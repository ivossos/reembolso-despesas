import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: '0.0.0.0', // Allow external connections
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '192.168.15.2', // Your local IP
      '.ngrok-free.app', // Allow all ngrok subdomains
      '.ngrok.io', // Allow all ngrok.io subdomains
      '.ngrok.app', // Allow all ngrok.app subdomains
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
