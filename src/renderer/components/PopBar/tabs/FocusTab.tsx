import { useEffect, useState, type FormEvent } from 'react'
import { Check, Minus, Pause, Play, Plus, RotateCcw, Timer as TimerIcon, Trash2 } from 'lucide-react'
import { usePomodoroStore, type PomodoroPhase } from '../../../hooks/usePomodoro'
import { AudioEngine } from '../../shared/AudioEngine'
import { useTaskStore } from '../../../stores/taskStore'

const BREAK_DURATION = 5 * 60
const MIN_MINUTES = 1
const MAX_MINUTES = 180
/** Quick-pick presets shown under the duration stepper. */
const DURATION_PRESETS = [15, 25, 45, 60]

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

const formatStudyTime = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  return `${Math.floor(totalSeconds / 3600).toString().padStart(2, '0')}:${Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}

const phaseLabel: Record<PomodoroPhase, string> = {
  idle: 'READY WHEN YOU ARE',
  running: 'FOCUS SESSION',
  paused: 'SESSION PAUSED',
  break: 'TAKE A BREATHER'
}

const FocusTab = () => {
  const phase = usePomodoroStore((state) => state.phase)
  const secondsRemaining = usePomodoroStore((state) => state.secondsRemaining)
  const focusDurationSeconds = usePomodoroStore((state) => state.focusDurationSeconds)
  const pausedPhase = usePomodoroStore((state) => state.pausedPhase)
  const durationMinutes = usePomodoroStore((state) => state.durationMinutes)
  const focusMode = usePomodoroStore((state) => state.focusMode)
  const strictMode = usePomodoroStore((state) => state.strictMode)
  const stopwatchElapsedMs = usePomodoroStore((state) => state.stopwatchElapsedMs)
  const start = usePomodoroStore((state) => state.start)
  const pause = usePomodoroStore((state) => state.pause)
  const reset = usePomodoroStore((state) => state.reset)
  const setDurationMinutes = usePomodoroStore((state) => state.setDurationMinutes)
  const [newTask, setNewTask] = useState('')
  const tasks = useTaskStore((state) => state.tasks)
  const addTaskToStore = useTaskStore((state) => state.addTask)
  const toggleTask = useTaskStore((state) => state.toggleTask)
  const deleteTask = useTaskStore((state) => state.deleteTask)

  useEffect(() => {
    if ((phase === 'running' || phase === 'break') && secondsRemaining > 0 && secondsRemaining % 60 === 0) {
      AudioEngine.playTick()
    }
  }, [phase, secondsRemaining])

  const totalDuration = phase === 'break' || (phase === 'paused' && pausedPhase === 'break')
    ? BREAK_DURATION
    : focusDurationSeconds
  const progress = 1 - secondsRemaining / totalDuration
  const circumference = 2 * Math.PI * 66
  const isSessionActive = phase === 'running' || phase === 'break' || phase === 'paused'

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = newTask.trim()
    if (!title) return
    setNewTask('')
    addTaskToStore(title)
  }

  const nudgeDuration = (delta: number) => {
    AudioEngine.playClick()
    setDurationMinutes(durationMinutes + delta)
  }

  return (
    <div className="focus-view">
      <div className="focus-workspace">
      <section className="focus-timer-panel" aria-label="Pomodoro timer">
        {focusMode === 'pomodoro' ? <>
          <span className="focus-eyebrow">{phaseLabel[phase]}</span>
          <div className="focus-clock-ring">
            <svg viewBox="0 0 152 152" aria-hidden="true">
              <circle className="focus-clock-track" cx="76" cy="76" r="66" />
              <circle className="focus-clock-progress" cx="76" cy="76" r="66" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
            </svg>
            <time>{formatTime(secondsRemaining)}</time>
          </div>
          <div className="focus-controls">
            {phase === 'running' || phase === 'break' ? (
              <button type="button" className="focus-control-button" disabled={strictMode} onClick={() => { AudioEngine.playClick(); pause() }} aria-label="Pause timer"><Pause size={15} /> Pause</button>
            ) : (
              <button type="button" className="focus-control-button focus-control-primary" onClick={() => { AudioEngine.playClick(); start() }}><Play size={14} fill="currentColor" /> {phase === 'paused' ? 'Resume' : 'Start'}</button>
            )}
            <button type="button" className="focus-reset-button" disabled={strictMode} onClick={() => { AudioEngine.playClick(); reset() }} aria-label="Reset timer"><RotateCcw size={15} /></button>
          </div>
        </> : <>
          <span className="focus-eyebrow">OPEN STUDY</span>
          <div className="focus-clock-ring open-study-ring"><time>{formatStudyTime(stopwatchElapsedMs)}</time></div>
        </>}

        {/* Manual session length. Locked while a session is live so the ring never
            desyncs from the countdown it is drawing. */}
        {focusMode === 'pomodoro' && <div className={`focus-duration ${isSessionActive ? 'is-locked' : ''}`}>
          <span className="focus-duration-label"><TimerIcon size={11} /> Session length</span>
          <div className="focus-duration-row">
            <button
              type="button"
              onClick={() => nudgeDuration(-5)}
              disabled={isSessionActive || durationMinutes <= MIN_MINUTES}
              aria-label="Decrease session length by five minutes"
            >
              <Minus size={13} />
            </button>
            <output aria-live="polite" aria-label="Session length in minutes">{durationMinutes} min</output>
            <button
              type="button"
              onClick={() => nudgeDuration(5)}
              disabled={isSessionActive || durationMinutes >= MAX_MINUTES}
              aria-label="Increase session length by five minutes"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="focus-duration-presets">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={durationMinutes === preset ? 'is-active' : ''}
                onClick={() => { AudioEngine.playClick(); setDurationMinutes(preset) }}
                disabled={isSessionActive}
                aria-label={`Set session length to ${preset} minutes`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>}
      </section>

      <section className="focus-task-panel" aria-label="Focus tasks">
        <div className="focus-task-heading"><h2>Session tasks</h2><span>{tasks.filter((task) => task.completed).length}/{tasks.length}</span></div>
        <form className="focus-task-form" onSubmit={addTask}>
          <input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task for this session" aria-label="New task" />
          <button type="submit" disabled={!newTask.trim()} aria-label="Add task"><Plus size={16} /></button>
        </form>
        <div className="focus-task-list">
          {tasks.length === 0 ? (
            <p className="focus-task-empty">A short list keeps the session clear.</p>
          ) : tasks.map((task) => (
            <div className={`focus-task ${task.completed ? 'is-complete' : ''}`} key={task.id}>
              <button
                type="button"
                className="focus-task-check"
                aria-label={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
                onClick={() => {
                  AudioEngine.playClick()
                  toggleTask(task.id)
                }}
              >
                {task.completed && <Check size={13} />}
              </button>
              <span>{task.title}</span>
              <button type="button" className="focus-task-delete" aria-label={`Delete ${task.title}`} onClick={() => {
                AudioEngine.playClick()
                deleteTask(task.id)
              }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  )
}

export default FocusTab