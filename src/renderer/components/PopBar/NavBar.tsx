import { Activity, BarChart3, CalendarDays, Clipboard, List, MessageCircle, Search, ShieldCheck, Timer, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore, type PopBarTab } from '../../stores/appStore'
import { AudioEngine } from '../shared/AudioEngine'

/**
 * These stay pinned to a single row. The calculator and shortcut slots live above the
 * tabs because nine tabs plus four slots do not fit the panel width without wrapping.
 */
const tabs: { id: PopBarTab; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'diagnostics', label: 'Health', icon: Activity },
  { id: 'processes', label: 'Apps', icon: List },
  { id: 'analytics', label: 'Stats', icon: BarChart3 },
  { id: 'search', label: 'Find', icon: Search },
  { id: 'focus', label: 'Focus', icon: ShieldCheck },
  { id: 'stopwatch', label: 'Stop', icon: Timer },
  { id: 'calendar', label: 'Cal', icon: CalendarDays },
  { id: 'clipboard', label: 'Shelf', icon: Clipboard }
]

const NavBar = () => {
  const selectedTab = useAppStore((state) => state.selectedTab)
  const setSelectedTab = useAppStore((state) => state.setSelectedTab)

  return (
    <nav className="popbar-nav" aria-label="Pop Bar sections">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isSelected = selectedTab === id

        return (
          <button
            type="button"
            key={id}
            className={`popbar-tab ${isSelected ? 'is-selected' : ''}`}
            aria-current={isSelected ? 'page' : undefined}
            title={label}
            onClick={() => { AudioEngine.playClick(); setSelectedTab(id) }}
          >
            {isSelected && <motion.span className="nav-tab-highlight" layoutId="navTab" />}
            <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default NavBar
