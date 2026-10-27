import { defineConfig } from "vite";

// base: "./" — пути к ассетам относительные, чтобы сборка работала внутри Capacitor (file://)
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "es2022", assetsInlineLimit: 0 },
});
