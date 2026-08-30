import type { AppState } from '../state/appState'
import {
  decodeStateJson,
  serializeState,
  STATE_VERSION,
  type StateDecodeErrorCode,
} from './stateCodec'

export const LOCAL_STATE_KEY = 'allflame-voyage-solver'
export const LOCAL_STATE_BACKUP_PREFIX = `${LOCAL_STATE_KEY}-recovery`

export type LocalSaveFailureCode = 'serialization' | 'quota' | 'unavailable' | 'verification'
export type LocalSaveResult =
  { ok: true } | { ok: false; code: LocalSaveFailureCode; message: string }

export interface LocalStateRecovery {
  status: 'recovery'
  raw: string
  backupKey: string | null
  code: StateDecodeErrorCode | 'migration'
  message: string
  warnings: string[]
  proposedState?: AppState
}

export type LocalStateLoadResult =
  { status: 'empty' } | { status: 'ready'; state: AppState } | LocalStateRecovery

/** Minimal synchronous browser-storage port; callers may supply an in-memory implementation. */
export interface StateStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Recovery and verified writes operate exclusively on the injected storage port. */
export function createStateRepository(storage: StateStorage) {
  function storageWriteFailure(error: unknown): Extract<LocalSaveResult, { ok: false }> {
    const name =
      typeof error === 'object' && error !== null && 'name' in error
        ? String((error as { name: unknown }).name)
        : ''
    if (name === 'QuotaExceededError') {
      return {
        ok: false,
        code: 'quota',
        message: 'Browser storage is full.',
      }
    }
    return {
      ok: false,
      code: 'unavailable',
      message: 'Browser storage is unavailable or blocked.',
    }
  }

  function saveLocal(state: AppState): LocalSaveResult {
    let serialized: string
    try {
      serialized = serializeState(state)
    } catch (error) {
      return {
        ok: false,
        code: 'serialization',
        message: error instanceof Error ? error.message : 'State could not be serialized.',
      }
    }

    try {
      storage.setItem(LOCAL_STATE_KEY, serialized)
    } catch (error) {
      return storageWriteFailure(error)
    }

    try {
      if (storage.getItem(LOCAL_STATE_KEY) !== serialized) {
        return {
          ok: false,
          code: 'verification',
          message: 'Browser storage did not confirm the saved data.',
        }
      }
    } catch {
      return {
        ok: false,
        code: 'verification',
        message: 'Browser storage could not verify the saved data.',
      }
    }
    return { ok: true }
  }

  function recoveryBackupKey(raw: string): string {
    let hash = 2166136261
    for (let index = 0; index < raw.length; index += 1) {
      hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619)
    }
    return `${LOCAL_STATE_BACKUP_PREFIX}-${raw.length}-${(hash >>> 0).toString(16)}`
  }

  /** Preserve the exact original payload without touching the active storage key. */
  function quarantineLocalState(raw: string): string | null {
    try {
      const baseKey = recoveryBackupKey(raw)
      for (let suffix = 0; suffix < 100; suffix += 1) {
        const backupKey = suffix === 0 ? baseKey : `${baseKey}-${suffix}`
        const existing = storage.getItem(backupKey)
        if (existing === raw) return backupKey
        if (existing === null) {
          storage.setItem(backupKey, raw)
          return storage.getItem(backupKey) === raw ? backupKey : null
        }
      }
      return null
    } catch {
      return null
    }
  }

  function loadLocalState(): LocalStateLoadResult {
    try {
      const raw = storage.getItem(LOCAL_STATE_KEY)
      if (!raw) return { status: 'empty' }
      const decoded = decodeStateJson(raw)
      if (!decoded.ok) {
        return {
          status: 'recovery',
          raw,
          backupKey: quarantineLocalState(raw),
          code: decoded.code,
          message: decoded.message,
          warnings: [],
        }
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>
      const needsMigration = parsed.v !== STATE_VERSION || decoded.warnings.length > 0
      if (needsMigration) {
        return {
          status: 'recovery',
          raw,
          backupKey: quarantineLocalState(raw),
          code: 'migration',
          message:
            decoded.warnings[0] ??
            `saved state version ${String(parsed.v ?? 'unversioned')} requires migration`,
          warnings: decoded.warnings,
          proposedState: decoded.state,
        }
      }
      return { status: 'ready', state: decoded.state }
    } catch {
      try {
        const raw = storage.getItem(LOCAL_STATE_KEY)
        if (raw) {
          return {
            status: 'recovery',
            raw,
            backupKey: quarantineLocalState(raw),
            code: 'invalid',
            message: 'saved state could not be read',
            warnings: [],
          }
        }
      } catch {
        /* storage itself is unavailable */
      }
      return { status: 'empty' }
    }
  }

  /** Compatibility helper for non-interactive callers. Recovery is never treated as empty state. */
  function loadLocal(): AppState | null {
    const result = loadLocalState()
    return result.status === 'ready' ? result.state : null
  }

  return { saveLocal, loadLocalState, loadLocal, quarantineLocalState }
}
