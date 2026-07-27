/* POST /api/sync —— 手动同步：无服务器架构下数据本就实时回源，
 * 这里强制拉取一次最新数据并返回结果，语义与本地版保持一致。
 * GET /api/sync/status 由 vercel.json 重写到 ?status=1。
 */
'use strict';

const { fetchProjects, fetchPosts, sendJson } = require('./_lib');

module.exports = async (req, res) => {
  const isStatus = req.query && req.query.status === '1';
  try {
    const [projects, posts] = await Promise.all([fetchProjects(), fetchPosts()]);
    const now = new Date().toISOString();
    if (isStatus) {
      return sendJson(res, 200, {
        syncing: false,
        latest: [
          { source: 'github', status: 'success', items_synced: projects.length, finished_at: now },
          { source: 'blog', status: 'success', items_synced: posts.length, finished_at: now }
        ],
        recent: []
      });
    }
    sendJson(res, 200, [
      { source: 'github', status: 'success', items: projects.length },
      { source: 'blog', status: 'success', items: posts.length }
    ]);
  } catch (e) {
    sendJson(res, 502, isStatus ? { syncing: false, latest: [], error: e.message } : { error: e.message });
  }
};
