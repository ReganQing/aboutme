/* Vercel 无服务器适配层：与 server/sync.js 同源逻辑，但不落库，
 * 每次请求实时拉取 GitHub / Halo 数据，靠 CDN 缓存（s-maxage）承担"定时同步"。
 * 下划线开头的文件不会被 Vercel 暴露为接口。
 */
'use strict';

const GITHUB_USER = 'ReganQing';
const GITHUB_API = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`;
const BLOG_BASE = 'http://114.55.211.108:8090';
const HALO_API = `${BLOG_BASE}/apis/api.content.halo.run/v1alpha1`;
const FEATURED_LIMIT = 6;
const FETCH_TIMEOUT = 15000;

function fetchJson(url, headers) {
  return fetch(url, {
    headers: Object.assign({ 'User-Agent': 'ron567-home-sync' }, headers || {}),
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  }).then((r) => {
    if (!r.ok) { throw new Error(`HTTP ${r.status} for ${url}`); }
    return r.json();
  });
}

/* 代表性评分：与 server/sync.js 保持一致 */
function scoreRepo(r) {
  let score = r.stargazers_count * 20 + r.forks_count * 10;
  if (r.description && r.description.trim().length >= 10) { score += 30; }
  if (r.homepage) { score += 10; }
  if ((r.topics || []).length > 0) { score += 5; }
  const monthsSincePush = (Date.now() - new Date(r.pushed_at).getTime()) / (30 * 24 * 3600 * 1000);
  if (monthsSincePush < 3) { score += 25; }
  else if (monthsSincePush < 12) { score += 10; }
  if (r.size >= 100) { score += 5; }
  if (r.size < 30) { score -= 20; }
  return Math.round(score);
}

function isNonProject(r) {
  const name = r.name.toLowerCase();
  return r.name === GITHUB_USER ||
    /(-img|-image|images)$/.test(name) ||
    /^(notes?|study|learn)/.test(name);
}

async function fetchProjects() {
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

  return scored.map(({ repo, score }, i) => ({
    id: i + 1,
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
    pushed_at: repo.pushed_at,
    synced_at: new Date().toISOString()
  }));
}

async function fetchPosts() {
  const [postsRes, catsRes, tagsRes] = await Promise.all([
    fetchJson(`${HALO_API}/posts?page=1&size=200`),
    fetchJson(`${HALO_API}/categories?page=1&size=1000`),
    fetchJson(`${HALO_API}/tags?page=1&size=1000`)
  ]);

  const catMap = new Map(catsRes.items.map((c) => [c.metadata.name, c.spec.displayName]));
  const tagMap = new Map(tagsRes.items.map((t) => [t.metadata.name, t.spec.displayName]));

  return postsRes.items
    .filter((p) => p.spec.publish && !p.spec.deleted && p.spec.visible === 'PUBLIC')
    .map((p, i) => {
      const permalink = (p.status && p.status.permalink) || `/archives/${p.spec.slug}`;
      return {
        id: i + 1,
        post_name: p.metadata.name,
        title: p.spec.title,
        slug: p.spec.slug,
        excerpt: (p.status && p.status.excerpt) || (p.spec.excerpt && p.spec.excerpt.raw) || '',
        url: BLOG_BASE + permalink,
        categories: (p.spec.categories || []).map((c) => catMap.get(c) || c),
        tags: (p.spec.tags || []).map((t) => tagMap.get(t) || t),
        published_at: p.spec.publishTime || p.metadata.creationTimestamp,
        synced_at: new Date().toISOString()
      };
    })
    .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
}

function sendJson(res, status, data, cacheSeconds) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (cacheSeconds) {
    // CDN 缓存承担"定时同步"：窗口期内命中缓存，过期后自动回源刷新
    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=86400`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.status(status).json(data);
}

module.exports = { fetchProjects, fetchPosts, sendJson };
