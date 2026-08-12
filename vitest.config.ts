import { defineConfig, mergeConfig } from 'vitest/config'
import type { UserConfig } from 'vite'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig as UserConfig,
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
