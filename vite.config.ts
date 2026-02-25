import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173
  }
});
