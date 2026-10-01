import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'path'
import { registerMediaHandlers, startSystemMonitor, stopSystemMonitor } from './ipc-handlers'
import { closeDatabase, registerDatabaseHandlers } from './database/db'
import { registerProcessHandlers } from './process-manager'
import { registerFileSearchHandlers } from './file-search'
import { registerAppLauncherHandlers } from './app-launcher'
import { registerFactsHandlers } from './facts'
import { startFocusTracker, stopFocusTracker } from './focus-tracker'
import { registerDesktopHandlers, stopDesktopMonitors } from './services/desktop'
import { registerIcyHandlers, stopIcyEngine } from './ai/llm-service'
import { registerAiKeyHandlers } from './ai/key-manager'
import type { HitRegion } from '../shared/ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | undefined

/**
 * Win32 mouse event forwarding (`setIgnoreMouseEvents(true, { forward: true })`) is
 * unreliable on Windows, so the island decides interactivity by hit testing the real
 * cursor position against the rectangles the renderer reports instead of trusting
 * `mouseenter` / `mouseleave`.
 */
const HIT_TEST_INTERVAL_MS = 8
const HIT_TEST_PADDING = 4
const WINDOW_WIDTH = 860
// Tall enough for the expanded PopBar; the extra height hangs below the collapsed island.
const WINDOW_MAX_HEIGHT = 756
// Height the bottom-right dock math assumes, so a taller window still parks the island
// at the same on-screen spot (the island rides at the top of the window).

let hitRegions: HitRegion[] = []
let hitRegionsReported = false
let hitTestTimer: NodeJS.Timeout | undefined
let mouseIgnored = true

/**
 * `getBounds()` is a synchronous round trip to the window manager, so its result is
 * cached and refreshed only when the window can actually have moved.
 */
let cachedBounds: Electron.Rectangle | null = null

const applyMouseIgnore = (ignore: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed() || mouseIgnored === ignore) return
  mouseIgnored = ignore
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
}

const invalidateCachedBounds = () => {
  cachedBounds = null
}

const getCachedBounds = (): Electron.Rectangle | null => {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  if (!cachedBounds) cachedBounds = mainWindow.getBounds()
  return cachedBounds
}

const isHitRegion = (value: unknown): value is HitRegion => {
  if (!value || typeof value !== 'object') return false
  const region = value as Partial<HitRegion>
  return (['x', 'y', 'width', 'height'] as const).every((key) => typeof region[key] === 'number' && Number.isFinite(region[key]))
}

const evaluateMouseIgnore = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Stay clickable until the renderer has reported its layout, and while a drag is running.
  if (!hitRegionsReported) {
    applyMouseIgnore(false)
    return
  }

  const bounds = getCachedBounds()
  if (!bounds) return

  const cursor = screen.getCursorScreenPoint()
  const x = cursor.x - bounds.x
  const y = cursor.y - bounds.y
  const overIsland = hitRegions.some((region) => (
    x >= region.x - HIT_TEST_PADDING &&
    x <= region.x + region.width + HIT_TEST_PADDING &&
    y >= region.y - HIT_TEST_PADDING &&
    y <= region.y + region.height + HIT_TEST_PADDING
  ))

  applyMouseIgnore(!overIsland)
}

const startHitTesting = () => {
  stopHitTesting()
  hitTestTimer = setInterval(evaluateMouseIgnore, HIT_TEST_INTERVAL_MS)
}

const stopHitTesting = () => {
  if (hitTestTimer === undefined) return
  clearInterval(hitTestTimer)
  hitTestTimer = undefined
}

const createTray = () => {
  if (tray) return
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="10" fill="#292b31"/><path d="M9 13a3 3 0 0 1 5-3 3 3 0 0 1 5 0 3 3 0 0 1 4 3v9c0 4-14 4-14 0z" fill="#f7faf8"/><circle cx="13" cy="17" r="1" fill="#17191b"/><circle cx="19" cy="17" r="1" fill="#17191b"/><ellipse cx="16" cy="20" rx="2" ry="1" fill="#17191b"/></svg>'
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  tray = new Tray(icon)
  tray.setToolTip('Icy Bear')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Icy Bear', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]))
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

const createWindow = (): BrowserWindow => {
  const workArea = screen.getPrimaryDisplay().workArea
  // Keep the window inside the work area: the pop bar panel is sized from `100vh`,
  // and a window taller than the work area would have its footer pushed off-screen.
  const width = Math.min(WINDOW_WIDTH, workArea.width)
  const height = Math.min(WINDOW_MAX_HEIGHT, workArea.height)

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'geolocation')
  })

  win.setPosition(Math.round(workArea.x + (workArea.width - width) / 2), workArea.y + 8)
  win.setIgnoreMouseEvents(true, { forward: true })

  // The hit test reads the window rectangle on a timer, so every path that can move or
  // resize the window has to drop the cached copy.
  win.on('move', invalidateCachedBounds)
  win.on('resize', invalidateCachedBounds)
  win.on('restore', invalidateCachedBounds)
  win.on('unmaximize', invalidateCachedBounds)
  screen.on('display-metrics-changed', invalidateCachedBounds)

  win.on('ready-to-show', () => {
    invalidateCachedBounds()
    win.show()
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[icy-bear] renderer process gone', details)
  })

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[icy-bear] preload failed for ${preloadPath}: ${error.message}`)
  })

  win.on('focus', () => {
    win.webContents.send('window:focus')
  })

  win.on('blur', () => {
    win.webContents.send('window:blur')
  })

  return win
}

const registerWindowIpc = () => {
  ipcMain.on('window:set-hit-regions', (_event, regions: unknown) => {
    if (!Array.isArray(regions)) return
    hitRegions = regions.filter(isHitRegion).slice(0, 40)
    hitRegionsReported = true
    evaluateMouseIgnore()
  })

  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.on('window:hide', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    createTray()
    mainWindow.hide()
  })

  ipcMain.on('notification:mock', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') return
    const message = input as { sender?: unknown; text?: unknown; avatar?: unknown }
    if (typeof message.sender !== 'string' || typeof message.text !== 'string') return
    const payload = {
      id: `${Date.now()}`,
      sender: message.sender.slice(0, 80),
      text: message.text.slice(0, 2000),
      avatar: typeof message.avatar === 'string' ? message.avatar.slice(0, 500) : undefined,
      timestamp: Date.now()
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('notification:incoming-message', payload)
    }
  })

  ipcMain.on('notification:mock-alert', (_event, input: unknown) => {
    if (!input || typeof input !== 'object') return
    const alert = input as { type?: unknown; message?: unknown; value?: unknown }
    if (!['volume', 'clipboard', 'battery', 'calendar', 'capslock'].includes(String(alert.type)) || typeof alert.message !== 'string') return
    const payload = {
      type: alert.type,
      message: alert.message.slice(0, 160),
      value: typeof alert.value === 'number' && Number.isFinite(alert.value) ? alert.value : undefined
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('island:alert', payload)
    }
  })
}

const createAndLoadWindow = async () => {
  hitRegions = []
  hitRegionsReported = false
  mouseIgnored = true
  invalidateCachedBounds()
  mainWindow = createWindow()
  startSystemMonitor()
  startHitTesting()

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerWindowIpc()
  registerDatabaseHandlers()
  registerProcessHandlers()
  registerFileSearchHandlers()
  registerAppLauncherHandlers()
  registerFactsHandlers()
  registerMediaHandlers()
  registerDesktopHandlers()
  registerAiKeyHandlers()
  registerIcyHandlers()
  startFocusTracker()
  void createAndLoadWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createAndLoadWindow()
    }
  })
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = undefined
})

app.on('before-quit', () => {
  stopHitTesting()
  stopSystemMonitor()
  stopFocusTracker()
  stopDesktopMonitors()
  stopIcyEngine()
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
