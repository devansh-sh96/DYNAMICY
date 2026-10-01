import { motion } from 'framer-motion'
import { ChevronUp, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useMediaControls } from '../../hooks/useMediaControls'
import { useMediaStore } from '../../stores/mediaStore'
import { IcySprite } from './IcySprite'

const formatClock = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, '0')}`
}

type MediaExpandedProps = { onClose: () => void }

/** The enlarged player the island morphs into when the bear is clicked while media plays. */
export const MediaExpanded = ({ onClose }: MediaExpandedProps) => {
  const media = useMediaStore((state) => state.media)
  const { pending, control } = useMediaControls()

  if (!media) return null

  const isPlaying = media.playback === 'Playing'
  const progress = media.durationSeconds > 0
    ? Math.min(1, Math.max(0, media.positionSeconds / media.durationSeconds))
    : 0

  return (
    <motion.section
      className="media-expanded-card"
      data-hit-region
      initial={{ opacity: 0, y: -12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      aria-label="Expanded now playing"
    >
      <header className="media-expanded-head">
        <span className="media-expanded-bear"><IcySprite /></span>
        <span className="media-expanded-badge" aria-hidden="true"><Music2 size={13} /></span>
        <div>
          <strong>Now playing</strong>
          <small title={media.app}>{media.app || 'System media session'}</small>
        </div>
        <button type="button" className="media-expanded-close" aria-label="Collapse now playing" title="Collapse" onClick={onClose}>
          <ChevronUp size={14} />
        </button>
      </header>

      <div className="media-expanded-body">
        <span className={`media-expanded-art ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
          <Music2 size={24} />
        </span>
        <div className="media-expanded-meta">
          <strong title={media.title}>{media.title || media.app || 'Unknown track'}</strong>
          <small title={media.artist}>{media.artist || 'Unknown artist'}</small>
        </div>
      </div>

      <div className="media-expanded-progress">
        <span className="media-expanded-track" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>
        <div className="media-expanded-times">
          <span>{formatClock(media.positionSeconds)}</span>
          <span>{formatClock(media.durationSeconds)}</span>
        </div>
      </div>

      <div className="media-expanded-controls">
        <button type="button" disabled={pending} aria-label="Previous track" title="Previous" onClick={() => void control('previous')}>
          <SkipBack size={16} fill="currentColor" />
        </button>
        <button type="button" disabled={pending} className="is-primary" aria-label={isPlaying ? 'Pause media' : 'Play media'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => void control('playPause')}>
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button type="button" disabled={pending} aria-label="Next track" title="Next" onClick={() => void control('next')}>
          <SkipForward size={16} fill="currentColor" />
        </button>
      </div>
    </motion.section>
  )
}

export default MediaExpanded
