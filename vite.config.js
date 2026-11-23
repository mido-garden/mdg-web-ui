import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev/preview proxy: browser stays on the Vite origin so the HttpOnly
// session cookie from mdg-auth-svc is stored for the UI host.
export default defineConfig(({ mode }) => {
  const file = loadEnv(mode, process.cwd(), '')
  const authOrigin = process.env.AUTH_API_ORIGIN || file.AUTH_API_ORIGIN || 'http://localhost:5000'
  const apiBase = (file.VITE_API_BASE_URL || '/v1').replace(/\/+$/, '') || '/v1'
  const proxy = {
    [apiBase]: {
      target: authOrigin,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react()],
    server: {
      host: true,
      allowedHosts: ["mitdo.tech", ".mitdo.tech", "mitdo.cloud", ".mitdo.cloud"],
      proxy,
    },
    preview: {
      host: true,
      allowedHosts: ["mitdo.tech", ".mitdo.tech", "mitdo.cloud", ".mitdo.cloud"],
      proxy,
    },
  }
})
