#!/usr/bin/env node
import { build } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  configFile: false,
  root,
  logLevel: "info",
  resolve: {
    alias: {
      "@": join(root, "src"),
      "@electric-sql/pglite": join(root, "src/lib/providers/db/pglite-package-stub.ts"),
    },
  },
  build: {
    ssr: join(root, "scripts/seed-bundle-entry.mjs"),
    outDir: join(root, ".output"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["pg"],
      output: { entryFileNames: "seed-cli.mjs", format: "es" },
    },
  },
});