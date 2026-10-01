import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

const FIFTEEN_MINUTES = 15 * 60 * 1000

export const useAgendaWatch = () => {
  const setUpcomingEventTitle = useAppStore((state) => state.setUpcomingEventTitle)
  const setIslandAlert = useAppStore((state) => state.setIslandAlert)

  useEffect(() => {
    let lastNotified = ''
    const scan = async () => {
      try {
        const events = await window.electronAPI?.listCalendarEvents() ?? []
        const now = Date.now()
        const soon = events.find((event) => event.startsAt - now > 0 && event.startsAt - now <= FIFTEEN_MINUTES)
        setUpcomingEventTitle(soon ? soon.title : null)
        if (soon && soon.id !== lastNotified && !useAppStore.getState().activeMessage) {
          lastNotified = soon.id
          setIslandAlert({ type: 'calendar', message: soon.title })
        }
      } catch {
        setUpcomingEventTitle(null)
      }
    }
    void scan()
    const timer = window.setInterval(() => void scan(), 30_000)
    return () => window.clearInterval(timer)
  }, [setIslandAlert, setUpcomingEventTitle])
}
