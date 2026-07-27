# Ron567 · Personal Homepage

English | [简体中文](./README.md)

A personal homepage in a dark-green glassmorphism style that automatically aggregates and showcases my GitHub open-source projects and Halo blog posts.

**Live site**: https://ron567-home.vercel.app

## ✨ Features

- **GitHub project showcase** — Automatically fetches non-fork original repositories from [@ReganQing](https://github.com/ReganQing), scored and filtered for the most representative ones (language, stars, description, last update)
- **Blog post aggregation** — Pulls the article list (title, excerpt, categories, tags, publish date) from my [tech blog](http://114.55.211.108:8090/) via the Halo public content API
- **Data sync mechanism** — Server syncs automatically every 30 minutes, with a manual "↻ Sync" button on the page
- **Dynamic weather background** — Canvas particle system with switchable sun / rain / snow effects
- **1440px proportional canvas** — Preserves the design layout, scaled proportionally to the viewport width

## 🗂 Project Structure

```
ron567-home/
├── index.html          # Homepage (inline styles, 1440px design canvas)
├── weather.js          # Weather background particle system
├── site-data.js        # Frontend dynamic rendering (project cards / post list / sync button)
├── api/                # Vercel Serverless Functions (production)
│   ├── _lib.js         # Shared logic: fetch GitHub / Halo data + scoring filter
│   ├── projects.js     # GET /api/projects
│   ├── posts.js        # GET /api/posts
│   └── sync.js         # POST /api/sync and sync status query
├── server/             # Local dev server (vanilla Node, zero third-party dependencies)
│   ├── db.js           # SQLite data layer (node:sqlite, built into Node 22+)
│   ├── sync.js         # Sync task: GitHub API + Halo API → SQLite
│   └── server.js       # HTTP server: static hosting + CRUD API + scheduled sync
└── vercel.json         # Vercel deployment config
```

## 🚀 Run Locally

Requirement: **Node.js ≥ 22.13** (uses the built-in `node:sqlite`, no dependencies to install)

```bash
cd ron567-home
npm start          # Start the server at http://localhost:3567 (syncs once on startup)
npm run sync       # Run a one-off data sync only
```

## 🔌 API Overview

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects?featured=1` | Featured GitHub project list |
| GET | `/api/posts` | Blog post list |
| POST | `/api/sync` | Trigger a manual sync (optional `?source=github\|blog`) |
| GET | `/api/sync/status` | Latest sync status |

The local environment (`server/`) additionally provides full CRUD endpoints (POST / PUT / PATCH / DELETE) for projects and posts.

## ☁️ Deployment

Deployed on Vercel: the `api/` directory maps to serverless functions. Data is fetched in real time and cached on the CDN for 30 minutes (`s-maxage=1800`) — no database required.

```bash
cd ron567-home
vercel --prod --yes
```

## 📄 License

Personal project, for learning and reference.
