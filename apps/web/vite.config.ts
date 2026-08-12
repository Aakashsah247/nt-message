import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Increase chunk size warning limit to reduce noisy warnings during build.
    chunkSizeWarningLimit: 2000,
  },
});