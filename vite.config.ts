import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5176,
    host: true,
    allowedHosts: ['.trycloudflare.com']
  }
});
