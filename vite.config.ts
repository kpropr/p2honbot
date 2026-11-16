import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/play/",
  plugins: [react()],
  server: { proxy: { "/play/api": "http://127.0.0.1:8081" } },
});
