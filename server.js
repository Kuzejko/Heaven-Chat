const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Handle CORS preflight for proxy requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'X-Charged-USD, Retry-After, Content-Type'
    });
    return res.end();
  }

  const fullUrl = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = fullUrl.pathname;

  // NordRouter Evaluate Proxy Endpoint (Bypasses missing CORS headers on nordrouter.com/v1/evaluate)
  if (urlPath === '/api/nordrouter/evaluate') {
    return handleNordrouterEvaluateProxy(req, res);
  }

  // Chub AI Proxy Endpoints
  if (urlPath === '/api/chub/search') {
    return handleChubSearchProxy(fullUrl, res);
  }
  if (urlPath === '/api/chub/card') {
    return handleChubCardProxy(fullUrl, res);
  }

  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

  // Security: prevent directory traversal
  const resolvedBase = path.resolve(__dirname);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(resolvedBase)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const extname = path.extname(resolvedPath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(resolvedPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('File Not Found');
      } else {
        res.statusCode = 500;
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

async function handleChubSearchProxy(fullUrl, res) {
  const search = fullUrl.searchParams.get('search') || '';
  const page = fullUrl.searchParams.get('page') || '1';
  const first = fullUrl.searchParams.get('first') || '20';
  const rawSort = fullUrl.searchParams.get('sort') || 'star_count';
  const sortMap = {
    starCount: 'star_count',
    lastActivityAt: 'last_activity_at',
    createdAt: 'created_at',
    downloadCount: 'download_count'
  };
  const sort = sortMap[rawSort] || rawSort;
  const asc = fullUrl.searchParams.get('asc') || 'false';
  const topics = fullUrl.searchParams.get('topics') || '';
  const nsfw = fullUrl.searchParams.get('nsfw') || 'false';

  const params = new URLSearchParams({
    search,
    page,
    first,
    sort,
    asc,
    nsfw
  });
  if (topics) {
    params.set('topics', topics);
  }

  const targetUrl = `https://api.chub.ai/search?${params.toString()}`;
  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    const data = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end(data);
  } catch (err) {
    console.error('[ChubProxy] Search error:', err.message);
    res.writeHead(502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Proxy search failed', details: err.message }));
  }
}

async function handleChubCardProxy(fullUrl, res) {
  const fullPath = fullUrl.searchParams.get('fullPath');
  if (!fullPath) {
    res.writeHead(400, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ error: 'fullPath parameter is required' }));
  }

  const targetUrl = `https://api.chub.ai/api/characters/${encodeURIComponent(fullPath).replace(/%2F/g, '/')}?full=true`;
  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    const data = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end(data);
  } catch (err) {
    console.error('[ChubProxy] Card fetch error:', err.message);
    res.writeHead(502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Proxy card fetch failed', details: err.message }));
  }
}

async function handleNordrouterEvaluateProxy(req, res) {
  const bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', async () => {
    try {
      const body = Buffer.concat(bodyChunks);
      const authHeader = req.headers['authorization'] || '';
      const targetUrl = req.headers['x-target-url'] || 'https://nordrouter.com/v1/evaluate';

      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        body: body.length > 0 ? body : undefined
      });

      const responseText = await upstream.text();
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'X-Charged-USD, Retry-After, Content-Type'
      };

      const chargedHeader = upstream.headers.get('x-charged-usd');
      if (chargedHeader) {
        headers['X-Charged-USD'] = chargedHeader;
      }
      const retryHeader = upstream.headers.get('retry-after');
      if (retryHeader) {
        headers['Retry-After'] = retryHeader;
      }

      res.writeHead(upstream.status, headers);
      res.end(responseText);
    } catch (err) {
      console.error('[NordRouterProxy] Evaluate error:', err.message);
      res.writeHead(502, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'NordRouter proxy evaluate failed', details: err.message }));
    }
  });
}

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server is running at ${url}`);
  console.log('Press Ctrl+C to stop the server.');
  
  // Auto-open browser
  const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${startCmd} ${url}`);
});
