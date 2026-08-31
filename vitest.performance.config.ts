import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/performance/*.test.ts'],
    // Timing gates must not compete with a solver workload in another test file.
    fileParallelism: false,
  },
})
