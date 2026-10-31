import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Reachable from a phone on the same network during development too.
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
