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
  getLaunchOptionsSync: function () { return global.__launchOptions || { query: {} }; },
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
check('难度曲线：尺寸递进到10x10、提示1次、生命2条、16关起评星', function () {
  const cases = [[1, 4], [3, 4], [4, 5], [12, 7], [13, 8], [15, 8], [16, 9], [30, 9], [31, 10], [60, 10]];
  cases.forEach(function (pair) {
    if (g.levelSize(pair[0]) !== pair[1]) {
      throw new Error('第' + pair[0] + '关尺寸应为' + pair[1] + '，实际' + g.levelSize(pair[0]));
    }
  });
  [1, 6, 13, 14, 21, 60].forEach(function (lv) {
    if (g.hintQuota(lv) !== 1) throw new Error('第' + lv + '关提示应为1次');
  });
  if (g.hearts.length !== 2) throw new Error('初始生命值应为2条');
  [1, 26, 60].forEach(function (lv) {
    g.loadLevel(lv);
    if (g.hearts.length !== 2 || g.hearts.some(function (v) { return !v; })) {
      throw new Error('第' + lv + '关生命值应为2条满血');
    }
    if (g.hintsLeft !== 1) throw new Error('第' + lv + '关提示应为1次');
  });
  const c15 = g.levelConfig(15), c16 = g.levelConfig(16);
  if (c15.starEnabled) throw new Error('15关不应启用星级');
  if (!c16.starEnabled) throw new Error('16关应启用星级');
  ['blocked', 'decoy', 'scent', 'forbidden'].forEach(function (k) {
    if (k in c16) throw new Error('关卡配置不应含禁放机制字段: ' + k);
  });
});
check('9x9关卡：颜色与符号覆盖全部9个区域，无越界', function () {
  g.loadLevel(16);
  if (g.size !== 9) throw new Error('第16关不是9x9');
  g.render();
  const colors = {}, symbols = {};
  for (let i = 0; i < g.cells.length; i++) {
    const cell = g.cells[i];
    if (!cell.color) throw new Error('区域颜色缺失: region=' + cell.region);
    if (cell.symbol === undefined || cell.symbol === null) throw new Error('区域符号越界: region=' + cell.region);
    colors[cell.region] = cell.color;
    symbols[cell.region] = cell.symbol;
  }
  if (Object.keys(colors).length !== 9) throw new Error('区域数不为9');
  const usedColors = {};
  for (const reg in colors) {
    if (usedColors[colors[reg]]) throw new Error('不同区域出现同色: ' + colors[reg]);
    usedColors[colors[reg]] = true;
  }
});
check('10x10关卡：谜题有解、10个区域颜色符号无越界无重复', function () {
  g.loadLevel(31);
  if (g.size !== 10) throw new Error('第31关不是10x10');
  g.render();
  const colors = {}, seen = {};
  for (let i = 0; i < g.cells.length; i++) {
    const cell = g.cells[i];
    if (!cell.color) throw new Error('区域颜色缺失: region=' + cell.region);
    if (cell.symbol === undefined || cell.symbol === null) throw new Error('区域符号越界: region=' + cell.region);
    colors[cell.region] = cell.color;
  }
  if (Object.keys(colors).length !== 10) throw new Error('区域数不为10');
  for (const reg in colors) {
    if (seen[colors[reg]]) throw new Error('不同区域出现同色: ' + colors[reg]);
    seen[colors[reg]] = true;
  }
});
check('棋盘无禁放格：所有格子初始可放、可标记、清除后全部还原', function () {
  g.loadLevel(26);
  const bad = g.cells.filter(function (c) {
    return c.state !== 'empty' || c.preset || c.color === '#5a6279';
  });
  if (bad.length) throw new Error('存在禁放/预置格: ' + bad.length);
  g.onCellTap(0);
  if (g.cells[0].state !== 'cat' || g.catsPlaced !== 1) throw new Error('普通格应可放猫');
  g.markMode = true;
  g.toggleBan(1);
  g.markMode = false;
  if (g.cells[1].state !== 'ban') throw new Error('普通格应可标记');
  g.onClear();
  if (g.cells[0].state !== 'empty' || g.cells[1].state !== 'empty' || g.catsPlaced !== 0) {
    throw new Error('清除后未全部还原');
  }
  g.render();
});
check('16-60关：纯棋盘均有解且无禁放状态', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  for (let lv = 16; lv <= 60; lv++) {
    g.loadLevel(lv);
    const bad = g.cells.filter(function (c) { return c.state !== 'empty'; }).length;
    if (bad) throw new Error('第' + lv + '关存在非空格子: ' + bad);
    const res = puzzleLib.countSolutions(g.size, g.region, 1);
    if (!res.count) throw new Error('第' + lv + '关无解');
  }
});
check('星级评定：16关起按用时评1-3星并存档', function () {
  g.loadLevel(16);
  const cfg = g.levelConfigCur;
  if (!cfg.starEnabled) throw new Error('16关星级未启用');
  // 快速用时得三星
  g.seconds = 0;
  g.winStats = null;
  g.finishLevel();
  if (!g.winStats || g.winStats.stars !== 3) throw new Error('快速通关应为3星，实际' + (g.winStats && g.winStats.stars));
  if (!g.bestStars || g.bestStars[16] !== 3) throw new Error('星级未存档');
  // 慢速用时得三星以外的低星（重新载入）
  g.loadLevel(16);
  g.seconds = cfg.star2 + 10;
  g.finishLevel();
  if (g.winStats.stars !== 1) throw new Error('超时通关应为1星，实际' + g.winStats.stars);
  if (g.bestStars[16] !== 3) throw new Error('最佳星级被低星覆盖');
  g.render();
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
  if (parsed.level !== 1 || typeof parsed.time !== 'number' || typeof parsed.total !== 'number' || typeof parsed.score !== 'number') {
    throw new Error('上报数据格式错误（应含 level/total/time/score）: ' + kv.value);
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
check('排行榜：我的排名与得分表头同一行、前三名有冠亚季标识', function () {
  g.rankReady = true;
  g.meInfo = { rank: 1 };
  g.rankList = [
    { rank: 1, nickname: '喵友2869', maxLevel: 10, score: 3200, lastScore: 480, totalText: '07:58', timeText: '01:05', isMe: true },
    { rank: 2, nickname: '小猫', maxLevel: 10, score: 3000, lastScore: 450, totalText: '08:10', timeText: '01:12', isMe: false },
    { rank: 3, nickname: '喵星人', maxLevel: 9, score: 2600, lastScore: 400, totalText: '09:00', timeText: '01:30', isMe: false },
    { rank: 4, nickname: '路人', maxLevel: 8, score: 2000, lastScore: 300, totalText: '10:00', timeText: '02:00', isMe: false },
  ];
  drawnTexts.length = 0;
  g.overlay = 'rank'; g.render();
  g.closeOverlay();
  const me = drawnTexts.find(function (t) { return t.s.indexOf('我的排名：') === 0; });
  const head = drawnTexts.find(function (t) { return t.s === '总得分'; });
  if (!me) throw new Error('未绘制我的排名');
  if (!head) throw new Error('未绘制总得分表头');
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

check('限制撤销：每关3次，超出后不再撤销', function () {
  g.loadLevel(1);
  if (g.undosLeft !== 3) throw new Error('初始撤销次数应为3');
  for (let i = 0; i < 3; i++) {
    g.onCellTap(0);
    g.onUndo();
  }
  if (g.undosLeft !== 0) throw new Error('3次撤销后应归零');
  g.onCellTap(0);
  const before = g.catsPlaced;
  g.onUndo();
  if (g.catsPlaced !== before) throw new Error('超额撤销仍生效');
  g.render();
});
check('反复点击同一格：连击不累积、取消扣撤销次数', function () {
  g.loadLevel(1);
  // 找一个合法格反复点击
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const res = puzzleLib.countSolutions(g.size, g.region, 1);
  const idx = res.solutions[0][0];
  let undos = g.undosLeft;
  for (let i = 0; i < 4; i++) {
    g.onCellTap(idx); // 放上
    if (g.combo !== 1) throw new Error('反复放同一格连击应为1，实际' + g.combo);
    if (i < 3) {
      g.onCellTap(idx); // 取消
      if (g.combo !== 0) throw new Error('取消后连击应清零，实际' + g.combo);
      undos--;
      if (g.undosLeft !== undos) throw new Error('取消应扣1次撤销');
    }
  }
  if (g.undosLeft !== 0) throw new Error('3次取消后撤销应归零');
  g.render();
});
check('撤销次数用完后不能取消已放的猫', function () {
  g.loadLevel(1);
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const res = puzzleLib.countSolutions(g.size, g.region, 1);
  const idx = res.solutions[0][0];
  g.undosLeft = 0;
  g.onCellTap(idx);
  if (g.cells[idx].state !== 'cat') throw new Error('应可正常放猫');
  g.onCellTap(idx);
  if (g.cells[idx].state !== 'cat') throw new Error('撤销用完后不应取消已放的猫');
});
check('区域高亮：按住格子高亮同区域，拖动/松手取消', function () {
  g.loadLevel(1);
  g.render();
  const idx = 0;
  const reg = g.cells[idx].region;
  const c = cellCenter(idx);
  const x = c.x * g.r.scale, y = c.y * g.r.scale;
  listeners.touchstart.forEach(function (cb) { cb({ touches: [{ clientX: x, clientY: y }] }); });
  if (g.highlightRegion !== reg) throw new Error('按住未高亮所在区域');
  listeners.touchend.forEach(function (cb) { cb({ changedTouches: [{ clientX: x, clientY: y }] }); });
  if (g.highlightRegion !== -1) throw new Error('松手后未取消高亮');
  // 拖动进入标记后取消高亮
  listeners.touchstart.forEach(function (cb) { cb({ touches: [{ clientX: x, clientY: y }] }); });
  const c2 = cellCenter(1);
  listeners.touchmove.forEach(function (cb) { cb({ touches: [{ clientX: c2.x * g.r.scale, clientY: c2.y * g.r.scale }] }); });
  if (g.highlightRegion !== -1) throw new Error('拖动后未取消高亮');
  listeners.touchend.forEach(function (cb) { cb({ changedTouches: [{ clientX: c2.x * g.r.scale, clientY: c2.y * g.r.scale }] }); });
});
check('多解法收集：不同摆法分别记录、重复不累加', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const LV = 16; // 9x9 多解关
  const SEED = 4242;
  g.loadLevel(LV, SEED);
  const n = g.size;
  const res = puzzleLib.countSolutions(n, g.region, 2);
  if (res.count < 2) throw new Error('测试关卡应有多解');
  function play(cols) {
    g.loadLevel(LV, SEED);
    for (let r = 0; r < n; r++) g.onCellTap(r * n + cols[r]);
  }
  play(res.solutions[0]);
  const first = g.foundSolutionCount(LV);
  if (first < 1) throw new Error('未记录首个解');
  play(res.solutions[1]);
  const second = g.foundSolutionCount(LV);
  if (second !== first + 1) throw new Error('新摆法未计数');
  play(res.solutions[1]);
  if (g.foundSolutionCount(LV) !== second) throw new Error('重复摆法不应累加');
  g.render();
});
check('关卡种子分享：随机种子码可还原同一棋盘', function () {
  g.loadLevel(26, 12345);
  const seed = g.currentSeed;
  if (seed !== 12345) throw new Error('指定种子未生效');
  g.inviteFriend();
  const shares = global.__shares || [];
  const s = shares[shares.length - 1];
  const m = s.query.match(/seed=([^&]+)/);
  if (!m) throw new Error('分享 query 缺少种子');
  const code = m[1];
  if (code.indexOf('-') < 0) throw new Error('种子码应包含随机种子部分: ' + code);
  // 按种子启动应跳到同一关、同一棋盘
  global.__launchOptions = { query: { from: 'invite', seed: code, level: '26' } };
  const g2 = new Game(wx.createCanvas());
  g2.stopTimer();
  if (g2.level !== 26) throw new Error('按种子启动未跳到第26关，实际' + g2.level);
  if (g2.currentSeed !== seed) throw new Error('按种子启动棋盘种子不一致');
  if (JSON.stringify(g2.region) !== JSON.stringify(g.region)) throw new Error('同一种子棋盘不同');
  global.__launchOptions = null;
});
check('随机棋盘：换一题生成不同种子与新棋盘', function () {
  g.loadLevel(20, 777);
  const seed1 = g.currentSeed, region1 = JSON.stringify(g.region);
  g.rerollLevel();
  if (g.currentSeed === seed1) throw new Error('换一题后种子未变');
  if (JSON.stringify(g.region) === region1) throw new Error('换一题后棋盘未变');
  if (g.levelSeeds[20] !== g.currentSeed) throw new Error('新种子未存档');
});
check('提示代价：用过提示最高2星', function () {
  g.loadLevel(16);
  g.seconds = 0;
  g.onHint();
  g.winStats = null;
  g.finishLevel();
  if (!g.winStats) throw new Error('未生成结算数据');
  if (g.winStats.usedHint !== true) throw new Error('未记录使用提示');
  if (g.winStats.stars !== 2) throw new Error('用提示应最高2星，实际' + g.winStats.stars);
});
check('无错连击：放错清零、完美通关记录', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  g.loadLevel(1);
  const res = puzzleLib.countSolutions(g.size, g.region, 1);
  const cols = res.solutions[0];
  g.onCellTap(cols[0]);
  g.onCellTap(g.size + cols[1]);
  if (g.combo !== 2) throw new Error('连续放对应累计连击，实际' + g.combo);
  g.onCellTap(cols[0] === 0 ? 1 : 0); // 与首只同行，必定冲突
  if (g.combo !== 0) throw new Error('放错后连击应清零');
  g.loadLevel(1);
  for (let r = 0; r < g.size; r++) g.onCellTap(r * g.size + cols[r]);
  if (!g.winStats) throw new Error('未生成结算数据');
  if (g.winStats.combo !== g.size) throw new Error('完美通关连击数错误');
  if (g.winStats.perfect !== true) throw new Error('应判定为完美通关');
  if (g.bestCombo < g.size || !g.perfectClears) throw new Error('连击/完美记录未存档');
});
check('猫咪图鉴：解锁条件、存档与面板渲染', function () {
  g.loadLevel(1);
  g.unlockedCats = [];
  g.bestTimes = { 5: 40, 10: 60, 15: 80, 20: 100, 25: 120, 30: 140, 35: 160, 45: 200, 60: 240 };
  g.bestStars = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 };
  g.bestCombo = 6;
  g.perfectClears = 1;
  const earned = g.checkCatUnlocks();
  if (!earned.length) throw new Error('应解锁猫咪');
  if (g.unlockedCats.length !== 12) throw new Error('应解锁全部12只，实际' + g.unlockedCats.length);
  g.overlay = 'gallery';
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s.indexOf('猫咪图鉴') >= 0; })) throw new Error('图鉴标题未绘制');
  if (!drawnTexts.some(function (t) { return t.s === '橘座'; })) throw new Error('已解锁猫咪名未绘制');
  g.closeOverlay();
});

check('得分机制：按难度/用时/连击/取消/生命计分，越高分越高', function () {
  g.loadLevel(10, 999);
  g.hearts = [1, 1]; g.undosLeft = 3;
  const full = g.calcScore(10, 10, 6, true, 3);
  g.hearts = [0, 1]; g.undosLeft = 1;
  const penalized = g.calcScore(10, 10, 6, true, 3);
  if (full <= penalized) throw new Error('取消/生命惩罚未降低得分');
  const slow = g.calcScore(10, 1000, 6, true, 3);
  const fast = g.calcScore(10, 10, 6, true, 3);
  if (fast <= slow) throw new Error('用时越短应得分越高');
  const lowCombo = g.calcScore(10, 10, 2, false, 1);
  if (fast <= lowCombo) throw new Error('连击/完美/星级应提高得分');
  const harder = g.calcScore(20, 10, 6, true, 3);
  if (harder <= fast) throw new Error('关卡难度应提高得分');
  if (g.calcScore(10, 99999, 0, false, 0) < 0) throw new Error('得分不应为负');
});
check('得分存档：通关记录本关最高分并累计', function () {
  g.bestScores = {}; g.totalScore = 0;
  g.loadLevel(1, 555);
  g.stopTimer(); g.seconds = 0; g.winStats = null;
  g.finishLevel();
  const first = g.winStats.score;
  if (!(first > 0) || g.bestScores[1] !== first) throw new Error('未记录本关得分');
  if (g.totalScore !== first) throw new Error('累计得分错误');
  // 更低分重玩不应降低最高分
  g.loadLevel(1, 555);
  g.stopTimer(); g.seconds = 500; g.winStats = null;
  g.finishLevel();
  if (g.bestScores[1] !== first || g.totalScore !== first) throw new Error('低分重玩不应降低最高分与累计分');
  g.render();
});

check('清除扣撤销次数：无次数时不能清除', function () {
  g.loadLevel(1, 333);
  g.onCellTap(0); // 放一只猫
  if (g.cells[0].state !== 'cat') throw new Error('未放上猫');
  const before = g.undosLeft;
  g.onClear();
  if (g.undosLeft !== before - 1) throw new Error('清除应扣1次撤销');
  if (g.cells[0].state !== 'empty' || g.catsPlaced !== 0) throw new Error('清除未生效');
  // 撤销耗尽后不能再清除
  g.loadLevel(1, 333);
  g.onCellTap(0);
  g.undosLeft = 0;
  g.onClear();
  if (g.cells[0].state !== 'cat') throw new Error('无撤销次数时不应清除');
});
check('主界面显示得分：图标+数值、无文字标签、大数字自适应', function () {
  g.loadLevel(1, 111);
  g.totalScore = 1234567; // 大数值，验证不被裁剪
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s === '1234567'; })) throw new Error('进度栏未显示累计得分');
  if (drawnTexts.some(function (t) { return t.s.indexOf('本关 ') === 0 || t.s.indexOf('总得分 ') === 0; })) {
    throw new Error('得分胶囊不应含文字标签');
  }
});

check('通关弹窗得分主视觉：显示本关得分与新高分徽章', function () {
  g.loadLevel(1, 909);
  g.stopTimer(); g.seconds = 0; g.winStats = null;
  g.finishLevel();
  g.overlay = 'win';
  drawnTexts.length = 0;
  g.render();
  g.closeOverlay();
  if (!drawnTexts.some(function (t) { return t.s === '本关得分'; })) throw new Error('未绘制得分主视觉标签');
  if (!drawnTexts.some(function (t) { return t.s === String(g.winStats.score); })) throw new Error('未绘制大号得分数值');
  const badge = drawnTexts.some(function (t) { return t.s === '新高分!'; });
  const fallback = drawnTexts.some(function (t) { return t.s.indexOf('最高 ') === 0; });
  if (!badge && !fallback) throw new Error('未绘制新高分徽章或最高分');
});
check('排行榜分数一致：一律显示云端真实分数，不做本地兜底', function () {
  g.loadLevel(12, 222);
  g.totalScore = 8888; // 本地分很高，但榜单不应据此改动显示
  g.bestScores = { 12: 640 };
  const list = g.buildRankList([
    { rank: 1, nickname: '我', maxLevel: 12, score: 1200, lastScore: 300, total: 100, time: 50, isMe: true },
    { rank: 2, nickname: '别人', maxLevel: 11, score: 7000, lastScore: 500, total: 200, time: 60, isMe: false },
  ]);
  // 本人也必须用云端分数，所有用户看到同一份榜单
  if (list[0].score !== 1200) throw new Error('本人分数被本地覆盖: ' + list[0].score);
  if (list[0].lastScore !== 300) throw new Error('本人本关分数被本地覆盖: ' + list[0].lastScore);
  if (list[1].score !== 7000) throw new Error('他人分数错误');
  // 云端为0的旧记录也照实显示，不补本地分
  const zero = g.buildRankList([{ rank: 1, nickname: '我', maxLevel: 12, score: 0, lastScore: 0, total: 0, time: 0, isMe: true }]);
  if (zero[0].score !== 0) throw new Error('云端0分不应被本地兜底');
});

g.stopTimer();
console.log('\n通过：' + pass + ' / ' + total);
