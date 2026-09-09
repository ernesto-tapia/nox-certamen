import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/nox-certamen/',
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  build: { outDir: 'pages-dist', emptyOutDir: true },
});
