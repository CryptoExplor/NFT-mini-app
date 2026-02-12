import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
    // Build optimization
    build: {
        target: 'esnext',
        outDir: 'dist',

        // Minification
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,      // Remove console.logs in production
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info']
            },
            format: {
                comments: false          // Remove comments
            }
        },

        // Code splitting configuration
        rollupOptions: {
            output: {
                // Manual chunks for better caching
                manualChunks: {
                    // Vendor chunks (rarely change)
                    'vendor-wagmi': ['@wagmi/core'],
                    'vendor-viem': ['viem'],
                    'vendor-appkit': ['@reown/appkit', '@reown/appkit-adapter-wagmi'],

                    // Feature chunks (lazy loaded)
                    'collections': ['./src/lib/loadCollections.js'],
                    'mint-helpers': ['./src/lib/mintHelpers.js'],
                    'router': ['./src/lib/router.js'],
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

    // Development optimizations
    server: {
        host: true,
        port: 3000,
        open: false,

        // HMR optimization
        hmr: {
            overlay: true
        }
    },

    // Dependency optimization
    optimizeDeps: {
        include: [
            'viem',
            '@wagmi/core',
            '@reown/appkit',
            '@reown/appkit-adapter-wagmi'
        ],
        exclude: [
            // Exclude large dependencies that don't need pre-bundling
        ]
    },

    // Plugins
    plugins: [
        // Image optimization
        ViteImageOptimizer({
            test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
            png: {
                quality: 80,
            },
            jpeg: {
                quality: 80,
            },
            jpg: {
                quality: 80,
            },
            webp: {
                quality: 80,
            },
        }),
    ],

    // CSS optimization
    css: {
        devSourcemap: true,
        preprocessorOptions: {
            // Add any CSS preprocessor options here
        }
    },

    // Build performance
    esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
    },

    // Preview server (for testing build)
    preview: {
        port: 4173,
        host: true
    }
});
