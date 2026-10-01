import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AiKeySaveResult,
  AiKeyStatus,
  FileSearchResult,
  HitRegion,
  InstalledApp,
  IslandCorner,
  IcyTurn,
  ProcessEntry,
  QuickSettingsState,
  QuickToggleKey,
  RendererToolCall,
  RendererToolResult
} from '../shared/ipc'

type WindowLifecycleEvent = 'focus' | 'blur'
type WindowLifecycleListener = () => void
type SystemStats = {
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
}
type TaskRecord = { id: number; title: string; completed: boolean; createdAt: number; updatedAt: number }
type FocusSessionRecord = {
  id: number
  startedAt: number
  endedAt: number | null
  durationSeconds: number
  completed: boolean
  notes: string
}
type MediaState = {
  title: string
  artist: string
  app: string
  playback: 'Playing' | 'Paused' | 'Stopped' | 'Unknown'
  positionSeconds: number
  durationSeconds: number
}
type IncomingMessage = { id: string; sender: string; avatar?: string; text: string; timestamp: number }
type IslandAlert = { type: 'volume' | 'clipboard' | 'battery' | 'calendar' | 'capslock' | 'focus' | 'gmail'; message: string; value?: number }
type CalendarEventRecord = {
  id: string
  title: string
  startsAt: number
  endsAt: number | null
  notes: string
  source: 'local'
}
type ClipboardSnippet = { id: string; text: string; copiedAt: number }
type MediaPrivacy = { camera: boolean; microphone: boolean }

export interface ElectronAPI {
  setHitRegions: (regions: HitRegion[]) => void
  setIslandCorner: (corner: IslandCorner | null) => void
  dragWindow: (deltaX: number, deltaY: number) => void
  minimizeWindow: () => void
  closeWindow: () => void
  hideWindow: () => void
  finishWindowDrag: () => void
  onSystemStatsUpdate: (listener: (stats: SystemStats) => void) => () => void
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
  onMediaUpdate: (listener: (media: MediaState | null) => void) => () => void
  onFullscreenActive: (listener: (fullscreen: boolean) => void) => () => void
  onIncomingMessage: (listener: (message: IncomingMessage) => void) => () => void
  onIslandAlert: (listener: (alert: IslandAlert) => void) => () => void
  triggerMockNotification: (message: { sender: string; text: string; avatar?: string }) => void
  triggerMockAlert: (alert: IslandAlert) => void
  listCalendarEvents: () => Promise<CalendarEventRecord[]>
  createCalendarEvent: (input: { title: string; startsAt: number; endsAt?: number | null; notes?: string }) => Promise<CalendarEventRecord>
  deleteCalendarEvent: (id: string) => Promise<boolean>
  listClipboard: () => Promise<ClipboardSnippet[]>
  writeClipboard: (text: string) => Promise<boolean>
  onClipboardUpdate: (listener: (items: ClipboardSnippet[]) => void) => () => void
  adjustVolume: (delta: number) => Promise<number>
  getVolume: () => Promise<number>
  setVolume: (level: number) => Promise<number>
  getQuickSettings: () => Promise<QuickSettingsState>
  toggleQuickSetting: (key: QuickToggleKey) => Promise<QuickSettingsState>
  setBrightness: (level: number) => Promise<number>
  openQuickSettingsTarget: (target: string) => Promise<boolean>
  getMediaPrivacy: () => Promise<MediaPrivacy>
  onMediaPrivacy: (listener: (flags: MediaPrivacy) => void) => () => void
  onCapsLock: (listener: (capsOn: boolean) => void) => () => void
  onWindowEvent: (
    event: WindowLifecycleEvent,
    listener: WindowLifecycleListener
  ) => () => void
}

const lifecycleChannelMap: Record<WindowLifecycleEvent, string> = {
  focus: 'window:focus',
  blur: 'window:blur'
}

const electronAPI: ElectronAPI = {
  setHitRegions: (regions) => {
    ipcRenderer.send('window:set-hit-regions', regions)
  },
  setIslandCorner: (corner) => {
    ipcRenderer.send('window:set-corner', corner)
  },
  dragWindow: (deltaX, deltaY) => {
    ipcRenderer.send('window:drag', deltaX, deltaY)
  },
  minimizeWindow: () => {
    ipcRenderer.send('window:minimize')
  },
  closeWindow: () => {
    ipcRenderer.send('window:close')
  },
  hideWindow: () => ipcRenderer.send('window:hide'),
  finishWindowDrag: () => ipcRenderer.send('window:drag-end'),
  onSystemStatsUpdate: (listener) => {
    const wrappedListener = (_ipcEvent: IpcRendererEvent, stats: SystemStats) => listener(stats)
    ipcRenderer.on('system:stats-update', wrappedListener)

    return () => ipcRenderer.removeListener('system:stats-update', wrappedListener)
  },
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title) => ipcRenderer.invoke('tasks:create', title),
  updateTask: (input) => ipcRenderer.invoke('tasks:update', input),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  listFocusSessions: () => ipcRenderer.invoke('focus-sessions:list'),
  createFocusSession: (input) => ipcRenderer.invoke('focus-sessions:create', input),
  updateFocusSession: (input) => ipcRenderer.invoke('focus-sessions:update', input),
  deleteFocusSession: (id) => ipcRenderer.invoke('focus-sessions:delete', id),
  listProcesses: () => ipcRenderer.invoke('process:list'),
  focusProcess: (pid) => ipcRenderer.invoke('process:focus', pid),
  killProcess: (pid) => ipcRenderer.invoke('process:kill', pid),
  searchFiles: (query) => ipcRenderer.invoke('files:search', query),
  openFile: (filePath) => ipcRenderer.invoke('files:open', filePath),
  listInstalledApps: () => ipcRenderer.invoke('apps:list'),
  pickApp: () => ipcRenderer.invoke('apps:pick'),
  launchApp: (path) => ipcRenderer.invoke('apps:launch', path),
  launchAppAlias: (target) => ipcRenderer.invoke('apps:launch-alias', target),
  sendShortcutKeys: (keys) => ipcRenderer.invoke('apps:send-keys', keys),
  lookupFact: (query) => ipcRenderer.invoke('facts:lookup', query),
  aiKeyStatus: () => ipcRenderer.invoke('ai-key:status'),
  saveAiKey: (key) => ipcRenderer.invoke('ai-key:save', key),
  clearAiKey: () => ipcRenderer.invoke('ai-key:clear'),
  testAiKey: () => ipcRenderer.invoke('ai-key:test'),
  icyChat: (turns) => ipcRenderer.invoke('icy:chat', turns),
  cancelIcyChat: () => ipcRenderer.invoke('icy:cancel'),
  onIcyDelta: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, payload: { requestId: number; chunk: string }) => listener(payload)
    ipcRenderer.on('icy:delta', wrappedListener)
    return () => ipcRenderer.removeListener('icy:delta', wrappedListener)
  },
  onIcyToolCall: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, call: RendererToolCall) => listener(call)
    ipcRenderer.on('icy:tool-call', wrappedListener)
    return () => ipcRenderer.removeListener('icy:tool-call', wrappedListener)
  },
  resolveIcyToolCall: (result) => {
    ipcRenderer.send('icy:tool-result', result)
  },
  controlMedia: (control) => ipcRenderer.invoke('media:control', control),
  onMediaUpdate: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, media: MediaState | null) => listener(media)
    ipcRenderer.on('media:update', wrappedListener)
    return () => ipcRenderer.removeListener('media:update', wrappedListener)
  },
  onFullscreenActive: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, fullscreen: boolean) => listener(fullscreen)
    ipcRenderer.on('window:fullscreen-active', wrappedListener)
    return () => ipcRenderer.removeListener('window:fullscreen-active', wrappedListener)
  },
  onIncomingMessage: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, message: IncomingMessage) => listener(message)
    ipcRenderer.on('notification:incoming-message', wrappedListener)
    return () => ipcRenderer.removeListener('notification:incoming-message', wrappedListener)
  },
  onIslandAlert: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, alert: IslandAlert) => listener(alert)
    ipcRenderer.on('island:alert', wrappedListener)
    return () => ipcRenderer.removeListener('island:alert', wrappedListener)
  },
  triggerMockNotification: (message) => ipcRenderer.send('notification:mock', message),
  triggerMockAlert: (alert) => ipcRenderer.send('notification:mock-alert', alert),
  listCalendarEvents: () => ipcRenderer.invoke('calendar:list'),
  createCalendarEvent: (input) => ipcRenderer.invoke('calendar:create', input),
  deleteCalendarEvent: (id) => ipcRenderer.invoke('calendar:delete', id),
  listClipboard: () => ipcRenderer.invoke('clipboard:list'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  onClipboardUpdate: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, items: ClipboardSnippet[]) => listener(items)
    ipcRenderer.on('clipboard:update', wrappedListener)
    return () => ipcRenderer.removeListener('clipboard:update', wrappedListener)
  },
  adjustVolume: (delta) => ipcRenderer.invoke('system:adjust-volume', delta),
  getVolume: () => ipcRenderer.invoke('system:get-volume'),
  setVolume: (level) => ipcRenderer.invoke('system:set-volume', level),
  getQuickSettings: () => ipcRenderer.invoke('quick-settings:get-state'),
  toggleQuickSetting: (key) => ipcRenderer.invoke('quick-settings:toggle', key),
  setBrightness: (level) => ipcRenderer.invoke('quick-settings:set-brightness', level),
  openQuickSettingsTarget: (target) => ipcRenderer.invoke('quick-settings:open', target),
  getMediaPrivacy: () => ipcRenderer.invoke('system:media-privacy'),
  onMediaPrivacy: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, flags: MediaPrivacy) => listener(flags)
    ipcRenderer.on('system:media-privacy', wrappedListener)
    return () => ipcRenderer.removeListener('system:media-privacy', wrappedListener)
  },
  onCapsLock: (listener) => {
    const wrappedListener = (_event: IpcRendererEvent, capsOn: boolean) => listener(capsOn)
    ipcRenderer.on('system:caps-lock', wrappedListener)
    return () => ipcRenderer.removeListener('system:caps-lock', wrappedListener)
  },
  onWindowEvent: (event, listener) => {
    const channel = lifecycleChannelMap[event]
    const wrappedListener = (_ipcEvent: IpcRendererEvent) => {
      listener()
    }

    ipcRenderer.on(channel, wrappedListener)

    return () => {
      ipcRenderer.removeListener(channel, wrappedListener)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
