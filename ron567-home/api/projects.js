/* GET /api/projects[?featured=1] —— 与本地 server.js 同构的接口 */
'use strict';

const { fetchProjects, sendJson } = require('./_lib');

module.exports = async (req, res) => {
  try {
    let list = await fetchProjects();
    if (req.query && req.query.featured === '1') {
      list = list.filter((p) => p.is_featured);
    }
    sendJson(res, 200, list, 1800); // CDN 缓存 30 分钟
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
};
