import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" — пути относительные, сборка работает и в подпапке GitHub Pages
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "es2022", assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // свой public/manifest.webmanifest
      workbox: {
        // вся игра (картинки, звук, шрифты, правила) кэшируется целиком — работает без сети
        globPatterns: ["**/*.{js,css,html,webp,png,json,ogg,mp3,wav,webmanifest,cur,ico}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});
