// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// Carimbo unico por build/deploy: muda sozinho, sem bump manual.
const BUILD_VERSION = process.env["CF_PAGES_COMMIT_SHA"] ?? process.env["COMMIT_SHA"] ?? Date.now().toString(36);
const BUILT_AT = new Date().toISOString();

/** Escreve public/version.json com a versao deste build (servido em /version.json). */
function versionStampPlugin(): Plugin {
  let written = false;
  return {
    name: "shop-studio-version-stamp",
    configResolved(config) {
      if (written) return;
      written = true;
      const dir = resolve(config.root, "public");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, "version.json"),
        `${JSON.stringify({ version: BUILD_VERSION, builtAt: BUILT_AT }, null, 2)}\n`,
      );
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [versionStampPlugin()],
    define: {
      __APP_VERSION__: JSON.stringify(BUILD_VERSION),
      __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
    },
  },
});
