import { usePomodoroStore } from '../../hooks/usePomodoro'

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

const MenuClockWidget = () => {
  // Subscribing straight to the store avoids the old local mirror that re-rendered the whole
  // menu bar once per second even while no session was running.
  const phase = usePomodoroStore((state) => state.phase)
  const secondsRemaining = usePomodoroStore((state) => state.secondsRemaining)

  const isVisible = phase !== 'idle'
  if (!isVisible) return null

  const isPaused = phase === 'paused'
  const isBreak = phase === 'break'

  return (
    <div className="menu-focus-clock" aria-label={`${isBreak ? 'Break' : 'Focus'} ${formatTime(secondsRemaining)}`}>
      <svg className={`menu-analog-clock ${isPaused ? 'is-paused' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
        <circle className="menu-clock-pin" cx="12" cy="12" r="1" />
      </svg>
      <span className="font-mono text-[10px] tabular-nums">{formatTime(secondsRemaining)}</span>
      <span className={`menu-focus-dot ${isBreak ? 'is-break' : ''} ${isPaused ? 'is-paused' : ''}`} />
    </div>
  )
}

export default MenuClockWidget