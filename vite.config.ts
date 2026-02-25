import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // IMPORTANT : autorise le host Railway (sinon "Blocked request")
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    allowedHosts: [
      "flippinpulse-production.up.railway.app",
      ".up.railway.app"
    ]
  },

  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
    allowedHosts: [
      "flippinpulse-production.up.railway.app",
      ".up.railway.app"
    ]
  }
});
