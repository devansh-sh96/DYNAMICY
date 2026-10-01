import { motion } from 'framer-motion'
import { usePomodoroStore } from '../../hooks/usePomodoro'

export const FocusCountdown = () => {
  // The store is the single source of truth for the countdown. This used to mirror it into
  // local state via a window event *and* a syncing effect, which rendered three times a tick.
  const secondsLeft = usePomodoroStore((state) => state.secondsRemaining)
  const phase = usePomodoroStore((state) => state.phase)

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')
  const isReady = phase === 'idle'

  return (
    <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-white" aria-label={isReady ? `Focus timer ${minutes}:${seconds}, ready` : `Focus timer ${minutes}:${seconds}`}>
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
        animate={phase === 'running' ? { opacity: [1, 0.4, 1], backgroundColor: ['#34d399', '#ffffff', '#34d399'] } : { opacity: 0.65 }}
        transition={{ duration: 1.5, repeat: phase === 'running' ? Infinity : 0, ease: 'easeInOut' }}
      />
      {minutes}:{seconds}{isReady && <span className="font-sans text-[9px] text-white/55">Ready</span>}
    </div>
  )
}