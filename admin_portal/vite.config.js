import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/]recharts(?:[\\/]|$)/,
              priority: 20,
            },
            {
              name: 'vendor',
              test:
                /node_modules[\\/](?:react|react-dom|react-router-dom)(?:[\\/]|$)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
