import { useState } from 'react'
import { encodeShare } from '../logic/share'
import { writeClipboardText } from '../logic/clipboard'
import type { AppState } from '../logic/storage'

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
    let hash: string
    try {
      hash = encodeShare(state)
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : 'Could not create share link')
      window.setTimeout(() => setShareMessage(''), 2500)
      return
    }

    const url = `${location.origin}${location.pathname}#${hash}`
    const result = await writeClipboardText(url)
    if (result.ok) {
      setShareMessage('Link copied!')
    } else {
      window.location.hash = hash
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
