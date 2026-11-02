import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function apiBackendPlugin(): Plugin {
  const handler = (server: { middlewares: import('connect').Server }) => {
    server.middlewares.use(async (req, res, next) => {
      if (req.url && req.url.startsWith('/api/')) {
        try {
          const { default: app } = await import('./server.ts');
          return (app as any)(req, res, next);
        } catch (err) {
          console.error('API plugin error:', err);
          return next(err);
        }
      }
      next();
    });
  };

  return {
    name: 'api-backend-plugin',
    configureServer: handler,
    configurePreviewServer: handler,
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiBackendPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  server: {
    hmr: false,
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
