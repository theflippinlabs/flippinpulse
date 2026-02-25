import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
  },

  preview: {
    host: true,
    port: Number(process.env.PORT) || 8080,
    strictPort: true,
    // Autorise les hosts Railway (ton domaine *.up.railway.app)
    allowedHosts: [".railway.app", ".up.railway.app"],
  },
});
