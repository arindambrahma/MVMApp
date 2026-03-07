import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __GIT_BRANCH__: JSON.stringify(getGitBranch()),
  },
  plugins: [
    react(),
    {
      name: 'serve-root-examples',
      configureServer(server) {
        server.middlewares.use('/examples', (req, res, next) => {
          const reqPath = (req.url || '').split('?')[0];
          const safePath = reqPath.replace(/^\/+/, '');
          const filePath = path.resolve(__dirname, '..', 'examples', safePath);
          if (!filePath.startsWith(path.resolve(__dirname, '..', 'examples'))) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(fs.readFileSync(filePath, 'utf8'));
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
})
