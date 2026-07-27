/* GET /api/posts —— 与本地 server.js 同构的接口 */
'use strict';

const { fetchPosts, sendJson } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const list = await fetchPosts();
    sendJson(res, 200, list, 1800); // CDN 缓存 30 分钟
  } catch (e) {
    sendJson(res, 502, { error: e.message });
  }
};
