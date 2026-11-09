import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile } from 'node:fs/promises';

// The site is served from the root unless MOUSEBIO_BASE names a subpath, as the GitHub Pages workflow does with /MouseBio_3D/.
const base = process.env.MOUSEBIO_BASE ?? '/';
if (!/^\/(?:(?!\.\.?\/)[A-Za-z0-9_.-]+\/)*$/.test(base)) throw new Error('MOUSEBIO_BASE must be an absolute path that ends with a slash.');

export default defineConfig({
  base,
  plugins: [react(),{name:'prototype-launcher',apply:'build',async closeBundle(){await copyFile('scripts/serve_prototype.py','dist/serve_prototype.py');}}],
  build: {chunkSizeWarningLimit: 650},
  server: {strictPort: true},
});
