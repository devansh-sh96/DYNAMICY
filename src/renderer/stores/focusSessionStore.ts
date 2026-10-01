import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type LocalFocusSession = {
  id: number
  startedAt: number
  endedAt: number | null
  durationSeconds: number
  completed: boolean
  notes: string
}

type FocusSessionStore = {
  sessions: LocalFocusSession[]
  startSession: (startedAt: number) => number
  finishSession: (id: number, durationSeconds: number, completed: boolean, endedAt?: number) => void
}

export const useFocusSessionStore = create<FocusSessionStore>()(persist(
  (set) => ({
    sessions: [],
    startSession: (startedAt) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      set((state) => ({
        sessions: [{ id, startedAt, endedAt: null, durationSeconds: 0, completed: false, notes: '' }, ...state.sessions].slice(0, 1000)
      }))
      return id
    },
    finishSession: (id, durationSeconds, completed, endedAt = Date.now()) => set((state) => ({
      sessions: state.sessions.map((session) => session.id === id
        ? { ...session, endedAt, durationSeconds: Math.max(0, durationSeconds), completed }
        : session)
    }))
  }),
  { name: 'icy-bear-focus-sessions', storage: createJSONStorage(() => localStorage) }
))
