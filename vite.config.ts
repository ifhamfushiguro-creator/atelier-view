import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function reconstructApiPlugin(): Plugin {
  const handler = (server: { middlewares: import('connect').Server }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/3d/reconstruct-video' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { framesBase64, fileName } = JSON.parse(body);
            const { reconstructVideoFrames } = await import('./server.ts');
            const result = await reconstructVideoFrames(framesBase64, fileName);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err: unknown) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            const msg = err instanceof Error ? err.message : 'Reconstruction failed';
            res.end(JSON.stringify({ error: msg }));
          }
        });
        return;
      }
      next();
    });
  };

  return {
    name: 'reconstruct-api',
    configureServer: handler,
    configurePreviewServer: handler
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), reconstructApiPlugin()],
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
