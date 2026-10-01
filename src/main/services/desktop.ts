import { BrowserWindow, clipboard, ipcMain } from 'electron'
import { execFile, spawn, type ChildProcessByStdio } from 'child_process'
import { promisify } from 'util'
import type { Readable } from 'stream'
import { getSecureStore, type ClipboardSnippet } from '../secure-store'

const execFileAsync = promisify(execFile)
const CLIPBOARD_LIMIT = 10
const SNIPPET_MAX = 4000

let clipboardTimer: NodeJS.Timeout | undefined
/** Restart delay used when the long-lived Caps Lock host exits unexpectedly. */
let capsTimer: NodeJS.Timeout | undefined
let capsChild: ChildProcessByStdio<null, Readable, null> | undefined
let mediaTimer: NodeJS.Timeout | undefined
let stopped = false
let lastClipboard = ''
let lastCaps = false
let lastVolume = 48
let lastMediaFlags: MediaPrivacy | null = null

const broadcast = (channel: string, payload?: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

const runPowerShell = async (command: string) => {
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 4000
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

const sendVolumeKey = async (direction: 'up' | 'down') => {
  const key = direction === 'up' ? '175' : '174'
  await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]${key})`)
}

/**
 * Real master-volume read/write through the Core Audio endpoint. The SendKeys path
 * above is relative and only used by `system:adjust-volume` (kept as-is); the quick
 * settings slider needs an absolute position, which COM gives us. The C# is compiled
 * once per call, so this is reserved for panel-open / slider-release, never per-frame.
 */
const VOLUME_CSHARP = [
  'using System;',
  'using System.Runtime.InteropServices;',
  '[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]',
  'public class MMDeviceEnumeratorObject { }',
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'public interface IMMDeviceEnumerator {',
  '    [PreserveSig] int NotImpl1();',
  '    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);',
  '}',
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'public interface IMMDevice {',
  '    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);',
  '}',
  '[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  'public interface IAudioEndpointVolume {',
  '    [PreserveSig] int RegisterControlChangeNotify(IntPtr pNotify);',
  '    [PreserveSig] int UnregisterControlChangeNotify(IntPtr pNotify);',
  '    [PreserveSig] int GetChannelCount(out uint pnChannelCount);',
  '    [PreserveSig] int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);',
  '    [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);',
  '    [PreserveSig] int GetMasterVolumeLevel(out float pfLevelDB);',
  '    [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);',
  '}',
  'public static class IcyVolume {',
  '    private static IAudioEndpointVolume Open() {',
  '        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorObject();',
  '        IMMDevice device;',
  '        if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0) throw new Exception("no endpoint");',
  '        Guid iid = typeof(IAudioEndpointVolume).GUID;',
  '        object activated;',
  '        if (device.Activate(ref iid, 1, IntPtr.Zero, out activated) != 0) throw new Exception("no volume");',
  '        return (IAudioEndpointVolume)activated;',
  '    }',
  '    public static int Get() {',
  '        float level;',
  '        if (Open().GetMasterVolumeLevelScalar(out level) != 0) throw new Exception("read failed");',
  '        return (int)Math.Round(level * 100f);',
  '    }',
  '    public static int Set(int percent) {',
  '        float scalar = Math.Max(0f, Math.Min(1f, percent / 100f));',
  '        if (Open().SetMasterVolumeLevelScalar(scalar, Guid.Empty) != 0) throw new Exception("write failed");',
  '        return (int)Math.Round(scalar * 100f);',
  '    }',
  '}'
].join('\n')

const runVolumeScript = async (call: string): Promise<string> => {
  const script = `Add-Type -TypeDefinition @'\n${VOLUME_CSHARP}\n'@\ntry { [Console]::Out.WriteLine([IcyVolume]::${call}) } catch { }`
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 8000 }
    )
    return stdout.trim()
  } catch {
    return ''
  }
}

const clampVolume = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

const queryMasterVolume = async (): Promise<number | null> => {
  const value = Number(await runVolumeScript('Get()'))
  return Number.isFinite(value) ? clampVolume(value) : null
}

const applyMasterVolume = async (level: number): Promise<number | null> => {
  const value = Number(await runVolumeScript(`Set(${clampVolume(level)})`))
  return Number.isFinite(value) ? clampVolume(value) : null
}

type MediaPrivacy = { camera: boolean; microphone: boolean }

const readMediaFlags = async (): Promise<MediaPrivacy> => {
  const script = `
    function Test-Cap($name) {
      $root = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\$name"
      if (-not (Test-Path $root)) { return $false }
      $keys = Get-ChildItem $root -Recurse -ErrorAction SilentlyContinue
      foreach ($key in $keys) {
        $stop = (Get-ItemProperty $key.PSPath -Name LastUsedTimeStop -ErrorAction SilentlyContinue).LastUsedTimeStop
        if ($null -ne $stop -and [int64]$stop -eq 0) { return $true }
      }
      return $false
    }
    $cam = Test-Cap 'webcam'
    $mic = Test-Cap 'microphone'
    Write-Output "$cam|$mic"
  `
  const result = await runPowerShell(script)
  const [camera, microphone] = result.split('|')
  return {
    camera: camera?.toLowerCase() === 'true',
    microphone: microphone?.toLowerCase() === 'true'
  }
}

const readClipboardHistory = (): ClipboardSnippet[] => {
  const stored = getSecureStore().get('clipboardHistory', [])
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (item): item is ClipboardSnippet =>
      Boolean(item) &&
      typeof item.id === 'string' &&
      typeof item.text === 'string' &&
      Number.isFinite(item.copiedAt)
  )
}

/**
 * Electron >= 40 ships the W3C-style Clipboard API, so `clipboard.readText()`
 * resolves with a Promise instead of returning a string synchronously. The value
 * is awaited and coerced to a string before any string method is used on it.
 */
const readClipboardText = async (): Promise<string> => {
  try {
    const value: unknown = await clipboard.readText()
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

const pushClipboard = (text: string) => {
  const store = getSecureStore()
  const current = readClipboardHistory()
  if (current[0]?.text === text) return current
  const next: ClipboardSnippet[] = [
    { id: `${Date.now()}`, text: text.slice(0, SNIPPET_MAX), copiedAt: Date.now() },
    ...current.filter((item) => item.text !== text)
  ].slice(0, CLIPBOARD_LIMIT)
  store.set('clipboardHistory', next)
  return next
}

const startClipboardMonitor = () => {
  if (clipboardTimer) return
  let reading = false
  void readClipboardText().then((text) => {
    lastClipboard = text
  })
  clipboardTimer = setInterval(() => {
    if (reading) return
    reading = true
    void readClipboardText()
      .then((text) => {
        if (!text || text === lastClipboard) return
        lastClipboard = text
        const history = pushClipboard(text)
        broadcast('clipboard:update', history)
        broadcast('island:alert', { type: 'clipboard', message: text.slice(0, 42) })
      })
      .finally(() => {
        reading = false
      })
  }, 700)
}

/**
 * Caps Lock used to be polled with a fresh `powershell.exe` process every 500 ms, which
 * meant two short-lived process spawns per second for the lifetime of the app. A single
 * long-lived host now watches the key state itself and only writes to stdout when it
 * actually flips, so the steady-state cost is a sleeping process instead of constant churn.
 */
const startCapsMonitor = () => {
  if (capsChild || process.platform !== 'win32') return

  const script = [
    'Add-Type -TypeDefinition @\'using System;using System.Runtime.InteropServices;public static class IcyKeys{[DllImport("user32.dll")]public static extern short GetKeyState(int v);}@\'',
    '$previous = $null',
    'while ($true) {',
    '  $state = ([IcyKeys]::GetKeyState(0x14) -band 1) -ne 0',
    '  if ($null -eq $previous) { $previous = $state }',
    '  elseif ($state -ne $previous) {',
    '    $previous = $state',
    '    [Console]::Out.WriteLine($state)',
    '    [Console]::Out.Flush()',
    '  }',
    '  Start-Sleep -Milliseconds 120',
    '}'
  ].join('\r\n')

  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  capsChild = child

  let pending = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const capsOn = line.trim().toLowerCase() === 'true'
      if (capsOn === lastCaps) continue
      lastCaps = capsOn
      if (capsOn) broadcast('island:alert', { type: 'capslock', message: 'Caps Lock on' })
      broadcast('system:caps-lock', capsOn)
    }
  })

  // The host exiting (update, kill, ...) must not leave the monitor permanently dead.
  child.on('exit', () => {
    capsChild = undefined
    if (!stopped) capsTimer = setTimeout(startCapsMonitor, 1000)
  })
  child.on('error', () => { capsChild = undefined })
}

const startMediaMonitor = () => {
  if (mediaTimer) return
  // The privacy flags only change when an app starts or stops using the device, so the
  // result is cached and only pushed to the renderer when it actually flips.
  const publish = (flags: MediaPrivacy) => {
    const previous = lastMediaFlags
    if (previous && previous.camera === flags.camera && previous.microphone === flags.microphone) return
    lastMediaFlags = flags
    broadcast('system:media-privacy', flags)
  }
  mediaTimer = setInterval(() => {
    void readMediaFlags().then(publish)
  }, 2500)
  void readMediaFlags().then(publish)
}

export const registerDesktopHandlers = () => {
  startClipboardMonitor()
  startCapsMonitor()
  startMediaMonitor()

  ipcMain.handle('clipboard:list', () => readClipboardHistory())
  ipcMain.handle('clipboard:write', async (_event, value: unknown) => {
    if (typeof value !== 'string' || !value) return false
    try {
      await clipboard.writeText(value)
    } catch {
      return false
    }
    lastClipboard = value
    broadcast('clipboard:update', pushClipboard(value))
    return true
  })

  ipcMain.handle('system:adjust-volume', async (_event, delta: unknown) => {
    const amount = Number(delta)
    if (!Number.isFinite(amount) || amount === 0) return lastVolume
    const direction = amount > 0 ? 'up' : 'down'
    const steps = Math.min(4, Math.max(1, Math.round(Math.abs(amount))))
    for (let index = 0; index < steps; index += 1) await sendVolumeKey(direction)
    lastVolume = Math.max(0, Math.min(100, lastVolume + amount * 2))
    return lastVolume
  })

  // Absolute position control for system volume, falling back to the tracked value when
  // Core Audio is unreachable.
  ipcMain.handle('system:set-volume', async (_event, level: unknown) => {
    const target = Number(level)
    if (!Number.isFinite(target)) return lastVolume
    const applied = await applyMasterVolume(target)
    lastVolume = applied ?? clampVolume(target)
    return lastVolume
  })

  ipcMain.handle('system:get-volume', async () => {
    const measured = await queryMasterVolume()
    if (measured !== null) lastVolume = measured
    return lastVolume
  })
  ipcMain.handle('system:media-privacy', () => readMediaFlags())
}

export const stopDesktopMonitors = () => {
  stopped = true
  if (clipboardTimer) clearInterval(clipboardTimer)
  if (capsTimer) clearTimeout(capsTimer)
  if (mediaTimer) clearInterval(mediaTimer)
  if (capsChild) {
    capsChild.kill()
    capsChild = undefined
  }
  clipboardTimer = undefined
  capsTimer = undefined
  mediaTimer = undefined
}
