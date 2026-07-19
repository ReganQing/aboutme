# 天气系统插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `ron567-home/index.html` 增加纯背景天气系统（晴/雨/雪），Headbar 右侧三图标分段控件切换，默认关闭，localStorage 持久化，不阻塞加载、不遮盖内容。

**Architecture:** Canvas 2D 粒子系统。画布作为 `#stage` 直接子元素置于 `.content` 之下（z-index 0，`pointer-events:none`）；独立 `weather.js` 以 `defer` 加载；单个 rAF 循环，仅在天气激活时运行。

**Tech Stack:** 原生 HTML/CSS/JS（无构建、无依赖）。验证工具：Node 22（语法检查）、Python 3.12（静态服务）、Playwright（视觉验证）。

**注意：** 项目不是 git 仓库，本计划省略 commit 步骤。

**规格修订（相对设计文档 §6）：** 雨天的「落地涟漪」取消——画布底部区域被页脚不透明渐变背景遮挡，且涟漪线位置固定会在滚动时显得错位；改为雨丝落出画布自然循环。其余规格不变。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `ron567-home/index.html`（修改） | 分段控件静态标记、控件与画布 CSS、`defer` 引入 weather.js |
| `ron567-home/weather.js`（新建） | 全部行为：状态机、持久化、画布生命周期、三种粒子系统、控件事件、可见性/降级处理 |

---

### Task 1: index.html — 控件标记、样式、脚本引入

**Files:**
- Modify: `ron567-home/index.html`

- [ ] **Step 1: 新增 CSS**

在 `/* ---------- Scroll reveal (subtle, layout-neutral) ---------- */` 这一行**之前**插入：

```css
  /* ---------- Weather background canvas ---------- */
  #weather-canvas{position:absolute;inset:0;z-index:0;pointer-events:none;}

  /* ---------- Weather switcher (nav right, before CTA) ---------- */
  .weather-switch{
    display:flex;align-items:center;gap:2px;
    height:40px;padding:0 4px;margin-right:16px;border-radius:9999px;
    background:var(--glass);border:1px solid var(--glass-border);
  }
  .weather-btn{
    display:flex;align-items:center;justify-content:center;
    width:32px;height:32px;border-radius:9999px;border:none;background:transparent;
    color:var(--muted);cursor:pointer;padding:0;
    transition:color .3s ease,background .3s ease;
  }
  .weather-btn:hover{color:var(--light);}
  .weather-btn.active{color:#0C1712;background:var(--green);}
  .weather-btn:focus-visible{outline:2px solid var(--green-stroke-strong);outline-offset:2px;}
  .weather-btn svg{width:16px;height:16px;display:block;}
```

- [ ] **Step 2: 导航内插入分段控件**

在 `index.html` 中 `<a class="nav-cta" href="#footer">联系我</a>` 这一行**之前**插入（图标为 Lucide/Feather 风格内联 SVG，stroke=currentColor）：

```html
          <div class="weather-switch" role="group" aria-label="背景天气切换">
            <button type="button" class="weather-btn" data-weather="sun" aria-pressed="false" aria-label="晴天" title="晴天">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            </button>
            <button type="button" class="weather-btn" data-weather="rain" aria-pressed="false" aria-label="雨天" title="雨天">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
            </button>
            <button type="button" class="weather-btn" data-weather="snow" aria-pressed="false" aria-label="雪天" title="雪天">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>
            </button>
          </div>
```

- [ ] **Step 3: 引入 weather.js**

在 `</body>` 之前的现有内联 `<script>...</script>` 块**之后**加一行：

```html
  <script src="weather.js" defer></script>
```

（此时 `weather.js` 尚不存在，控制台会有一个 404，属预期，Task 2 消除。）

- [ ] **Step 4: 静态验证**

Run: `python -m http.server 8321 --directory ron567-home`（后台），浏览器打开 `http://localhost:8321/`
Expected: 页面与之前一致；导航右侧「联系我」左边出现三图标胶囊控件（无激活态）；除 weather.js 404 外无报错。

---

### Task 2: 新建 weather.js — 完整行为实现

**Files:**
- Create: `ron567-home/weather.js`

- [ ] **Step 1: 写完整文件**

```js
/* Ron567 主页 · 背景天气系统（晴 / 雨 / 雪）
 * defer 加载，不阻塞解析；画布位于 .content 之下（z-index 0），pointer-events:none。
 * 默认关闭；仅在天气激活时运行 rAF 循环；localStorage 持久化用户选择。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ron567-weather';
  var MODES = ['sun', 'rain', 'snow'];
  var DPR_CAP = 1.5;
  var REF_AREA = 1440 * 3400; // 粒子基数按此面积标定
  var BASE_COUNT = { sun: 70, rain: 140, snow: 160 };
  var MAX_DT = 50; // ms，钳制标签页切换后的时间跳变

  var canvas = null;
  var ctx = null;
  var stage = null;
  var mode = 'off';
  var particles = [];
  var rafId = null;
  var lastTime = 0;
  var width = 0;
  var height = 0;
  var sunSprite = null;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 持久化 ----------
  function readStoredMode() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return MODES.indexOf(v) !== -1 ? v : 'off';
    } catch (e) {
      return 'off';
    }
  }

  function storeMode(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) { /* 存储不可用（隐私模式等）：仅本次会话有效 */ }
  }

  // ---------- 画布生命周期 ----------
  function ensureCanvas() {
    if (canvas) { return; }
    stage = document.getElementById('stage');
    if (!stage) { return; }
    canvas = document.createElement('canvas');
    canvas.id = 'weather-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var content = stage.querySelector('.content');
    stage.insertBefore(canvas, content || null);
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('load', resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas || !stage) { return; }
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    width = stage.clientWidth;
    height = stage.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode !== 'off') {
      buildParticles(mode);
      if (reducedMotion) { drawFrame(); }
    }
  }

  // ---------- 粒子构建 ----------
  function rand(min, max) { return min + Math.random() * (max - min); }

  function scaledCount(base) {
    var area = width * height;
    if (area <= 0) { return base; }
    return Math.max(24, Math.round(base * area / REF_AREA));
  }

  function buildParticles(kind) {
    var n = scaledCount(BASE_COUNT[kind]);
    var list = [];
    var i;
    if (kind === 'sun') {
      for (i = 0; i < n; i++) {
        list.push({
          x: rand(0, width), y: rand(0, height),
          r: rand(1.2, 3.4),
          vx: rand(-6, 6), vy: rand(-9, -2),
          phase: rand(0, Math.PI * 2), sway: rand(8, 26),
          alpha: rand(0.10, 0.32), size: rand(14, 34)
        });
      }
    } else if (kind === 'rain') {
      for (i = 0; i < n; i++) {
        list.push({
          x: rand(-40, width + 40), y: rand(-height, height),
          len: rand(14, 30),
          speed: rand(900, 1400), slant: rand(60, 110),
          alpha: rand(0.12, 0.30)
        });
      }
    } else if (kind === 'snow') {
      for (i = 0; i < n; i++) {
        list.push({
          x: rand(0, width), y: rand(-height, height),
          r: rand(0.9, 2.9),
          speed: rand(28, 78),
          phase: rand(0, Math.PI * 2), sway: rand(18, 46),
          alpha: rand(0.35, 0.85)
        });
      }
    }
    particles = list;
  }

  // ---------- 渲染 ----------
  function getSunSprite() {
    if (sunSprite) { return sunSprite; }
    sunSprite = document.createElement('canvas');
    sunSprite.width = 64;
    sunSprite.height = 64;
    var c = sunSprite.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(246, 233, 178, 0.9)');
    g.addColorStop(0.35, 'rgba(233, 222, 160, 0.35)');
    g.addColorStop(1, 'rgba(233, 222, 160, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return sunSprite;
  }

  function drawLightShafts(t) {
    var i, cx, wTop, grad;
    for (i = 0; i < 3; i++) {
      cx = width * (0.18 + i * 0.3) + Math.sin(t * 0.05 + i * 2.1) * width * 0.04;
      wTop = width * 0.055;
      grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(233, 222, 160, 0.055)');
      grad.addColorStop(0.7, 'rgba(233, 222, 160, 0.012)');
      grad.addColorStop(1, 'rgba(233, 222, 160, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + wTop, 0);
      ctx.lineTo(cx + wTop * 2.6, height);
      ctx.lineTo(cx + wTop * 1.6, height);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFrame() {
    if (!ctx) { return; }
    ctx.clearRect(0, 0, width, height);
    var t = performance.now() / 1000;
    var i, p, dx;
    if (mode === 'sun') {
      drawLightShafts(t);
      var sprite = getSunSprite();
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        dx = p.x + Math.sin(t * 0.35 + p.phase) * p.sway;
        ctx.globalAlpha = p.alpha;
        ctx.drawImage(sprite, dx - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    } else if (mode === 'rain') {
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        var k = p.len / p.speed;
        ctx.strokeStyle = 'rgba(174, 205, 224, ' + p.alpha + ')';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.slant * k, p.y - p.len);
        ctx.stroke();
      }
    } else if (mode === 'snow') {
      ctx.fillStyle = '#FFFFFF';
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        dx = p.x + Math.sin(t * 0.6 + p.phase) * p.sway;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(dx, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 动画循环 ----------
  function update(dt) {
    var i, p;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (mode === 'sun') {
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.y < -20) { p.y = height + 20; p.x = rand(0, width); }
        if (p.x < -20) { p.x = width + 20; } else if (p.x > width + 20) { p.x = -20; }
      } else if (mode === 'rain') {
        p.y += p.speed * dt;
        p.x += p.slant * dt;
        if (p.y > height + 40) { p.y = rand(-120, -40); p.x = rand(-40, width + 40); }
      } else if (mode === 'snow') {
        p.y += p.speed * dt;
        if (p.y > height + 6) { p.y = rand(-60, -6); p.x = rand(0, width); }
      }
    }
  }

  function tick(now) {
    rafId = null;
    if (mode === 'off') { return; }
    var dt = Math.min(now - lastTime, MAX_DT) / 1000;
    lastTime = now;
    update(dt);
    drawFrame();
    rafId = window.requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId === null && !reducedMotion && !document.hidden) {
      lastTime = performance.now();
      rafId = window.requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ---------- 状态机 ----------
  function setMode(next, persist) {
    if (MODES.indexOf(next) === -1) { next = 'off'; }
    mode = next;
    if (persist !== false) { storeMode(mode); }
    updateControls();
    if (mode === 'off') {
      stopLoop();
      particles = [];
      if (ctx) { ctx.clearRect(0, 0, width, height); }
      return;
    }
    ensureCanvas();
    buildParticles(mode);
    if (reducedMotion) {
      drawFrame(); // 减少动态偏好：仅绘制一帧静态画面
    } else {
      stopLoop();
      startLoop();
    }
  }

  // ---------- 控件 ----------
  function updateControls() {
    var btns = document.querySelectorAll('.weather-btn');
    for (var i = 0; i < btns.length; i++) {
      var active = btns[i].getAttribute('data-weather') === mode;
      btns[i].classList.toggle('active', active);
      btns[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function bindControls() {
    var btns = document.querySelectorAll('.weather-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var w = btn.getAttribute('data-weather');
          setMode(w === mode ? 'off' : w);
        });
      })(btns[i]);
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopLoop();
    } else if (mode !== 'off' && !reducedMotion) {
      startLoop();
    }
  });

  // ---------- 初始化 ----------
  function init() {
    bindControls();
    setMode(readStoredMode(), false); // 恢复存储状态，不回写
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: 语法检查**

Run: `node --check ron567-home/weather.js`
Expected: 无输出，退出码 0

- [ ] **Step 3: 浏览器冒烟验证**

刷新 `http://localhost:8321/`：
- 默认无任何天气动画，DOM 中无 `#weather-canvas`，控制台无 404/报错
- 点雨天图标：图标变绿底激活态，页面背景出现雨丝（文字上方无遮挡）；localStorage `ron567-weather === "rain"`
- 刷新页面：雨天自动恢复
- 再点一次雨天图标：关闭，画布清空，动画循环停止

---

### Task 3: Playwright 视觉验证（四状态截图 + 层级检查）

**Files:**
- 无改动（验证 only）

- [ ] **Step 1: 编写验证脚本并运行**

使用 playwright-skill，对 `http://localhost:8321/` 执行：
1. 默认（off）整页截图 → 无粒子、无画布
2. 依次点击 sun / rain / snow，各等待 1.5s 后截取首屏
3. DOM 断言：`#weather-canvas` 计算样式 `z-index < .content 的 z-index` 且 `pointer-events === 'none'`
4. 点击 snow 后刷新，断言 `.weather-btn[data-weather="snow"].active` 存在

- [ ] **Step 2: 人工查看截图**

逐张确认：粒子只透现在留白/玻璃区域；标题、段落、卡片文字清晰无遮挡；控件在导航右侧不挤压「联系我」。

---

### Task 4: 代码审查

- [ ] **Step 1: 运行 code-reviewer agent**

对 `ron567-home/index.html` 的 diff 与 `ron567-home/weather.js` 全量做审查，处理 CRITICAL/HIGH 问题。

---

## Self-Review 结果

- **规格覆盖：** 设计文档 §4 层级 → Task 1 CSS + Task 3 断言；§5 控件 → Task 1；§6 三种天气 → Task 2（涟漪已修订，见文首）；§7 性能 → Task 2（defer/off 不启动循环/visibility/DPR/reduced-motion）；§8 持久化 → Task 2 + Task 3 刷新断言。无缺口。
- **占位符：** 无 TBD/TODO；所有代码完整。
- **一致性：** `setMode/buildParticles/drawFrame/updateControls` 等符号在 Task 2 内定义且仅在该文件内使用；Task 1 的 `data-weather` 值（sun/rain/snow）与 Task 2 的 `MODES` 一致。
