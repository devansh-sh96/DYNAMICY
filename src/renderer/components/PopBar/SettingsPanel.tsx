import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, X } from 'lucide-react'
import type { AiKeyStatus } from '../../../shared/ipc'
import { useAppStore } from '../../stores/appStore'
import { useChatStore } from '../../stores/chatStore'

/**
 * Where the Gemini key is entered.
 *
 * The renderer never reads the key back: it posts a candidate, and the main process decides
 * whether it is a usable key, whether Windows can encrypt it, and what the file on disk ends
 * up looking like. What comes back is a status with a four-character hint, which is all this
 * panel needs to tell one key from another.
 */
const SettingsPanel = () => {
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const refreshKeyStatus = useChatStore((state) => state.refreshKeyStatus)
  const [status, setStatus] = useState<AiKeyStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const close = () => setSettingsOpen(false)

  useEffect(() => {
    let disposed = false
    void window.electronAPI?.aiKeyStatus()
      .then((next) => { if (!disposed) setStatus(next) })
      .catch(() => undefined)
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const key = draft.trim()
    if (!key || busy) return

    setBusy('save')
    setNotice(null)
    const result = await window.electronAPI.saveAiKey(key).catch(() => null)
    setBusy(null)

    if (!result?.ok) {
      setNotice({ tone: 'error', text: result?.error ?? 'The key could not be saved.' })
      return
    }
    setStatus(result)
    setDraft('')
    setNotice({ tone: 'ok', text: 'Key encrypted and saved. Test it to be sure Gemini accepts it.' })
    void refreshKeyStatus()
  }

  const runTest = async () => {
    if (busy) return
    setBusy('test')
    setNotice(null)
    const result = await window.electronAPI.testAiKey().catch(() => null)
    setBusy(null)

    if (!result) {
      setNotice({ tone: 'error', text: 'The key could not be tested.' })
      return
    }
    setNotice(result.ok
      ? { tone: 'ok', text: 'Gemini answered. Icy is ready.' }
      : { tone: 'error', text: result.error ?? 'Gemini rejected the key.' })
  }

  const disconnect = async () => {
    if (busy) return
    setBusy('clear')
    setNotice(null)
    const next = await window.electronAPI.clearAiKey().catch(() => null)
    setBusy(null)

    if (next) setStatus(next)
    setNotice({ tone: 'ok', text: 'Key removed. Chat stays locked until another one is connected.' })
    void refreshKeyStatus()
  }

  const connected = status?.connected === true

  return (
    <motion.div
      className="settings-overlay"
      data-no-window-drag
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={close}
    >
      <motion.div
        className="settings-panel"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <h2>Settings</h2>
            <p>Kept on this machine, encrypted for this Windows account.</p>
          </div>
          <button type="button" className="settings-close" onClick={close} aria-label="Close settings">
            <X size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-section-heading">
              <KeyRound size={13} strokeWidth={1.9} aria-hidden="true" />
              <h3>Gemini API key</h3>
              <span className={`settings-badge ${connected ? 'is-on' : ''}`}>
                {connected ? 'Connected' : 'Not connected'}
              </span>
            </div>
              <p className="settings-hint">
              Icy answers only through your own Gemini API key. It is encrypted with the
              Windows Data Protection API before it reaches the disk — in <code>user_config.enc.json</code>
              {' '}under Local AppData — so the plain key is never written, and the encrypted copy
              is readable by this Windows account on this machine alone.
            </p>

            {connected && (
              <p className="settings-current">
                Key ending <strong>{status?.hint ?? '••••'}</strong>
                {status?.updatedAt ? ` · saved ${new Date(status.updatedAt).toLocaleDateString()}` : ''}
              </p>
            )}

            <form className="settings-field" onSubmit={save}>
              <input
                type="password"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Paste your Gemini API key"
                aria-label="Gemini API key"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
              />
              <button type="submit" disabled={busy !== null || !draft.trim()}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
            </form>

            <div className="settings-actions">
              <button type="button" onClick={runTest} disabled={busy !== null || !connected}>
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </button>
              <button type="button" className="is-danger" onClick={disconnect} disabled={busy !== null || !connected}>
                {busy === 'clear' ? 'Removing…' : 'Disconnect'}
              </button>
            </div>

            {status && !status.encryptionAvailable && (
              <p className="settings-notice is-error">
                Windows encryption is unavailable here, so no key can be stored safely and chat stays locked.
              </p>
            )}
            {notice && <p className={`settings-notice is-${notice.tone}`} role="status">{notice.text}</p>}
          </section>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default SettingsPanel
