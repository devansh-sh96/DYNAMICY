import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { AudioEngine } from '../components/shared/AudioEngine'

type DragPosition = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  pendingX: number
  pendingY: number
  frame: number | null
  started: boolean
  root: HTMLElement
  removeListeners: () => void
}

export const useWindowDrag = (onDragStart?: () => void) => {
  const dragPosition = useRef<DragPosition | null>(null)
  const suppressClick = useRef(false)
  const suppressClickTimer = useRef<number | undefined>(undefined)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || dragPosition.current) return
    suppressClick.current = false
    if (suppressClickTimer.current !== undefined) window.clearTimeout(suppressClickTimer.current)
    if ((event.target as HTMLElement).closest('[data-no-window-drag]')) return

    const position: DragPosition = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      pendingX: 0,
      pendingY: 0,
      frame: null,
      started: false,
      root: event.currentTarget,
      removeListeners: () => undefined
    }

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== position.pointerId) return
      const totalX = moveEvent.screenX - position.startX
      const totalY = moveEvent.screenY - position.startY
      if (!position.started && Math.hypot(totalX, totalY) < 4) return

      if (!position.started) {
        position.started = true
        setIsDragging(true)
        onDragStart?.()
        AudioEngine.playDrag()
      }

      moveEvent.preventDefault()
      position.pendingX += moveEvent.screenX - position.lastX
      position.pendingY += moveEvent.screenY - position.lastY
      position.lastX = moveEvent.screenX
      position.lastY = moveEvent.screenY

      if (position.frame === null) {
        position.frame = window.requestAnimationFrame(() => {
          position.frame = null
          if (position.pendingX === 0 && position.pendingY === 0) return
          window.electronAPI?.dragWindow(position.pendingX, position.pendingY)
          position.pendingX = 0
          position.pendingY = 0
        })
      }
    }

    const removeListeners = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      if (position.frame !== null) {
        window.cancelAnimationFrame(position.frame)
        position.frame = null
      }
      if (position.pendingX !== 0 || position.pendingY !== 0) {
        window.electronAPI?.dragWindow(position.pendingX, position.pendingY)
        position.pendingX = 0
        position.pendingY = 0
      }
    }

    const onEnd = (endEvent: globalThis.PointerEvent) => {
      if (endEvent.pointerId !== position.pointerId) return
      removeListeners()
      dragPosition.current = null
      if (!position.started) return

      setIsDragging(false)
      suppressClick.current = true
      suppressClickTimer.current = window.setTimeout(() => { suppressClick.current = false }, 350)
      window.electronAPI?.finishWindowDrag()
    }

    position.removeListeners = removeListeners
    dragPosition.current = position
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  const onClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  useEffect(() => () => {
    if (suppressClickTimer.current !== undefined) window.clearTimeout(suppressClickTimer.current)
    dragPosition.current?.removeListeners()
    dragPosition.current = null
  }, [])

  const bindDrag = { onPointerDown, onClickCapture }
  return { bindDrag, isDragging }
}