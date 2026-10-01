import { create } from 'zustand'

export type IcyState = 'idle' | 'chatting' | 'working'
export type SpriteAction = 'default' | 'calm' | 'research'
export type CenterPodMode = 'equalizer' | 'gauges' | 'focus' | 'media'
export type PopBarTab = 'chat' | 'diagnostics' | 'processes' | 'analytics' | 'search' | 'focus' | 'calendar' | 'clipboard' | 'calculator' | 'stopwatch'
export type ActiveMessage = { id: string; sender: string; avatar?: string; text: string; timestamp: number }
export type IslandAlert = { type: 'volume' | 'clipboard' | 'battery' | 'calendar' | 'capslock' | 'focus' | 'gmail'; message: string; value?: number }
export type MediaPrivacy = { camera: boolean; microphone: boolean }

export type SystemStats = {
  cpu: number
  ramUsed: number
  ramTotal: number
  cores: number[]
  gpuLoad: number | null
  gpuName: string
  networkRxKbps: number
  networkTxKbps: number
  diskUsedGb: number
  diskTotalGb: number
}

type AppStore = {
  icyState: IcyState
  isExpanded: boolean
  isMinimal: boolean
  mediaMode: boolean
  fullscreenActive: boolean
  activeMessage: ActiveMessage | null
  islandAlert: IslandAlert | null
  centerPodMode: CenterPodMode
  selectedTab: PopBarTab
  systemStats: SystemStats
  spriteAction: SpriteAction
  analyticsTriggered: boolean
  responseText: string
  mediaPrivacy: MediaPrivacy
  upcomingEventTitle: string | null
  /** True while the island is slid up out of the way under the top edge. */
  isTucked: boolean
  /** Whether the settings panel is covering the popup, opened from the cog in the heading. */
  settingsOpen: boolean
  /** Identifier of the current chat session; a fresh one is minted on every expand. */
  chatSessionId: string
  setIcyState: (icyState: IcyState) => void
  setSystemStats: (systemStats: SystemStats) => void
  setExpanded: (isExpanded: boolean) => void
  setMinimal: (isMinimal: boolean) => void
  setMediaMode: (mediaMode: boolean) => void
  toggleMediaMode: () => void
  setFullscreenActive: (fullscreenActive: boolean) => void
  setActiveMessage: (activeMessage: ActiveMessage | null) => void
  setIslandAlert: (islandAlert: IslandAlert | null) => void
  setSelectedTab: (selectedTab: PopBarTab) => void
  setCenterPodMode: (centerPodMode: CenterPodMode) => void
  cycleCenterPodMode: () => void
  setSpriteAction: (spriteAction: SpriteAction) => void
  handleUserMessage: (message: string) => void
  triggerAnalytics: () => void
  setMediaPrivacy: (mediaPrivacy: MediaPrivacy) => void
  setUpcomingEventTitle: (upcomingEventTitle: string | null) => void
  setTucked: (isTucked: boolean) => void
  setSettingsOpen: (settingsOpen: boolean) => void
  startChatSession: () => void
}

const centerPodModes: CenterPodMode[] = ['equalizer', 'gauges', 'focus', 'media']

export const useAppStore = create<AppStore>((set) => ({
  icyState: 'idle',
  isExpanded: false,
  isMinimal: false,
  mediaMode: false,
  fullscreenActive: false,
  activeMessage: null,
  islandAlert: null,
  centerPodMode: 'equalizer',
  selectedTab: 'chat',
  systemStats: {
    cpu: 18,
    ramUsed: 5.2,
    ramTotal: 16,
    cores: [12, 28, 18, 42, 24, 35, 16, 30],
    gpuLoad: null,
    gpuName: 'GPU data unavailable',
    networkRxKbps: 0,
    networkTxKbps: 0,
    diskUsedGb: 0,
    diskTotalGb: 0
  },
  spriteAction: 'default',
  analyticsTriggered: false,
  responseText: '',
  mediaPrivacy: { camera: false, microphone: false },
  upcomingEventTitle: null,
  isTucked: false,
  settingsOpen: false,
  chatSessionId: typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  setIcyState: (icyState) => set({ icyState }),
  setSystemStats: (systemStats) => set({ systemStats }),
  setExpanded: (isExpanded) => set({ isExpanded }),
  setMinimal: (isMinimal) => set({ isMinimal }),
  setMediaMode: (mediaMode) => set({ mediaMode }),
  toggleMediaMode: () => set((state) => ({ mediaMode: !state.mediaMode })),
  setFullscreenActive: (fullscreenActive) => set({ fullscreenActive }),
  setActiveMessage: (activeMessage) => set({ activeMessage }),
  setIslandAlert: (islandAlert) => set({ islandAlert }),
  setSelectedTab: (selectedTab) => set({ selectedTab }),
  setCenterPodMode: (centerPodMode) => set({ centerPodMode }),
  cycleCenterPodMode: () =>
    set((state) => ({
      centerPodMode:
        centerPodModes[(centerPodModes.indexOf(state.centerPodMode) + 1) % centerPodModes.length]
    })),
  setSpriteAction: (spriteAction) => set({ spriteAction }),
  handleUserMessage: (message) => {
    if (/\b(?:damn|fuck|shit|bitch|asshole|crap|idiot)\b/i.test(message)) {
      set({
        icyState: 'chatting',
        spriteAction: 'calm',
        responseText: "Let's keep it respectful, okay?"
      })
      return
    }

    if (/\b(?:research|look up|find out|tell me about|information on)\b/i.test(message)) {
      set({ icyState: 'working', spriteAction: 'research', responseText: 'Looking that up now.' })
      return
    }

    set({ icyState: 'chatting', spriteAction: 'default', responseText: '' })
  },
  triggerAnalytics: () => set({ analyticsTriggered: true }),
  setMediaPrivacy: (mediaPrivacy) => set({ mediaPrivacy }),
  setUpcomingEventTitle: (upcomingEventTitle) => set({ upcomingEventTitle }),
  setTucked: (isTucked) => set({ isTucked }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  startChatSession: () => set({
    chatSessionId: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  })
}))