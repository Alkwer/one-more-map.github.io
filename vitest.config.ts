import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/*.{test,spec}.{ts,tsx}'],
    },
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  }),
)
