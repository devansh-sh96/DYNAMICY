import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Shortcut = { name: string; path: string }

export const SHORTCUT_SLOTS = 4

type ShortcutStore = {
  /** Always four entries; `null` means the slot is still empty. */
  slots: (Shortcut | null)[]
  assign: (index: number, shortcut: Shortcut) => void
  clear: (index: number) => void
  launch: (index: number) => Promise<void>
}

const emptySlots = (): (Shortcut | null)[] => Array.from({ length: SHORTCUT_SLOTS }, () => null)

export const useShortcutStore = create<ShortcutStore>()(persist(
  (set, get) => ({
    slots: emptySlots(),

    assign: (index, shortcut) => set((state) => ({
      slots: state.slots.map((slot, position) => (position === index ? shortcut : slot))
    })),

    clear: (index) => set((state) => ({
      slots: state.slots.map((slot, position) => (position === index ? null : slot))
    })),

    launch: async (index) => {
      const target = get().slots[index]
      if (!target) return
      // Failure is non-fatal: the slot simply does nothing if the file has moved.
      await window.electronAPI?.launchApp(target.path)
    }
  }),
  {
    name: 'icy-bear-shortcuts',
    storage: createJSONStorage(() => localStorage),
    // Older state may hold a different number of slots; normalise on rehydrate.
    merge: (persisted, current) => {
      const stored = (persisted as Partial<ShortcutStore> | undefined)?.slots ?? []
      const merged = emptySlots()
      for (let index = 0; index < SHORTCUT_SLOTS; index += 1) {
        const slot = stored[index]
        merged[index] = slot && typeof slot.name === 'string' && typeof slot.path === 'string' ? slot : null
      }
      return { ...current, slots: merged }
    }
  }
))
