import { useEffect } from 'react'
import { create } from 'zustand'
import { useAppStore } from '../stores/appStore'
import { AudioEngine } from '../components/shared/AudioEngine'
import { useFocusSessionStore } from '../stores/focusSessionStore'

export type PomodoroPhase = 'idle' | 'running' | 'paused' | 'break'
export type FocusMode = 'pomodoro' | 'stopwatch'
export type PomodoroTick = { phase: PomodoroPhase; secondsRemaining: number }

const FOCUS_SECONDS = 25 * 60
const BREAK_SECONDS = 5 * 60
const TICK_EVENT = 'icy:pomodoro-tick'
const MIN_FOCUS_MINUTES = 1
const MAX_FOCUS_MINUTES = 180

type PomodoroStore = {
  phase: PomodoroPhase
  focusMode: FocusMode
  strictMode: boolean
  strictStudyUrls: boolean
  pausedPhase: 'running' | 'break'
  secondsRemaining: number
  focusDurationSeconds: number
  /** User-chosen session length in minutes, used by the Focus tab's duration control. */
  durationMinutes: number
  activeSessionId: number | null
  sessionStartedAt: number | null
  /** Stopwatch runs alongside the timer and counts up in milliseconds. */
  stopwatchRunning: boolean
  stopwatchElapsedMs: number
  stopwatchSessionId: number | null
  start: (durationMinutes?: number) => void
  pause: () => void
  reset: () => void
  tick: () => void
  setDurationMinutes: (minutes: number) => void
  toggleStopwatch: () => void
  resetStopwatch: () => void
  setFocusMode: (focusMode: FocusMode) => void
  setStrictMode: (strictMode: boolean) => void
  setStrictStudyUrls: (enabled: boolean) => void
}

/**
 * The countdown already lives in this store, so `publishTick` only has to mirror the phase
 * into the app store. The `CustomEvent` is kept for non-React listeners, but it is dispatched
 * only when something actually changed — the per-second tick was previously waking every
 * subscriber three separate times (store, event, and a syncing effect) for one second of data.
 */
const publishTick = (phase: PomodoroPhase, secondsRemaining: number) => {
  const nextIcyState = phase === 'running' ? 'working' : 'idle'
  const appState = useAppStore.getState()
  if (appState.icyState !== nextIcyState) appState.setIcyState(nextIcyState)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PomodoroTick>(TICK_EVENT, { detail: { phase, secondsRemaining } })
    )
  }
}

export const usePomodoroStore = create<PomodoroStore>((set, get) => ({
  phase: 'idle',
  focusMode: 'pomodoro',
  strictMode: false,
  strictStudyUrls: false,
  pausedPhase: 'running',
  secondsRemaining: FOCUS_SECONDS,
  focusDurationSeconds: FOCUS_SECONDS,
  durationMinutes: 25,
  activeSessionId: null,
  sessionStartedAt: null,
  stopwatchRunning: false,
  stopwatchElapsedMs: 0,
  stopwatchSessionId: null,
  start: (durationMinutes = get().durationMinutes) => {
    const current = get()
    if (current.phase === 'running') return

    if (current.phase === 'paused') {
      set({ phase: current.pausedPhase })
      publishTick(current.pausedPhase, current.secondsRemaining)
      return
    }

    if (current.phase === 'break') {
      publishTick('break', current.secondsRemaining)
      return
    }

    const minutes = Math.max(MIN_FOCUS_MINUTES, Math.min(MAX_FOCUS_MINUTES, Math.round(durationMinutes)))
    const focusDurationSeconds = minutes * 60
    const startedAt = Date.now()
    const activeSessionId = useFocusSessionStore.getState().startSession(startedAt)
    set({
      phase: 'running',
      secondsRemaining: focusDurationSeconds,
      focusDurationSeconds,
      durationMinutes: minutes,
      pausedPhase: 'running',
      activeSessionId,
      sessionStartedAt: startedAt
    })
    publishTick('running', focusDurationSeconds)
  },
  pause: () => {
    const current = get()
    if (current.phase !== 'running' && current.phase !== 'break') return

    set({ phase: 'paused', pausedPhase: current.phase })
    publishTick('paused', current.secondsRemaining)
  },
  reset: () => {
    const current = get()
    if (current.activeSessionId) {
      const durationSeconds = Math.max(0, current.focusDurationSeconds - current.secondsRemaining)
      useFocusSessionStore.getState().finishSession(current.activeSessionId, durationSeconds, false)
    }
    set({ phase: 'idle', secondsRemaining: current.focusDurationSeconds, pausedPhase: 'running', activeSessionId: null, sessionStartedAt: null })
    publishTick('idle', current.focusDurationSeconds)
  },
  tick: () => {
    const current = get()
    if (current.phase !== 'running' && current.phase !== 'break') return

    if (current.secondsRemaining > 1) {
      const secondsRemaining = current.secondsRemaining - 1
      set({ secondsRemaining })
      publishTick(current.phase, secondsRemaining)
      return
    }

    if (current.phase === 'running') {
      AudioEngine.playChime()
      if (current.activeSessionId) {
        const durationSeconds = Math.max(0, current.focusDurationSeconds - current.secondsRemaining)
        useFocusSessionStore.getState().finishSession(current.activeSessionId, durationSeconds, true)
      }
      set({ phase: 'break', secondsRemaining: BREAK_SECONDS, activeSessionId: null, sessionStartedAt: null })
      publishTick('break', BREAK_SECONDS)
      return
    }

    AudioEngine.playChime()
    set({ phase: 'idle', secondsRemaining: current.focusDurationSeconds, pausedPhase: 'running' })
    publishTick('idle', current.focusDurationSeconds)
  },
  setDurationMinutes: (minutes) => {
    const current = get()
    const clamped = Math.max(MIN_FOCUS_MINUTES, Math.min(MAX_FOCUS_MINUTES, Math.round(minutes)))
    if (current.phase === 'running' || current.phase === 'break' || current.phase === 'paused') return
    // Only applies to the next session; the current idle countdown follows the new length.
    set({ durationMinutes: clamped, focusDurationSeconds: clamped * 60, secondsRemaining: clamped * 60 })
  },
  toggleStopwatch: () => {
    const current = get()
    if (current.stopwatchRunning) {
      if (current.stopwatchSessionId) useFocusSessionStore.getState().finishSession(current.stopwatchSessionId, Math.floor(current.stopwatchElapsedMs / 1000), true)
      set({ stopwatchRunning: false, stopwatchSessionId: null })
      return
    }
    const stopwatchSessionId = useFocusSessionStore.getState().startSession(Date.now())
    set({ stopwatchRunning: true, stopwatchSessionId })
  },
  resetStopwatch: () => {
    const current = get()
    if (current.stopwatchSessionId) useFocusSessionStore.getState().finishSession(current.stopwatchSessionId, Math.floor(current.stopwatchElapsedMs / 1000), false)
    set({ stopwatchRunning: false, stopwatchElapsedMs: 0, stopwatchSessionId: null })
  },
  setFocusMode: (focusMode) => set({ focusMode }),
  setStrictMode: (strictMode) => set({ strictMode }),
  setStrictStudyUrls: (strictStudyUrls) => set({ strictStudyUrls }),
}))

/**
 * Advances the stopwatch against the real clock instead of counting ticks, so it stays
 * accurate even if the interval is throttled while the window is in the background.
 * The interval itself still fires once per second; only the stopwatch display needs
 * sub-second resolution, which this rAF loop provides while it is running.
 */
const useStopwatchLoop = () => {
  const running = usePomodoroStore((state) => state.stopwatchRunning)

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      // Clamp so a long background stall does not dump minutes onto the counter at once.
      const delta = Math.min(250, now - last)
      last = now
      usePomodoroStore.setState((state) => ({ stopwatchElapsedMs: state.stopwatchElapsedMs + delta }))
      frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [running])
}

export const usePomodoro = () => usePomodoroStore()

export const usePomodoroTicker = () => {
  const phase = usePomodoroStore((state) => state.phase)
  useStopwatchLoop()

  useEffect(() => {
    const interval = window.setInterval(() => usePomodoroStore.getState().tick(), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    useAppStore.getState().setIcyState(phase === 'running' ? 'working' : 'idle')
  }, [phase])
}