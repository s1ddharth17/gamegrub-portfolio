import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

function treatJsFilesAsJsx() {
  return {
    name: "treat-js-files-as-jsx",
    async transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/");

      if (!normalizedId.match(/\/src\/.*\.js$/)) {
        return null;
      }

      return transformWithEsbuild(code, id, {
        loader: "jsx",
        jsx: "automatic",
      });
    },
  };
}

export default defineConfig({
  plugins: [treatJsFilesAsJsx(), react()],
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: "build",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          http: ["axios"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
