import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Pour que Railway puisse accéder à l'app
  preview: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    allowedHosts: true,
  },

  // Utile en dev / et certains runners
  server: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
  },
})
