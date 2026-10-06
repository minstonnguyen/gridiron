import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base './' keeps the bundle portable: GitHub Pages project sites (/<repo>/) and any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
