import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Gym Tracker",
        short_name: "Gym Tracker",
        description: "Gym Tracker offline con rutinas, historial y calendario.",
        theme_color: "#0f172a",
        background_color: "#020617",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "./icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "./icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "./icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
