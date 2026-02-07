import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        target: 'esnext',
        outDir: 'dist'
    },
    server: {
        host: true
    }
});
