import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/verify/" : "/",
  plugins: [react()],
  server: { port: 5175, host: true },
}));
