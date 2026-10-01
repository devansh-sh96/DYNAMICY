import type { IcyTurn } from '../shared/ipc'

export type IslandAlertType = 'volume' | 'clipboard' | 'battery' | 'calendar' | 'capslock' | 'focus' | 'gmail'

export interface ElectronAPI {
  setHitRegions: (regions: { x: number; y: number; width: number; height: number }[]) => void
  setIslandCorner: (corner: 'bottom-right' | null) => void
  dragWindow: (deltaX: number, deltaY: number) => void
  minimizeWindow: () => void
  closeWindow: () => void
  hideWindow: () => void
  finishWindowDrag: () => void
  onSystemStatsUpdate: (
    listener: (stats: {
      cpu: number
      ramUsed: number
      ramTotal: number
      cores: number[]
      gpuLoad: number | null
      gpuName: string
      networkRxKbps: number
      networkTxKbps: number
      diskUsedGb: number
      diskTotalGb: number
    }) => void
  ) => () => void
  listTasks: () => Promise<TaskRecord[]>
  createTask: (title: string) => Promise<TaskRecord>
  updateTask: (input: { id: number; title?: string; completed?: boolean }) => Promise<TaskRecord | null>
  deleteTask: (id: number) => Promise<boolean>
  listFocusSessions: () => Promise<FocusSessionRecord[]>
  createFocusSession: (input?: { startedAt?: number; durationSeconds?: number; notes?: string }) => Promise<FocusSessionRecord>
  updateFocusSession: (input: { id: number; endedAt?: number | null; durationSeconds?: number; completed?: boolean; notes?: string }) => Promise<FocusSessionRecord | null>
  deleteFocusSession: (id: number) => Promise<boolean>
  listProcesses: () => Promise<ProcessEntry[]>
  focusProcess: (pid: number) => Promise<boolean>
  killProcess: (pid: number) => Promise<boolean>
  searchFiles: (query: string) => Promise<FileSearchResult[]>
  openFile: (filePath: string) => Promise<boolean>
  listInstalledApps: () => Promise<InstalledApp[]>
  pickApp: () => Promise<InstalledApp | null>
  launchApp: (path: string) => Promise<boolean>
  launchAppAlias: (target: string) => Promise<{ ok: boolean; name: string }>
  sendShortcutKeys: (keys: string) => Promise<boolean>
  lookupFact: (query: string) => Promise<string | null>
  aiKeyStatus: () => Promise<AiKeyStatus>
  saveAiKey: (key: string) => Promise<AiKeySaveResult>
  clearAiKey: () => Promise<AiKeyStatus>
  testAiKey: () => Promise<{ ok: boolean; error?: string }>
  icyChat: (turns: IcyTurn[]) => Promise<string>
  cancelIcyChat: () => Promise<void>
  onIcyDelta: (listener: (payload: { requestId: number; chunk: string }) => void) => () => void
  onIcyToolCall: (listener: (call: RendererToolCall) => void) => () => void
  resolveIcyToolCall: (result: RendererToolResult) => void
  controlMedia: (control: 'playPause' | 'next' | 'previous') => Promise<boolean>
  onMediaUpdate: (listener: (media: {
    title: string
    artist: string
    app: string
    playback: 'Playing' | 'Paused' | 'Stopped' | 'Unknown'
    positionSeconds: number
    durationSeconds: number
  } | null) => void) => () => void
  onFullscreenActive: (listener: (fullscreen: boolean) => void) => () => void
  onIncomingMessage: (listener: (message: { id: string; sender: string; avatar?: string; text: string; timestamp: number }) => void) => () => void
  onIslandAlert: (listener: (alert: { type: IslandAlertType; message: string; value?: number }) => void) => () => void
  triggerMockNotification: (message: { sender: string; text: string; avatar?: string }) => void
  triggerMockAlert: (alert: { type: IslandAlertType; message: string; value?: number }) => void
  listCalendarEvents: () => Promise<CalendarEventRecord[]>
  createCalendarEvent: (input: { title: string; startsAt: number; endsAt?: number | null; notes?: string }) => Promise<CalendarEventRecord>
  deleteCalendarEvent: (id: string) => Promise<boolean>
  listClipboard: () => Promise<ClipboardSnippet[]>
  writeClipboard: (text: string) => Promise<boolean>
  onClipboardUpdate: (listener: (items: ClipboardSnippet[]) => void) => () => void
  getMediaPrivacy: () => Promise<MediaPrivacy>
  onMediaPrivacy: (listener: (flags: MediaPrivacy) => void) => () => void
  onCapsLock: (listener: (capsOn: boolean) => void) => () => void
  getVolume: () => Promise<number>
  setVolume: (level: number) => Promise<number>
  getQuickSettings: () => Promise<import('../shared/ipc').QuickSettingsState>
  toggleQuickSetting: (key: import('../shared/ipc').QuickToggleKey) => Promise<import('../shared/ipc').QuickSettingsState>
  setBrightness: (level: number) => Promise<number>
  openQuickSettingsTarget: (target: string) => Promise<boolean>
  onWindowEvent: (
    event: 'focus' | 'blur',
    listener: () => void
  ) => () => void
}

interface TaskRecord { id: number; title: string; completed: boolean; createdAt: number; updatedAt: number }
interface FocusSessionRecord {
  id: number
  startedAt: number
  endedAt: number | null
  durationSeconds: number
  completed: boolean
  notes: string
}
interface ProcessEntry { pid: number; name: string; cpu: number; memoryMb: number; path: string }
interface FileSearchResult { path: string; name: string }
export interface InstalledApp { name: string; path: string }
export interface CalendarEventRecord {
  id: string
  title: string
  startsAt: number
  endsAt: number | null
  notes: string
  source: 'local'
}
export interface ClipboardSnippet { id: string; text: string; copiedAt: number }
export interface MediaPrivacy { camera: boolean; microphone: boolean }
export interface AiKeyStatus {
  connected: boolean
  hint?: string
  updatedAt?: number
  encryptionAvailable: boolean
}
export type AiKeySaveResult = AiKeyStatus & { ok: boolean; error?: string }
export type RendererToolName = 'get_system_telemetry' | 'set_focus_timer' | 'add_task' | 'control_media'
export interface RendererToolCall { callId: string; name: RendererToolName; args: Record<string, unknown> }
export interface RendererToolResult { callId: string; result: string; ok: boolean }

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
