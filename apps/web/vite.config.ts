import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * CSS is emitted by BOTH the client and the ssr environment, each with its own
 * content hash (the ssr copy is not minified, so the hashes never agree).
 * `root.tsx` imports the sheet with `?url` and renders it through `links()`, so
 * a hash mismatch means the server sends `/assets/index-<hashA>.css` while the
 * hydrated client renders `<link href="/assets/index-<hashB>.css">` — React
 * treats that as a hydration mismatch (error #418) on every single page.
 * Dropping the hash for CSS keeps one filename across environments; the
 * stylesheet is revalidated by etag, and JS keeps its content hash.
 */
const assetFileNames = (info: { names?: string[]; name?: string }) => {
  const name = info.names?.[0] ?? info.name ?? 'asset';
  return name.endsWith('.css') ? 'assets/[name][extname]' : 'assets/[name]-[hash][extname]';
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    cloudflare({
      // The Wrangler config lives at the monorepo root; point the plugin at it so
      // dev/preview run the Worker with the real D1/R2/KV bindings.
      configPath: fileURLToPath(new URL('../../wrangler.toml', import.meta.url)),
      viteEnvironment: { name: 'ssr' },
    }),
    reactRouter(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app', import.meta.url)),
      '@velora/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { assetFileNames } },
  },
  environments: {
    ssr: {
      build: { rollupOptions: { output: { assetFileNames } } },
    },
  },
});
