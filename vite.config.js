import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                 // relative paths, so dist/ also works from a subfolder
  server: { host: true },     // reachable from the phone on the same Wi-Fi
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
