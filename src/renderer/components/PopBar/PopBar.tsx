import { AnimatePresence, motion } from 'framer-motion'
import type { ComponentType } from 'react'
import { useRef } from 'react'
import { Calculator, Settings } from 'lucide-react'
import { useAppStore, type PopBarTab } from '../../stores/appStore'
import MenuBar from '../MenuBar/MenuBar'
import NavBar from './NavBar'
import SettingsPanel from './SettingsPanel'
import ShortcutSlots from './ShortcutSlots'
import TrafficLights from './TrafficLights'
import { AudioEngine } from '../shared/AudioEngine'
import ChatTab from './tabs/ChatTab'
import DiagnosticsTab from './tabs/DiagnosticsTab'
import AnalyticsTab from './tabs/AnalyticsTab'
import FocusTab from './tabs/FocusTab'
import ProcessesTab from './tabs/ProcessesTab'
import SearchTab from './tabs/SearchTab'
import CalendarTab from './tabs/CalendarTab'
import ClipboardTab from './tabs/ClipboardTab'
import CalculatorTab from './tabs/CalculatorTab'
import StopwatchTab from './tabs/StopwatchTab'
import { IcySprite } from '../DynamicIsland/IcySprite'
import { useMascotPress } from '../../hooks/useMascotPress'
import { usePomodoroStore } from '../../hooks/usePomodoro'

const tabViews: Record<PopBarTab, { title: string; subtitle: string; component: ComponentType }> = {
  chat: { title: 'Chat', subtitle: 'Your desktop companion', component: ChatTab },
  diagnostics: { title: 'Diagnostics', subtitle: 'Live system health', component: DiagnosticsTab },
  processes: { title: 'Processes', subtitle: 'Running applications', component: ProcessesTab },
  analytics: { title: 'Analytics', subtitle: 'System activity over time', component: AnalyticsTab },
  search: { title: 'Search', subtitle: 'Find something on your device', component: SearchTab },
  focus: { title: 'Focus', subtitle: 'A little room to think', component: FocusTab },
  calendar: { title: 'Calendar', subtitle: 'Local agenda', component: CalendarTab },
  clipboard: { title: 'Clipboard', subtitle: 'Last ten copied snippets', component: ClipboardTab },
  calculator: { title: 'Calculator', subtitle: 'Quick maths with history', component: CalculatorTab },
  stopwatch: { title: 'Stopwatch', subtitle: 'Count up, record laps', component: StopwatchTab }
}

// Generous on purpose: nothing here answers to a lone press, so the extra slack in the
// window costs nothing and catches a slow second click that the island's window rejects.
const MASCOT_DOUBLE_PRESS_WINDOW_MS = 650

const PopBar = () => {
  const selectedTab = useAppStore((state) => state.selectedTab)
  const setSelectedTab = useAppStore((state) => state.setSelectedTab)
  const setExpanded = useAppStore((state) => state.setExpanded)
  const setMinimal = useAppStore((state) => state.setMinimal)
  const mediaPrivacy = useAppStore((state) => state.mediaPrivacy)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const strictMode = usePomodoroStore((state) => state.strictMode)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const panelRef = useRef<HTMLElement>(null)
  const currentView = tabViews[selectedTab]
  const CurrentTab = currentView.component

  /**
   * The panel's mascot is the mirror of the island's bear: a double press collapses the
   * panel back into the compact capsule. Detection goes through the shared press hook
   * rather than `onDoubleClick` because the mascot sprite is re-mounted by framer-motion
   * as Icy changes state, and a native double click is keyed to the event target — the
   * remount resets Chromium's click counter and the gesture is swallowed.
   */
  const mascotPress = useMascotPress({
    windowMs: MASCOT_DOUBLE_PRESS_WINDOW_MS,
    onDoublePress: () => {
      if (strictMode) return
      AudioEngine.playClick()
      setMinimal(false)
      setExpanded(false)
    }
  })

  // No shared-layout morph with the island: projecting this whole panel out of the pill
  // stretched every child mid-flight and stalled for seconds. Opacity + scale stay on the compositor.
  return (
    <motion.section
      className="popbar-panel"
      data-hit-region
      style={{ transformOrigin: 'top center' }}
      initial={{ opacity: 0, scale: 0.94, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      // A 48px backdrop blur re-rendered on every frame of the scale is what made the
      // entrance stutter; it's dropped while the panel moves and restored when it lands.
      onAnimationStart={() => panelRef.current?.classList.add('is-animating')}
      onAnimationComplete={() => panelRef.current?.classList.remove('is-animating')}
      ref={panelRef}
      aria-label="Icy Bear Pop Bar"
    >
      <div className="popbar-menubar-row">
        <TrafficLights />
        <MenuBar />
      </div>
      <div className="popbar-inner" data-no-window-drag>
        <div className="popbar-heading">
          <div className="popbar-heading-identity">
            {/*
              Double-clicking the mascot collapses the popup back to the island. The
              island's own bear button only exists while the island is on screen, so the
              expanded panel needs its own copy of this handler.
            */}
            <button
              type="button"
              className="popbar-mascot-button"
              data-no-window-drag
              title="Double-click to collapse the island"
              aria-label="Icy Bear — double-click to collapse"
              aria-expanded={true}
              onPointerDown={mascotPress.onPointerDown}
              onPointerUp={mascotPress.onPointerUp}
              onPointerCancel={mascotPress.onPointerCancel}
              onPointerLeave={mascotPress.onPointerLeave}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                if (strictMode) return
                AudioEngine.playClick()
                setMinimal(false)
                setExpanded(false)
              }}
            >
              <IcySprite />
            </button>
            <div>
            <h1>{currentView.title}</h1>
            <p>{currentView.subtitle}</p>
            </div>
          </div>
          <div className="popbar-heading-meta">
            {mediaPrivacy.camera && <span className="privacy-dot" role="status" title="Camera in use" aria-label="Camera in use" />}
            {mediaPrivacy.microphone && <span className="privacy-dot is-microphone" role="status" title="Microphone in use" aria-label="Microphone in use" />}
            {/*
              The key the chat needs has to be reachable from anywhere in the panel, not just
              from the chat tab's own setup card — so the cog sits in the heading itself.
            */}
            <button
              type="button"
              className={`popbar-settings-button ${settingsOpen ? 'is-active' : ''}`}
              title="Settings"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => { AudioEngine.playClick(); setSettingsOpen(!settingsOpen) }}
            >
              <Settings size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Calculator launcher and shortcut slots stay pinned above the tabs. */}
        <div className="popbar-utility-row">
          <div className="popbar-utility-actions">
            <button
              type="button"
              className={`utility-calculator ${selectedTab === 'calculator' ? 'is-active' : ''}`}
              aria-current={selectedTab === 'calculator' ? 'page' : undefined}
              title="Calculator"
              onClick={() => { AudioEngine.playClick(); setSelectedTab('calculator') }}
            >
              <Calculator size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>Calc</span>
            </button>
            <ShortcutSlots />
          </div>
        </div>
        {/*
          The nav highlight is a `layoutId` motion element that remounts on every tab
          switch, and framer-motion 11.18.2 never unregisters a presence child when a
          plain motion component unmounts — the stale entry sits at `false` in this
          panel's presence map forever, so the panel's exit can never complete and the
          mascot double-click quietly stops collapsing after the first tab switch.
          This always-present AnimatePresence parks the highlight's registrations in
          its own throwaway map, which nobody waits on.
        */}
        <AnimatePresence>
          <NavBar key="navbar" />
        </AnimatePresence>
        <div className="popbar-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedTab}
              className="tab-view"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <CurrentTab />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="popbar-footer"><span>ICY BEAR</span><span>LOCAL SESSION</span></div>
        {/*
          The settings sheet rides above the panel rather than becoming an eleventh tab, so
          connecting a key never costs the user their place in the island.
        */}
        <AnimatePresence>
          {settingsOpen && <SettingsPanel key="settings" />}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

export default PopBar