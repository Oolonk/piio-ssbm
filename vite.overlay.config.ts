import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'js/class/overlay-entry.ts'),
      name: 'PiioOverlay',
      formats: ['iife'],
      fileName: () => 'all.js',
    },
    outDir: path.resolve(__dirname, 'js/dist'),
    emptyOutDir: false,
  },
});
