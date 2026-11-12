import { fileURLToPath } from "node:url";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// apps/shared holds code used by every portal. It sits outside this app, so the packages it imports
// are looked up in this app's node_modules.
const sharedDeps = ["react", "react-dom", "lucide-react"].map((dep) => ({
  find: new RegExp(`^${dep}(?=$|/)`),
  replacement: fileURLToPath(new URL(`./node_modules/${dep}`, import.meta.url)),
}));


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    port: 5174,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      "/ws": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: sharedDeps,
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    commonjsOptions: {
      include: [/react/, /react-dom/],
    },
  },
})
