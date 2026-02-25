import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: true
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173
  }
})
