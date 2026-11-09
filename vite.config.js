import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { monacoCancellationPatch } from './scripts/lib/monaco-cancellation-patch.mjs';
const require = createRequire(import.meta.url);
export default defineConfig({
  plugins: [monacoCancellationPatch(require('monaco-editor/package.json').version)],
  base: './',
  build: { outDir: 'dist', sourcemap: false, manifest: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true }
});
