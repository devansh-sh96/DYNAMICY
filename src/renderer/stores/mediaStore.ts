import { create } from 'zustand'

export type SystemMedia = {
  title: string
  artist: string
  app: string
  playback: 'Playing' | 'Paused' | 'Stopped' | 'Unknown'
  positionSeconds: number
  durationSeconds: number
}

type MediaStore = {
  media: SystemMedia | null
  mediaMode: boolean
  setMedia: (media: SystemMedia | null) => void
  toggleMediaMode: () => void
}

export const useMediaStore = create<MediaStore>((set) => ({
  media: null,
  mediaMode: false,
  setMedia: (media) => set({ media }),
  toggleMediaMode: () => set((state) => ({ mediaMode: !state.mediaMode }))
}))