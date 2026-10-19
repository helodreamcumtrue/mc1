const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }
    if (pathname === '/favicon.ico') {
      pathname = '/assets/favicon.svg';
    }

    const filePath = path.normalize(path.join(ROOT, pathname));

    // Security check: ensure path is within ROOT
    if (!filePath.startsWith(ROOT)) {
      res.statusCode = 403;
      res.end('Access Denied');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err) {
        res.statusCode = 404;
        res.end('File Not Found');
        return;
      }

      if (stats.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        fs.stat(indexPath, (idxErr, idxStats) => {
          if (idxErr || !idxStats.isFile()) {
            res.statusCode = 404;
            res.end('File Not Found');
            return;
          }
          serveFile(indexPath, idxStats, res);
        });
        return;
      }

      serveFile(filePath, stats, res);
    });
  } catch (e) {
    res.statusCode = 500;
    res.end('Server Error');
  }
});

function serveFile(filePath, stats, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': 'no-cache'
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = Number(PORT) + 1;
    console.log(`Port ${PORT} is in use, retrying on port ${fallbackPort}...`);
    server.listen(fallbackPort);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  const addr = server.address();
  console.log(`Server running at http://localhost:${addr.port}/`);
});
