import { SkipBack, SkipForward, Pause, Play } from 'lucide-react'
import { useMediaControls } from '../../hooks/useMediaControls'
import { useMediaStore } from '../../stores/mediaStore'

const NowPlaying = ({ force = false }: { force?: boolean }) => {
  const media = useMediaStore((state) => state.media)
  const mediaMode = useMediaStore((state) => state.mediaMode)
  const { pending, control } = useMediaControls()

  if (!mediaMode && !force) return null

  const currentMedia = media ?? {
    title: 'Starboy',
    artist: 'The Weeknd',
    app: 'Icy Bear demo',
    playback: 'Playing' as const,
    positionSeconds: 0,
    durationSeconds: 0
  }

  const isPlaying = currentMedia.playback === 'Playing'

  return (
    <div className="now-playing" title={`${currentMedia.title}${currentMedia.artist ? ` · ${currentMedia.artist}` : ''}`}>
      <span className={`now-playing-wave ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <span className="now-playing-track">
        <strong>{currentMedia.title || currentMedia.app}</strong>
        <small>{currentMedia.artist || currentMedia.app}</small>
      </span>
      <button type="button" disabled={pending} aria-label="Previous track" title="Previous" onClick={() => void control('previous')}>
        <SkipBack size={13} fill="currentColor" />
      </button>
      <button type="button" disabled={pending} aria-label={isPlaying ? 'Pause media' : 'Play media'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => void control('playPause')}>
        {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
      </button>
      <button type="button" disabled={pending} aria-label="Next track" title="Next" onClick={() => void control('next')}>
        <SkipForward size={13} fill="currentColor" />
      </button>
    </div>
  )
}

export default NowPlaying