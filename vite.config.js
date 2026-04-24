import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  build: {
    target: 'esnext',
    outDir: 'dist',
    minify: 'esbuild',

    commonjsOptions: {
      strictRequires: 'auto',
      esmExternals: ['@wagmi/core', 'eventemitter3', 'dayjs', 'dayjs/locale/en'],
    },

    rollupOptions: {
      onwarn(warning, warn) {
        // Silence harmless sourcemap warnings from third-party libraries
        if (
          warning.code === 'SOURCEMAP_ERROR' &&
          (warning.message.includes('@reown') || warning.message.includes('@walletconnect'))
        ) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks: {
          'vendor-viem': ['viem'],
          'vendor-appkit': ['@reown/appkit'],
          'vendor-farcaster': ['@farcaster/miniapp-sdk'],
          'vendor-utils': ['eventemitter3', 'object-hash'],
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
    alias: [
      // @wagmi/connectors imports { tempoWallet } from '@wagmi/core/tempo', but
      // this subpath doesn't exist in the installed @wagmi/core version.
      // Point it at a local stub that exports a no-op tempoWallet so Rollup
      // can resolve the import without erroring at build time.
      {
        find: /^@wagmi\/core\/tempo.*$/,
        replacement: path.resolve(__dirname, 'src/shims/wagmi-tempo.js'),
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
    // Pre-bundle ALL heavy deps so Vite serves them as a single cached file in dev mode.
    // Previously excluded packages caused hundreds of unbundled ESM requests on cold start,
    // which is what made the loading screen hang on localhost but not on Vercel (prod bundle).
    include: [
      'viem',
      '@reown/appkit',
      '@reown/appkit-adapter-wagmi',
      '@wagmi/core',
      '@wagmi/connectors',
      'eventemitter3',
      'dayjs',
      'dayjs/locale/en',
    ],
    esbuildOptions: {
      sourcemap: false,
    },
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

  css: { devSourcemap: false },

  esbuild: {
    logOverride: {
      'this-is-undefined-in-esm': 'silent',
      'sourcemap-error': 'silent'
    },
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },

  preview: { port: 4173, host: true }
}));