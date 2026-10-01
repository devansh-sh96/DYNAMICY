import { BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'

let systemMonitor: UtilityProcess | undefined

export type MediaControl = 'playPause' | 'next' | 'previous'

type MonitorMessage =
  | { channel: 'system:stats-update'; payload: unknown }
  | { channel: 'media:update'; payload: unknown }

const parseMonitorMessage = (message: unknown): MonitorMessage | null => {
  if (!message || typeof message !== 'object') return null
  const candidate = message as { type?: unknown; stats?: unknown; media?: unknown }

  if (candidate.type === 'system:stats-update') return { channel: 'system:stats-update', payload: candidate.stats }
  if (candidate.type === 'media:update') return { channel: 'media:update', payload: candidate.media }
  return null
}

const broadcastToWindows = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

export const startSystemMonitor = () => {
  if (systemMonitor) return

  systemMonitor = utilityProcess.fork(join(__dirname, 'system-monitor.js'), [], {
    serviceName: 'Icy Bear System Monitor'
  })

  systemMonitor.on('message', (message: unknown) => {
    const parsed = parseMonitorMessage(message)
    if (!parsed) return
    broadcastToWindows(parsed.channel, parsed.payload)
  })

  systemMonitor.on('exit', () => {
    systemMonitor = undefined
  })
}

export const stopSystemMonitor = () => {
  if (!systemMonitor) return

  systemMonitor.postMessage({ type: 'system:monitor-stop' })
  systemMonitor.kill()
  systemMonitor = undefined
}

export const registerMediaHandlers = () => {
  const validControls: MediaControl[] = ['playPause', 'next', 'previous']
  ipcMain.handle('media:control', (_event, control: unknown) => {
    if (typeof control !== 'string' || !validControls.includes(control as MediaControl)) {
      throw new Error('Unsupported media control')
    }
    systemMonitor?.postMessage({ type: 'media:control', action: control })
    return Boolean(systemMonitor)
  })
}