export interface ClipboardWriter {
  writeText(text: string): Promise<void>
}

export type ClipboardWriteResult =
  | { ok: true }
  | {
      ok: false
      reason: 'unavailable' | 'rejected'
      detail: string
      manualText: string
    }

function browserClipboard(): ClipboardWriter | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.clipboard
}

/** Write text without assuming that the Clipboard API exists or is permitted. */
export async function writeClipboardText(
  text: string,
  clipboard: ClipboardWriter | undefined = browserClipboard(),
): Promise<ClipboardWriteResult> {
  if (typeof clipboard?.writeText !== 'function') {
    return {
      ok: false,
      reason: 'unavailable',
      detail: 'The Clipboard API is unavailable in this browser.',
      manualText: text,
    }
  }

  try {
    await clipboard.writeText(text)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: 'rejected',
      detail:
        error instanceof Error && error.message ? error.message : 'Clipboard access was denied.',
      manualText: text,
    }
  }
}
