import type { RendererToolCall, RendererToolName, RendererToolResult } from '../../shared/ipc'
import { usePomodoroStore } from '../hooks/usePomodoro'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'

/**
 * The renderer half of Icy's tool use.
 *
 * Four of Icy's six tools touch state that lives in this window: the focus countdown, the
 * task list, the media session, and the CPU/RAM/battery readout that fills the island's own
 * gauges. Running them here — rather than in the main process — has a useful side effect:
 * Icy reads the same stores the widgets draw from, so she cannot contradict what is on
 * screen. The two tools that genuinely need the main process (starting a program, sending
 * a keystroke to the focused window) never arrive here.
 */

type ToolOutcome = { result: string; ok: boolean }

/** Battery is not in the main process's stats broadcast; the MenuBar reads it from here. */
type BatteryStatus = { level: number; charging: boolean }
type BatteryNavigator = Navigator & { getBattery?: () => Promise<BatteryStatus> }

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asMinutes = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(asText(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

type MediaAction = 'playPause' | 'next' | 'previous'

/**
 * The declaration tells the model the three exact names, but a model that says "toggle"
 * still means the same thing, and refusing it would cost the user the whole request.
 */
const asMediaAction = (value: unknown): MediaAction | null => {
  const raw = asText(value).toLowerCase().replace(/[\s_-]/g, '')
  if (!raw) return null
  if (raw.startsWith('play') || raw.startsWith('pause') || raw === 'toggle' || raw === 'resume') return 'playPause'
  if (raw.startsWith('next') || raw.startsWith('skip') || raw.startsWith('forward')) return 'next'
  if (raw.startsWith('prev') || raw.startsWith('back')) return 'previous'
  return null
}

const readBattery = async (): Promise<string | null> => {
  const getBattery = (navigator as BatteryNavigator).getBattery
  if (typeof getBattery !== 'function') return null
  try {
    const status = await getBattery.call(navigator)
    return `battery ${Math.round(status.level * 100)}%${status.charging ? ' (charging)' : ''}`
  } catch {
    return null
  }
}

/** CPU, RAM and battery as one sentence — the numbers the island's own gauges are showing. */
const readTelemetry = async (): Promise<ToolOutcome> => {
  const stats = useAppStore.getState().systemStats
  const ramPercent = stats.ramTotal > 0 ? Math.round((stats.ramUsed / stats.ramTotal) * 100) : 0
  const parts = [
    `CPU ${Math.round(stats.cpu)}%`,
    `RAM ${stats.ramUsed.toFixed(1)} of ${Math.round(stats.ramTotal)} GB (${ramPercent}%)`
  ]
  if (stats.gpuLoad !== null) parts.push(`GPU ${Math.round(stats.gpuLoad)}%`)

  const battery = await readBattery()
  if (battery) parts.push(battery)

  return { result: `${parts.join(', ')}.`, ok: true }
}

/**
 * Starts the island's focus countdown.
 *
 * `start` is deliberately a no-op while a session is already running, so the already-running
 * case is reported back instead of silently pretending a new timer began — the model is
 * told what actually happened and says so.
 */
const startFocusTimer = (args: Record<string, unknown>): ToolOutcome => {
  const minutes = asMinutes(args.minutes)
  if (minutes === null) return { result: 'No usable number of minutes was given.', ok: false }

  const store = usePomodoroStore.getState()
  if (store.phase === 'running' || store.phase === 'paused') {
    const left = Math.max(1, Math.ceil(store.secondsRemaining / 60))
    return {
      result: `A focus session is already running with about ${left} minutes left, so no new timer was started.`,
      ok: false
    }
  }

  // A break is not work in progress: nothing is at stake in winding it back to idle.
  if (store.phase === 'break') store.reset()
  store.start(minutes)

  return {
    result: `The island's focus timer is now counting down ${usePomodoroStore.getState().durationMinutes} minutes.`,
    ok: true
  }
}

const addTask = (args: Record<string, unknown>): ToolOutcome => {
  const title = asText(args.title)
  if (!title) return { result: 'No task text was given.', ok: false }

  useTaskStore.getState().addTask(title)
  return { result: `Added "${title}" to the task list.`, ok: true }
}

const controlMedia = async (args: Record<string, unknown>): Promise<ToolOutcome> => {
  const action = asMediaAction(args.action)
  if (!action) return { result: 'That is not a media control Icy can send.', ok: false }

  const sent = await (window.electronAPI?.controlMedia(action) ?? Promise.resolve(false))
  return sent
    ? { result: `The media player was sent "${action}".`, ok: true }
    : { result: 'No media player responded.', ok: false }
}

/** One entry per renderer-owned tool, so adding one to the union is a compile error here. */
const handlers: Record<RendererToolName, (args: Record<string, unknown>) => ToolOutcome | Promise<ToolOutcome>> = {
  get_system_telemetry: readTelemetry,
  set_focus_timer: startFocusTimer,
  add_task: addTask,
  control_media: controlMedia
}

/**
 * Runs a tool the main process forwarded, and answers with a sentence.
 *
 * Never throws: the worker is blocked waiting on this call, so a failure has to come back
 * as a result the model can speak from, not as a rejection that would strand the turn.
 */
export const runRendererTool = async (call: RendererToolCall): Promise<RendererToolResult> => {
  const handler = handlers[call.name]
  if (!handler) return { callId: call.callId, result: 'That tool does not exist.', ok: false }

  try {
    const outcome = await handler(call.args ?? {})
    return { callId: call.callId, result: outcome.result, ok: outcome.ok }
  } catch (error) {
    return {
      callId: call.callId,
      result: error instanceof Error ? error.message : 'The action failed.',
      ok: false
    }
  }
}
