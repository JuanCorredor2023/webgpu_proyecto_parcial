import { defineConfig } from "vite";

export default defineConfig({
  base: "/<your-repo-name>/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // add more entry points as needed
      },
    },
  },
});