import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type LocalTask = { id: number; title: string; completed: boolean }

type TaskStore = {
  tasks: LocalTask[]
  addTask: (title: string) => void
  toggleTask: (id: number) => void
  deleteTask: (id: number) => void
}

export const useTaskStore = create<TaskStore>()(persist(
  (set) => ({
    tasks: [],
    addTask: (title) => set((state) => ({
      tasks: [...state.tasks, { id: Date.now() + Math.random(), title: title.trim(), completed: false }]
    })),
    toggleTask: (id) => set((state) => ({
      tasks: state.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task)
    })),
    deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
  }),
  {
    name: 'icy-bear-tasks',
    storage: createJSONStorage(() => localStorage)
  }
))