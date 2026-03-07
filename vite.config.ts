import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['test.aozai.top','aozai.top']
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
