import { dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { promisify } from 'util'

const executeFile = promisify(execFile)

export type InstalledApp = { name: string; path: string }

const MAX_APPS = 200

/**
 * Reads the Start Menu folders, which is where Windows records installed applications.
 *
 * This is a much cheaper signal than walking every directory under Program Files: the
 * Start Menu already contains one shortcut per installed app, and the list is cached
 * because it only changes when the user installs or removes software.
 */
const startMenuFolders = (): string[] => {
  const programData = process.env.ProgramData ?? 'C:\\ProgramData'
  const appData = process.env.APPDATA ?? ''
  const folders = [
    join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]
  return folders.filter((folder) => existsSync(folder))
}

const collectShortcuts = (root: string, depth = 0, out: string[] = []): string[] => {
  if (depth > 3) return out

  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch {
    return out
  }

  for (const entry of entries) {
    const full = join(root, entry)
    let stats: ReturnType<typeof statSync>
    try {
      stats = statSync(full)
    } catch {
      continue
    }

    if (stats.isDirectory()) collectShortcuts(full, depth + 1, out)
    else if (/\.(lnk|url)$/i.test(entry)) out.push(full)
  }

  return out
}

let cachedApps: InstalledApp[] | null = null
let cachedAt = 0
const CACHE_MS = 5 * 60 * 1000

export const listInstalledApps = async (): Promise<InstalledApp[]> => {
  if (cachedApps && Date.now() - cachedAt < CACHE_MS) return cachedApps

  const shortcuts = startMenuFolders().flatMap((folder) => collectShortcuts(folder))
  const seen = new Set<string>()
  const apps: InstalledApp[] = []

  for (const shortcut of shortcuts) {
    // "Spotify" from "Spotify.lnk"; the shell name is usually the user-facing name.
    const name = basename(shortcut, shortcut.slice(shortcut.lastIndexOf('.')))
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    apps.push({ name, path: shortcut })
    if (apps.length >= MAX_APPS) break
  }

  cachedApps = apps
  cachedAt = Date.now()
  return apps
}

const pickExecutable = async (): Promise<InstalledApp | null> => {
  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!owner) return null

  const result = await dialog.showOpenDialog(owner, {
    title: 'Choose an application to pin',
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['exe', 'bat', 'cmd', 'lnk'] }]
  })

  const picked = result.filePaths[0]
  if (result.canceled || !picked) return null
  return { name: basename(picked, picked.slice(picked.lastIndexOf('.'))), path: picked }
}

const launchApp = async (target: string): Promise<boolean> => {
  if (!existsSync(target)) return false
  // shell.openPath handles both .lnk and .exe without spawning a console window.
  const failure = await shell.openPath(target)
  return !failure
}

/**
 * Sends a keystroke to whichever window currently has focus.
 *
 * The island is click-through and frequently unfocused, so there is no webContents to
 * post the input event to — SendKeys targets the foreground window directly, which is
 * what "close tab" needs to reach.
 */
export const sendShortcutKeys = async (keys: string): Promise<boolean> => {
  if (!/^[\w+^%~()\[\]{}-]{1,12}$/.test(keys)) return false
  try {
    await executeFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `$w = New-Object -ComObject WScript.Shell; $w.SendKeys('${keys}')`],
      { windowsHide: true, timeout: 4000 }
    )
    return true
  } catch {
    return false
  }
}

/**
 * Short names Icy is taught to use, expanded to real Start Menu entries.
 *
 * Icy is far more reliable when it is handed a fixed vocabulary than when it is asked to
 * produce a Start Menu name verbatim — "vsc" is unambiguous, "the application with the
 * blue logo" is not. The first entry that exists on the machine wins.
 */
const APP_ALIASES: Record<string, string[]> = {
  vsc: ['Visual Studio Code', 'Code', 'vscode'],
  vscode: ['Visual Studio Code', 'Code', 'vscode'],
  code: ['Visual Studio Code', 'Code', 'vscode'],
  term: ['Windows Terminal', 'Terminal'],
  terminal: ['Windows Terminal', 'Terminal'],
  cmd: ['Command Prompt', 'cmd'],
  notepad: ['Notepad', 'notepad'],
  paint: ['Paint', 'mspaint'],
  files: ['File Explorer', 'explorer'],
  explorer: ['File Explorer', 'explorer'],
  settings: ['Settings', 'ms-settings:'],
  taskmgr: ['Task Manager', 'taskmgr'],
  calc: ['Calculator', 'calc'],
  calculator: ['Calculator', 'calc'],
  edge: ['Microsoft Edge', 'msedge'],
  chrome: ['Google Chrome', 'chrome'],
  firefox: ['Mozilla Firefox', 'firefox'],
  spotify: ['Spotify'],
  discord: ['Discord'],
  steam: ['Steam'],
  word: ['Microsoft Word', 'Word'],
  excel: ['Microsoft Excel', 'Excel'],
  outlook: ['Outlook', 'Mail']
}

/**
 * Commands Windows itself resolves. These are the only bare words handed to `start`,
 * so `open_app` can never turn into arbitrary command execution from a model typo.
 */
const SHELL_TARGETS = new Set([
  'calc', 'notepad', 'mspaint', 'explorer', 'taskmgr', 'cmd', 'control', 'regedit',
  'charmap', 'winver', 'osk', 'magnify', 'ms-settings:'
])

const normalizeTarget = (value: string): string =>
  value.trim().toLowerCase().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ')

const findInstalledApp = (names: string[]): InstalledApp | null => {
  const apps = cachedApps ?? []
  for (const name of names) {
    const needle = name.toLowerCase()
    const hit = apps.find((app) => app.name.toLowerCase() === needle) ??
      apps.find((app) => app.name.toLowerCase().includes(needle))
    if (hit) return hit
  }
  return null
}

/**
 * Resolves a loose target from the action router and starts it.
 *
 * The routing is deliberately narrow: a Start Menu shortcut is opened through the shell,
 * a URL through the default browser, and a bare word only if Windows itself knows it.
 * Anything unrecognised fails loudly so the chat can say so, rather than being passed to
 * a shell to interpret.
 */
export const launchAppAlias = async (value: string): Promise<{ ok: boolean; name: string }> => {
  const target = normalizeTarget(value)
  if (!target || target.length > 64) return { ok: false, name: '' }

  if (/^https?:\/\//i.test(target)) {
    await shell.openExternal(target)
    return { ok: true, name: target }
  }

  const alias = APP_ALIASES[target] ?? [target]
  const installed = findInstalledApp(alias)
  if (installed) {
    return { ok: await launchApp(installed.path), name: installed.name }
  }

  if (SHELL_TARGETS.has(target) || SHELL_TARGETS.has(alias[0]?.toLowerCase() ?? '')) {
    const command = alias[0]?.toLowerCase() ?? target
    try {
      // The `""` is the (empty) window title `start` insists on, and it stops a target
      // that happens to be quoted from being read as a title.
      await executeFile('cmd.exe', ['/c', 'start', '', command], { windowsHide: true, timeout: 6000 })
      return { ok: true, name: command }
    } catch {
      return { ok: false, name: command }
    }
  }

  return { ok: false, name: '' }
}

export const registerAppLauncherHandlers = () => {
  ipcMain.handle('apps:list', () => listInstalledApps())
  ipcMain.handle('apps:pick', () => pickExecutable())
  ipcMain.handle('apps:launch', (_event, value: unknown) => {
    if (typeof value !== 'string' || !value) return false
    return launchApp(value)
  })
  ipcMain.handle('apps:launch-alias', (_event, value: unknown) => {
    if (typeof value !== 'string') return { ok: false, name: '' }
    // The Start Menu scan is lazy, so make sure the catalog is warm before matching.
    void listInstalledApps()
    return launchAppAlias(value)
  })
  ipcMain.handle('apps:send-keys', (_event, value: unknown) => {
    if (typeof value !== 'string') return false
    return sendShortcutKeys(value)
  })
}
