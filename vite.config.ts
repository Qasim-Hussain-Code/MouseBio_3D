import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile } from 'node:fs/promises';

export default defineConfig({
  plugins: [react(),{name:'prototype-launcher',apply:'build',async closeBundle(){await copyFile('scripts/serve_prototype.py','dist/serve_prototype.py');}}],
  build: {chunkSizeWarningLimit: 650},
  server: {strictPort: true},
});
