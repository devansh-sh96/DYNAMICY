import { BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import { launchAppAlias, listInstalledApps, sendShortcutKeys } from '../app-launcher'
import { readAiKey } from './key-manager'
import { RENDERER_TOOLS, type IcyToolName } from './icy-tools'
import type { IcyTurn, RendererToolCall, RendererToolName, RendererToolResult } from '../../shared/ipc'

/**
 * The main process half of an Icy turn.
 *
 * A turn runs across three processes. The renderer asks the question; this module forks a
 * worker that holds the API key and the network stream; and the tools the worker asks for
 * are run here if they touch the machine, or relayed to the renderer if they touch state
 * the window owns.
 *
 * A fresh worker per turn, rather than one kept warm, because a turn is bounded by a
 * network call that has to be abandonable. `kill()` is the only dependable way to drop a
 * stalled stream — and it means the key only ever lives inside a process that ends.
 */

/** Ceiling on one whole turn, tool round trips included. Reaching it means something hung. */
const REQUEST_BUDGET_MS = 45_000

/** The key check is a single tiny round trip; it should answer almost immediately. */
const KEY_TEST_BUDGET_MS = 20_000

export const NO_KEY_MESSAGE = 'Gemini API key missing. Add GEMINI_API_KEY to your .env file.'

type ActiveTurn = {
  requestId: number
  worker: UtilityProcess
  resolve: (text: string) => void
  reject: (error: Error) => void
  timer?: NodeJS.Timeout
}

let current: ActiveTurn | null = null
let nextRequestId = 1

/** Renderer tool calls in flight, so the reply can be matched back to its turn. */
const rendererCalls = new Map<string, number>()

const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

/** Settles a turn exactly once and retires the worker that was serving it. */
const endTurn = (turn: ActiveTurn, error?: Error, text?: string) => {
  if (turn.timer) clearTimeout(turn.timer)
  if (current === turn) current = null

  for (const [callId, requestId] of rendererCalls) {
    if (requestId === turn.requestId) rendererCalls.delete(callId)
  }

  // Triggers `exit`, which is guarded on `current` and so does nothing for a settled turn.
  turn.worker.kill()

  if (error) turn.reject(error)
  else turn.resolve(text ?? '')
}

const cancelActiveTurn = () => {
  if (current) endTurn(current, new Error('Cancelled.'))
}

/**
 * Posts to the worker only while its turn is still the live one. Tool calls can finish
 * after their turn was cancelled, and posting then would be answered into the void.
 */
const replyToWorker = (requestId: number, message: unknown) => {
  if (current?.requestId !== requestId) return
  current.worker.postMessage(message)
}

/**
 * The two tools that only the main process can run.
 *
 * Everything else is the renderer's, so this is deliberately a short list: a program being
 * started and a keystroke reaching whichever window is focused. Both results are phrased as
 * a plain sentence, because they are handed to the model as the truth to confirm from.
 */
const runLocally = async (name: IcyToolName, args: Record<string, unknown>): Promise<string> => {
  if (name === 'launch_application') {
    const target = typeof args.app_name === 'string' ? args.app_name : ''
    if (!target) return 'No application was named.'
    // The Start Menu scan is lazy and cached; a cold cache would make every alias miss.
    await listInstalledApps().catch(() => [])
    const outcome = await launchAppAlias(target)
    return outcome.ok ? `Opened ${outcome.name}.` : `Nothing installed matched "${target}".`
  }

  // A focused chat input means the overlay itself owns focus. Never send Ctrl+W to Icy,
  // because Windows interprets it as closing the app's only window.
  if (BrowserWindow.getFocusedWindow()) return 'Icy kept its window open.'
  const sent = await sendShortcutKeys('^w')
  return sent ? 'Ctrl+W was sent to the focused window.' : 'The keystroke could not be sent.'
}

/** Narrows the name so the forwarded call is typed as one the renderer can answer. */
const isRendererTool = (name: IcyToolName): name is RendererToolName => RENDERER_TOOLS.has(name)

const dispatchTool = (
  requestId: number,
  callId: string,
  name: IcyToolName,
  args: Record<string, unknown>
) => {
  if (isRendererTool(name)) {
    rendererCalls.set(callId, requestId)
    broadcast('icy:tool-call', { callId, name, args } satisfies RendererToolCall)
    return
  }

  void runLocally(name, args).then(
    (result) => replyToWorker(requestId, { type: 'icy:tool-result', requestId, callId, ok: true, result }),
    (error: unknown) =>
      replyToWorker(requestId, {
        type: 'icy:tool-result',
        requestId,
        callId,
        ok: false,
        result: error instanceof Error ? error.message : 'The action failed.'
      })
  )
}

const asText = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

/**
 * Everything a worker message can mean.
 *
 * Kept separate from the listener so the listener can be a guard rail: a throw in here
 * surfaces as an unhandled event on the utility process, and the symptom — the chat
 * quietly going silent — says nothing about the cause.
 */
const routeWorkerMessage = (turn: ActiveTurn, message: unknown) => {
  if (!message || typeof message !== 'object') return
  const payload = message as {
    type?: unknown
    requestId?: unknown
    chunk?: unknown
    text?: unknown
    message?: unknown
    callId?: unknown
    name?: unknown
    args?: unknown
  }

  // A late message from a worker whose turn was already cancelled or replaced.
  if (payload.requestId !== turn.requestId) return

  switch (payload.type) {
    case 'icy:delta':
      // Straight through to the bubble; the promise below still resolves with the whole
      // reply, so a caller that would rather wait does not have to reassemble the pieces.
      broadcast('icy:delta', { requestId: turn.requestId, chunk: asText(payload.chunk) })
      return

    case 'icy:tool-call':
      if (typeof payload.callId !== 'string' || typeof payload.name !== 'string') return
      dispatchTool(
        turn.requestId,
        payload.callId,
        payload.name as IcyToolName,
        (payload.args as Record<string, unknown>) ?? {}
      )
      return

    case 'icy:done':
      endTurn(turn, undefined, asText(payload.text))
      return

    case 'icy:error':
      endTurn(turn, new Error(asText(payload.message, 'The request to Gemini failed.')))
      return

    case 'icy:aborted':
      return
  }
}

/**
 * Normalises the transcript before it crosses into the worker.
 *
 * The renderer is a different process, and this is the one value in the chat path shaped
 * by someone else's code. A malformed turn would otherwise reach the API as a 400 that
 * says nothing about where it came from.
 */
const sanitiseTurns = (value: unknown): IcyTurn[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((turn): turn is Record<string, unknown> => typeof turn === 'object' && turn !== null)
    .map((turn) => ({
      role: turn.role === 'system' ? ('system' as const) : turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: typeof turn.content === 'string' ? turn.content.slice(0, 4000) : ''
    }))
    .filter((turn) => turn.content.trim().length > 0)
}

const forkWorker = (serviceName: string): UtilityProcess =>
  utilityProcess.fork(join(__dirname, 'gemini-worker.js'), [], { serviceName })

/** Asks Icy for a reply. Rejects immediately when no key is connected. */
const promptIcy = (turns: IcyTurn[]): Promise<string> => {
  const apiKey = readAiKey()
  if (!apiKey) return Promise.reject(new Error(NO_KEY_MESSAGE))
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return Promise.reject(new Error('Nothing to answer.'))
  }

  // One conversation at a time: a new question retires the previous turn rather than
  // letting two streams race into the same bubble.
  cancelActiveTurn()

  const requestId = nextRequestId++
  let worker: UtilityProcess
  try {
    worker = forkWorker('Icy Bear Chat')
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }

  return new Promise<string>((resolve, reject) => {
    const turn: ActiveTurn = { requestId, worker, resolve, reject }
    current = turn
    turn.timer = setTimeout(
      () => endTurn(turn, new Error('Icy took too long to answer.')),
      REQUEST_BUDGET_MS
    )

    worker.on('message', (message: unknown) => {
      try {
        routeWorkerMessage(turn, message)
      } catch (error) {
        console.error('[icy] worker message failed', error)
      }
    })

    worker.on('exit', () => {
      // A settled turn kills its own worker, so an exit that reaches here is a crash.
      if (current === turn) endTurn(turn, new Error('The chat worker stopped before answering.'))
    })

    worker.postMessage({ type: 'icy:prompt', requestId, apiKey, turns })
  })
}

/**
 * Verifies a key by making the smallest real request the API accepts.
 *
 * Runs in its own worker for the same reason chat does — the SDK and the secret both stay
 * out of this process — and reports the API's own words on failure, because for a bad key
 * those words ("API key not valid") are the only thing that tells the user what to fix.
 */
const testKey = (apiKey: string): Promise<void> => {
  let worker: UtilityProcess
  try {
    worker = forkWorker('Icy Bear Key Test')
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.kill()
      if (error) reject(error)
      else resolve()
    }

    const timer = setTimeout(() => finish(new Error('Gemini did not answer in time.')), KEY_TEST_BUDGET_MS)

    worker.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return
      const payload = message as { type?: unknown; ok?: unknown; message?: unknown }
      if (payload.type !== 'icy:test-result') return
      finish(payload.ok === true ? undefined : new Error(asText(payload.message, 'Gemini rejected the key.')))
    })

    worker.on('exit', () => finish(new Error('The test worker stopped before answering.')))
    worker.postMessage({ type: 'icy:test', apiKey })
  })
}

/** The renderer's answer to a tool call it was handed. */
const parseRendererToolResult = (value: unknown): RendererToolResult | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { callId?: unknown; result?: unknown; ok?: unknown }
  if (typeof candidate.callId !== 'string') return null
  return {
    callId: candidate.callId,
    result: typeof candidate.result === 'string' ? candidate.result.slice(0, 1000) : '',
    ok: candidate.ok !== false
  }
}

export const registerIcyHandlers = () => {
  ipcMain.handle('icy:chat', (_event, value: unknown) => {
    // Sanitised here rather than in the worker so the worker can trust its input, and so a
    // clean rejection crosses the IPC boundary instead of an exception.
    return promptIcy(sanitiseTurns(value)).catch((error: unknown) => {
      console.error('[icy] chat failed', error)
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    })
  })

  ipcMain.handle('icy:cancel', () => {
    cancelActiveTurn()
  })

  ipcMain.handle('ai-key:test', async () => {
    const apiKey = readAiKey()
    if (!apiKey) return { ok: false, error: NO_KEY_MESSAGE } as const
    try {
      await testKey(apiKey)
      return { ok: true } as const
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The key could not be verified.' } as const
    }
  })

  ipcMain.on('icy:tool-result', (_event, value: unknown) => {
    const result = parseRendererToolResult(value)
    if (!result) return

    const requestId = rendererCalls.get(result.callId)
    if (requestId === undefined) return
    rendererCalls.delete(result.callId)
    replyToWorker(requestId, {
      type: 'icy:tool-result',
      requestId,
      callId: result.callId,
      ok: result.ok,
      result: result.result
    })
  })
}

/** Retires the in-flight turn; called from `before-quit` so no worker outlives the app. */
export const stopIcyEngine = () => {
  cancelActiveTurn()
}
