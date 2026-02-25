import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // 🔥 Serveur de dev local
  server: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true
  },

  // 🚀 Preview utilisé par Railway (TRÈS IMPORTANT)
  preview: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,

    // ✅ Autorise Railway
    allowedHosts: ['.railway.app']
  }
})
