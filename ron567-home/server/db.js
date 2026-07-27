/* Ron567 主页 · SQLite 数据层（node:sqlite，零第三方依赖）
 * 表结构：github_projects / blog_posts / sync_log
 * 对外暴露 CRUD 接口，供 server.js（HTTP API）与 sync.js（同步任务）共用。
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'site.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS github_projects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER UNIQUE NOT NULL,          -- GitHub 仓库 ID（去重键）
    name         TEXT NOT NULL,
    full_name    TEXT NOT NULL,
    description  TEXT,
    url          TEXT NOT NULL,
    homepage     TEXT,
    language     TEXT,
    stars        INTEGER NOT NULL DEFAULT 0,
    forks        INTEGER NOT NULL DEFAULT 0,
    topics       TEXT NOT NULL DEFAULT '[]',       -- JSON 数组
    is_featured  INTEGER NOT NULL DEFAULT 0,       -- 是否入选主页展示
    score        INTEGER NOT NULL DEFAULT 0,       -- 代表性评分（同步时计算）
    created_at   TEXT,
    pushed_at    TEXT,
    synced_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS blog_posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    post_name    TEXT UNIQUE NOT NULL,             -- Halo metadata.name（去重键）
    title        TEXT NOT NULL,
    slug         TEXT,
    excerpt      TEXT,
    url          TEXT NOT NULL,
    categories   TEXT NOT NULL DEFAULT '[]',       -- JSON 数组（分类显示名）
    tags         TEXT NOT NULL DEFAULT '[]',       -- JSON 数组（标签显示名）
    published_at TEXT,
    synced_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL,                    -- github | blog
    status       TEXT NOT NULL,                    -- success | error
    message      TEXT,
    items_synced INTEGER NOT NULL DEFAULT 0,
    started_at   TEXT NOT NULL,
    finished_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projects_featured ON github_projects(is_featured, score);
  CREATE INDEX IF NOT EXISTS idx_posts_published   ON blog_posts(published_at);
  CREATE INDEX IF NOT EXISTS idx_synclog_source    ON sync_log(source, finished_at);
`);

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function rowToProject(row) {
  if (!row) { return null; }
  return Object.assign({}, row, {
    topics: JSON.parse(row.topics || '[]'),
    is_featured: !!row.is_featured
  });
}

function rowToPost(row) {
  if (!row) { return null; }
  return Object.assign({}, row, {
    categories: JSON.parse(row.categories || '[]'),
    tags: JSON.parse(row.tags || '[]')
  });
}

/* ---------------- GitHub 项目 CRUD ---------------- */

const projects = {
  list(opts) {
    const o = opts || {};
    const sql = o.featuredOnly
      ? 'SELECT * FROM github_projects WHERE is_featured = 1 ORDER BY score DESC, pushed_at DESC'
      : 'SELECT * FROM github_projects ORDER BY score DESC, pushed_at DESC';
    return db.prepare(sql).all().map(rowToProject);
  },

  get(id) {
    return rowToProject(db.prepare('SELECT * FROM github_projects WHERE id = ?').get(id));
  },

  create(p) {
    const stmt = db.prepare(`
      INSERT INTO github_projects
        (repo_id, name, full_name, description, url, homepage, language,
         stars, forks, topics, is_featured, score, created_at, pushed_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(
      p.repo_id, p.name, p.full_name, p.description || null, p.url,
      p.homepage || null, p.language || null, p.stars | 0, p.forks | 0,
      JSON.stringify(p.topics || []), p.is_featured ? 1 : 0, p.score | 0,
      p.created_at || null, p.pushed_at || null, nowIso()
    );
    return projects.get(Number(r.lastInsertRowid));
  },

  /* 按 repo_id 幂等写入：存在则更新，不存在则插入。返回 'inserted' | 'updated' */
  upsert(p) {
    const existing = db.prepare('SELECT id FROM github_projects WHERE repo_id = ?').get(p.repo_id);
    if (existing) {
      db.prepare(`
        UPDATE github_projects SET
          name = ?, full_name = ?, description = ?, url = ?, homepage = ?,
          language = ?, stars = ?, forks = ?, topics = ?, is_featured = ?,
          score = ?, created_at = ?, pushed_at = ?, synced_at = ?
        WHERE repo_id = ?
      `).run(
        p.name, p.full_name, p.description || null, p.url, p.homepage || null,
        p.language || null, p.stars | 0, p.forks | 0, JSON.stringify(p.topics || []),
        p.is_featured ? 1 : 0, p.score | 0, p.created_at || null, p.pushed_at || null,
        nowIso(), p.repo_id
      );
      return 'updated';
    }
    projects.create(p);
    return 'inserted';
  },

  update(id, patch) {
    const cur = db.prepare('SELECT * FROM github_projects WHERE id = ?').get(id);
    if (!cur) { return null; }
    const merged = Object.assign({}, cur, patch);
    db.prepare(`
      UPDATE github_projects SET
        name = ?, full_name = ?, description = ?, url = ?, homepage = ?,
        language = ?, stars = ?, forks = ?, topics = ?, is_featured = ?, score = ?,
        created_at = ?, pushed_at = ?, synced_at = ?
      WHERE id = ?
    `).run(
      merged.name, merged.full_name, merged.description, merged.url, merged.homepage,
      merged.language, merged.stars | 0, merged.forks | 0,
      typeof merged.topics === 'string' ? merged.topics : JSON.stringify(merged.topics || []),
      merged.is_featured ? 1 : 0, merged.score | 0,
      merged.created_at, merged.pushed_at, nowIso(), id
    );
    return projects.get(id);
  },

  remove(id) {
    return db.prepare('DELETE FROM github_projects WHERE id = ?').run(id).changes > 0;
  },

  /* 同步收尾：删除远端已不存在的仓库记录 */
  pruneMissing(keepRepoIds) {
    if (!keepRepoIds.length) { return 0; }
    const placeholders = keepRepoIds.map(() => '?').join(',');
    return db.prepare(
      `DELETE FROM github_projects WHERE repo_id NOT IN (${placeholders})`
    ).run(...keepRepoIds).changes;
  }
};

/* ---------------- 博客文章 CRUD ---------------- */

const posts = {
  list() {
    return db.prepare('SELECT * FROM blog_posts ORDER BY published_at DESC').all().map(rowToPost);
  },

  get(id) {
    return rowToPost(db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(id));
  },

  create(p) {
    const r = db.prepare(`
      INSERT INTO blog_posts
        (post_name, title, slug, excerpt, url, categories, tags, published_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.post_name, p.title, p.slug || null, p.excerpt || null, p.url,
      JSON.stringify(p.categories || []), JSON.stringify(p.tags || []),
      p.published_at || null, nowIso()
    );
    return posts.get(Number(r.lastInsertRowid));
  },

  /* 按 post_name 幂等写入。返回 'inserted' | 'updated' */
  upsert(p) {
    const existing = db.prepare('SELECT id FROM blog_posts WHERE post_name = ?').get(p.post_name);
    if (existing) {
      db.prepare(`
        UPDATE blog_posts SET
          title = ?, slug = ?, excerpt = ?, url = ?, categories = ?, tags = ?,
          published_at = ?, synced_at = ?
        WHERE post_name = ?
      `).run(
        p.title, p.slug || null, p.excerpt || null, p.url,
        JSON.stringify(p.categories || []), JSON.stringify(p.tags || []),
        p.published_at || null, nowIso(), p.post_name
      );
      return 'updated';
    }
    posts.create(p);
    return 'inserted';
  },

  update(id, patch) {
    const cur = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(id);
    if (!cur) { return null; }
    const merged = Object.assign({}, cur, patch);
    db.prepare(`
      UPDATE blog_posts SET
        title = ?, slug = ?, excerpt = ?, url = ?, categories = ?, tags = ?,
        published_at = ?, synced_at = ?
      WHERE id = ?
    `).run(
      merged.title, merged.slug, merged.excerpt, merged.url,
      typeof merged.categories === 'string' ? merged.categories : JSON.stringify(merged.categories || []),
      typeof merged.tags === 'string' ? merged.tags : JSON.stringify(merged.tags || []),
      merged.published_at, nowIso(), id
    );
    return posts.get(id);
  },

  remove(id) {
    return db.prepare('DELETE FROM blog_posts WHERE id = ?').run(id).changes > 0;
  },

  pruneMissing(keepNames) {
    if (!keepNames.length) { return 0; }
    const placeholders = keepNames.map(() => '?').join(',');
    return db.prepare(
      `DELETE FROM blog_posts WHERE post_name NOT IN (${placeholders})`
    ).run(...keepNames).changes;
  }
};

/* ---------------- 同步日志 ---------------- */

const syncLog = {
  add(entry) {
    db.prepare(`
      INSERT INTO sync_log (source, status, message, items_synced, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.source, entry.status, entry.message || null,
      entry.items_synced | 0, entry.started_at, nowIso()
    );
  },

  latest() {
    return db.prepare(`
      SELECT source, status, message, items_synced, started_at, finished_at
      FROM sync_log s
      WHERE finished_at = (SELECT MAX(finished_at) FROM sync_log WHERE source = s.source)
      GROUP BY source
    `).all();
  },

  recent(limit) {
    return db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit || 20);
  }
};

module.exports = { db, projects, posts, syncLog, nowIso };
