import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps asset paths relative, so the same build works on
// GitHub Pages (/Today/) and inside the Capacitor iOS shell.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
