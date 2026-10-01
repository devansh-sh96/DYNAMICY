import { ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { QuickSettingsState, QuickToggleKey } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

/**
 * Hardware toggles for the quick-settings strip. Each reader is defensive: a missing
 * Wi-Fi card, a Bluetooth stack that hides behind a store app, or a desktop without a
 * WMI backlight all report `supported: false` and the matching tile falls back to
 * opening the relevant Settings page rather than pretending the toggle worked.
 */

const runPowerShell = async (command: string, timeout = 6000): Promise<{ ok: boolean; output: string }> => {
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout
    })
    return { ok: true, output: stdout.trim() }
  } catch {
    return { ok: false, output: '' }
  }
}

// netsh takes plain argv (no shell), so an SSID is passed as one argument and can never
// be interpreted as a command — no injection surface.
const runNetsh = async (args: string[]): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('netsh', args, { windowsHide: true, timeout: 6000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

/** SSID the Wi-Fi toggle reconnects to: the last network we saw connected, else the first saved profile. */
let rememberedSsid: string | null = null

const readWifi = async (): Promise<QuickSettingsState['wifi']> => {
  const output = await runNetsh(['wlan', 'show', 'interfaces'])
  if (!output) return { supported: false, active: false, detail: null }
  const state = /^\s*State\s*:\s*(\S+)/im.exec(output)?.[1]?.toLowerCase()
  if (state !== 'connected' && state !== 'disconnected') return { supported: false, active: false, detail: null }
  const ssid = /^\s*SSID\s*:\s*(.+)$/im.exec(output)?.[1]?.trim() ?? null
  if (state === 'connected' && ssid) rememberedSsid = ssid
  return { supported: true, active: state === 'connected', detail: state === 'connected' ? ssid : null }
}

const firstWifiProfile = async (): Promise<string | null> => {
  const output = await runNetsh(['wlan', 'show', 'profiles'])
  return /All User Profile\s*:\s*(.+)$/im.exec(output)?.[1]?.trim() ?? null
}

const toggleWifi = async (): Promise<void> => {
  const current = await readWifi()
  if (!current.supported) {
    await shell.openExternal('ms-settings:network-wifi')
    return
  }
  if (current.active) {
    await runNetsh(['wlan', 'disconnect'])
    return
  }
  const ssid = rememberedSsid ?? (await firstWifiProfile())
  if (ssid) await runNetsh(['wlan', 'connect', `name="${ssid}"`])
  else await shell.openExternal('ms-settings:network-wifi')
}

const readBluetooth = async (): Promise<QuickSettingsState['bluetooth']> => {
  const present = await runPowerShell(
    '(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Measure-Object).Count'
  )
  if (!present.ok || !/^[0-9]+$/.test(present.output)) return { supported: false, active: false }
  if (Number(present.output) === 0) return { supported: false, active: false }
  // A powered-down radio still enumerates but reports Status "Error" instead of "OK".
  const ok = await runPowerShell(
    "(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | Measure-Object).Count"
  )
  return { supported: true, active: ok.ok && Number(ok.output) > 0 }
}

const toggleBluetooth = async (): Promise<void> => {
  const before = await readBluetooth()
  if (!before.supported) {
    await shell.openExternal('ms-settings:bluetooth')
    return
  }
  // Disabling/enabling a PnP device needs elevation; when it fails we land on the
  // Settings page, which is the supported per-user toggle.
  const verb = before.active ? 'Disable-PnpDevice' : 'Enable-PnpDevice'
  await runPowerShell(
    `Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | ${verb} -Confirm:$false -ErrorAction SilentlyContinue`
  )
  await new Promise((resolve) => setTimeout(resolve, 900))
  const after = await readBluetooth()
  if (after.active === before.active) await shell.openExternal('ms-settings:bluetooth')
}

const AIRPLANE_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\RadioManagement\\SystemRadioState'

const readAirplane = async (): Promise<QuickSettingsState['airplane']> => {
  const result = await runPowerShell(
    `(Get-ItemProperty -Path '${AIRPLANE_KEY}' -Name SystemRadioState -ErrorAction SilentlyContinue).SystemRadioState`
  )
  if (!result.ok || !/^[01]$/.test(result.output)) return { supported: false, active: false }
  return { supported: true, active: result.output === '1' }
}

const toggleAirplane = async (): Promise<void> => {
  const before = await readAirplane()
  if (!before.supported) {
    await shell.openExternal('ms-settings:network-airplanemode')
    return
  }
  const next = before.active ? 0 : 1
  await runPowerShell(
    `Set-ItemProperty -Path '${AIRPLANE_KEY}' -Name SystemRadioState -Value ${next} -ErrorAction SilentlyContinue`
  )
  await new Promise((resolve) => setTimeout(resolve, 700))
  const after = await readAirplane()
  if (!after.supported || after.active === before.active) {
    // The registry write is ignored without elevation; the Settings page is the real toggle.
    await shell.openExternal('ms-settings:network-airplanemode')
  }
}

// A backlight never disappears at runtime, so once seen it stays; a slow read reuses it.
let lastBrightness: QuickSettingsState['brightness'] | null = null

const readBrightness = async (): Promise<QuickSettingsState['brightness']> => {
  const result = await runPowerShell(
    '(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty CurrentBrightness)'
  )
  if (!result.ok || !/^[0-9]+$/.test(result.output)) return { supported: false, level: 0 }
  return { supported: true, level: Number(result.output) }
}

const setBrightness = async (level: number): Promise<number> => {
  const clamped = Math.max(0, Math.min(100, Math.round(level)))
  await runPowerShell(
    `(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue).WmiSetBrightness(1, ${clamped})`
  )
  lastBrightness = { supported: true, level: clamped }
  return clamped
}

// One PowerShell process for every non-netsh read: spawning four in parallel on a slow
// CPU pushed the brightness read past its timeout, so the slider randomly vanished.
const READ_ALL_SCRIPT = [
  '$bt = @(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue)',
  "$btOk = @($bt | Where-Object { $_.Status -eq 'OK' }).Count",
  `$air = (Get-ItemProperty -Path '${AIRPLANE_KEY}' -Name SystemRadioState -ErrorAction SilentlyContinue).SystemRadioState`,
  '$br = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty CurrentBrightness',
  '@{ btCount = $bt.Count; btOk = $btOk; air = $air; br = $br } | ConvertTo-Json -Compress'
].join('; ')

const readSystemRadios = async (): Promise<Pick<QuickSettingsState, 'bluetooth' | 'airplane' | 'brightness'>> => {
  const result = await runPowerShell(READ_ALL_SCRIPT, 15000)
  let parsed: { btCount?: unknown; btOk?: unknown; air?: unknown; br?: unknown } = {}
  try { parsed = result.ok ? JSON.parse(result.output) : {} } catch { parsed = {} }
  const btCount = Number(parsed.btCount)
  const bluetooth = Number.isFinite(btCount) && btCount > 0
    ? { supported: true, active: Number(parsed.btOk) > 0 }
    : { supported: false, active: false }
  const airplane = parsed.air === 0 || parsed.air === 1
    ? { supported: true, active: parsed.air === 1 }
    : { supported: false, active: false }
  if (typeof parsed.br === 'number') lastBrightness = { supported: true, level: parsed.br }
  return { bluetooth, airplane, brightness: lastBrightness ?? { supported: false, level: 0 } }
}

let collecting: Promise<QuickSettingsState> | null = null

const collectState = (): Promise<QuickSettingsState> => {
  collecting ??= Promise.all([readWifi(), readSystemRadios()])
    .then(([wifi, radios]) => ({ wifi, ...radios }))
    .finally(() => { collecting = null })
  return collecting
}

/** ms-settings: pages / helper exes for the launcher tiles and the volume expand affordance. */
const QUICK_TARGETS: Record<string, string> = {
  'energy-saver': 'ms-settings:powersleep',
  accessibility: 'ms-settings:easeofaccess-display',
  'live-captions': 'ms-settings:easeofaccess-captions',
  'volume-mixer': 'sndvol.exe'
}

const toggles: Record<QuickToggleKey, () => Promise<void>> = {
  wifi: toggleWifi,
  bluetooth: toggleBluetooth,
  airplane: toggleAirplane
}

export const registerQuickSettingsHandlers = () => {
  ipcMain.handle('quick-settings:get-state', () => collectState())

  ipcMain.handle('quick-settings:toggle', async (_event, key: unknown) => {
    if (typeof key !== 'string' || !(key in toggles)) return collectState()
    await toggles[key as QuickToggleKey]()
    // Give the radio/driver a beat to settle before re-reading so the pill flips once.
    return collectState()
  })

  ipcMain.handle('quick-settings:set-brightness', async (_event, level: unknown) => {
    const value = Number(level)
    if (!Number.isFinite(value)) return (await readBrightness()).level
    return setBrightness(value)
  })

  ipcMain.handle('quick-settings:open', async (_event, target: unknown) => {
    const destination = typeof target === 'string' ? QUICK_TARGETS[target] : undefined
    if (!destination) return false
    if (destination.endsWith('.exe')) {
      // sndvol and friends are programs, not URIs.
      await execFileAsync(destination, [], { windowsHide: false }).catch(() => undefined)
    } else {
      await shell.openExternal(destination)
    }
    return true
  })
}
