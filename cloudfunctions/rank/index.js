// 云函数 rank：排行榜提交与查询
// 部署前需在云开发控制台创建集合 rankings（权限：仅创建者可读写即可，
// 本云函数使用服务端身份读写，不受客户端权限限制）。
// 排名规则：score(累计得分) 降序 → maxLevel 降序 → total 升序 → time 升序。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COL = 'rankings';
const TOP_N = 20;

function ensureCollection() {
  return db.createCollection(COL).catch(function () { /* 已存在则忽略 */ });
}

function num(v) { const n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }

// 判断 a 是否比 b 更靠前：得分高者先，其次关数高、总用时短、单关用时短
function better(a, b) {
  const as = num(a.score), bs = num(b.score);
  if (as !== bs) return as > bs;
  const al = num(a.maxLevel), bl = num(b.maxLevel);
  if (al !== bl) return al > bl;
  const at = num(a.total), bt = num(b.total);
  if (at !== bt) return at < bt;
  return num(a.time) < num(b.time);
}

function sortRows(rows) {
  return rows.slice().sort(function (a, b) { return better(a, b) ? -1 : (better(b, a) ? 1 : 0); });
}

exports.main = async function (event) {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  try {
    await ensureCollection();

    if (action === 'submit') {
      const level = Math.max(1, Math.min(60, Math.floor(Number(event.level) || 1)));
      const total = Math.max(0, Math.floor(Number(event.total) || 0));
      const time = Math.max(0, Math.floor(Number(event.time) || 0));
      const score = num(event.score);
      const lastScore = num(event.lastScore);
      const nickname = String(event.nickname || '喵友').slice(0, 16);
      const res = await db.collection(COL).where({ openid: OPENID }).get();
      const doc = res.data[0];

      if (!doc) {
        await db.collection(COL).add({
          data: {
            openid: OPENID, nickname: nickname,
            maxLevel: level, total: total, time: time, score: score, lastScore: lastScore,
            updatedAt: Date.now(),
          },
        });
      } else {
        const next = { maxLevel: level, total: total, time: time, score: score, lastScore: lastScore };
        // 旧记录缺 total/score 视为待迁移，直接用新数据覆盖
        const legacy = (typeof doc.total !== 'number' || doc.total <= 0)
          || (typeof doc.score !== 'number');
        if (legacy || better(next, doc)) {
          await db.collection(COL).doc(doc._id).update({
            data: {
              nickname: nickname, maxLevel: level, total: total, time: time, score: score, lastScore: lastScore,
              updatedAt: Date.now(),
            },
          });
        }
      }
      return { ok: true };
    }

    if (action === 'top') {
      // 取候选后在内存按得分排序，兼容没有 score 字段的旧记录
      const res = await db.collection(COL).limit(1000).get();
      const rows = sortRows(res.data);
      const top = rows.slice(0, TOP_N).map(function (r, i) {
        return {
          rank: i + 1,
          nickname: r.nickname,
          maxLevel: r.maxLevel || 0,
          score: num(r.score),
          lastScore: num(r.lastScore),
          total: num(r.total),
          time: num(r.time),
          isMe: r.openid === OPENID,
        };
      });
      let me = null;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].openid === OPENID) {
          me = {
            rank: i + 1, nickname: rows[i].nickname, maxLevel: rows[i].maxLevel || 0,
            score: num(rows[i].score), lastScore: num(rows[i].lastScore),
            total: num(rows[i].total), time: num(rows[i].time),
          };
          break;
        }
      }
      return { ok: true, top: top, me: me };
    }

    return { ok: false, error: 'unknown-action' };
  } catch (err) {
    return { ok: false, error: String(err && err.errMsg || err) };
  }
};
