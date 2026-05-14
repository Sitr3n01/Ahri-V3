import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/data': {
        target: 'http://localhost:8742',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['zustand', 'lucide-react'],
          'markdown-vendor': ['react-markdown', 'remark-gfm'],
          'highlight-vendor': ['react-syntax-highlighter'],
        },
      },
    },
  },
  // Copia assets para o build
  publicDir: path.resolve(__dirname, '../../data/assets'),
});
