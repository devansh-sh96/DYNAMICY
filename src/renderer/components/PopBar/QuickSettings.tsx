import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import {
  Accessibility,
  BatteryMedium,
  Bluetooth,
  Captions,
  ChevronRight,
  Leaf,
  Plane,
  Settings,
  Sun,
  Volume2,
  VolumeX,
  Wifi
} from 'lucide-react'
import { useQuickSettings } from '../../hooks/useQuickSettings'
import { useAppStore } from '../../stores/appStore'

/**
 * Windows 11 quick-settings flyout rebuilt inside the panel: three system radio
 * toggles, three deep links, brightness and volume sliders, and a battery pill.
 *
 * The radio tiles only animate state — the actual radio work lives in the main
 * process, which re-reads every radio after a toggle so the tile never lies
 * about a switch the driver refused.
 */

type BatterySnapshot = { level: number; charging: boolean }

type BatteryHandle = {
  level: number
  charging: boolean
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

type NavigatorsWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryHandle>
}

const tileTransition = { type: 'spring', stiffness: 400, damping: 28 } as const
const SLIDER_DEBOUNCE_MS = 60

/**
 * The thumb follows the pointer instantly while at most one system call is in flight;
 * the newest value always goes next, and a late reply can never drag the thumb back.
 */
const useSystemSlider = (send: (level: number) => Promise<unknown>) => {
  const [draft, setDraft] = useState<number | null>(null)
  const inFlight = useRef(false)
  const queued = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const schedulePump = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      void pump()
    }, SLIDER_DEBOUNCE_MS)
  }, [])

  const pump = useCallback(async () => {
    if (inFlight.current || queued.current === null) return
    const level = queued.current
    queued.current = null
    inFlight.current = true
    try {
      await send(level).catch(() => undefined)
    } finally {
      inFlight.current = false
      if (queued.current !== null) schedulePump()
      else setDraft(null)
    }
  }, [schedulePump, send])

  const change = useCallback((level: number) => {
    setDraft(level)
    queued.current = level
    schedulePump()
  }, [schedulePump])

  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
  }, [])

  return { draft, change }
}

const fillStyle = (level: number) => ({ '--fill': `${level}%` }) as CSSProperties

const QuickSettings = () => {
  const { state, busyKey, toggle, setBrightness } = useQuickSettings()
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)

  const [volume, setVolume] = useState<number | null>(null)
  const [battery, setBattery] = useState<BatterySnapshot | null>(null)

  useEffect(() => {
    let alive = true
    void window.electronAPI.getVolume().then((level) => { if (alive) setVolume(level) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const nav = navigator as NavigatorsWithBattery
    if (!nav.getBattery) return
    let batteryRef: BatteryHandle | null = null
    const onLevel = () => {
      if (batteryRef) setBattery({ level: Math.round(batteryRef.level * 100), charging: batteryRef.charging })
    }
    void nav.getBattery().then((b) => {
      batteryRef = b
      onLevel()
      b.addEventListener('levelchange', onLevel)
      b.addEventListener('chargingchange', onLevel)
    })
    return () => {
      batteryRef?.removeEventListener?.('levelchange', onLevel)
      batteryRef?.removeEventListener?.('chargingchange', onLevel)
    }
  }, [])

  const sendVolume = useCallback(async (level: number) => {
    setVolume(await window.electronAPI.setVolume(level))
  }, [])
  const volumeSlider = useSystemSlider(sendVolume)
  const brightnessSlider = useSystemSlider(setBrightness)
  const volumeValue = volumeSlider.draft ?? volume
  const brightnessValue = brightnessSlider.draft ?? state?.brightness.level ?? 0

  const wifiActive = state?.wifi.active ?? false
  const wifiDetail = wifiActive
    ? (state?.wifi.detail ?? 'Connected')
    : (state?.wifi.supported === false ? 'Unavailable' : 'Off')

  return (
    <section className="quick-settings" aria-label="Quick settings">
      <div className="quick-settings-top">
        <div className="quick-settings-tiles" role="group" aria-label="Quick toggles">
          <motion.button
            type="button"
            className={`quick-tile ${wifiActive ? 'is-on' : ''} ${state?.wifi.supported === false ? 'is-unsupported' : ''}`}
            onClick={() => void toggle('wifi')}
            disabled={busyKey !== null || state?.wifi.supported === false}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
            aria-pressed={wifiActive}
          >
            <Wifi size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Wi-Fi</span>
              <span className="quick-tile-sub">{busyKey === 'wifi' ? '…' : wifiDetail}</span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            className={`quick-tile ${state?.bluetooth.active ? 'is-on' : ''} ${state?.bluetooth.supported === false ? 'is-unsupported' : ''}`}
            onClick={() => void toggle('bluetooth')}
            disabled={busyKey !== null || state?.bluetooth.supported === false}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
            aria-pressed={state?.bluetooth.active ?? false}
          >
            <Bluetooth size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Bluetooth</span>
              <span className="quick-tile-sub">
                {busyKey === 'bluetooth' ? '…' : state?.bluetooth.supported === false ? 'Unavailable' : state?.bluetooth.active ? 'On' : 'Off'}
              </span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            className={`quick-tile ${state?.airplane.active ? 'is-on' : ''} ${state?.airplane.supported === false ? 'is-unsupported' : ''}`}
            onClick={() => void toggle('airplane')}
            disabled={busyKey !== null || state?.airplane.supported === false}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
            aria-pressed={state?.airplane.active ?? false}
          >
            <Plane size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Airplane</span>
              <span className="quick-tile-sub">
                {busyKey === 'airplane' ? '…' : state?.airplane.supported === false ? 'Unavailable' : state?.airplane.active ? 'On' : 'Off'}
              </span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            className="quick-tile"
            onClick={() => void window.electronAPI.openQuickSettingsTarget('energy-saver')}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
          >
            <Leaf size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Energy saver</span>
              <span className="quick-tile-sub">Battery settings</span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            className="quick-tile"
            onClick={() => void window.electronAPI.openQuickSettingsTarget('accessibility')}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
          >
            <Accessibility size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Accessibility</span>
              <span className="quick-tile-sub">Display settings</span>
            </span>
          </motion.button>

          <motion.button
            type="button"
            className="quick-tile"
            onClick={() => void window.electronAPI.openQuickSettingsTarget('live-captions')}
            whileTap={{ scale: 0.94 }}
            transition={tileTransition}
          >
            <Captions size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="quick-tile-text">
              <span className="quick-tile-label">Live captions</span>
              <span className="quick-tile-sub">Caption settings</span>
            </span>
          </motion.button>
        </div>

        <div className="quick-settings-side">
          {battery && (
            <div
              className={`quick-battery ${battery.charging ? 'is-charging' : ''}`}
              role="status"
              aria-label={`Battery ${battery.level} percent${battery.charging ? ', charging' : ''}`}
            >
              <BatteryMedium size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>{battery.level}%</span>
            </div>
          )}
          <button
            type="button"
            className={`quick-settings-gear ${settingsOpen ? 'is-active' : ''}`}
            title="Settings"
            aria-label="Open settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {(state?.brightness.supported || volumeValue !== null) && (
        <div className="quick-settings-sliders">
          {state?.brightness.supported && (
            <div className="quick-slider-row">
              <Sun size={15} strokeWidth={1.8} aria-hidden="true" />
              <input
                type="range"
                className="quick-slider"
                data-no-window-drag
                min={0}
                max={100}
                step={1}
                value={brightnessValue}
                style={fillStyle(brightnessValue)}
                onChange={(event) => brightnessSlider.change(Number(event.target.value))}
                onInput={(event) => brightnessSlider.change(Number(event.currentTarget.value))}
                aria-label="Brightness"
              />
            </div>
          )}
          {volumeValue !== null && (
            <div className="quick-slider-row">
              {volumeValue === 0 ? (
                <VolumeX size={15} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Volume2 size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
              <input
                type="range"
                className="quick-slider"
                data-no-window-drag
                min={0}
                max={100}
                step={1}
                value={volumeValue}
                style={fillStyle(volumeValue)}
                aria-label="Volume"
                onChange={(event) => volumeSlider.change(Number(event.target.value))}
                onInput={(event) => volumeSlider.change(Number(event.currentTarget.value))}
              />
              <button
                type="button"
                className="quick-slider-expand"
                title="Open volume mixer"
                aria-label="Open volume mixer"
                onClick={() => void window.electronAPI.openQuickSettingsTarget('volume-mixer')}
              >
                <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default QuickSettings
