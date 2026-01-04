import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                'handle-generator': resolve(__dirname, 'handle-generator/index.html'),
                'vessel-generator': resolve(__dirname, 'vessel-generator/index.html'),
                'cast-form-generator': resolve(__dirname, 'cast-form-generator/index.html')
            }
        }
    },
    server: {
        port: 3000,
        open: '/dashboard.html'
    }
});
