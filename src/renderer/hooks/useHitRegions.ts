import { useEffect } from 'react'
import type { HitRegion } from '../../shared/ipc'

const REGION_SELECTOR = '[data-hit-region]'
/** Fallback sweep that catches layout changes no observer reported. */
const PUBLISH_INTERVAL_MS = 250
/** Consecutive unchanged frames after which the rAF tracker parks itself. */
const IDLE_FRAME_LIMIT = 6

const collectHitRegions = (nodes: HTMLElement[]): HitRegion[] => {
  const regions: HitRegion[] = []

  for (const node of nodes) {
    // Elements that opt out of pointer events (e.g. the tucked island) must not keep the
    // window clickable, otherwise they would swallow clicks meant for the app underneath.
    if (window.getComputedStyle(node).pointerEvents === 'none') continue

    const rect = node.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue

    regions.push({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  }

  return regions
}

const sameRect = (left: HitRegion, right: HitRegion) =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height

const sameRegions = (left: HitRegion[], right: HitRegion[]) => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!sameRect(left[index], right[index])) return false
  }
  return true
}

/**
 * The island window is click-through everywhere except the elements marked with
 * `data-hit-region`. Win32 hover forwarding (`setIgnoreMouseEvents(..., { forward: true })`)
 * is unreliable, so the rectangles are reported to the main process, which hit tests the
 * real cursor position and toggles pass-through accordingly.
 *
 * The hit map has to track the island/panel morph while it runs, because framer-motion's
 * shared-layout animation otherwise leaves a stale rectangle behind. Measuring on every
 * frame forever is wasteful, so the frame tracker parks itself once the layout settles and
 * is woken by the observers plus a low-frequency safety sweep.
 */
export const useHitRegions = () => {
  useEffect(() => {
    let published: HitRegion[] = []
    let hasPublished = false
    let nodes: HTMLElement[] = []
    let frame = 0
    let idleFrames = 0
    let active = true

    /** Publishes the current hit map; returns true when it actually changed. */
    const publish = (force = false): boolean => {
      if (!active) return false
      const regions = collectHitRegions(nodes)

      if (!force && hasPublished && sameRegions(regions, published)) return false

      published = regions
      hasPublished = true
      window.electronAPI?.setHitRegions(regions)
      return true
    }

    const track = () => {
      if (!active) return
      // Park the loop once the layout stops changing; observers and the safety sweep
      // below restart it whenever the island morphs again.
      idleFrames = publish() ? 0 : idleFrames + 1
      if (idleFrames > IDLE_FRAME_LIMIT) {
        frame = 0
        return
      }
      frame = window.requestAnimationFrame(track)
    }

    const wake = () => {
      if (frame !== 0) return
      idleFrames = 0
      frame = window.requestAnimationFrame(track)
    }

    const observer = new ResizeObserver(() => {
      publish()
      wake()
    })

    const refreshNodes = () => {
      nodes = Array.from(document.querySelectorAll<HTMLElement>(REGION_SELECTOR))
      // Re-point the observer at the new set; `data-hit-region` elements come and go as the
      // island morphs between its collapsed, media and expanded states.
      observer.disconnect()
      nodes.forEach((node) => observer.observe(node))
      publish(true)
      wake()
    }

    // Only structural changes are observed here. Watching `style`/`class` would fire on every
    // frame that framer-motion writes a transform, forcing a full re-query during animations;
    // geometry changes are already covered by the frame tracker and the safety sweep.
    const mutationObserver = new MutationObserver(() => {
      refreshNodes()
    })

    refreshNodes()
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    const safetySweep = () => {
      publish()
      wake()
    }

    const timer = window.setInterval(safetySweep, PUBLISH_INTERVAL_MS)
    window.addEventListener('resize', refreshNodes)

    return () => {
      active = false
      if (frame !== 0) window.cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener('resize', refreshNodes)
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [])
}
