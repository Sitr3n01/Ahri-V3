import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ahri - AI Companion',
        short_name: 'Ahri',
        description: 'Multi-persona AI companion system with memory and Spotify integration',
        theme_color: '#da4ea2',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost:8742\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 // 5 minutes max
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
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
