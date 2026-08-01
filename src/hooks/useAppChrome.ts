import { useState } from 'react'
import { encodeShare, type AppState } from '../logic/storage'

export function useAppChrome(state: AppState) {
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('onboarding-seen')
    } catch {
      return false
    }
  })
  const [showMods, setShowMods] = useState(false)
  const [harvestTheme, setHarvestTheme] = useState(() =>
    document.body.classList.contains('theme-harvest'),
  )
  const [shareMessage, setShareMessage] = useState('')

  const closeOnboarding = () => {
    setShowOnboarding(false)
    try {
      localStorage.setItem('onboarding-seen', '1')
    } catch {
      /* ignore */
    }
  }
  const toggleTheme = () => {
    const next = !harvestTheme
    setHarvestTheme(next)
    document.body.classList.toggle('theme-harvest', next)
    try {
      localStorage.setItem('theme', next ? 'harvest' : 'allflame')
    } catch {
      /* ignore */
    }
  }
  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodeShare(state)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareMessage('Link copied!')
    } catch {
      window.location.hash = encodeShare(state)
      setShareMessage('Link set in address bar')
    }
    window.setTimeout(() => setShareMessage(''), 2500)
  }

  return {
    showOnboarding,
    openOnboarding: () => setShowOnboarding(true),
    closeOnboarding,
    showMods,
    openMods: () => setShowMods(true),
    closeMods: () => setShowMods(false),
    harvestTheme,
    toggleTheme,
    shareMessage,
    share,
  }
}
