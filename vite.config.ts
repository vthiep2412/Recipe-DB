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
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
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
    host: true,
    allowedHosts: ['.trycloudflare.com']
  }
});
