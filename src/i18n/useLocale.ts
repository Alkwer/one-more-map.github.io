import { useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale } from './locale'

/** The application subscribes once so language changes rerender the existing
 * component tree without remounting it or losing an in-progress voyage. */
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale)
}
