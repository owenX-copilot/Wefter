import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      phaser: path.resolve('./src/phaser-shim.ts'),
    },
  },
  server: {
    allowedHosts: ['test.aozai.top', 'aozai.top'],
  },
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
