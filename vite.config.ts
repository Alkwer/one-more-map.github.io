import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built site works on GitHub Pages or any subpath
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        harvest: resolve(__dirname, 'harvest.html'),
      },
    },
  },
})
