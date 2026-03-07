import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      phaser: path.resolve('./src/phaser-shim.ts'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
