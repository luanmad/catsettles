// 小游戏运行环境模拟测试：mock wx API，直接驱动渲染与交互，确保无运行时异常。
const path = require('path');

const listeners = { touchstart: [], touchmove: [], touchend: [], onHide: [], onShow: [] };
const storage = {};
const drawnTexts = [];

function ctxMock() {
  const noop = function () {};
  return {
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arcTo: noop, closePath: noop, fill: noop, stroke: noop, fillRect: noop,
    fillText: function (s, x, y) { drawnTexts.push({ s: String(s), x: x, y: y }); },
    arc: noop, bezierCurveTo: noop, quadraticCurveTo: noop, ellipse: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, rect: noop, clip: noop,
    measureText: function (s) { return { width: String(s).length * 12 }; },
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {},
    set textAlign(v) {}, set textBaseline(v) {}, set shadowColor(v) {}, set shadowBlur(v) {},
    set globalAlpha(v) {}, set lineCap(v) {}, set lineJoin(v) {},
  };
}

global.wx = {
  getWindowInfo: function () { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }; },
  getSystemInfoSync: function () { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }; },
  createCanvas: function () { return { width: 750, height: 1334, getContext: function () { return ctxMock(); } }; },
  createInnerAudioContext: function () { return { stop: function () {}, play: function () {}, seek: function () {}, set src(v) {}, set volume(v) {}, set obeyMuteSwitch(v) {}, onError: function () {} }; },
  getStorageSync: function (k) { return storage[k]; },
  setStorageSync: function (k, v) { storage[k] = v; },
  getOpenDataContext: function () {
    if (!global.__odc) {
      global.__odc = {
        canvas: { width: 300, height: 150, getContext: function () { return ctxMock(); } },
        messages: [],
        postMessage: function (m) { global.__odc.messages.push(m); },
      };
    }
    return global.__odc;
  },
  setUserCloudStorage: function (o) { (global.__cloudReports || (global.__cloudReports = [])).push(o); if (o.success) o.success(); },
  shareAppMessage: function (o) { (global.__shares || (global.__shares = [])).push(o); },
  showShareMenu: function () { global.__showShareMenuCalled = true; },
  onShareAppMessage: function (cb) { global.__shareCb = cb; },
  onTouchStart: function (cb) { listeners.touchstart.push(cb); },
  onTouchMove: function (cb) { listeners.touchmove.push(cb); },
  onTouchEnd: function (cb) { listeners.touchend.push(cb); },
  onHide: function (cb) { listeners.onHide.push(cb); },
  onShow: function (cb) { listeners.onShow.push(cb); },
  vibrateShort: function () {},
  requestAnimationFrame: function () { /* 不排队，避免模拟环境无限循环 */ },
  cloud: null,
};
global.requestAnimationFrame = global.wx.requestAnimationFrame;

storage.catwhere_save_v2 = { healthNoticed: true }; // 默认跳过健康忠告页，忠告页单独测试
const Game = require(path.join(__dirname, '..', 'js', 'game.js'));
const canvas = wx.createCanvas();
const g = new Game(canvas);

function tap(lx, ly) {
  const x = lx * g.r.scale, y = ly * g.r.scale;
  listeners.touchstart.forEach(function (cb) { cb({ touches: [{ clientX: x, clientY: y }] }); });
  listeners.touchend.forEach(function (cb) { cb({ changedTouches: [{ clientX: x, clientY: y }] }); });
}

function cellCenter(idx) {
  const areas = g.r.hitAreas;
  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    if (a.data && a.data.longPress && a.data.idx === idx) {
      return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    }
  }
  throw new Error('未找到格子命中区域 idx=' + idx);
}

// 模拟手指按住首格，依次划过后续格子后松开
function dragCells(idxs) {
  const s = g.r.scale;
  const first = cellCenter(idxs[0]);
  listeners.touchstart.forEach(function (cb) { cb({ touches: [{ clientX: first.x * s, clientY: first.y * s }] }); });
  for (let i = 1; i < idxs.length; i++) {
    const c = cellCenter(idxs[i]);
    listeners.touchmove.forEach(function (cb) { cb({ touches: [{ clientX: c.x * s, clientY: c.y * s }] }); });
  }
  const last = cellCenter(idxs[idxs.length - 1]);
  listeners.touchend.forEach(function (cb) { cb({ changedTouches: [{ clientX: last.x * s, clientY: last.y * s }] }); });
}

let pass = 0, total = 0;
function check(name, fn) {
  total++;
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message || e)); process.exitCode = 1; }
}

console.log('小游戏运行模拟：');
check('启动页：健康游戏忠告八句文案与进入按钮', function () {
  g.showHealthNotice = true;
  drawnTexts.length = 0;
  g.render(); // 忠告页显示时不应计算棋盘布局
  const joined = drawnTexts.map(function (t) { return t.s; }).join('|');
  const lines = ['抵制不良游戏，拒绝盗版游戏。', '注意自我保护，谨防受骗上当。',
    '适度游戏益脑，沉迷游戏伤身。', '合理安排时间，享受健康生活。'];
  if (joined.indexOf('健康游戏忠告') < 0) throw new Error('缺少标题');
  lines.forEach(function (line) {
    if (joined.indexOf(line) < 0) throw new Error('缺少忠告文案: ' + line);
  });
  if (!drawnTexts.some(function (t) { return t.s === '我已阅读并同意'; })) throw new Error('缺少进入按钮');
  // 点击按钮进入游戏，状态落盘不再重复显示
  const btn = g.r.hitAreas.find(function (a) { return a.data && typeof a.data.onTap === 'function'; });
  if (!btn) throw new Error('进入按钮未注册命中区');
  btn.data.onTap();
  if (g.showHealthNotice) throw new Error('点击后未关闭忠告页');
  if (storage.catwhere_save_v2.healthNotified !== false && storage.catwhere_save_v2.healthNoticed !== true) {
    throw new Error('未写入已确认状态');
  }
  g.showHealthNotice = false;
});
check('初始化布局与首帧渲染', function () {
  g.render();
  if (!g.layout) throw new Error('layout 未计算');
  if (g.size !== 4 || g.level !== 1) throw new Error('初始关卡错误');
});
check('绘制各浮层无异常', function () {
  g.overlay = 'levels'; g.render();
  g.overlay = 'rank'; g.render();
  g.overlay = 'win'; g.render();
  g.overlay = null; g.render();
  g.dialog = { title: '玩法说明', content: '每行每列各一只小猫，不能相邻哦'.repeat(6), showCancel: false, confirm: '知道了' };
  g.render(); g.dialog = null;
  g.openSettings(); g.render(); g.settings = null;
});
check('放猫与撤销', function () {
  g.loadLevel(1);
  const before = g.catsPlaced;
  g.onCellTap(0); g.render();
  if (g.catsPlaced !== before + 1) throw new Error('放猫后计数未增加: ' + g.catsPlaced);
  g.onUndo(); g.render();
  if (g.catsPlaced !== before) throw new Error('撤销未恢复计数');
});
check('提示与清除', function () {
  g.onHint(); g.render();
  g.onClear(); g.render();
  if (g.catsPlaced !== 0) throw new Error('清除后仍有猫');
});
check('通关流程', function () {
  const puzzle = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  g.loadLevel(1);
  const n = g.size;
  // 用求解器基于当前 region 求一个完整解
  const res = puzzle.countSolutions(n, g.region, 1);
  if (!res.count) throw new Error('谜题无解（测试数据异常）');
  const cols = res.solutions[0];
  for (let r = 0; r < n; r++) {
    const idx = r * n + cols[r];
    if (g.cells[idx].state !== 'cat') g.onCellTap(idx);
  }
  g.render();
  if (!g.won) throw new Error('按求解器解摆放后未通关, catsPlaced=' + g.catsPlaced + '/' + n);
  // 验证通关时上报了微信托管数据
  const reports = global.__cloudReports || [];
  if (!reports.length) throw new Error('通关后未调用 setUserCloudStorage');
  const kv = reports[reports.length - 1].KVDataList[0];
  if (kv.key !== 'cat_rank_v1') throw new Error('上报 key 错误: ' + kv.key);
  const parsed = JSON.parse(kv.value);
  if (parsed.level !== 1 || typeof parsed.time !== 'number' || typeof parsed.total !== 'number') {
    throw new Error('上报数据格式错误（应含 level/total/time）: ' + kv.value);
  }
  // 验证结算页 4 项时间统计齐全
  if (!g.winStats) throw new Error('未生成 winStats');
  ['single', 'total', 'bestSingle', 'bestTotal'].forEach(function (k) {
    if (typeof g.winStats[k] !== 'number') throw new Error('winStats 缺少 ' + k);
  });
  g.overlay = 'win'; g.render();
  g.onNextLevel(); g.render();
  if (g.level !== 2 || g.won) throw new Error('下一关未正确加载');
});
check('换关后本关计时归零（不延续上一关）', function () {
  g.seconds = 250; // 模拟上一关累计了几分钟
  g.loadLevel(3);
  if (g.seconds !== 0) throw new Error('换关后计时未归零: ' + g.seconds);
  if (g.timerBase !== 0) throw new Error('计时基准未归零: ' + g.timerBase);
});
check('邀请好友分享', function () {
  g.inviteFriend();
  const shares = global.__shares || [];
  if (!shares.length) throw new Error('未调用 wx.shareAppMessage');
  const s = shares[shares.length - 1];
  if (!s.query || s.query.indexOf('from=invite') < 0) throw new Error('分享 query 缺少来源参数: ' + s.query);
});
check('被动转发与分享菜单已配置', function () {
  if (!global.__showShareMenuCalled) throw new Error('未调用 showShareMenu');
  if (typeof global.__shareCb !== 'function') throw new Error('未注册 onShareAppMessage');
  const info = global.__shareCb();
  if (!info.title || info.title.indexOf('猫猫请落座') < 0) throw new Error('转发标题错误');
  if (!info.query || info.query.indexOf('from=invite') < 0) throw new Error('转发 query 错误');
});
check('好友排行榜：打开面板通知子域、关闭清理', function () {
  if (!g.openDataContext) throw new Error('未获取开放数据域');
  const before = global.__odc.messages.length;
  g.overlay = 'friendRank';
  g.friendRankActive = false;
  g.render(); // 首次渲染应发 show
  const msgs = global.__odc.messages;
  const showMsg = msgs.slice(before).find(function (m) { return m.action === 'show'; });
  if (!showMsg) throw new Error('打开好友榜未发送 show 消息');
  if (!showMsg.view || showMsg.view.w <= 0 || showMsg.view.h <= 0) throw new Error('show 消息缺少视图尺寸');
  g.closeOverlay();
  const hideMsg = global.__odc.messages.find(function (m) { return m.action === 'hide'; });
  if (!hideMsg) throw new Error('关闭好友榜未发送 hide 消息');
  if (g.friendRankActive) throw new Error('关闭后 friendRankActive 未重置');
  if (g.overlay !== null) throw new Error('关闭后 overlay 未置空');
});
check('触摸坐标命中棋盘格', function () {
  g.loadLevel(1); g.render();
  const b = g.layout;
  tap(b.boardX + 8 + b.cellSize / 2, b.boardY + 8 + b.cellSize / 2);
  g.render();
});
check('标记模式：拖动划过多个格子批量标记 X，只记一步历史', function () {
  g.loadLevel(1); g.render();
  g.markMode = true;
  const idxs = [0, 1, 2];
  const histBefore = g.history.length;
  dragCells(idxs);
  idxs.forEach(function (idx) {
    if (g.cells[idx].state !== 'ban') throw new Error('格子 ' + idx + ' 未被标记为 X: ' + g.cells[idx].state);
  });
  if (g.history.length !== histBefore + 1) throw new Error('一次拖拽应只产生一条历史，实际 +' + (g.history.length - histBefore));
  g.markMode = false;
});
check('标记模式：从 X 起手拖动可批量清除', function () {
  g.loadLevel(1); g.render();
  g.markMode = true;
  const idxs = [0, 1, 2];
  dragCells(idxs);
  dragCells(idxs);
  idxs.forEach(function (idx) {
    if (g.cells[idx].state !== 'empty') throw new Error('格子 ' + idx + ' 未清除: ' + g.cells[idx].state);
  });
  g.markMode = false;
});
check('标记模式：单击只标记一次（拖拽会话抑制单格 tap）', function () {
  g.loadLevel(1); g.render();
  g.markMode = true;
  const histBefore = g.history.length;
  dragCells([0]);
  if (g.cells[0].state !== 'ban') throw new Error('单击未标记: ' + g.cells[0].state);
  if (g.history.length !== histBefore + 1) throw new Error('单击历史数异常: +' + (g.history.length - histBefore));
  g.markMode = false;
});
check('批量标记可一次撤销', function () {
  g.loadLevel(1); g.render();
  g.markMode = true;
  const idxs = [0, 1, 2, 3];
  dragCells(idxs);
  g.onUndo();
  idxs.forEach(function (idx) {
    if (g.cells[idx].state !== 'empty') throw new Error('撤销后格子 ' + idx + ' 未恢复: ' + g.cells[idx].state);
  });
  g.markMode = false;
});
check('普通模式：直接拖动即可批量标记 X（无需标记按钮或长按）', function () {
  g.loadLevel(1); g.render();
  g.markMode = false;
  const idxs = [0, 1, 2];
  const histBefore = g.history.length;
  dragCells(idxs);
  idxs.forEach(function (idx) {
    if (g.cells[idx].state !== 'ban') throw new Error('拖动未标记 idx=' + idx + ': ' + g.cells[idx].state);
  });
  if (g.history.length !== histBefore + 1) throw new Error('一次拖拽应只产生一条历史，实际 +' + (g.history.length - histBefore));
});
check('普通模式：单击仍放猫（拖动阈值不影响单击）', function () {
  g.loadLevel(1); g.render();
  g.markMode = false;
  dragCells([0]);
  if (g.cells[0].state !== 'cat') throw new Error('单击未放猫: ' + g.cells[0].state);
  if (g.catsPlaced !== 1) throw new Error('放猫计数错误: ' + g.catsPlaced);
});
check('排行榜：我的排名并入用时表头行、前三名有冠亚季标识', function () {
  g.rankReady = true;
  g.meInfo = { rank: 1 };
  g.rankList = [
    { rank: 1, nickname: '喵友2869', maxLevel: 10, totalText: '07:58', timeText: '01:05', isMe: true },
    { rank: 2, nickname: '小猫', maxLevel: 10, totalText: '08:10', timeText: '01:12', isMe: false },
    { rank: 3, nickname: '喵星人', maxLevel: 9, totalText: '09:00', timeText: '01:30', isMe: false },
    { rank: 4, nickname: '路人', maxLevel: 8, totalText: '10:00', timeText: '02:00', isMe: false },
  ];
  drawnTexts.length = 0;
  g.overlay = 'rank'; g.render();
  g.closeOverlay();
  const me = drawnTexts.find(function (t) { return t.s.indexOf('我的排名：') === 0; });
  const head = drawnTexts.find(function (t) { return t.s === '总用时'; });
  if (!me) throw new Error('未绘制我的排名');
  if (!head) throw new Error('未绘制用时表头');
  if (Math.abs(me.y - head.y) > 0.5) throw new Error('我的排名未与用时表头同一行: ' + me.y + ' vs ' + head.y);
  ['冠', '亚', '季'].forEach(function (label) {
    if (!drawnTexts.some(function (t) { return t.s === label; })) throw new Error('缺少前三名标识: ' + label);
  });
});
check('浮层关闭按钮避开右上角微信胶囊区', function () {
  g.overlay = 'rank';
  drawnTexts.length = 0;
  g.render();
  g.closeOverlay();
  const close = drawnTexts.find(function (t) { return t.s === '✕'; });
  if (!close) throw new Error('未绘制关闭按钮');
  // 微信胶囊约占据画布右侧 190 逻辑px，关闭按钮须落在其左侧，避免误触退出小程序
  if (close.x > g.r.DW - 190) throw new Error('关闭按钮过于靠近胶囊: x=' + close.x + ', 上限=' + (g.r.DW - 190));
});

g.stopTimer();
console.log('\n通过：' + pass + ' / ' + total);
