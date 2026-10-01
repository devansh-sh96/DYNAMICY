import { useState } from 'react'
import { Pause, Play, RotateCcw, Timer as TimerIcon } from 'lucide-react'
import { usePomodoroStore } from '../../../hooks/usePomodoro'
import { useAppStore } from '../../../stores/appStore'

type Lap = { id: number; label: string }

/** `MM:SS.dd` for long runs, `SS.dd` under a minute. */
const format = (elapsedMs: number): string => {
  const safe = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const totalSeconds = Math.floor(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hundredths = Math.floor((safe % 1000) / 10)

  const pad = (value: number) => value.toString().padStart(2, '0')
  const main = hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
  return `${main}.${pad(hundredths)}`
}

/**
 * A standalone count-up timer.
 *
 * It reads the same store the Focus tab's inline stopwatch uses, so the two always agree
 * and only one animation loop is ever running.
 */
const StopwatchTab = () => {
  const running = usePomodoroStore((state) => state.stopwatchRunning)
  const elapsedMs = usePomodoroStore((state) => state.stopwatchElapsedMs)
  const toggle = usePomodoroStore((state) => state.toggleStopwatch)
  const reset = usePomodoroStore((state) => state.resetStopwatch)
  const setIcyState = useAppStore((state) => state.setIcyState)

  // Laps belong to the view, so they start empty whenever this tab is mounted.
  const [items, setItems] = useState<Lap[]>([])
  const laps = {
    items,
    add: (elapsed: number) => setItems((current) => [...current, { id: Date.now(), label: format(elapsed) }].slice(-20)),
    clear: () => setItems([])
  }

  return (
    <div className="stopwatch-tab">
      <div className={`stopwatch-face ${running ? 'is-running' : ''}`} role="timer" aria-live="off">
        <span className="stopwatch-eyebrow"><TimerIcon size={11} /> Stopwatch</span>
        <time className="stopwatch-time">{format(elapsedMs)}</time>
        <span className="stopwatch-state">{running ? 'Running' : elapsedMs > 0 ? 'Paused' : 'Ready'}</span>
      </div>

      <div className="stopwatch-controls">
        <button
          type="button"
          className={`stopwatch-primary ${running ? 'is-running' : ''}`}
          onClick={() => { toggle(); setIcyState(running ? 'chatting' : 'working') }}
          aria-label={running ? 'Pause stopwatch' : 'Start stopwatch'}
        >
          {running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          {running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'}
        </button>
        <button type="button" onClick={() => { reset(); laps.clear() }} aria-label="Reset stopwatch">
          <RotateCcw size={16} />
          Reset
        </button>
        <button
          type="button"
          onClick={() => laps.add(elapsedMs)}
          disabled={!running || elapsedMs === 0}
          aria-label="Record lap"
        >
          Lap
        </button>
      </div>

      <div className="stopwatch-laps" aria-label="Lap times">
        {laps.items.length === 0 ? (
          <p className="stopwatch-laps-empty">Record a lap while the stopwatch runs.</p>
        ) : laps.items.map((lap, index) => (
          <div key={lap.id} className="stopwatch-lap">
            <span>Lap {laps.items.length - index}</span>
            <strong>{lap.label}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StopwatchTab
