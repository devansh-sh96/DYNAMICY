import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Settings, Sparkles, Square } from 'lucide-react'
import { useAppStore } from '../../../stores/appStore'
import { useChatStore } from '../../../stores/chatStore'
import { usePomodoroStore } from '../../../hooks/usePomodoro'

/*
 * One chip per tool, and deliberately nothing that sends Ctrl+W: typing the request means the
 * island holds keyboard focus, and `close_active_window_or_tab` sends the keystroke to whichever
 * window is focused — the island itself. Icy can still do it when asked; the app should not
 * offer it as a one-tap button.
 */
const suggestions = [
  { label: 'Check my system', prompt: 'How is my computer running?' },
  { label: 'Start a 20 minute timer', prompt: 'Start a 20 minute focus timer' },
  { label: 'Open Notepad', prompt: 'Open Notepad' }
]

/**
 * Chat is unreachable without a key, so the tab is either the setup instruction or the
 * conversation — never a composer that answers with an apology. The main process enforces
 * the same rule, which is why the card can be trusted rather than merely believed.
 */
const ChatTab = () => {
  const [draft, setDraft] = useState('')
  const messages = useChatStore((state) => state.messages)
  const isThinking = useChatStore((state) => state.isThinking)
  const keyStatus = useChatStore((state) => state.keyStatus)
  const error = useChatStore((state) => state.error)
  const sendMessage = useChatStore((state) => state.sendMessage)
  const cancelReply = useChatStore((state) => state.cancelReply)
  const refreshKeyStatus = useChatStore((state) => state.refreshKeyStatus)
  const setIcyState = useAppStore((state) => state.setIcyState)
  const setSpriteAction = useAppStore((state) => state.setSpriteAction)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const messageList = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSpriteAction('default')
    setIcyState(usePomodoroStore.getState().phase === 'running' ? 'working' : 'chatting')
  }, [setIcyState, setSpriteAction])

  // The key can be connected, disconnected or replaced while the panel is open.
  useEffect(() => {
    void refreshKeyStatus()
  }, [refreshKeyStatus])

  useEffect(() => {
    const list = messageList.current
    if (!list) return
    /*
     * Instant while a reply is streaming, because the bubble grows on every frame and a
     * smooth scroll would restart its animation on each one and trail the text; one smooth
     * scroll once the reply has settled.
     */
    list.scrollTo({ top: list.scrollHeight, behavior: isThinking ? 'auto' : 'smooth' })
  }, [messages, isThinking])

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim()) return
    sendMessage(draft)
    setDraft('')
  }

  if (!keyStatus) {
    return (
      <section className="chat-live-tab is-centre" aria-label="Chat with Icy Bear">
        <div className="chat-setup-card is-checking">
          <span className="chat-thinking" aria-label="Checking the connection"><i /><i /><i /></span>
        </div>
      </section>
    )
  }

  if (!keyStatus.connected) {
    return (
      <section className="chat-live-tab is-centre" aria-label="Chat with Icy Bear">
        <div className="chat-setup-card">
          <span className="chat-setup-key" aria-hidden="true">🔑</span>
          <p className="chat-setup-title">AI Disconnected.</p>
          <p className="chat-setup-body">Connect your Gemini API key in settings.</p>
          {!keyStatus.encryptionAvailable && (
            <p className="chat-setup-note">
              Windows cannot encrypt a key for this account, so it cannot be stored safely.
            </p>
          )}
          <button type="button" className="chat-setup-action" onClick={() => setSettingsOpen(true)}>
            <Settings size={13} strokeWidth={1.8} aria-hidden="true" />
            Open settings
          </button>
        </div>
      </section>
    )
  }

  const keyLabel = keyStatus.hint ? `Icy · Gemini · key ${keyStatus.hint}` : 'Icy · Gemini · connected'

  return (
    <section className="chat-live-tab" aria-label="Chat with Icy Bear">
      <div className="chat-live-messages" ref={messageList} aria-live="polite">
        {messages.map((message) => (
          <div className={`chat-live-row ${message.role === 'user' ? 'is-user' : 'is-assistant'}`} key={message.id}>
            {message.role === 'assistant' && <span className="chat-live-avatar">I</span>}
            <p>{message.content}</p>
          </div>
        ))}
        {isThinking && (
          <div className="chat-live-row is-assistant">
            <span className="chat-live-avatar">I</span>
            <p className="chat-thinking" aria-label="Icy is thinking"><i /><i /><i /></p>
          </div>
        )}
      </div>
      <div className="chat-live-bottom">
        <div className="chat-engine-status" title={keyStatus.hint ? `Key ending ${keyStatus.hint}` : undefined}>
          {keyLabel}
        </div>
        {error && <p className="chat-error" role="status">{error}</p>}
        <div className="chat-suggestions" aria-label="Suggested prompts">
          {suggestions.map(({ label, prompt }) => (
            <button key={label} type="button" disabled={isThinking} onClick={() => sendMessage(prompt)}>
              <Sparkles size={12} />{label}
            </button>
          ))}
        </div>
        <form className="chat-live-composer" onSubmit={submitMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask Icy something..."
            aria-label="Message Icy"
          />
          {isThinking ? (
            <button type="button" className="is-stop" onClick={cancelReply} aria-label="Stop Icy">
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Send message"><ArrowUp size={16} /></button>
          )}
        </form>
      </div>
    </section>
  )
}

export default ChatTab
