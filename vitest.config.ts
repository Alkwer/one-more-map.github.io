import { defineConfig, mergeConfig } from 'vitest/config'
import { createAppViteConfig } from './vite.config.ts'

export default mergeConfig(
  createAppViteConfig('test'),
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['tests/fixtures/**', 'tests/performance/**'],
      benchmark: {
        include: ['benchmarks/**/*.bench.ts'],
      },
    },
  }),
)
