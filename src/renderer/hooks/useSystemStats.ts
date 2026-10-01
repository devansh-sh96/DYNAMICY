import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

export const useSystemStats = () => {
  const setSystemStats = useAppStore((state) => state.setSystemStats)

  useEffect(() => window.electronAPI?.onSystemStatsUpdate(setSystemStats), [setSystemStats])
}