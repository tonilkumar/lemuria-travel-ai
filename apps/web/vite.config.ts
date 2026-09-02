import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Bind IPv4 loopback explicitly: Windows reserves TCP 5162-5261 here (netsh excludedportrange),
    // which swallows Vite's default 5173, so this project uses 5300.
    host: '127.0.0.1',
    port: 5300,
    strictPort: false,
    // The SPA talks to /api on its own origin in every environment, so cookies
    // stay first-party and no CORS pre-flight is needed in the browser.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split the rarely-changing vendors out of the app chunk so a code
        // change does not force every user to re-download React. Recharts is
        // deliberately NOT listed: naming it here would make Vite preload it from
        // index.html and defeat the lazy import in DashboardPage.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@tanstack/react-table'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
});
