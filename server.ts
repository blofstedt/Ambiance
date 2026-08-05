/**
 * Optional static server for the built app (`npm run serve`).
 *
 * BUILD-03: this used to be the `dev` script and ran Vite in middleware mode,
 * which meant `npm run dev` booted an Express server just to proxy to Vite. It
 * also called dotenv.config() solely to read a GEMINI_API_KEY that nothing used.
 * `npm run dev` is now plain `vite`, and this file does one job: serve `dist`.
 */

import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import type { Request, Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const distPath = path.join(__dirname, 'dist');

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use(
  express.static(distPath, {
    // Hashed asset filenames can be cached hard; index.html must not be.
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// SPA fallback.
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ambient Canvas served from ${distPath} on http://localhost:${PORT}`);
});
