import { defineConfig, loadEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  borderIntakeContentSecurityPolicy,
  resolveBorderIntakeDeployment,
} from './scripts/border-intake-deployment.ts'

// base './' so the built site works on GitHub Pages or any subpath
export function createAppViteConfig(mode: string): UserConfig {
  const deployment = resolveBorderIntakeDeployment(loadEnv(mode, process.cwd(), ''), mode)
  const contentSecurityPolicy = borderIntakeContentSecurityPolicy(deployment)

  return {
    base: './',
    define: {
      __BORDER_ROLL_INTAKE_URL__: JSON.stringify(deployment.endpoint),
    },
    plugins: [
      react(),
      {
        name: 'border-intake-deployment-config',
        transformIndexHtml(html) {
          return html.replace('__BORDER_ROLL_CONTENT_SECURITY_POLICY__', contentSecurityPolicy)
        },
      },
    ],
    build: {
      // The manifest drives the bundle-budget check without depending on hashed filenames.
      manifest: true,
    },
  }
}

export default defineConfig(({ mode }) => createAppViteConfig(mode))
