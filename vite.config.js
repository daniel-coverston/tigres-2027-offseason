import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Vercel / Netlify: base "/". GitHub Pages con repo "tigres-dashboard": base "/tigres-dashboard/".
export default defineConfig({ plugins: [react()], base: "/" });
