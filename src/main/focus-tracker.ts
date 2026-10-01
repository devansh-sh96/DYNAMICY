import { execFile } from 'child_process'
import { BrowserWindow, screen } from 'electron'
import { promisify } from 'util'

const executeFile = promisify(execFile)
const focusProbe = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct IslandRect { public int Left; public int Top; public int Right; public int Bottom; }
public static class IslandForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out IslandRect rect); }
'@
$handle = [IslandForeground]::GetForegroundWindow()
$rect = New-Object IslandRect
if ($handle -eq [IntPtr]::Zero -or -not [IslandForeground]::GetWindowRect($handle, [ref]$rect)) { 'false'; exit 0 }
$width = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$height = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
($rect.Left -le 1 -and $rect.Top -le 1 -and $rect.Right -ge ($width - 2) -and $rect.Bottom -ge ($height - 2)).ToString().ToLowerInvariant()
`

let timer: NodeJS.Timeout | undefined
let checking = false
let lastFullscreen: boolean | undefined

const checkForegroundWindow = async () => {
  if (checking || process.platform !== 'win32') return
  checking = true

  try {
    const script = focusProbe.replace(
      '$width = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width\n$height = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height',
      `$width = ${screen.getPrimaryDisplay().bounds.width}\n$height = ${screen.getPrimaryDisplay().bounds.height}`
    )
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const { stdout } = await executeFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 1800,
      maxBuffer: 64 * 1024
    })
    const fullscreen = stdout.trim().toLowerCase() === 'true'
    if (fullscreen === lastFullscreen) return

    lastFullscreen = fullscreen
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('window:fullscreen-active', fullscreen)
      }
    }
  } catch {
    // A failed foreground-window probe must not affect the desktop overlay.
  } finally {
    checking = false
  }
}

export const startFocusTracker = () => {
  if (timer || process.platform !== 'win32') return
  void checkForegroundWindow()
  timer = setInterval(() => void checkForegroundWindow(), 2000)
}

export const stopFocusTracker = () => {
  if (timer) clearInterval(timer)
  timer = undefined
}
