import { defineConfig } from "vite";

export default defineConfig({
  base: "webgpu_proyecto_parcial",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // add more entry points as needed
      },
    },
  },
});