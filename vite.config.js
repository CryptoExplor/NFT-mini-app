import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig(({ mode }) => ({
  build: {
    target: 'esnext',
    outDir: 'dist',
    minify: 'esbuild',

    // Layer 1: Tell @rollup/plugin-commonjs to treat @wagmi/core as ESM
    // when CJS modules (like appkit-adapter-wagmi) try to require() it.
    // This stops the tempo proxy file from being created in the first place.
    commonjsOptions: {
      esmExternals: ['@wagmi/core'],
      ignore: ['@wagmi/core'],
    },

    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-viem': ['viem'],
          'vendor-appkit': ['@reown/appkit'],
          // @reown/appkit-adapter-wagmi intentionally removed from manual chunks.
          // Putting it in a manual chunk forces Rollup to resolve its CJS bundle
          // independently, which is what triggers the tempo proxy creation.
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

  // Layer 2: Alias regex catches any @wagmi/core/* deep import at resolution time,
  // including @wagmi/core/tempo or @wagmi/core/tempo_HASH variants.
  // Runs at enforce:'pre' level — before Vite's internal CJS resolver plugin.
  resolve: {
    alias: [
      {
        find: /^@wagmi\/core\/.*/,
        replacement: '@wagmi/core',
      },
    ],
    dedupe: ['@wagmi/core', 'viem'],
  },

  server: {
    host: true,
    port: 3000,
    open: false,
    hmr: { overlay: true }
  },

  optimizeDeps: {
    include: ['viem', '@reown/appkit'],
    exclude: ['@wagmi/core', '@wagmi/connectors', '@reown/appkit-adapter-wagmi'],
  },

  plugins: [
    // Layer 3: enforce:'pre' resolveId hook — runs before ALL of Vite's internal
    // plugins including commonjs--resolver. Intercepts any remaining /tempo paths
    // that slip past layers 1 and 2.
    {
      name: 'fix-wagmi-tempo',
      enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('@wagmi/core/')) {
          return { id: '@wagmi/core', moduleSideEffects: false };
        }
      },
    },

    ViteImageOptimizer({
      test: /\.(jpe?g|png|gif|tiff|webp|avif)$/i,
      png: { quality: 80 },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { quality: 80 },
    }),
  ],

  css: { devSourcemap: true },

  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },

  preview: { port: 4173, host: true }
}));
