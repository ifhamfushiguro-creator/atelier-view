import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { GET as get3DProcess, POST as post3DProcess } from './src/app/api/3d/process/route.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure public/uploads directory exists for serving uploaded & optimized .GLB files
  const uploadsPath = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadsPath, { recursive: true });
  app.use('/uploads', express.static(uploadsPath));

  // Bridge Express /api/3d/process to the Web Fetch API Route Handler in src/app/api/3d/process/route.ts
  app.get('/api/3d/process', async (_req, res) => {
    try {
      const webResponse = await get3DProcess();
      const body = await webResponse.text();
      res
        .status(webResponse.status)
        .set('Content-Type', webResponse.headers.get('content-type') || 'application/json')
        .send(body);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Internal server error'
      });
    }
  });

  app.post(
    '/api/3d/process',
    express.raw({ type: '*/*', limit: '100mb' }),
    async (req, res) => {
      try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${PORT}`;
        const url = `${protocol}://${host}${req.originalUrl}`;

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers.set(key, value);
          } else if (Array.isArray(value)) {
            headers.set(key, value.join(', '));
          }
        }

        const rawBody =
          Buffer.isBuffer(req.body) && req.body.byteLength > 0
            ? new Uint8Array(req.body)
            : undefined;

        const webRequest = new Request(url, {
          method: 'POST',
          headers,
          body: rawBody
        });

        const webResponse = await post3DProcess(webRequest);
        const responseText = await webResponse.text();
        res
          .status(webResponse.status)
          .set('Content-Type', webResponse.headers.get('content-type') || 'application/json')
          .send(responseText);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to process 3D request'
        });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Spatial 3D & AI Client Portal server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
