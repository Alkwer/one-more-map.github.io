/** Compatibility facade. New consumers should import domain state or pure codecs directly. */
export * from '../state/appState'
export * from './stateCodec'
export * from './stateRepository'

import { createStateRepository } from './stateRepository'

// Resolve the browser global only during an operation, so access failures remain recoverable.
const browserRepository = createStateRepository({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
})

export const { saveLocal, loadLocalState, loadLocal, quarantineLocalState } = browserRepository
