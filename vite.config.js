import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig(({ mode }) => ({
  // Build optimization
  build: {
    target: 'esnext',
    outDir: 'dist',

    // esbuild minification — much faster than Terser, comparable output
    minify: 'esbuild',

    // Code splitting configuration
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // Vendor chunks (rarely change, cached long-term)
          'vendor-wagmi': ['@wagmi/core'],
          'vendor-viem': ['viem'],
          'vendor-appkit': ['@reown/appkit', '@reown/appkit-adapter-wagmi'],
          'vendor-farcaster': ['@farcaster/miniapp-sdk'],

          // Feature chunks (lazy loaded on demand)
          'collections': ['./src/lib/loadCollections.js'],
          'mint-helpers': ['./src/lib/mintHelpers.js'],
        },

        // Better file naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Chunk size warnings
    chunkSizeWarningLimit: 500,

    // Asset inlining threshold (10kb)
    assetsInlineLimit: 10240,
  },

  server: {
    host: true,
    port: 3000,
    open: false,
    hmr: { overlay: true }
  },

  optimizeDeps: {
    include: [
      'viem',
      '@wagmi/core',
      '@reown/appkit',
      '@reown/appkit-adapter-wagmi'
    ]
  },

  plugins: [
    ViteImageOptimizer({
      test: /\.(jpe?g|png|gif|tiff|webp|avif)$/i,
      png: { quality: 80 },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { quality: 80 },
    }),
  ],

  css: {
    devSourcemap: true,
    preprocessorOptions: {}
  },

  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },

  preview: {
    port: 4173,
    host: true
  }
}));
