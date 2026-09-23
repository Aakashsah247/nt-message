import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Route-level lazy loading keeps heavyweight work and messaging workspaces
    // out of the initial bundle. Warn if any production chunk regresses above 1 MB.
    chunkSizeWarningLimit: 1000,
  },
});