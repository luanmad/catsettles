// 微信小游戏开放数据域（子域）：唯一能读取好友真实昵称/头像的地方。
// 子域 canvas 由主域设置物理尺寸，子域按逻辑坐标持续绘制，主域每帧把它贴到面板上。

const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

const KEY = 'cat_rank_v1'; // 与主域上报的 key 一致

let view = { w: 0, h: 0, scale: 1 };
let dpr = 1;
let rows = [];
let status = 'idle'; // idle | loading | ready | error
let avatarImgs = {};
let scrollY = 0;

const C = {
  card: '#ffffff',
  text: '#3d4667',
  subText: '#8a94b3',
  lightBg: '#eef2f7',
  coral: '#f4756b',
  orange: '#ff8a3d',
  greenDeep: '#2f8c78',
  toolActive: '#bfe8dc',
};

// 解析托管数据 value：{score, level, total, time}
function parseKV(kvList) {
  for (let i = 0; i < kvList.length; i++) {
    if (kvList[i].key === KEY) {
      try {
        const v = JSON.parse(kvList[i].value);
        return {
          score: Math.max(0, Math.floor(v.score || 0)),
          lastScore: Math.max(0, Math.floor(v.lastScore || 0)),
          level: v.level || 1,
          // 兼容旧数据：没有 total 时用 time 兜底
          total: (typeof v.total === 'number' ? v.total : (v.time || 0)),
          time: v.time || 0,
        };
      } catch (e) { return null; }
    }
  }
  return null;
}

function fetchFriends() {
  status = 'loading';
  try {
    wx.getFriendCloudStorage({
      keyList: [KEY],
      success: function (res) {
        const list = [];
        (res.data || []).forEach(function (u) {
          const k = parseKV(u.KVDataList || []);
          if (!k) return;
          list.push({
            avatarUrl: u.avatarUrl,
            nickname: u.nickname || '微信用户',
            score: k.score,
            lastScore: k.lastScore,
            level: k.level,
            total: k.total,
            time: k.time,
            isMe: !!u.isMe,
          });
          loadAvatar(u.avatarUrl);
        });
        // 排序：得分降序 → 关数降序 → 总时间升序 → 单关时间升序
        list.sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          if (b.level !== a.level) return b.level - a.level;
          if (b.total !== a.total) return a.total - b.total;
          return a.time - b.time;
        });
        rows = list;
        status = 'ready';
      },
      fail: function () {
        rows = [];
        status = 'error';
      },
    });
  } catch (e) {
    rows = [];
    status = 'error';
  }
}

function loadAvatar(url) {
  if (!url || avatarImgs[url] !== undefined) return;
  try {
    const img = wx.createImage();
    avatarImgs[url] = img;
    img.onload = function () { avatarImgs[url] = img; };
    img.onerror = function () { avatarImgs[url] = null; };
    img.src = url;
  } catch (e) {
    avatarImgs[url] = null;
  }
}

function draw() {
  const w = view.w, h = view.h;
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, w, h);

  if (status === 'loading') {
    fillText('正在获取好友榜…', w / 2, h / 2, 26, C.subText, 'center');
    return;
  }
  if (status === 'error') {
    fillText('好友排行榜暂不可用', w / 2, h / 2 - 16, 26, C.subText, 'center');
    fillText('请确认已开通小游戏关系链数据能力', w / 2, h / 2 + 24, 20, C.subText, 'center');
    return;
  }
  if (!rows.length) {
    fillText('还没有好友上榜', w / 2, h / 2 - 40, 26, C.subText, 'center');
    fillText('通关后成绩会出现在这里', w / 2, h / 2, 22, C.subText, 'center');
    fillText('分享给好友一起玩吧', w / 2, h / 2 + 40, 22, C.subText, 'center');
    return;
  }

  // 表头：总分 / 本关 / 关数
  const headY = 26;
  fillText('总分', w - 210, headY, 18, C.subText, 'left');
  fillText('本关', w - 110, headY, 18, C.subText, 'left');
  fillText('关数', w - 20, headY, 18, C.subText, 'right');

  const rowH = 88;
  const top = 48;
  const clipH = h - top - 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, clipH);
  ctx.clip();

  const maxScroll = Math.max(0, rows.length * rowH - clipH);
  if (scrollY > maxScroll) scrollY = maxScroll;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = top + i * rowH - scrollY;
    if (y + rowH < top || y > top + clipH) continue;

    const medal = i < 3 ? [
      { row: '#fff4d6', badge: '#f5b942', label: '冠' },
      { row: '#eef1f6', badge: '#b7c2d6', label: '亚' },
      { row: '#fbeee2', badge: '#d98a56', label: '季' },
    ][i] : null;
    if (medal) fillRoundRect(8, y + 2, w - 16, rowH - 6, 14, medal.row);
    else if (r.isMe) fillRoundRect(8, y + 2, w - 16, rowH - 6, 14, C.toolActive);

    // 名次：前三名用金银铜徽章（外白圈 + 奖牌色）
    if (medal) {
      fillCircle(48, y + rowH / 2, 24, '#ffffff');
      fillCircle(48, y + rowH / 2, 21, medal.badge);
      fillText(String(i + 1), 48, y + rowH / 2 + 1, 22, '#ffffff', 'center', 'bold');
    } else {
      fillText(String(i + 1), 48, y + rowH / 2, 24, C.subText, 'center');
    }

    // 头像（圆形裁剪）
    const ax = 92, ay = y + rowH / 2, ar = 24;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const img = avatarImgs[r.avatarUrl];
    if (img) {
      try { ctx.drawImage(img, ax - ar, ay - ar, ar * 2, ar * 2); }
      catch (e) { drawDefaultAvatar(ax, ay, ar); }
    } else {
      drawDefaultAvatar(ax, ay, ar);
    }
    ctx.restore();

    // 昵称（微信真实昵称）
    fillText(r.nickname, 128, y + rowH / 2, 24, C.text, 'left');
    if (medal) {
      const nw = ctx.measureText(r.nickname).width;
      const lx = Math.min(128 + nw + 10, w - 300);
      fillText(medal.label, lx, y + rowH / 2, 18, medal.badge, 'left', 'bold');
    }
    // 总分 / 本关得分 / 关数，数值过长时缩小字号避免遮挡
    function fitFilled(str, size, maxW) {
      const tw = ctx.measureText(str).width;
      return tw > maxW ? Math.max(13, Math.floor(size * maxW / tw)) : size;
    }
    const totalStr = String(r.score || 0), lastStr = String(r.lastScore || 0);
    fillText(totalStr, w - 210, y + rowH / 2, fitFilled(totalStr, 24, 85), C.orange || '#ff8a3d', 'left', 'bold');
    fillText(lastStr, w - 110, y + rowH / 2, fitFilled(lastStr, 24, 85), C.subText, 'left');
    fillText(String(r.level), w - 20, y + rowH / 2, 22, C.text, 'right');
  }
  ctx.restore();
}

function drawDefaultAvatar(ax, ay, ar) {
  ctx.fillStyle = C.lightBg;
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.text;
  ctx.beginPath(); ctx.arc(ax, ay, ar * 0.5, 0, Math.PI * 2); ctx.fill();
}

/* ---------- 绘制工具 ---------- */
function fillText(str, x, y, size, color, align, weight) {
  ctx.font = (weight ? weight + ' ' : '') + size + 'px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(str), x, y);
}
function fillRoundRect(x, y, w, h, r, color) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
  ctx.fill();
}
function fillCircle(cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}
function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
}

/* ---------- 通信 ---------- */
wx.onMessage(function (data) {
  if (!data || !data.action) return;
  if (data.action === 'show') {
    view = data.view || view;
    dpr = data.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scrollY = 0;
    fetchFriends();
  } else if (data.action === 'scroll') {
    scrollY += (data.dy || 0);
    if (scrollY < 0) scrollY = 0;
  } else if (data.action === 'hide') {
    status = 'idle';
    rows = [];
  }
});

// 每帧持续绘制，头像异步加载完成后自动更新（不依赖状态变化触发）
function loop() {
  if (status !== 'idle') {
    try { draw(); } catch (e) { /* 绘制异常不中断循环 */ }
  }
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
  else setTimeout(loop, 16);
}
loop();
