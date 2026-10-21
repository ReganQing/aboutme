/* Ron567 主页 · GitHub 项目 & 博客文章动态渲染
 * 数据来自本地服务（server/server.js）的 /api/projects 与 /api/posts；
 * 服务端每 30 分钟自动同步，页面上也提供手动同步按钮。
 * 若 API 不可用（如直接以 file:// 打开），显示降级提示，不影响页面其余部分。
 */
(function () {
  'use strict';

  var API_BASE = ''; // 同源部署；如前后端分离可改为 'http://localhost:3567'

  /* ---------- 工具 ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  function fmtDate(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtTime(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    return fmtDate(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function getJson(path) {
    return fetch(API_BASE + path).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    });
  }

  /* 渲染改变了 #stage 高度，需要让 fit() 与天气画布重新计算 */
  function refreshLayout() {
    window.dispatchEvent(new Event('resize'));
  }

  /* ---------- GitHub 项目 ---------- */
  var LANG_COLORS = {
    Java: '#B07219', TypeScript: '#3178C6', JavaScript: '#F1E05A',
    Vue: '#41B883', Python: '#3572A5', HTML: '#E34C26',
    'Jupyter Notebook': '#DA5B0B', Go: '#00ADD8', Rust: '#DEA584'
  };

  function renderProjects(list) {
    var grid = document.getElementById('gh-grid');
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(el('p', 'data-empty', '暂无项目数据，试试右上角「同步」。'));
      return;
    }
    list.forEach(function (p, i) {
      var card = el('a', 'gh-card');
      card.href = p.url;
      card.target = '_blank';
      card.rel = 'noopener';

      var top = el('div', 'card-top');
      top.appendChild(el('span', 'idx', String(i + 1).padStart(2, '0')));
      var meta = el('span', 'gh-meta');
      if (p.language) {
        var dot = el('span', 'gh-lang-dot');
        dot.style.background = LANG_COLORS[p.language] || '#7DD9A6';
        meta.appendChild(dot);
        meta.appendChild(el('span', 'gh-lang', p.language));
      }
      meta.appendChild(el('span', 'gh-stars', '★ ' + p.stars));
      top.appendChild(meta);
      card.appendChild(top);

      card.appendChild(el('h3', 'card-title gh-title', p.name));
      card.appendChild(el('p', 'card-desc gh-desc', p.description || '（暂无描述）'));

      var tag = el('span', 'card-tag');
      tag.textContent = 'GitHub · 更新于 ' + fmtDate(p.pushed_at);
      card.appendChild(tag);
      grid.appendChild(card);
    });
  }

  /* ---------- 博客文章 ---------- */
  function renderPosts(list) {
    var wrap = document.getElementById('blog-list');
    // 初始 HTML 已包含精选文章；空结果或接口故障时保留这些可访问的入口。
    if (!Array.isArray(list) || !list.length) { return; }
    wrap.innerHTML = '';
    list.forEach(function (p) {
      var item = el('a', 'blog-item');
      item.href = p.url;
      item.target = '_blank';
      item.rel = 'noopener';

      var head = el('div', 'blog-item-head');
      head.appendChild(el('h3', 'blog-title', p.title));
      head.appendChild(el('span', 'blog-date', fmtDate(p.published_at)));
      item.appendChild(head);

      if (p.excerpt) {
        var ex = p.excerpt.replace(/\s+/g, ' ').trim();
        if (ex.length > 90) { ex = ex.slice(0, 90) + '…'; }
        item.appendChild(el('p', 'blog-excerpt', ex));
      }

      var tags = el('div', 'blog-tags');
      (p.categories || []).forEach(function (c) { tags.appendChild(el('span', 'blog-cat', c)); });
      (p.tags || []).forEach(function (t) { tags.appendChild(el('span', 'blog-tag', '# ' + t)); });
      item.appendChild(tags);
      wrap.appendChild(item);
    });
  }

  /* ---------- 同步状态与手动同步 ---------- */
  function renderSyncStatus() {
    return getJson('/api/sync/status').then(function (s) {
      var label = document.getElementById('sync-time');
      if (!label) { return; }
      var latest = (s.latest || []).map(function (l) { return l.finished_at; }).sort().pop();
      label.textContent = latest ? '上次同步 ' + fmtTime(latest) : '尚未同步';
    }).catch(function () { /* 状态非关键，忽略 */ });
  }

  function bindSyncButton() {
    var btn = document.getElementById('sync-btn');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      if (btn.classList.contains('busy')) { return; }
      btn.classList.add('busy');
      btn.textContent = '同步中…';
      fetch(API_BASE + '/api/sync', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function () { return loadAll(); })
        .catch(function () { /* 失败时下方 loadAll 的降级逻辑兜底 */ })
        .then(function () {
          btn.classList.remove('busy');
          btn.textContent = '↻ 同步';
        });
    });
  }

  /* ---------- 加载 ---------- */
  function showFallback() {
    var grid = document.getElementById('gh-grid');
    if (grid.querySelector('a')) { return; }
    grid.innerHTML = '';
    grid.appendChild(el('p', 'data-empty', '项目列表暂时无法更新，可通过下方链接查看 GitHub 仓库。'));
  }

  function loadAll() {
    return Promise.all([
      getJson('/api/projects?featured=1').then(renderProjects).catch(showFallback),
      getJson('/api/posts').then(renderPosts).catch(function () { /* 保留精选文章 */ }),
      renderSyncStatus()
    ]).then(function () {
      refreshLayout();
    });
  }

  function init() {
    bindSyncButton();
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
