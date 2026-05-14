import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Service-worker PWA support is intentionally disabled until Workbox's
  // serialize-javascript advisory is resolved in the Vite PWA dependency chain.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ahri/shared': path.resolve(__dirname, '../shared/src')
    }
  },
  server: {
    port: 5174,
    host: true, // Allow access from network (for mobile testing)
    proxy: {
      '/auth': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/chat': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/personas': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/sessions': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/memory': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/agent': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/agent-mode': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/search': {
        target: 'http://localhost:8742',
        changeOrigin: true
      },
      '/spotify': {
        target: 'http://localhost:8742',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['zustand', 'lucide-react', 'react-markdown']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@ahri/shared']
  }
});
