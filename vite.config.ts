// vite.config.ts - Vite React build configuration
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    open: true,
    watch: {
      ignored: ['**/version 2.0/**', '**/dist/**', '**/dist-server/**', '**/data/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4200',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
