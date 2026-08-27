import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:4173" },
  },
  build: { outDir: "dist/client", emptyOutDir: true },
});
