import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useFocusSessionStore } from '../../../stores/focusSessionStore'

type DaySummary = {
  day: string
  completedSessions: number
  focusMinutes: number
  completedFocusMinutes: number
  interruptedMinutes: number
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const AnalyticsTab = () => {
  const sessions = useFocusSessionStore((state) => state.sessions)

  const week = useMemo(() => {
    const now = new Date()
    const days: DaySummary[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now)
      date.setDate(now.getDate() - (6 - index))
      return {
        day: date.toLocaleDateString(undefined, { weekday: 'short' }),
        completedSessions: 0,
        focusMinutes: 0,
        completedFocusMinutes: 0,
        interruptedMinutes: 0
      }
    })
    const byDate = new Map<string, DaySummary>()

    days.forEach((day, index) => {
      const date = new Date(now)
      date.setDate(now.getDate() - (6 - index))
      byDate.set(dayKey(date), day)
    })

    sessions.forEach((session) => {
      const date = new Date(session.startedAt)
      const summary = byDate.get(dayKey(date))
      if (!summary) return
      const minutes = Math.max(0, Math.round(session.durationSeconds / 60))
      summary.focusMinutes += minutes
      if (session.completed) {
        summary.completedSessions += 1
        summary.completedFocusMinutes += minutes
      }
      else summary.interruptedMinutes += minutes
    })

    return days
  }, [sessions])

  const completedThisWeek = week.reduce((total, day) => total + day.completedSessions, 0)
  const minutesThisWeek = week.reduce((total, day) => total + day.focusMinutes, 0)

  return (
    <div className="analytics-dashboard">
      <div className="analytics-summary-row">
        <div><span>Completed sessions</span><strong>{completedThisWeek}</strong><small>last 7 days</small></div>
        <div><span>Time focused</span><strong>{Math.floor(minutesThisWeek / 60)}h {minutesThisWeek % 60}m</strong><small>from saved sessions</small></div>
        <div><span>Daily average</span><strong>{Math.round(completedThisWeek / 7 * 10) / 10}</strong><small>sessions per day</small></div>
      </div>

      <div className="analytics-chart-grid">
        <section className="analytics-chart-panel">
          <div className="analytics-chart-heading"><div><h2>Productivity</h2><p>Completed focus sessions</p></div><span>7 DAYS</span></div>
          <div className="analytics-recharts">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                <XAxis dataKey="day" tick={{ fill: '#909692', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#777d79', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#191a1d', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 10 }} />
                <Bar dataKey="completedSessions" name="Completed" fill="#dce2de" radius={[4, 4, 0, 0]} maxBarSize={25} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="analytics-chart-panel">
          <div className="analytics-chart-heading"><div><h2>Focus distribution</h2><p>Minutes by session outcome</p></div><span>7 DAYS</span></div>
          <div className="analytics-recharts">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                <XAxis dataKey="day" tick={{ fill: '#909692', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#777d79', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#191a1d', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 10 }} />
                <Bar dataKey="completedFocusMinutes" name="Completed focus minutes" stackId="focus" fill="#dce2de" radius={[3, 3, 0, 0]} maxBarSize={25} />
                <Bar dataKey="interruptedMinutes" name="Interrupted minutes" stackId="focus" fill="#686f6b" radius={[3, 3, 0, 0]} maxBarSize={25} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      {!sessions.length && <span className="analytics-loading">Charts fill as you complete focus sessions. History is stored on this device.</span>}
    </div>
  )
}

export default AnalyticsTab