/* Ron567 主页 · 数据同步任务
 * - GitHub：拉取 ReganQing 的仓库，过滤 fork，按启发式评分挑选代表性项目
 * - 博客：调用 Halo 公开内容 API 拉取文章 / 分类 / 标签
 * 同步幂等：按远端唯一键 upsert，并清理远端已删除的数据；每次记录 sync_log。
 * 可独立运行：node sync.js [github|blog]
 */
'use strict';

const { projects, posts, syncLog, nowIso } = require('./db');

const GITHUB_USER = 'ReganQing';
const GITHUB_API = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
const BLOG_BASE = 'http://114.55.211.108:8090';
const HALO_API = `${BLOG_BASE}/apis/api.content.halo.run/v1alpha1`;
const FEATURED_LIMIT = 6;        // 主页最多展示的代表性项目数
const FETCH_TIMEOUT = 20000;

function fetchJson(url, headers) {
  return fetch(url, {
    headers: Object.assign({ 'User-Agent': 'ron567-home-sync' }, headers || {}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  }).then((r) => {
    if (!r.ok) { throw new Error(`HTTP ${r.status} for ${url}`); }
    return r.json();
  });
}

/* ---------------- GitHub 同步 ---------------- */

/* 代表性评分：星数权重最高，其次是有描述（说明项目相对完整）、近期活跃、体量适中 */
function scoreRepo(r) {
  let score = r.stargazers_count * 20 + r.forks_count * 10;
  if (r.description && r.description.trim().length >= 10) { score += 30; }
  if (r.homepage) { score += 10; }
  if ((r.topics || []).length > 0) { score += 5; }
  const monthsSincePush = (Date.now() - new Date(r.pushed_at).getTime()) / (30 * 24 * 3600 * 1000);
  if (monthsSincePush < 3) { score += 25; }
  else if (monthsSincePush < 12) { score += 10; }
  if (r.size >= 100) { score += 5; }          // 排除近乎空仓库
  if (r.size < 30) { score -= 20; }
  return Math.round(score);
}

/* 非项目类仓库：个人 profile README、图床、纯笔记仓库不作为代表作 */
function isNonProject(r) {
  const name = r.name.toLowerCase();
  return r.name === GITHUB_USER ||
    /(-img|-image|images)$/.test(name) ||
    /^(notes?|study|learn)/.test(name);
}

async function syncGithub() {
  const startedAt = nowIso();
  try {
    const repos = await fetchJson(GITHUB_API, { Accept: 'application/vnd.github+json' });
    const own = repos.filter((r) => !r.fork && !r.archived);

    const scored = own
      .map((r) => ({ repo: r, score: scoreRepo(r), nonProject: isNonProject(r) }))
      .sort((a, b) => b.score - a.score);

    const featuredIds = new Set(
      scored.filter((s) => !s.nonProject && s.score > 0)
        .slice(0, FEATURED_LIMIT)
        .map((s) => s.repo.id)
    );

    let count = 0;
    for (const { repo, score } of scored) {
      projects.upsert({
        repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        homepage: repo.homepage,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        topics: repo.topics || [],
        is_featured: featuredIds.has(repo.id),
        score,
        created_at: repo.created_at,
        pushed_at: repo.pushed_at
      });
      count++;
    }
    projects.pruneMissing(own.map((r) => r.id));

    syncLog.add({ source: 'github', status: 'success', items_synced: count, started_at: startedAt });
    return { source: 'github', status: 'success', items: count };
  } catch (e) {
    syncLog.add({ source: 'github', status: 'error', message: e.message, started_at: startedAt });
    return { source: 'github', status: 'error', message: e.message };
  }
}

/* ---------------- 博客同步（Halo API） ---------------- */

async function syncBlog() {
  const startedAt = nowIso();
  try {
    const [postsRes, catsRes, tagsRes] = await Promise.all([
      fetchJson(`${HALO_API}/posts?page=1&size=200`),
      fetchJson(`${HALO_API}/categories?page=1&size=1000`),
      fetchJson(`${HALO_API}/tags?page=1&size=1000`)
    ]);

    const catMap = new Map(catsRes.items.map((c) => [c.metadata.name, c.spec.displayName]));
    const tagMap = new Map(tagsRes.items.map((t) => [t.metadata.name, t.spec.displayName]));

    const visible = postsRes.items.filter((p) =>
      p.spec.publish && !p.spec.deleted && p.spec.visible === 'PUBLIC'
    );

    let count = 0;
    for (const p of visible) {
      const permalink = (p.status && p.status.permalink) || `/archives/${p.spec.slug}`;
      posts.upsert({
        post_name: p.metadata.name,
        title: p.spec.title,
        slug: p.spec.slug,
        excerpt: (p.status && p.status.excerpt) || (p.spec.excerpt && p.spec.excerpt.raw) || '',
        url: BLOG_BASE + permalink,
        categories: (p.spec.categories || []).map((c) => catMap.get(c) || c),
        tags: (p.spec.tags || []).map((t) => tagMap.get(t) || t),
        published_at: p.spec.publishTime || p.metadata.creationTimestamp
      });
      count++;
    }
    posts.pruneMissing(visible.map((p) => p.metadata.name));

    syncLog.add({ source: 'blog', status: 'success', items_synced: count, started_at: startedAt });
    return { source: 'blog', status: 'success', items: count };
  } catch (e) {
    syncLog.add({ source: 'blog', status: 'error', message: e.message, started_at: startedAt });
    return { source: 'blog', status: 'error', message: e.message };
  }
}

async function syncAll() {
  const results = await Promise.all([syncGithub(), syncBlog()]);
  return results;
}

module.exports = { syncGithub, syncBlog, syncAll };

/* 命令行直接运行：node sync.js [github|blog] */
if (require.main === module) {
  const target = process.argv[2];
  const task = target === 'github' ? syncGithub() : target === 'blog' ? syncBlog() : syncAll();
  Promise.resolve(task).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
