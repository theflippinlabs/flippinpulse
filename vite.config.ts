import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Pour "vite preview" (prod)
  preview: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    allowedHosts: ['.railway.app']
  },

  // Pour "vite" (dev) au cas où
  server: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    allowedHosts: ['.railway.app']
  }
})
