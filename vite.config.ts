import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    allowedHosts: [
      'flippinpulse-production.up.railway.app',
      '.railway.app',
      '.up.railway.app'
    ]
  }
})
