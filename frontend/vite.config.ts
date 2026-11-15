import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Product release identity
const APP_BUILD = "v1.0.0-coalchat"
// Netlify exposes COMMIT_REF during builds; falls back to "dev" locally
const commitRef = (process.env.COMMIT_REF || "").slice(0, 7)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${APP_BUILD}-${commitRef || "dev"}`),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
  },
})
