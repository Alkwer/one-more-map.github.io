import { describe, expect, it } from 'vitest'

describe('nested validation discovery canary', () => {
  it('runs intended tests below the top level of tests/', () => {
    expect(new URL('.', import.meta.url).pathname).toContain('/tests/integration/')
  })
})
