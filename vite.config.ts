import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/video-p2p/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    // Prevent Vite from inlining small Workers/scripts as data: URLs.
    // data: URL Workers are blocked on Chromium for module Workers
    // (null origin) and cause silent failures. Classic Workers tolerate
    // data: URLs, but we strip {type:"module"} via postbuild.mjs to
    // support WebKit+GitHub Pages, so keeping Workers as files is safer.
    assetsInlineLimit: 0,
  },
});
