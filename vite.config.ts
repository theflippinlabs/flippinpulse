import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["flippinpulse-production.up.railway.app"],
    host: true,
    port: Number(process.env.PORT) || 4173
  }
});
