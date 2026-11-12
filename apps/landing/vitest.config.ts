import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// apps/shared holds code used by every portal. It sits outside this app, so the packages it imports
// are looked up in this app's node_modules.
const sharedDeps = ["react", "react-dom", "lucide-react"].map((dep) => ({
  find: new RegExp(`^${dep}(?=$|/)`),
  replacement: fileURLToPath(new URL(`./node_modules/${dep}`, import.meta.url)),
}));


export default defineConfig({
  plugins: [react()],
  // Shared files (apps/shared) sit outside this app's tsconfig, so say how to compile JSX for them.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: sharedDeps },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
