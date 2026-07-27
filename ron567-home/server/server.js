/* Ron567 主页 · 本地服务（零第三方依赖，node:http + node:sqlite）
 * - 静态托管 ron567-home 目录（index.html / weather.js / assets）
 * - REST API：GitHub 项目与博客文章的 CRUD、同步状态、手动触发同步
 * - 定时同步：每 SYNC_INTERVAL_MS 自动拉取 GitHub 与博客更新
 * 启动：node server/server.js  →  http://localhost:3567
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { projects, posts, syncLog } = require('./db');
const { syncAll, syncGithub, syncBlog } = require('./sync');

const PORT = process.env.PORT || 3567;
const STATIC_ROOT = path.join(__dirname, '..');
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 每 30 分钟自动同步一次

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/* ---------------- 同步调度 ---------------- */

let syncing = false;
let lastSyncResults = null;

async function runSync(kind) {
  if (syncing) { return { busy: true }; }
  syncing = true;
  try {
    const task = kind === 'github' ? syncGithub().then((r) => [r])
      : kind === 'blog' ? syncBlog().then((r) => [r])
      : syncAll();
    lastSyncResults = await task;
    return lastSyncResults;
  } finally {
    syncing = false;
  }
}

/* ---------------- API 路由 ---------------- */

async function handleApi(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // ---- GitHub 项目 CRUD ----
  if (seg[1] === 'projects') {
    const id = seg[2] ? Number(seg[2]) : null;
    if (method === 'GET' && !id) {
      return sendJson(res, 200, projects.list({ featuredOnly: url.searchParams.get('featured') === '1' }));
    }
    if (method === 'GET' && id) {
      const p = projects.get(id);
      return p ? sendJson(res, 200, p) : sendJson(res, 404, { error: 'not found' });
    }
    if (method === 'POST' && !id) {
      const body = await readBody(req);
      if (!body.repo_id || !body.name || !body.url) {
        return sendJson(res, 400, { error: 'repo_id, name, url are required' });
      }
      return sendJson(res, 201, projects.create(body));
    }
    if ((method === 'PUT' || method === 'PATCH') && id) {
      const body = await readBody(req);
      const p = projects.update(id, body);
      return p ? sendJson(res, 200, p) : sendJson(res, 404, { error: 'not found' });
    }
    if (method === 'DELETE' && id) {
      return projects.remove(id)
        ? sendJson(res, 200, { deleted: true })
        : sendJson(res, 404, { error: 'not found' });
    }
  }

  // ---- 博客文章 CRUD ----
  if (seg[1] === 'posts') {
    const id = seg[2] ? Number(seg[2]) : null;
    if (method === 'GET' && !id) { return sendJson(res, 200, posts.list()); }
    if (method === 'GET' && id) {
      const p = posts.get(id);
      return p ? sendJson(res, 200, p) : sendJson(res, 404, { error: 'not found' });
    }
    if (method === 'POST' && !id) {
      const body = await readBody(req);
      if (!body.post_name || !body.title || !body.url) {
        return sendJson(res, 400, { error: 'post_name, title, url are required' });
      }
      return sendJson(res, 201, posts.create(body));
    }
    if ((method === 'PUT' || method === 'PATCH') && id) {
      const body = await readBody(req);
      const p = posts.update(id, body);
      return p ? sendJson(res, 200, p) : sendJson(res, 404, { error: 'not found' });
    }
    if (method === 'DELETE' && id) {
      return posts.remove(id)
        ? sendJson(res, 200, { deleted: true })
        : sendJson(res, 404, { error: 'not found' });
    }
  }

  // ---- 同步：POST /api/sync[?source=github|blog] 手动触发；GET /api/sync/status 查看状态 ----
  if (seg[1] === 'sync') {
    if (method === 'POST') {
      const result = await runSync(url.searchParams.get('source'));
      return sendJson(res, result.busy ? 409 : 200, result);
    }
    if (method === 'GET' && seg[2] === 'status') {
      return sendJson(res, 200, {
        syncing,
        latest: syncLog.latest(),
        recent: syncLog.recent(10)
      });
    }
  }

  return sendJson(res, 404, { error: 'unknown api route' });
}

/* ---------------- 静态文件 ---------------- */

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') { rel = '/index.html'; }
  const filePath = path.normalize(path.join(STATIC_ROOT, rel));
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- 服务器 ---------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => sendJson(res, 500, { error: e.message }));
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Ron567 home server → http://localhost:${PORT}`);
  // 启动即同步一次，之后定时同步
  runSync().then((r) => console.log('[sync] startup:', JSON.stringify(r)));
  setInterval(() => {
    runSync().then((r) => console.log('[sync] scheduled:', JSON.stringify(r)));
  }, SYNC_INTERVAL_MS);
});
