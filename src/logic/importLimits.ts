export const MAX_IMPORT_TEXT_LENGTH = 512 * 1024
export const MAX_IMPORT_REJECTIONS = 20
export const MAX_IMPORT_SIGNATURE_PREFIX_LENGTH = 4 * 1024

export function importSizeLimitMessage(): string {
  return `Import rejected: maximum size is ${MAX_IMPORT_TEXT_LENGTH.toLocaleString('en-US')} characters. The pasted text was not retained.`
}
