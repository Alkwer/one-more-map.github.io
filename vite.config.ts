import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built site works on GitHub Pages or any subpath
export default defineConfig({
  base: './',
  plugins: [react()],
})
