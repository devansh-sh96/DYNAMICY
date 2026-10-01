import { create } from 'zustand'
import type { AiKeyStatus, IcyTurn } from '../../shared/ipc'
import { usePomodoroStore } from '../hooks/usePomodoro'
import { runRendererTool } from '../lib/icyTools'
import { useAppStore } from './appStore'

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

type ChatStore = {
  messages: ChatMessage[]
  isThinking: boolean
  /** Whether a Gemini key is connected; the tab shows the composer only when one is. */
  keyStatus: AiKeyStatus | null
  /** Set when a turn failed, so the tab can say so without putting words in Icy's mouth. */
  error: string | null
  sendMessage: (content: string) => void
  /** Abandons the reply being written; the worker is killed, so the stream really stops. */
  cancelReply: () => void
  /** Clears the transcript and mints a brand-new session id in the app store. */
  beginSession: () => void
  refreshKeyStatus: () => Promise<AiKeyStatus | null>
}

let nextMessageId = Date.now()

/** Icy's opener: third person, no pleasantries, and a hint at what she can do. */
const GREETING = 'Icy is here. Ask for a timer, a task, an app, or a fact.'

/** The bubble currently filling from the token stream, if any. */
let streamingMessageId: number | null = null

/**
 * Streamed text arrives a few characters at a time, far faster than the display needs.
 * Chunks are buffered and flushed once per frame, so the bubble grows every 16 ms instead
 * of re-rendering the whole transcript on every token.
 */
let pendingDelta = ''
let deltaFrame = 0

const cancelStreamFrame = () => {
  if (deltaFrame) window.cancelAnimationFrame(deltaFrame)
  deltaFrame = 0
  pendingDelta = ''
}

const flushDelta = () => {
  deltaFrame = 0
  const chunk = pendingDelta
  pendingDelta = ''
  if (!chunk || streamingMessageId === null) return

  useChatStore.setState((state) => ({
    messages: state.messages.map((message) =>
      message.id === streamingMessageId ? { ...message, content: message.content + chunk } : message
    )
  }))
}

const queueDelta = (chunk: string) => {
  if (!chunk) return
  pendingDelta += chunk
  if (!deltaFrame) deltaFrame = window.requestAnimationFrame(flushDelta)
}

const asTurns = (messages: ChatMessage[]): IcyTurn[] =>
  messages.map((message) => ({ role: message.role, content: message.content }))

const computerContext = (): IcyTurn => {
  const stats = useAppStore.getState().systemStats
  const ramPercent = stats.ramTotal > 0 ? Math.round((stats.ramUsed / stats.ramTotal) * 100) : 0
  const screenInfo = typeof screen === 'undefined' ? 'unknown display' : `${screen.width}x${screen.height}`
  const platform = typeof navigator === 'undefined' ? 'unknown platform' : navigator.platform
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown timezone'
  return {
    role: 'system',
    content: `Private live computer context: platform ${platform}; display ${screenInfo}; timezone ${timezone}; CPU ${Math.round(stats.cpu)}%; RAM ${stats.ramUsed.toFixed(1)} of ${Math.round(stats.ramTotal)} GB (${ramPercent}%); GPU ${stats.gpuName || 'unavailable'}${stats.gpuLoad === null ? '' : ` at ${Math.round(stats.gpuLoad)}%`}; network received ${Math.round(stats.networkRxKbps)} KB/s and sent ${Math.round(stats.networkTxKbps)} KB/s; disk ${stats.diskTotalGb > 0 ? `${stats.diskUsedGb.toFixed(1)} of ${stats.diskTotalGb.toFixed(1)} GB` : 'unavailable'}. Use this when answering computer-status questions. Do not reveal private context unless relevant.`
  }
}

if (typeof window !== 'undefined') {
  window.electronAPI?.onIcyDelta(({ chunk }) => queueDelta(chunk))

  // Icy asked for something the window owns. The answer goes back through the main process
  // to the worker that is waiting on it, which is how a tool call becomes her next line.
  window.electronAPI?.onIcyToolCall((call) => {
    void runRendererTool(call).then((result) => window.electronAPI.resolveIcyToolCall(result))
  })
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [{ id: nextMessageId++, role: 'assistant', content: GREETING }],
  isThinking: false,
  keyStatus: null,
  error: null,

  // A brand-new session every time the popup opens: new id, empty transcript, and a fresh
  // look at whether a key is connected.
  beginSession: () => {
    cancelStreamFrame()
    streamingMessageId = null
    set({
      messages: [{ id: nextMessageId++, role: 'assistant', content: GREETING }],
      isThinking: false,
      error: null
    })
    useAppStore.getState().startChatSession()
    // A reply from the last time the popup was open must not stream into this transcript.
    void window.electronAPI?.cancelIcyChat()
    void get().refreshKeyStatus()
  },

  cancelReply: () => {
    void window.electronAPI?.cancelIcyChat()
  },

  refreshKeyStatus: async () => {
    const api = window.electronAPI
    if (!api) {
      set({ keyStatus: null })
      return null
    }
    const status = await api.aiKeyStatus().catch(() => null)
    set({ keyStatus: status })
    return status
  },

  sendMessage: (content) => {
    const prompt = content.trim()
    if (!prompt || get().isThinking) return

    const history = [computerContext(), ...asTurns(get().messages)]
    const userMessage: ChatMessage = { id: nextMessageId++, role: 'user', content: prompt }
    const replyId = nextMessageId++
    streamingMessageId = replyId
    cancelStreamFrame()

    set((state) => ({
      messages: [...state.messages, userMessage, { id: replyId, role: 'assistant', content: '' }],
      isThinking: true,
      error: null
    }))
    useAppStore.getState().setIcyState('working')

    const settle = (reply: string) => {
      cancelStreamFrame()
      const finalText = reply.trim()
      set((state) => ({
        messages: state.messages.flatMap((message) => {
          if (message.id !== replyId) return [message]
          if (finalText) return [{ ...message, content: finalText }]
          // No final text, but the stream may already have written something worth keeping.
          return message.content.trim() ? [message] : [{ ...message, content: 'Icy said nothing.' }]
        }),
        isThinking: false,
        error: null
      }))
    }

    const fail = (message: string) => {
      cancelStreamFrame()
      set((state) => ({
        // An empty bubble plus a banner reads better than a sentence the user could
        // mistake for Icy's own words.
        messages: state.messages.filter((item) => item.id !== replyId || item.content.trim().length > 0),
        isThinking: false,
        error: message
      }))
      if (message.includes('Gemini API key missing')) void get().refreshKeyStatus()
    }

    void window.electronAPI
      .icyChat([...history, { role: 'user', content: prompt }])
      .then(settle)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : ''
        // Stopping a reply is a user action, so it keeps whatever was streamed and
        // shows no banner; anything else is a real failure the user should see.
        if (message === 'Cancelled.') {
          cancelStreamFrame()
          set((state) => ({
            messages: state.messages.filter((item) => item.id !== replyId || item.content.trim().length > 0),
            isThinking: false
          }))
          return
        }
        fail(message || 'Icy could not answer that one.')
      })
      .finally(() => {
        if (streamingMessageId === replyId) streamingMessageId = null
        // A running focus session outranks chat in the island's own state.
        useAppStore.getState().setIcyState(usePomodoroStore.getState().phase === 'running' ? 'working' : 'chatting')
      })
  }
}))
