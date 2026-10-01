import { motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { useMediaStore } from '../../stores/mediaStore'

/**
 * Bars are sized once by CSS and scaled on the compositor. Animating `height` here would
 * relayout the island on every frame of a never-ending loop, so the surge instead drives
 * `scaleY`, which the compositor can handle without touching layout.
 *
 * The CSS track is 18px tall and the original surge peaked at 28px, so 28 / 18 keeps the
 * exact same visual height while animating on the compositor.
 */
const BAR_MAX_SCALE = 28 / 18
/** A soft neutral grey keeps the waveform legible across the capsule. */
const WAVE_GREY = 'rgb(213 220 223)'

/**
 * Produces a per-bar height for the media waveform. Each bar is driven by a different
 * frequency of the track's elapsed time, so the five bars rise and fall in a rolling
 * pattern that keeps moving for as long as the media session is playing.
 */
const mediaLevel = (index: number, media: { positionSeconds: number; durationSeconds: number } | null): number => {
  const duration = media && media.durationSeconds > 0 ? media.durationSeconds : 1
  const position = media ? media.positionSeconds : 0
  const t = position / duration
  // Prime-ish multipliers give each bar its own rhythm without looking random.
  const phase = t * Math.PI * 2 * (index + 1.6) + index * 1.1
  const wave = (Math.sin(phase) + 1) / 2
  return 0.3 + wave * 0.7
}

type ActivityEqualizerProps = {
  surgeProgress?: number
  /** True while the bars are mirroring a playing media session rather than a hold. */
  mediaDriven?: boolean
  /** True while a focus session is active. */
  focusDriven?: boolean
}

export const ActivityEqualizer = ({ surgeProgress = 0, mediaDriven = false, focusDriven = false }: ActivityEqualizerProps) => {
  const cores = useAppStore((state) => state.systemStats.cores)
  const icyState = useAppStore((state) => state.icyState)
  // Subscribing to the media object (and therefore its position) is what makes the
  // media-driven waveform advance instead of sitting frozen between polls.
  const media = useMediaStore((state) => state.media)
  const isActive = icyState === 'working' || focusDriven
  const isSurging = surgeProgress > 0.01

  return (
    <div
      className={`equalizer-bars ${isSurging ? 'is-surging' : ''} ${mediaDriven ? 'is-media' : ''}`}
      aria-label={isSurging ? 'Wave surge' : mediaDriven ? 'Playing media' : 'Idle waveform'}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const load = cores[index] ?? cores[0] ?? 12
        // While media plays the bars track the track's own progress instead of CPU load,
        // so the waveform visibly moves in time with the audio.
        const mediaIntensity = mediaDriven ? mediaLevel(index, media) : null
        const activePeak = mediaIntensity ?? Math.max(0.35, Math.min(1, (7 + load * 0.2) / 18))
        const idlePeak = 0.55
        const surgeScale = BAR_MAX_SCALE

        return (
          <motion.span
            key={index}
            className="equalizer-bar"
            style={{ transformOrigin: 'center' }}
            animate={isSurging
              ? {
                  scaleY: surgeScale,
                  opacity: 1,
                  backgroundColor: WAVE_GREY,
                  boxShadow: `0 0 26px ${WAVE_GREY}`
                }
              : isActive
                ? { scaleY: [activePeak * 0.55, activePeak, activePeak * 0.5], opacity: [0.8, 1, 0.82] }
                : { scaleY: [0.4, idlePeak, 0.4], opacity: [0.66, 0.84, 0.66] }}
            transition={isSurging
              ? { duration: 0.8, ease: 'easeOut' }
              : {
                  duration: isActive ? 0.48 + index * 0.09 : 2.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: index * (isActive ? 0.07 : 0.08)
                }}
          />
        )
      })}
    </div>
  )
}
