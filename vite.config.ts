import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ["flippinpulse-production.up.railway.app", ".railway.app"],
  },

  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: ["flippinpulse-production.up.railway.app", ".railway.app"],
  },
});
