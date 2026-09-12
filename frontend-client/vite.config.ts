import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/student/" : "/",
  plugins: [react()],
  server: { port: 5173, host: true },
}));
