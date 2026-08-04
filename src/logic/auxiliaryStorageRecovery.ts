export type AuxiliaryStorageRecoveryCode = 'invalid' | 'incompatible' | 'unavailable'

export interface AuxiliaryStorageRecovery {
  code: AuxiliaryStorageRecoveryCode
  message: string
  raw: string | null
  backupKey: string | null
}

function recoveryBackupKey(storageKey: string, raw: string): string {
  let hash = 2166136261
  for (let index = 0; index < raw.length; index += 1) {
    hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619)
  }
  return `${storageKey}-recovery-${raw.length}-${(hash >>> 0).toString(16)}`
}

/** Preserve the exact payload under a stable key without touching its active key. */
export function quarantineAuxiliaryStore(storageKey: string, raw: string): string | null {
  try {
    const baseKey = recoveryBackupKey(storageKey, raw)
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const backupKey = suffix === 0 ? baseKey : `${baseKey}-${suffix}`
      const existing = localStorage.getItem(backupKey)
      if (existing === raw) return backupKey
      if (existing === null) {
        localStorage.setItem(backupKey, raw)
        return localStorage.getItem(backupKey) === raw ? backupKey : null
      }
    }
  } catch {
    /* storage is unavailable or cannot accept a backup */
  }
  return null
}

export function incompatibleAuxiliaryStore(
  storageKey: string,
  raw: string,
  code: Exclude<AuxiliaryStorageRecoveryCode, 'unavailable'>,
  message: string,
): AuxiliaryStorageRecovery {
  return {
    code,
    message,
    raw,
    backupKey: quarantineAuxiliaryStore(storageKey, raw),
  }
}

export function unavailableAuxiliaryStore(message: string): AuxiliaryStorageRecovery {
  return { code: 'unavailable', message, raw: null, backupKey: null }
}
