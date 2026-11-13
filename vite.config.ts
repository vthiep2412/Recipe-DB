import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEV_AUTH_TOKEN = crypto.randomBytes(24).toString('hex');

function recipeStudioApiPlugin(): Plugin {
  return {
    name: 'recipe-studio-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save-recipe' && req.method === 'POST') {
          // Dev auth token verification
          const devToken = req.headers['x-dev-token'];
          if (!devToken || devToken !== DEV_AUTH_TOKEN) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Unauthorized dev write request' }));
            return;
          }

          const origin = req.headers.origin;
          if (!origin) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Origin header is required' }));
            return;
          }

          try {
            const originHostname = new URL(origin).hostname;
            const trustedHosts = ['localhost', '127.0.0.1'];
            const isAllowed = trustedHosts.includes(originHostname) || originHostname.endsWith('.trycloudflare.com');

            if (!isAllowed) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Origin is not permitted' }));
              return;
            }
          } catch {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'Invalid origin header' }));
            return;
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
              if (!data || typeof data !== 'object' || Array.isArray(data)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Request body must be a JSON object' }));
                return;
              }
              const rawId = data.id !== undefined && data.id !== null ? String(data.id) : '';
              const recipeId = (rawId || 'recipe-' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '-');
              const recipesDir = path.resolve(import.meta.dirname, 'src/recipes');
              if (!fs.existsSync(recipesDir)) {
                fs.mkdirSync(recipesDir, { recursive: true });
              }
              const filePath = path.resolve(recipesDir, `${recipeId}.json`);
              if (!filePath.startsWith(recipesDir + path.sep)) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Invalid recipe file path' }));
                return;
              }
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
              res.end(JSON.stringify({ ok: false, error: 'Internal server error while saving recipe' }));
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
  define: {
    __DEV_SAVE_TOKEN__: JSON.stringify(DEV_AUTH_TOKEN)
  },
  plugins: [preact(), recipeStudioApiPlugin()],
  server: {
    port: 5176,
    host: '127.0.0.1',
    allowedHosts: ['.trycloudflare.com']
  }
});
