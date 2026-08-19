import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: (env.AUTH_API_UPSTREAM_URL || 'http://localhost:3001').replace(/\/$/, ''),
          changeOrigin: true,
        },
        '/official-api': {
          target: (env.OFFICIAL_API_UPSTREAM_URL || 'https://whatsapp-modelos.andre-51e.workers.dev').replace(/\/$/, ''),
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/official-api/, '/api/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const token = env.OFFICIAL_API_TOKEN || env.VITE_OFFICIAL_API_TOKEN
              if (token) proxyReq.setHeader('Authorization', `Bearer ${token}`)
            })
          },
        },
      },
    },
  }
})
