import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * A second press within this window is a double press.
 *
 * Slightly longer than the 380ms the island used before: a slow first press on this
 * machine (an i3 at 1.2GHz, with the window itself being click-through) regularly left
 * a 400ms gap between the two clicks of an ordinary double click.
 */
export const DOUBLE_PRESS_WINDOW_MS = 420

type MascotPressOptions = {
  /**
   * Fired the instant the second press lands — before the pointer is released, so the
   * island has already morphed by the time the user lifts their finger.
   */
  onDoublePress: () => void
  /**
   * Fired after a lone press has gone unchallenged for the whole double-press window.
   * Omit it when a single press should do nothing.
   */
  onSinglePress?: () => void
  /** Fired on the first press of a gesture, so hold gestures can be armed. */
  onPressStart?: () => void
  /** Fired when a press ends, and also when a second press turns out to be a double. */
  onPressEnd?: () => void
  /**
   * How long a gap between two presses still reads as a double press.
   *
   * Only ever worth tightening where a lone press has a meaning of its own and the wait
   * for it would be felt. Where a single press does nothing, the window costs nothing
   * and a generous one is simply better at catching a slow second click.
   */
  windowMs?: number
}

/**
 * Pointer-timestamp double press detection, shared by the island's bear and the expanded
 * panel's mascot.
 *
 * The native `dblclick` event (and `MouseEvent.detail`) cannot be used here. Both are
 * keyed to the *event target*: the bear is a live sprite whose subtree is re-created by
 * framer-motion whenever Icy's state changes, and the whole capsule is re-parented by the
 * shared-layout morph between island and panel. Any remount between the two clicks
 * resets Chromium's click counter, so the second click arrives as `detail === 1` and no
 * `dblclick` is ever dispatched — the gesture silently does nothing. Comparing press
 * timestamps lives outside the DOM, so it survives remounts, layout projection and
 * framer-motion's element churn, and it also ignores the OS double-click speed setting.
 */
export const useMascotPress = ({
  onDoublePress,
  onSinglePress,
  onPressStart,
  onPressEnd,
  windowMs = DOUBLE_PRESS_WINDOW_MS
}: MascotPressOptions) => {
  const lastPressAt = useRef(0)
  const singleTimer = useRef<number | undefined>(undefined)
  /** True between pointerdown and pointerup, i.e. while the finger is still down. */
  const pointerIsDown = useRef(false)

  const clearSingleTimer = () => {
    if (singleTimer.current === undefined) return
    window.clearTimeout(singleTimer.current)
    singleTimer.current = undefined
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Only the primary button takes part; a right click opens the Electron menu instead.
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const now = performance.now()
    const isDoublePress = now - lastPressAt.current <= windowMs
    clearSingleTimer()

    if (isDoublePress) {
      // Zero marks the gesture as consumed, so the matching pointerup does not also
      // queue a single press.
      lastPressAt.current = 0
      pointerIsDown.current = true
      // A hold that is already rippling must be torn down before the morph starts.
      onPressEnd?.()
      onDoublePress()
      return
    }

    lastPressAt.current = now
    pointerIsDown.current = true
    onPressStart?.()
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointerIsDown.current = false
    if (lastPressAt.current === 0) return
    onPressEnd?.()
    if (!onSinglePress) return
    singleTimer.current = window.setTimeout(() => {
      singleTimer.current = undefined
      onSinglePress()
    }, windowMs)
  }

  /**
   * Fires for a pointer cancelled outright and for the cursor simply leaving the mascot.
   *
   * The two are not the same thing and must not be treated the same. A finished tap that
   * the cursor drifts one or two pixels off — which is exactly what a human hand does
   * between the two halves of a double click — must survive, or the second press starts
   * a fresh gesture and the morph never happens. Only a press that is still in progress
   * is abandoned, which is what sliding off the mascot mid-drag means.
   */
  const onPointerCancel = (event?: ReactPointerEvent<HTMLElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!pointerIsDown.current) return
    pointerIsDown.current = false
    lastPressAt.current = 0
    clearSingleTimer()
    onPressEnd?.()
  }

  useEffect(() => () => {
    clearSingleTimer()
  }, [])

  /** Drops any pending gesture: used when something else on the island takes over. */
  const cancel = () => {
    lastPressAt.current = 0
    pointerIsDown.current = false
    clearSingleTimer()
  }

  return { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave: onPointerCancel, cancel }
}
