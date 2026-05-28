import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { registerApiRoutes } from './server/api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'resume-homepage-api',
      configureServer(server) {
        registerApiRoutes(server.middlewares)
      },
    },
  ],
})
