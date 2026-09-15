import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Collapse lucide-react's per-icon modules (shared across nearly
        // every lazy route, previously ~40 one-icon chunks) into a single
        // cacheable chunk: dozens of tiny requests become one.
        manualChunks: {
          icons: ['lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['tesseract.js']
  },
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  }
});