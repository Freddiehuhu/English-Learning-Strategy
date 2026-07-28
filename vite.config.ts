import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    target: 'es2022',
    sourcemap: false,
    // Phaser is intentionally isolated in a lazy chunk; its size does not affect the learning-card entry page.
    chunkSizeWarningLimit: 1500,
  },
});
