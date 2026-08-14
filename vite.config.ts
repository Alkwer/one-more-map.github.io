import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  borderIntakeContentSecurityPolicy,
  resolveBorderIntakeDeployment,
} from './scripts/border-intake-deployment.ts'
import {
  parseStaticHeadersConfig,
  productionSecurityHeaders,
  renderStaticHeadersConfig,
} from './src/securityHeaders.ts'

function emitStaticSecurityHeaders(contentSecurityPolicy: string): Plugin {
  return {
    name: 'emit-static-security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: renderStaticHeadersConfig(contentSecurityPolicy),
      })
    },
  }
}

// base './' so the built site works on GitHub Pages or any subpath
export function createAppViteConfig(
  mode: string,
  previewHeaders?: ReturnType<typeof productionSecurityHeaders>,
): UserConfig {
  const deployment = resolveBorderIntakeDeployment(loadEnv(mode, process.cwd(), ''), mode)
  const contentSecurityPolicy = borderIntakeContentSecurityPolicy(deployment)
  const securityHeaders = productionSecurityHeaders(contentSecurityPolicy)

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
      emitStaticSecurityHeaders(contentSecurityPolicy),
    ],
    build: {
      // The manifest drives the bundle-budget check without depending on hashed filenames.
      manifest: true,
    },
    preview: {
      headers: previewHeaders ?? securityHeaders,
    },
  }
}

export default defineConfig(({ isPreview, mode }) =>
  createAppViteConfig(
    mode,
    isPreview
      ? parseStaticHeadersConfig(readFileSync(new URL('./dist/_headers', import.meta.url), 'utf8'))
      : undefined,
  ),
)
