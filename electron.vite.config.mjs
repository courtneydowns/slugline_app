import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import commonjs from "@rollup/plugin-commonjs"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      lib: {
        entry: "electron/main/index.js"
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/preload/index.js"
      }
    }
  },
  renderer: {
    root: "src",
    plugins: [react()],
    build: {
      rollupOptions: {
        input: "src/index.html"
      }
    }
  }
})
