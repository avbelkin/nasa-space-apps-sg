import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1400,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5180',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:5180',
          changeOrigin: true,
        },
      },
    },
  }
})
