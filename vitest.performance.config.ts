import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/performance/solver-performance-budget.test.ts'],
  },
})
