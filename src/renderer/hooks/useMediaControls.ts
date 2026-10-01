import { useCallback, useRef, useState } from 'react'
import { AudioEngine } from '../components/shared/AudioEngine'

export type MediaControlAction = 'playPause' | 'next' | 'previous'

/** Shares the media transport wiring between the compact and the expanded player. */
export const useMediaControls = () => {
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)

  const control = useCallback(async (action: MediaControlAction) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    AudioEngine.playClick()
    try {
      await window.electronAPI?.controlMedia(action)
    } catch {
      // Metadata can disappear when the source app closes between polling updates.
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  return { pending, control }
}
