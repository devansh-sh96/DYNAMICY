import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useShortcutStore } from '../../stores/shortcutStore'

/**
 * Four fixed pin slots beside the calculator.
 *
 * Left click launches, right click opens a small menu with Replace / Remove. Empty slots
 * open the native file picker so any local executable can be pinned.
 */
const ShortcutSlots = () => {
  const slots = useShortcutStore((state) => state.slots)
  const assign = useShortcutStore((state) => state.assign)
  const clear = useShortcutStore((state) => state.clear)
  const launch = useShortcutStore((state) => state.launch)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // A click anywhere else dismisses the open context menu.
  useEffect(() => {
    if (menuFor === null) return
    const dismiss = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuFor(null) }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

  const pickFor = async (index: number) => {
    setMenuFor(null)
    const picked = await window.electronAPI?.pickApp()
    if (picked) assign(index, picked)
  }

  return (
    <div className="shortcut-slots" ref={menuRef} aria-label="Pinned application shortcuts">
      {slots.map((slot, index) => (
        <div key={index} className="shortcut-slot">
          <button
            type="button"
            className={`shortcut-button ${slot ? 'is-assigned' : 'is-empty'}`}
            onClick={() => (slot ? void launch(index) : void pickFor(index))}
            onContextMenu={(event) => {
              event.preventDefault()
              if (slot) setMenuFor((current) => (current === index ? null : index))
            }}
            title={slot ? `${slot.name} — click to launch, right click to edit` : 'Pin an application'}
            aria-label={slot ? `Launch ${slot.name}` : `Pin an application to slot ${index + 1}`}
          >
            {slot ? <span className="shortcut-label">{slot.name.slice(0, 2).toUpperCase()}</span> : <Plus size={13} />}
          </button>

          {menuFor === index && slot && (
            <div className="shortcut-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void pickFor(index)}>Replace…</button>
              <button type="button" role="menuitem" onClick={() => { clear(index); setMenuFor(null) }}>Remove</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default ShortcutSlots
