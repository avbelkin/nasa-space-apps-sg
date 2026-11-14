import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  applyLinkPreviewHtmlTransform,
  resolveLinkPreviewUrls,
} from './src/utils/linkPreviewMeta.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const base = env.VITE_BASE_PATH || '/'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5180'
  const linkPreviewUrls = resolveLinkPreviewUrls({
    siteUrl: env.VITE_SITE_URL,
    basePath: base,
  })

  return {
    base,
    worker: {
      format: 'es',
    },
    plugins: [
      react(),
      {
        name: 'earth-fire-calendar-link-preview',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            return applyLinkPreviewHtmlTransform(html, linkPreviewUrls)
          },
        },
      },
    ],
    build: {
      chunkSizeWarningLimit: 1400,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/health': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
