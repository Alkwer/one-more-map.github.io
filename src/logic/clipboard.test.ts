import { describe, expect, it, vi } from 'vitest'
import { writeClipboardText } from './clipboard'

describe('writeClipboardText', () => {
  it('returns a manual-copy result when the Clipboard API is unavailable', async () => {
    await expect(writeClipboardText('manual value', undefined)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
      detail: 'The Clipboard API is unavailable in this browser.',
      manualText: 'manual value',
    })
  })

  it('returns a manual-copy result without logging an uncaught rejection', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(writeClipboardText('manual value', { writeText })).resolves.toMatchObject({
      ok: false,
      reason: 'rejected',
      manualText: 'manual value',
    })
    expect(writeText).toHaveBeenCalledWith('manual value')
    expect(consoleError).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('reports success only after the write resolves', async () => {
    let resolveWrite: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveWrite = resolve
    })
    const result = writeClipboardText('copied value', { writeText: () => pending })
    let settled = false
    void result.then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    resolveWrite?.()
    await expect(result).resolves.toEqual({ ok: true })
  })
})
