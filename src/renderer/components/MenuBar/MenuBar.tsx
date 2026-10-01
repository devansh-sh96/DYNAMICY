import { useEffect, useState } from 'react'
import { Battery, BatteryCharging, Music4, Wifi } from 'lucide-react'
import { useMediaStore } from '../../stores/mediaStore'
import MenuClockWidget from './MenuClockWidget'

type BatteryStatus = {
  level: number
  charging: boolean
  addEventListener: (event: 'levelchange' | 'chargingchange', listener: () => void) => void
  removeEventListener: (event: 'levelchange' | 'chargingchange', listener: () => void) => void
}

type BatteryNavigator = Navigator & { getBattery?: () => Promise<BatteryStatus> }

const formatClock = (date: Date) =>
  [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')

/** Centre slot: mirrors the Windows media session, or reports that nothing is playing. */
const MenuMediaSlot = () => {
  const media = useMediaStore((state) => state.media)
  const control = useMediaStore((state) => state.toggleMediaMode)
  const isPlaying = media?.playback === 'Playing'

  if (!media) {
    return (
      <span className="menu-media is-idle" aria-label="No media playing">
        <Music4 size={12} strokeWidth={1.8} aria-hidden="true" />
        <span>No media playing</span>
      </span>
    )
  }

  return (
    <span
      className={`menu-media ${isPlaying ? 'is-playing' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${media.title || media.app}${media.artist ? ` by ${media.artist}` : ''}, ${media.playback}`}
      title={`${media.title || media.app}${media.artist ? ` · ${media.artist}` : ''}`}
      onClick={control}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control() } }}
    >
      <Music4 size={12} strokeWidth={1.8} aria-hidden="true" />
      <strong>{media.title || media.app}</strong>
      {media.artist && <small>{media.artist}</small>}
    </span>
  )
}

const MenuBar = () => {
  const [now, setNow] = useState(() => new Date())
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null)

  useEffect(() => {
    const clockTimer = window.setInterval(() => setNow(new Date()), 1000)
    let batteryStatus: BatteryStatus | undefined
    let disposed = false

    const updateBattery = () => {
      if (batteryStatus && !disposed) {
        setBattery({ level: batteryStatus.level, charging: batteryStatus.charging })
      }
    }

    const getBattery = (navigator as BatteryNavigator).getBattery
    if (getBattery) {
      void getBattery.call(navigator).then((status) => {
        if (disposed) return
        batteryStatus = status
        updateBattery()
        status.addEventListener('levelchange', updateBattery)
        status.addEventListener('chargingchange', updateBattery)
      }).catch(() => setBattery(null))
    }

    return () => {
      disposed = true
      window.clearInterval(clockTimer)
      batteryStatus?.removeEventListener('levelchange', updateBattery)
      batteryStatus?.removeEventListener('chargingchange', updateBattery)
    }
  }, [])

  const BatteryIcon = battery?.charging ? BatteryCharging : Battery

  return (
    <div className="menu-bar">
      {/* Left cluster is intentionally empty; the old File/Diagnostics/Processes/Help
          links are gone and the centre now carries the media session instead. */}
      <div className="menu-bar-side" />
      <MenuMediaSlot />
      <div className="flex items-center gap-3 text-white/70">
        <MenuClockWidget />
        <span className="flex items-center gap-1.5" aria-label="Battery status">
          <BatteryIcon size={15} strokeWidth={1.8} aria-hidden="true" />
          <span className="font-mono text-[10px]">{battery ? `${Math.round(battery.level * 100)}%` : '--'}</span>
        </span>
        <Wifi size={15} strokeWidth={1.8} aria-label="Wi-Fi" />
        <time className="min-w-[62px] font-mono text-[11px] tabular-nums text-white/85">
          {formatClock(now)}
        </time>
      </div>
    </div>
  )
}

export default MenuBar