import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'DodoCheckout',
            formats: ['iife'],
            fileName: () => 'dodo-checkout.js',
        },
        outDir: 'dist',
        emptyOutDir: true,
    },
})