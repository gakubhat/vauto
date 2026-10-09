import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api is proxied to the API server. Point it at the deployed app to work
    // against live data without running a local server (and a second scheduler):
    //   VITE_API_TARGET=https://vauto.fly.dev npm run dev
    proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:3000' },
  },
  base: '/',
});
