import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig(({ mode }) => ({
  build: {
    target: 'esnext',
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-viem': ['viem'],
          'vendor-appkit': ['@reown/appkit', '@reown/appkit-adapter-wagmi'],
          'vendor-farcaster': ['@farcaster/miniapp-sdk'],
          'collections': ['./src/lib/loadCollections.js'],
          'mint-helpers': ['./src/lib/mintHelpers.js'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    chunkSizeWarningLimit: 500,
    assetsInlineLimit: 10240,
  },

  resolve: {
    dedupe: ['@wagmi/core', 'viem'],
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
      '@reown/appkit',
    ],
    exclude: [
      '@wagmi/core',
      '@wagmi/connectors',
      '@reown/appkit-adapter-wagmi',
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
