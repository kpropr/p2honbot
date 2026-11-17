import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localGame } from "./local-game";
export default defineConfig(({ command, mode }) => ({
  base: "/play/",
  plugins: [
    react(),
    command === "serve" && mode === "local-game" && localGame(),
  ],
  server:
    mode === "local-game"
      ? undefined
      : { proxy: { "/play/api": "http://127.0.0.1:8081" } },
}));
