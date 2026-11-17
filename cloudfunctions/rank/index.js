// 云函数 rank：排行榜提交与查询
// 部署前需在云开发控制台创建集合 rankings（权限：仅创建者可读写即可，
// 本云函数使用服务端身份读写，不受客户端权限限制）。
// 排名规则：maxLevel 倒序 → total(总通关时间) 升序 → time(本关用时) 升序。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COL = 'rankings';
const TOP_N = 20;

function ensureCollection() {
  return db.createCollection(COL).catch(function () { /* 已存在则忽略 */ });
}

// 判断 a 是否比 b 更靠前（同关数下先比总时间，再比单关时间）
function better(aLevel, aTotal, aTime, bLevel, bTotal, bTime) {
  if (aLevel !== bLevel) return aLevel > bLevel;
  if (aTotal !== bTotal) return aTotal < bTotal;
  return aTime < bTime;
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
      const nickname = String(event.nickname || '喵友').slice(0, 16);
      const res = await db.collection(COL).where({ openid: OPENID }).get();
      const doc = res.data[0];

      if (!doc) {
        await db.collection(COL).add({
          data: {
            openid: OPENID, nickname: nickname,
            maxLevel: level, total: total, time: time,
            updatedAt: Date.now(),
          },
        });
      } else {
        // 旧记录没有 total 字段时视为待迁移，直接用新数据覆盖
        const missingTotal = (typeof doc.total !== 'number' || doc.total <= 0);
        if (missingTotal || better(level, total, time, doc.maxLevel, doc.total || 0, doc.time || 0)) {
          await db.collection(COL).doc(doc._id).update({
            data: {
              nickname: nickname, maxLevel: level, total: total, time: time,
              updatedAt: Date.now(),
            },
          });
        }
      }
      return { ok: true };
    }

    if (action === 'top') {
      // 先按关数降序、总时间升序、单关时间升序取候选，再截前 N
      const res = await db.collection(COL)
        .orderBy('maxLevel', 'desc')
        .orderBy('total', 'asc')
        .orderBy('time', 'asc')
        .limit(1000)
        .get();
      const rows = res.data;
      const top = rows.slice(0, TOP_N).map(function (r, i) {
        return {
          rank: i + 1,
          nickname: r.nickname,
          maxLevel: r.maxLevel,
          total: r.total || 0,
          time: r.time || 0,
          isMe: r.openid === OPENID,
        };
      });
      let me = null;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].openid === OPENID) {
          me = {
            rank: i + 1, nickname: rows[i].nickname, maxLevel: rows[i].maxLevel,
            total: rows[i].total || 0, time: rows[i].time || 0,
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
