import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Clock3 } from 'lucide-react'
import { ActivityEqualizer } from './ActivityEqualizer'
import { FocusCountdown } from './FocusCountdown'
import { IcySprite } from './IcySprite'
import { SystemGauges } from './SystemGauges'
import { useAppStore } from '../../stores/appStore'
import { useMascotPress } from '../../hooks/useMascotPress'
import { AudioEngine } from '../shared/AudioEngine'
import MediaExpanded from './MediaExpanded'
import NowPlaying from './NowPlaying'
import { usePomodoroStore } from '../../hooks/usePomodoro'
import { useMediaStore } from '../../stores/mediaStore'

type DynamicIslandProps = { minimal?: boolean }

/** How long the ripple takes to fill and the island takes to slide up. */
const SURGE_DURATION_MS = 800
/** How long a press is held before the ripple and slide begin. */
const BEAR_HOLD_SURGE_MS = 260
/** How far the island travels during its ordinary exit transition. */
const ISLAND_EXIT_DISTANCE = 150
/**
 * Fallback tuck distance, used before the capsule has ever been measured.
 *
 * The real distance is the capsule's own height, because that is what "out of the frame"
 * means for a pill that grows when media is playing or a message arrives. The old fixed
 * 12px "lip" was the bug: on a 58px capsule that slid it up by a fifth of its height and
 * then took its pointer events away, leaving a dead island sitting on screen that could
 * neither be clicked nor hovered.
 */
const TUCK_TRAVEL_FALLBACK = 120

const DynamicIsland = ({ minimal = false }: DynamicIslandProps) => {
  const isExpanded = useAppStore((state) => state.isExpanded)
  const isTucked = useAppStore((state) => state.isTucked)
  const setTucked = useAppStore((state) => state.setTucked)
  const activeMessage = useAppStore((state) => state.activeMessage)
  const islandAlert = useAppStore((state) => state.islandAlert)
  const centerPodMode = useAppStore((state) => state.centerPodMode)
  const setExpanded = useAppStore((state) => state.setExpanded)
  const setMinimal = useAppStore((state) => state.setMinimal)
  const setSelectedTab = useAppStore((state) => state.setSelectedTab)
  const setIcyState = useAppStore((state) => state.setIcyState)
  const setSpriteAction = useAppStore((state) => state.setSpriteAction)
  const setActiveMessage = useAppStore((state) => state.setActiveMessage)
  const setIslandAlert = useAppStore((state) => state.setIslandAlert)
  const setCenterPodMode = useAppStore((state) => state.setCenterPodMode)
  const mediaMode = useMediaStore((state) => state.mediaMode)
  const media = useMediaStore((state) => state.media)
  const pomodoroPhase = usePomodoroStore((state) => state.phase)
  const stopwatchRunning = usePomodoroStore((state) => state.stopwatchRunning)
  const strictMode = usePomodoroStore((state) => state.strictMode)
  const startFocus = usePomodoroStore((state) => state.start)
  const systemCpu = useAppStore((state) => state.systemStats.cpu)

  const [quickReplyOpen, setQuickReplyOpen] = useState(false)
  const [quickReply, setQuickReply] = useState('')
  const [mediaExpanded, setMediaExpanded] = useState(false)
  const [waveSurge, setWaveSurge] = useState(0)
  const [isRevealing, setIsRevealing] = useState(false)
  /** How far up the island has to travel to clear the top edge, re-measured on each tuck. */
  const [tuckTravel, setTuckTravel] = useState(TUCK_TRAVEL_FALLBACK)

  const replyInput = useRef<HTMLInputElement>(null)
  const bearHoldTimer = useRef<number | undefined>(undefined)
  const surgeTimer = useRef<number | undefined>(undefined)
  const pillRef = useRef<HTMLElement | null>(null)

  const cancelBearHoldTimers = () => {
    if (bearHoldTimer.current !== undefined) {
      window.clearTimeout(bearHoldTimer.current)
      bearHoldTimer.current = undefined
    }
  }

  const stopSurgeTimer = () => {
    if (surgeTimer.current === undefined) return
    window.clearTimeout(surgeTimer.current)
    surgeTimer.current = undefined
  }

  const endWaveSurge = () => {
    stopSurgeTimer()
    setWaveSurge(0)
  }

  /**
   * Click-and-hold: a wave ripple plays while the whole island slides up and out of the
   * top of the frame. Releasing stops the ripple but leaves the island tucked, so it
   * stays out of the way until the cursor comes back over the restore strip.
   *
   * The distance is measured rather than guessed. The capsule is 58px tall at rest and
   * grows to 80px-plus in media mode or with a message banner, so a hard-coded travel
   * either leaves a dead sliver on screen or flings the island into the void. Measuring
   * the live element means "tucked" is always exactly "not on screen".
   */
  const startWaveSurge = () => {
    setMediaExpanded(false)
    // Let framer-motion own the visual ramp. Updating React state on every animation frame
    // made the entire island reconcile 50+ times during one hold gesture.
    setWaveSurge(1)
    stopSurgeTimer()
    surgeTimer.current = window.setTimeout(() => {
      surgeTimer.current = undefined
      // The capsule sits 8px below the top of the window, so clearing its own height
      // plus that inset puts it wholly out of frame. The restore strip along the top
      // of the window is what brings it back.
      const height = pillRef.current?.offsetHeight ?? 0
      setTuckTravel(Math.max(TUCK_TRAVEL_FALLBACK, height + 24))
      setTucked(true)
      AudioEngine.playChime()
    }, SURGE_DURATION_MS)
  }

  const stopPointerGestures = () => {
    cancelBearHoldTimers()
    if (surgeTimer.current !== undefined) endWaveSurge()
  }

  /** The tucked lip reappearing is the only way back from a hide. */
  const revealIsland = () => {
    if (!isTucked) return
    AudioEngine.playClick()
    setIsRevealing(true)
    setTucked(false)
    setWaveSurge(0)
    window.setTimeout(() => setIsRevealing(false), 260)
  }

  const restoreIsland = () => {
    AudioEngine.playClick()
    setWaveSurge(0)
    setSpriteAction('default')
    setIcyState('idle')
    setMinimal(false)
  }

  /** Double-clicking the bear while the popup is open collapses it back to the island. */
  const collapseToIsland = () => {
    stopPointerGestures()
    AudioEngine.playClick()
    setMediaExpanded(false)
    setQuickReplyOpen(false)
    setExpanded(false)
  }

  const openChat = () => {
    setSelectedTab('chat')
    setSpriteAction('default')
    setIcyState('chatting')
    setExpanded(true)
  }

  const onBearActivate = () => {
    // Single click only ever surfaces the media sheet, and only while a session is
    // actually playing. Any other state is deliberately a no-op.
    if (!mediaPlaying) return
    AudioEngine.playClick()
    setMediaExpanded((expanded) => !expanded)
  }

  const onBearPointerDown = () => {
    cancelBearHoldTimers()
    // A single sustained press runs the ripple and the slide-up together.
    bearHoldTimer.current = window.setTimeout(() => {
      bearHoldTimer.current = undefined
      startWaveSurge()
    }, BEAR_HOLD_SURGE_MS)
  }

  /**
   * The bear's whole gesture vocabulary: a double press morphs between the compact island
   * and the expanded panel, a lone press surfaces the media sheet, and holding still runs
   * the wave surge that tucks the island away.
   */
  const bearPress = useMascotPress({
    onDoublePress: () => {
      cancelBearHoldTimers()
      // A ripple may already be running from the first press; it has to stop dead, or
      // the island slides back out of the way behind the panel that just opened.
      if (surgeTimer.current !== undefined) endWaveSurge()
      if (isTucked) {
        setTucked(false)
        setWaveSurge(0)
      }
      if (strictMode) return
      // Expanded: collapse back to the compact island. Island: open the popup.
      if (isExpanded) collapseToIsland()
      else openChat()
    },
    onSinglePress: onBearActivate,
    onPressStart: onBearPointerDown,
    onPressEnd: stopPointerGestures
  })

  const onCapsuleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    bearPress.cancel()
    cancelBearHoldTimers()
    AudioEngine.playClick()
    setMinimal(false)
    setExpanded(true)
  }

  const onWaveClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    AudioEngine.playClick()
    if (centerPodMode === 'focus' && !focusActive) {
      startFocus()
      return
    }

    const nextMode = centerPodMode === 'equalizer'
      ? 'gauges'
      : centerPodMode === 'gauges'
        ? 'focus'
        : centerPodMode === 'focus'
          ? mediaPlaying ? 'media' : 'equalizer'
          : 'equalizer'
    setCenterPodMode(nextMode)
  }

  const sendQuickReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!quickReply.trim()) return
    setQuickReply('')
    setQuickReplyOpen(false)
    setActiveMessage(null)
  }


  useEffect(() => {
    // A release anywhere ends the hold gestures, even when the pointer left the island.
    const stop = () => stopPointerGestures()
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  useEffect(() => {
    if (!activeMessage) {
      setQuickReplyOpen(false)
      return
    }
    const timeout = window.setTimeout(() => {
      setActiveMessage(null)
      setQuickReplyOpen(false)
    }, quickReplyOpen ? 30000 : 5000)
    return () => window.clearTimeout(timeout)
  }, [activeMessage, quickReplyOpen, setActiveMessage])

  useEffect(() => {
    if (!islandAlert) return
    const timeout = window.setTimeout(() => setIslandAlert(null), 2500)
    return () => window.clearTimeout(timeout)
  }, [islandAlert, setIslandAlert])

  useEffect(() => {
    if (quickReplyOpen) replyInput.current?.focus()
  }, [quickReplyOpen])

  useEffect(() => {
    // The enlarged player only makes sense while something is playing.
    if (media?.playback === 'Playing') return
    setMediaExpanded(false)
  }, [media])

  useEffect(() => () => {
    bearPress.cancel()
    cancelBearHoldTimers()
    stopSurgeTimer()
  }, [])

  const mediaPlaying = media?.playback === 'Playing'
  const focusActive = pomodoroPhase !== 'idle' || stopwatchRunning
  const splitFocus = pomodoroPhase === 'running' && (mediaPlaying || systemCpu >= 75)
  // The waveform is the island's resting state, so it shows unless something more
  // important (a message or an alert) is occupying the capsule.
  const waveActive = !activeMessage && !islandAlert

  const centerPod = centerPodMode === 'gauges' ? (
    <SystemGauges />
  ) : centerPodMode === 'focus' ? (
    <div className="focus-island-status">
      {focusActive ? <FocusCountdown /> : <span className="focus-start-label">Start focus</span>}
    </div>
  ) : centerPodMode === 'media' && mediaPlaying ? (
    <NowPlaying force />
  ) : (
    <ActivityEqualizer surgeProgress={waveSurge} mediaDriven={mediaPlaying} />
  )

  // The pebble comes from the prop alone: an instance that is exiting while the store
  // flag flips must finish its own form, not morph into a twin of the incoming dot.
  if (minimal) {
    return (
      <main className="app-shell is-corner">
        <motion.button
          type="button"
          className="island-pebble"
          data-hit-region
          aria-label="Restore the Dynamic Island"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          onClick={restoreIsland}
        >
          <IcySprite />
        </motion.button>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="island-cluster">
        {/*
          The restore zone lives on the cluster, not inside the capsule, so it does not
          slide off-screen along with the thing it is meant to bring back. It is a
          generous strip across the top of the window — a 12px sliver was effectively
          impossible to land the cursor on, and `onMouseEnter` is unreliable on a
          click-through window, so this listens to `onMouseMove` instead.
        */}
        {isTucked && (
          <div
            className="island-restore-zone"
            data-hit-region
            onMouseEnter={revealIsland}
            onMouseOver={revealIsland}
            onMouseMove={revealIsland}
            onMouseMoveCapture={revealIsland}
            onClick={revealIsland}
            onPointerDown={revealIsland}
            onPointerEnter={revealIsland}
            onPointerOver={revealIsland}
            onPointerMove={revealIsland}
            onPointerMoveCapture={revealIsland}
            aria-hidden="true"
          />
        )}
        <motion.section
          ref={pillRef}
          layout
          data-hit-region
          className={`island-pill flex items-center gap-2 rounded-full border border-white/15 bg-[#121216]/55 px-2 py-1.5 text-white backdrop-blur-2xl ${mediaMode ? 'is-media-mode' : ''} ${activeMessage ? 'has-message' : ''} ${isTucked ? 'is-fullscreen-tucked' : ''}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{
            // The slide is a transform, so it stays on the compositor and reads as one
            // continuous motion rather than a jump cut. `tuckTravel` is the capsule's own
            // measured height plus its inset, so tucking always clears the frame entirely.
            y: isTucked ? -tuckTravel : 0,
            opacity: 1,
            scale: 1
          }}
          exit={
            // Expanding hands over to the panel's own entrance, so the capsule just fades
            // in place. The fly-away exit is for the pebble/minimal path.
            isExpanded
              ? { opacity: 0, transition: { duration: 0.1, ease: 'easeOut' } }
              : { opacity: 0, scale: 0.9, y: -ISLAND_EXIT_DISTANCE }
          }
          transition={isRevealing
            ? { type: 'spring', stiffness: 620, damping: 42, mass: 0.38 }
            : { type: 'spring', stiffness: 260, damping: 28, mass: 0.7 }}
          onDoubleClick={onCapsuleDoubleClick}
          aria-label="Icy Bear Dynamic Island"
        >
          <button
            type="button"
            data-long-analytics
            data-no-window-drag
            className="flex h-11 items-center gap-1 rounded-full pl-1 pr-2 outline-none focus-visible:ring-1 focus-visible:ring-white/60"
            aria-label="Icy Bear — double-press to open the panel"
            aria-expanded={mediaExpanded}
            onPointerDown={bearPress.onPointerDown}
            onPointerUp={bearPress.onPointerUp}
            onPointerCancel={bearPress.onPointerCancel}
            onPointerLeave={bearPress.onPointerLeave}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              // Keyboard users get the same morph the double press performs.
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              if (isExpanded) collapseToIsland()
              else openChat()
            }}
          >
            <IcySprite />
          </button>

          {activeMessage ? (
            <button type="button" className="island-message-banner" onClick={(event) => { event.stopPropagation(); setQuickReplyOpen(true) }}>
              <span className="message-avatar">{activeMessage.avatar ? <img src={activeMessage.avatar} alt="" /> : activeMessage.sender.slice(0, 1).toUpperCase()}</span>
              <span className="message-preview"><strong>{activeMessage.sender}</strong><small>{activeMessage.text}</small></span>
            </button>
          ) : islandAlert ? (
            <div className="island-alert-content"><span>{islandAlert.message}</span>{islandAlert.value !== undefined && <strong>{islandAlert.value}%</strong>}</div>
          ) : mediaMode ? (
            <NowPlaying />
          ) : (
            <button
              type="button"
              className="center-pod flex min-w-[92px] cursor-pointer items-center justify-center rounded-full px-2 outline-none focus-visible:ring-1 focus-visible:ring-white/60"
              data-no-window-drag
              data-no-capsule-collapse
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onWaveClick}
              aria-label={`Change center display, current ${centerPodMode}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={waveSurge > 0 ? 'surge-wave' : waveActive ? 'resting-wave' : centerPodMode}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
                  {centerPod}
                </motion.div>
              </AnimatePresence>
            </button>
          )}

          {!mediaMode && !activeMessage && !islandAlert && <NowPlaying />}
        </motion.section>

        {splitFocus && !mediaMode && (
          <motion.button
            type="button"
            className="focus-detached-bubble"
            data-hit-region
            initial={{ opacity: 0, scale: 0.7, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.7, x: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            aria-label="Open focus timer"
            onClick={() => { setSelectedTab('focus'); setExpanded(true) }}
          >
            <Clock3 size={14} />
          </motion.button>
        )}

        <AnimatePresence>
          {mediaExpanded && mediaPlaying && (
            <MediaExpanded key="media-expanded" onClose={() => setMediaExpanded(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {quickReplyOpen && activeMessage && (
            <motion.form
              className="quick-reply-card"
              data-hit-region
              data-no-window-drag
              data-no-capsule-collapse
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onSubmit={sendQuickReply}
              onKeyDown={(event) => { if (event.key === 'Escape') { setQuickReplyOpen(false); setActiveMessage(null) } }}
            >
              <strong>{activeMessage.sender}</strong>
              <p>{activeMessage.text}</p>
              <div className="quick-reply-entry">
                <input ref={replyInput} value={quickReply} onChange={(event) => setQuickReply(event.target.value)} placeholder="Reply..." aria-label="Quick reply" />
                <button type="submit" disabled={!quickReply.trim()} aria-label="Send reply"><ArrowUp size={15} /></button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}

export default DynamicIsland
