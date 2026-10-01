import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import type { CalendarEventRecord } from '../../../electron-env'

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

const CalendarTab = () => {
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('09:30')

  const loadEvents = () => {
    void window.electronAPI?.listCalendarEvents().then(setEvents).catch(() => setEvents([]))
  }

  useEffect(() => {
    loadEvents()
  }, [])

  const days = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const startOffset = first.getDay()
    const grid: { date: Date; inMonth: boolean }[] = []
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(year, month, index - startOffset + 1)
      grid.push({ date, inMonth: date.getMonth() === month })
    }
    return grid
  }, [cursor])

  const selectedEvents = events.filter((event) => startOfDay(new Date(event.startsAt)) === selectedDay)
  const upcoming = events.filter((event) => event.startsAt >= Date.now()).slice(0, 6)
  const today = startOfDay(new Date())

  const addEvent = (form: FormEvent<HTMLFormElement>) => {
    form.preventDefault()
    if (!title.trim()) return
    const [hours, minutes] = time.split(':').map(Number)
    const starts = new Date(selectedDay)
    starts.setHours(hours || 0, minutes || 0, 0, 0)
    void window.electronAPI?.createCalendarEvent({ title: title.trim(), startsAt: starts.getTime() }).then(() => {
      setTitle('')
      loadEvents()
    }).catch(() => undefined)
  }

  return (
    <div className="calendar-workspace">
      <section className="calendar-month" aria-label="Month view">
        <header>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
          <strong>{cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">›</button>
        </header>
        <div className="calendar-weekdays">
          {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
        <div className="calendar-grid">
          {days.map(({ date, inMonth }) => {
            const stamp = startOfDay(date)
            const hasEvent = events.some((event) => startOfDay(new Date(event.startsAt)) === stamp)
            return (
              <button
                type="button"
                key={stamp + String(inMonth)}
                className={`calendar-day ${inMonth ? '' : 'is-outside'} ${stamp === today ? 'is-today' : ''} ${stamp === selectedDay ? 'is-selected' : ''}`}
                onClick={() => setSelectedDay(stamp)}
              >
                {date.getDate()}
                {hasEvent && <i />}
              </button>
            )
          })}
        </div>
      </section>

      <section className="calendar-agenda" aria-label="Agenda">
        <form className="calendar-create" onSubmit={addEvent}>
          <div>
            <CalendarDays size={14} />
            <span>{new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Quick event" aria-label="Event title" />
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Event time" />
          <button type="submit" aria-label="Add event"><Plus size={14} /></button>
        </form>

        <ul className="calendar-event-list">
          {(selectedEvents.length ? selectedEvents : upcoming).map((event) => (
            <AgendaRow key={event.id} event={event} onDelete={() => { void window.electronAPI?.deleteCalendarEvent(event.id).then(loadEvents).catch(() => undefined) }} />
          ))}
          {!selectedEvents.length && !upcoming.length && <li className="calendar-empty">Nothing on the books. Add a local event to keep it offline.</li>}
        </ul>

      </section>
    </div>
  )
}

const AgendaRow = ({ event, onDelete }: { event: CalendarEventRecord; onDelete: () => void }) => (
  <li className="calendar-event-row">
    <span>
      <strong>{event.title}</strong>
      <small>
        {new Date(event.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        {' · Local'}
      </small>
    </span>
    <button type="button" onClick={onDelete} aria-label={`Delete ${event.title}`}><Trash2 size={13} /></button>
  </li>
)

export default CalendarTab
