import { useEffect, useRef } from 'react'
import { AnimatePresence, LayoutGroup } from 'framer-motion'
import DynamicIsland from './components/DynamicIsland/DynamicIsland'
import PopBar from './components/PopBar/PopBar'
import { useAppStore } from './stores/appStore'
import { useChatStore } from './stores/chatStore'
import { usePomodoroTicker } from './hooks/usePomodoro'
import { usePomodoroStore } from './hooks/usePomodoro'
import { useSystemStats } from './hooks/useSystemStats'
import { useMediaStore } from './stores/mediaStore'
import { useAgendaWatch } from './hooks/useAgendaWatch'
import { useHitRegions } from './hooks/useHitRegions'

const App = () => {
	const isExpanded = useAppStore((state) => state.isExpanded)
	const isMinimal = useAppStore((state) => state.isMinimal)
	const setFullscreenActive = useAppStore((state) => state.setFullscreenActive)
	const setActiveMessage = useAppStore((state) => state.setActiveMessage)
	const setIslandAlert = useAppStore((state) => state.setIslandAlert)
	const setMedia = useMediaStore((state) => state.setMedia)
	const setMediaPrivacy = useAppStore((state) => state.setMediaPrivacy)
	const beginSession = useChatStore((state) => state.beginSession)
	// Read the previous expansion state without re-running the effect on every change.
	const wasExpanded = useRef(false)
	usePomodoroTicker()
	useSystemStats()
	useAgendaWatch()
	useHitRegions()

	// Every time the popup expands, mint a fresh session id and clear the transcript.
	useEffect(() => {
		if (isExpanded && !wasExpanded.current) beginSession()
		wasExpanded.current = isExpanded
	}, [isExpanded, beginSession])

	useEffect(() => window.electronAPI?.onMediaUpdate(setMedia), [setMedia])
	useEffect(() => window.electronAPI?.onFullscreenActive(setFullscreenActive), [setFullscreenActive])
	useEffect(() => window.electronAPI?.onIncomingMessage((message) => {
		setActiveMessage(message)
		setIslandAlert(null)
	}), [setActiveMessage, setIslandAlert])
	useEffect(() => window.electronAPI?.onIslandAlert((alert) => {
		if (!useAppStore.getState().activeMessage) setIslandAlert(alert)
	}), [setIslandAlert])
	useEffect(() => window.electronAPI?.onCapsLock((capsOn) => {
		if (!capsOn || useAppStore.getState().activeMessage) return
		setIslandAlert({ type: 'capslock', message: 'Caps Lock is on' })
	}), [setIslandAlert])
	useEffect(() => window.electronAPI?.onMediaPrivacy(setMediaPrivacy), [setMediaPrivacy])

	return (
		<main className="app-shell">
			<LayoutGroup id="icy-popbar">
				{/*
					Sync mode on purpose: the outgoing element stays on screen for the length of
					the shared-layout crossfade, so the incoming tree mounts and paints behind it
					instead of after it. `mode="wait"` gated the panel's mount on the island's
					exit completing, which left a dead window of blank frames between the capsule
					fading out and the panel's first paint.
					The form each instance renders is decided by its own `minimal` prop, not by
					the store flag — under `mode="wait"` an exiting island used to re-read
					`isMinimal` and morph into a second pebble mid-transition (two dots).
				*/}
				<AnimatePresence initial={false}>
					{isMinimal ? <DynamicIsland key="island-dot" minimal /> : isExpanded ? <PopBar key="popbar" /> : <DynamicIsland key="island" />}
				</AnimatePresence>
			</LayoutGroup>
		</main>
	)
}

export default App
