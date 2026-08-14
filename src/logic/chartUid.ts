let uidCounter = 0

export function newUid(): string {
  uidCounter += 1
  return `c${Date.now().toString(36)}-${uidCounter}`
}
