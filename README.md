# Ron567 · 个人主页

[English](./README.en.md) | 简体中文

深绿玻璃拟态风格的个人主页，自动聚合展示我的 GitHub 开源项目与 Halo 博客文章。

**在线访问**：https://www.ron567.top

## ✨ 功能特性

- **GitHub 项目展示** — 自动抓取 [@ReganQing](https://github.com/ReganQing) 的非 fork 原创仓库，按代表性评分筛选出精选项目（语言、星数、描述、更新时间）
- **博客文章聚合** — 通过 Halo 公开内容 API 拉取 [技术博客](https://blog.ron567.top/) 的文章列表（标题、摘要、分类、标签、发布日期）
- **数据同步机制** — 服务端每 30 分钟自动同步，页面提供手动「↻ 同步」按钮
- **动态天气背景** — Canvas 粒子系统实现晴 / 雨 / 雪三种可切换的背景效果
- **1440px 等比缩放画布** — 保留设计稿布局，按视口宽度等比缩放

## 🗂 项目结构

```
ron567-home/
├── index.html          # 主页（内联样式，1440px 设计画布）
├── weather.js          # 天气背景粒子系统
├── site-data.js        # 前端动态渲染（项目卡片 / 文章列表 / 同步按钮）
├── api/                # Vercel Serverless Functions（线上环境）
│   ├── _lib.js         # 共享逻辑：抓取 GitHub / Halo 数据 + 评分筛选
│   ├── projects.js     # GET /api/projects
│   ├── posts.js        # GET /api/posts
│   └── sync.js         # POST /api/sync 与同步状态查询
├── server/             # 本地开发服务（Node 原生，零第三方依赖）
│   ├── db.js           # SQLite 数据层（node:sqlite，Node 22+ 内置）
│   ├── sync.js         # 同步任务：GitHub API + Halo API → SQLite
│   └── server.js       # HTTP 服务：静态托管 + CRUD API + 定时同步
└── vercel.json         # Vercel 部署配置
```

## 🚀 本地运行

要求：**Node.js ≥ 22.13**（使用内置 `node:sqlite`，无需安装任何依赖）

```bash
cd ron567-home
npm start          # 启动服务 http://localhost:3567（启动时自动同步一次）
npm run sync       # 仅手动执行一次数据同步
```

## 🔌 API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects?featured=1` | 精选 GitHub 项目列表 |
| GET | `/api/posts` | 博客文章列表 |
| POST | `/api/sync` | 手动触发同步（可选 `?source=github\|blog`） |
| GET | `/api/sync/status` | 最近同步状态 |

本地环境（`server/`）额外提供项目 / 文章的完整 CRUD 接口（POST / PUT / PATCH / DELETE）。

## ☁️ 部署

线上部署于 Vercel：`api/` 目录即无服务器函数，数据实时拉取并通过 CDN 缓存 30 分钟（`s-maxage=1800`），无需数据库。

```bash
cd ron567-home
vercel --prod --yes
```

## 📄 License

个人项目，供学习参考。
