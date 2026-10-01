/**
 * IPC payload contracts shared by the main process and the renderer.
 * Keeping them here avoids the renderer reaching into `src/main`, which the
 * web TypeScript project does not compile.
 */

export type ProcessEntry = {
  pid: number
  name: string
  cpu: number
  memoryMb: number
  path: string
}

export type FileSearchResult = { path: string; name: string }

export type IslandCorner = 'bottom-right'
export type QuickToggleKey = 'wifi' | 'bluetooth' | 'airplane'
export type QuickSettingsState = {
  wifi: { supported: boolean; active: boolean; detail: string | null }
  bluetooth: { supported: boolean; active: boolean }
  airplane: { supported: boolean; active: boolean }
  brightness: { supported: boolean; level: number }
}

/** Window-relative rectangle the island window should stay clickable inside. */
export type HitRegion = { x: number; y: number; width: number; height: number }

/** An application discovered from the Windows Start Menu. */
export type InstalledApp = { name: string; path: string }

/* --- Chat: bring-your-own-key Gemini --- */

export type IcyTurn = { role: 'system' | 'user' | 'assistant'; content: string }

/** Whether a usable Gemini key is available. The key itself never crosses this boundary. */
export type AiKeyStatus = {
  connected: boolean
  /** Last four characters of the connected key, for telling two keys apart. */
  hint?: string
  updatedAt?: number
  /** False when Windows DPAPI is unavailable; nothing can be stored securely. */
  encryptionAvailable: boolean
}

export type AiKeySaveResult = AiKeyStatus & { ok: boolean; error?: string }

/**
 * Tools the renderer runs, because the state they touch is state the renderer already
 * owns and draws: the focus countdown, the task list, the media session, and the live
 * CPU/RAM/battery readout that fills the island's own gauges.
 *
 * Exported as a value rather than a bare union so the main process can build its
 * `RENDERER_TOOLS` set from the same list the renderer switches on.
 */
export const RENDERER_TOOL_NAMES = [
  'get_system_telemetry',
  'set_focus_timer',
  'add_task',
  'control_media'
] as const

export type RendererToolName = (typeof RENDERER_TOOL_NAMES)[number]

export type RendererToolCall = {
  callId: string
  name: RendererToolName
  args: Record<string, unknown>
}

export type RendererToolResult = {
  callId: string
  /** Human-readable outcome, handed straight back to the model as the tool's answer. */
  result: string
  ok: boolean
}

export type IslandAlertType = 'volume' | 'clipboard' | 'battery' | 'calendar' | 'capslock' | 'focus' | 'gmail'


