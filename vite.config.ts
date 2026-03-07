import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      external: ['phaser'],
      output: {
        format: 'iife',
        globals: {
          phaser: 'Phaser',
        },
      },
    },
  },
});
