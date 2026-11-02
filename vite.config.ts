import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Provided by the host's import map; never bundled. */
const HOST_MODULES = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-dom/client",
  "@docleus/sdk",
];

/**
 * Modules this plugin adds to the host import map (`exposes` in the
 * manifest), so block plugins with raw Tiptap extensions share this copy of
 * Tiptap and ProseMirror. Each `src/exposed/<name>.ts` re-exports one.
 */
const EXPOSED = readdirSync("src/exposed").map((file) =>
  file.replace(/\.ts$/, ""),
);

const SYNC_STORE = fileURLToPath(
  new URL("src/editor/sync-store.ts", import.meta.url),
);

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Library mode leaves `process.env.NODE_ENV` in place, and Tiptap reads it
  // unguarded; the browser has no `process`.
  ...(command === "build" && {
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  }),
  resolve: {
    alias: [
      {
        find: /^use-sync-external-store\/shim\/(index|with-selector)\.js$/,
        replacement: SYNC_STORE,
      },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        "editor/index": "src/editor/index.ts",
        ...Object.fromEntries(
          EXPOSED.map((name) => [`exposed/${name}`, `src/exposed/${name}.ts`]),
        ),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: (id) => HOST_MODULES.includes(id),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "happy-dom",
    restoreMocks: true,
  },
}));
