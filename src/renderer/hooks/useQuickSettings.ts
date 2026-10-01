import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuickSettingsState, QuickToggleKey } from '../../shared/ipc'

const POLL_INTERVAL_MS = 15000

/**
 * Live mirror of the hardware toggles the quick-settings strip exposes. State is fetched
 * on mount and then polled gently while the panel is open (these are cheap reads and the
 * panel is the only place they surface); every toggle re-reads fresh state so the pill
 * reflects the radio's real answer, not the optimistic tap.
 */
export const useQuickSettings = () => {
  const [state, setState] = useState<QuickSettingsState | null>(null)
  const [busyKey, setBusyKey] = useState<QuickToggleKey | null>(null)
  const fetchingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      setState(await window.electronAPI.getQuickSettings())
    } finally {
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const toggle = useCallback(async (key: QuickToggleKey) => {
    if (busyKey) return
    setBusyKey(key)
    try {
      setState(await window.electronAPI.toggleQuickSetting(key))
    } finally {
      setBusyKey(null)
    }
  }, [busyKey])

  const setBrightness = useCallback(async (level: number) => {
    const applied = await window.electronAPI.setBrightness(level)
    setState((current) => (current ? { ...current, brightness: { supported: true, level: applied } } : current))
    return applied
  }, [])

  return { state, busyKey, toggle, refresh, setBrightness }
}
