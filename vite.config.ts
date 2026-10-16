import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import fs from 'node:fs';
import path from 'node:path';

function recipeStudioApiPlugin(): Plugin {
  return {
    name: 'recipe-studio-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save-recipe' && req.method === 'POST') {
          const host = req.headers.host;
          const origin = req.headers.origin;
          if (origin) {
            try {
              const originHost = new URL(origin).host;
              if (originHost !== host) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Origin does not match request host' }));
                return;
              }
            } catch {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Invalid origin header' }));
              return;
            }
          }

          const contentType = req.headers['content-type'] || '';
          if (!contentType.includes('application/json')) {
            res.statusCode = 415;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Content-Type must be application/json' }));
            return;
          }

          const MAX_BODY_SIZE = 5 * 1024 * 1024;
          let body = '';
          let bodyLength = 0;
          let isOversized = false;

          req.on('data', chunk => {
            if (isOversized) return;
            bodyLength += chunk.length;
            if (bodyLength > MAX_BODY_SIZE) {
              isOversized = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Payload too large. Maximum size is 5MB' }));
              req.destroy();
              return;
            }
            body += chunk;
          });

          req.on('end', () => {
            if (isOversized) return;
            try {
              const data = JSON.parse(body);
              const recipeId = (data.id || 'recipe-' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '-');
              const recipesDir = path.resolve(__dirname, 'src/recipes');
              if (!fs.existsSync(recipesDir)) {
                fs.mkdirSync(recipesDir, { recursive: true });
              }
              const filePath = path.join(recipesDir, `${recipeId}.json`);
              if (fs.existsSync(filePath)) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: `Recipe "${recipeId}" already exists. Overwrite is not allowed.` }));
                return;
              }
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, filePath, id: recipeId }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [preact(), recipeStudioApiPlugin()],
  server: {
    port: 5176,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
