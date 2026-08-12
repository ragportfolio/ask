import { resolve } from "node:path";

import { defineConfig } from "vite";

/**
 * The server helper is built as its own library so it can never be pulled into the browser bundle.
 *
 * It is a separate Rollup graph with no React plugin and no CSS, which means the only way to reach
 * it is to import `@ragportfolio/ask/server` explicitly from server code. Bundling it with the
 * component would put a module that accepts an API token one tree-shake mistake away from a page.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/server.ts"),
      name: "RagportfolioAskServer",
      fileName: "ragportfolio-ask-server",
      formats: ["es", "cjs"]
    }
  }
});
