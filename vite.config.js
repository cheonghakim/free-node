import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.js",
      name: "FreeNode",
      fileName: (format) => `free-node.${format}.js`,
    },
    sourcemap: true,
    minify: "terser",
  },
});
