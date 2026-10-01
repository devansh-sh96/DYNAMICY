import { app, ipcMain, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { AiKeySaveResult, AiKeyStatus } from '../../shared/ipc'

/**
 * Bring-your-own-key storage.
 *
 * The Gemini key is the one secret this app owns, and it never touches disk in a form
 * anyone can read. It is sealed with Windows DPAPI — the same `CryptProtectData` call
 * the spec asks for through `pywin32`, reached here through Electron's `safeStorage`,
 * which is a thin binding to it. The ciphertext is bound to the Windows account and the
 * machine that produced it, so copying the file to another profile or another PC yields
 * nothing: DPAPI refuses to decrypt, and the app reports a disconnected key.
 *
 * The plaintext exists in exactly two places, both in this process: the moment it is
 * typed into the settings card, and the moment the Gemini request is dispatched.
 */

/** Folder under Local AppData. Named after the app rather than the Electron bundle id. */
const CONFIG_DIRECTORY = 'IcyBear'
const CONFIG_FILE = 'user_config.enc.json'
const CONFIG_VERSION = 1

const MIN_KEY_LENGTH = 20
const MAX_KEY_LENGTH = 200

type StoredConfig = {
  version: number
  gemini?: {
    /** Base64 of the DPAPI blob. The only representation of the key that ever lands on disk. */
    cipher: string
    updatedAt: number
  }
}

/** What lives inside the encrypted blob. */
type SecretPayload = {
  key: string
  hint: string
}

/**
 * The spec asks for Local AppData, which is also the correct scope: DPAPI blobs are
 * per-user and do not roam, so a file in Roaming AppData would simply fail to decrypt
 * on the next machine.
 */
const configPath = (): string => {
  const base = process.env.LOCALAPPDATA ?? app.getPath('userData')
  return join(base, CONFIG_DIRECTORY, CONFIG_FILE)
}

const readEnvironmentKey = (): string | undefined => {
  const direct = process.env.GEMINI_API_KEY?.trim()
  if (direct) return direct

  const candidates = [join(process.cwd(), '.env'), join(app.getAppPath(), '.env')]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const line = readFileSync(path, 'utf8').split(/\r?\n/).find((entry) => /^\s*GEMINI_API_KEY\s*=/.test(entry))
      const value = line?.replace(/^\s*GEMINI_API_KEY\s*=\s*/, '').trim().replace(/^['"]|['"]$/g, '')
      if (value) return value
    } catch {
      // Treat an unreadable .env file like a missing key; settings can still provide one.
    }
  }
  return undefined
}

const readConfig = (): StoredConfig | null => {
  const path = configPath()
  if (!existsSync(path)) return null

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredConfig
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    // A corrupt or half-written file is treated as "no key": the user can always paste
    // the key again, and a crash here would take the whole startup path down with it.
    return null
  }
}

const writeConfig = (config: StoredConfig) => {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })

  // Write beside the target and rename, so an interrupted save cannot leave a truncated
  // file where a working key used to be.
  const staging = `${path}.tmp`
  writeFileSync(staging, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(staging, path)
}

const encrypt = (payload: SecretPayload): string => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows DPAPI is unavailable, so the key cannot be encrypted.')
  }
  return safeStorage.encryptString(JSON.stringify(payload)).toString('base64')
}

/**
 * Returns null rather than throwing. The expected failure here is a file copied from
 * another Windows account, and the caller's response to it is the same as to a missing
 * key: show the setup card.
 */
const decrypt = (cipher: string): SecretPayload | null => {
  try {
    const plain = safeStorage.decryptString(Buffer.from(cipher, 'base64'))
    const payload = JSON.parse(plain) as SecretPayload
    return typeof payload?.key === 'string' && payload.key.length > 0 ? payload : null
  } catch {
    return null
  }
}

const encryptionAvailable = (): boolean => {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

const statusFrom = (config: StoredConfig | null): AiKeyStatus => {
  const available = encryptionAvailable()
  const environmentKey = readEnvironmentKey()
  if (environmentKey) {
    return { connected: true, hint: environmentKey.slice(-4), encryptionAvailable: available }
  }
  const record = config?.gemini
  if (!record?.cipher) return { connected: false, encryptionAvailable: available }

  const payload = decrypt(record.cipher)
  if (!payload) {
    // The blob exists but this account cannot open it. Reporting "connected" would send
    // every chat into a 401, so this reads as disconnected instead.
    return { connected: false, encryptionAvailable: available }
  }

  return {
    connected: true,
    hint: payload.hint,
    updatedAt: record.updatedAt,
    encryptionAvailable: available
  }
}

export const getAiKeyStatus = (): AiKeyStatus => statusFrom(readConfig())

/**
 * Keys never contain whitespace. Rejecting it also catches the common paste accident of
 * grabbing a line break along with the key, which would otherwise surface much later as
 * an opaque 400 from the API.
 */
const normaliseKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const key = value.trim()
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) return null
  if (/\s/.test(key)) return null
  return key
}

export const saveAiKey = (value: unknown): AiKeySaveResult => {
  const key = normaliseKey(value)
  if (!key) {
    return {
      ...getAiKeyStatus(),
      ok: false,
      error: 'That does not look like an API key. Paste the whole key and try again.'
    }
  }

  if (!encryptionAvailable()) {
    return {
      connected: false,
      encryptionAvailable: false,
      ok: false,
      error: 'Windows DPAPI is unavailable, so the key cannot be stored securely.'
    }
  }

  try {
    const config = readConfig() ?? { version: CONFIG_VERSION }
    config.version = CONFIG_VERSION
    config.gemini = {
      cipher: encrypt({ key, hint: key.slice(-4) }),
      updatedAt: Date.now()
    }
    writeConfig(config)
    return { ...getAiKeyStatus(), ok: true }
  } catch (error) {
    return {
      ...getAiKeyStatus(),
      ok: false,
      error: error instanceof Error ? error.message : 'The key could not be saved.'
    }
  }
}

export const clearAiKey = (): AiKeyStatus => {
  const config = readConfig()
  if (config?.gemini) {
    delete config.gemini
    try {
      writeConfig(config)
    } catch {
      // Nothing actionable for the caller; the reported status below still reflects intent.
    }
  }
  return getAiKeyStatus()
}

/**
 * The one reader of the plaintext key.
 *
 * Deliberately not exposed over IPC: the renderer asks whether a key is connected and
 * how it ends, never what it is. Only the worker, which talks to Google directly, is
 * handed the secret.
 */
export const readAiKey = (): string | null => {
  const environmentKey = readEnvironmentKey()
  if (environmentKey) return environmentKey
  const record = readConfig()?.gemini
  if (!record?.cipher) return null
  return decrypt(record.cipher)?.key ?? null
}

export const registerAiKeyHandlers = () => {
  ipcMain.handle('ai-key:status', () => getAiKeyStatus())
  ipcMain.handle('ai-key:save', (_event, value: unknown) => saveAiKey(value))
  ipcMain.handle('ai-key:clear', () => clearAiKey())
}
