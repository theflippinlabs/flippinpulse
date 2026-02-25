import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [
      "flippinpulse-production.up.railway.app",
      ".railway.app"
    ]
  },

  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: [
      "flippinpulse-production.up.railway.app",
      ".railway.app"
    ]
  }
});
