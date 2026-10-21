'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site-data.js'), 'utf8');

class Element {
  constructor(tagName, text = '') {
    this.tagName = tagName;
    this.textContent = text;
    this.children = [];
    this.style = {};
  }
  set innerHTML(value) { this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(tag) { return this.children.find(child => child.tagName === tag) || null; }
}

async function load({ posts, projects }) {
  const featured = new Element('a', '初始 HTML 中的精选文章');
  const grid = new Element('div');
  const list = new Element('div');
  list.appendChild(featured);
  vm.runInNewContext(source, {
    document: {
      readyState: 'complete',
      createElement: tag => new Element(tag),
      getElementById: id => ({ 'gh-grid': grid, 'blog-list': list }[id] || null)
    },
    window: { dispatchEvent() {} },
    Event: class {},
    fetch: async url => {
      const value = url.startsWith('/api/projects') ? projects
        : url === '/api/posts' ? posts : { latest: [] };
      if (value instanceof Error) { throw value; }
      return { ok: true, json: async () => value };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { grid, list, featured };
}

const post = { title: '新文章', url: 'https://blog.ron567.top/archives/new', published_at: '2026-10-19' };
const project = { name: '开源作品', url: 'https://github.com/ReganQing/example', stars: 1, pushed_at: '2026-10-19' };

test('项目接口失败时仍展示成功获取的文章', async () => {
  const { list } = await load({ posts: [post], projects: new Error('offline') });
  assert.equal(list.children[0].href, post.url);
});

test('文章接口失败时保留精选链接，并正常展示项目', async () => {
  const { grid, list, featured } = await load({ posts: new Error('offline'), projects: [project] });
  assert.equal(list.children[0], featured);
  assert.equal(grid.children[0].href, project.url);
});

test('空文章结果不会删除初始 HTML 中的精选链接', async () => {
  const { list, featured } = await load({ posts: [], projects: [] });
  assert.equal(list.children[0], featured);
});

test('两个接口均失败时文章入口仍可用，提示包含可执行的下一步', async () => {
  const { grid, list, featured } = await load({ posts: new Error('offline'), projects: new Error('offline') });
  assert.equal(list.children[0], featured);
  assert.match(grid.children[0].textContent, /GitHub/);
});

test('无需 JavaScript 的首页包含身份信息、规范地址和三篇文章入口', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /rel="canonical" href="https:\/\/www\.ron567\.top\/"/);
  assert.equal((html.match(/class="blog-item" href="https:\/\/blog\.ron567\.top\/archives\//g) || []).length, 3);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.mainEntity.url, 'https://www.ron567.top/');
  assert.equal(schema.mainEntity.subjectOf.url, 'https://blog.ron567.top/');
});
