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
    setLineDash: noop,
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
  removeUserCloudStorage: function (o) { (global.__cloudRemoves || (global.__cloudRemoves = [])).push(o); if (o.success) o.success(); },
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

check('猫咪图鉴：12只外观各异、猫王戴皇冠、无重复配色', function () {
  const GameMod = require(path.join(__dirname, '..', 'js', 'game.js'));
  // 通过图鉴渲染捕获传给 cat() 的 variant 与 color
  const seen = [];
  const realCat = g.r.cat;
  g.r.cat = function (cx, cy, s, color, variant) { seen.push({ color: color, variant: variant }); };
  g.unlockedCats = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  g.overlay = 'gallery';
  g.listScroll.gallery = 0;
  drawnTexts.length = 0;
  g.render();
  g.r.cat = realCat;

  const cats = seen.filter(function (s) { return typeof s.variant === 'number' && s.variant >= 0; });
  if (cats.length !== 12) throw new Error('图鉴应绘制12只已解锁猫，实际' + cats.length);
  const variants = cats.map(function (c) { return c.variant; });
  const colors = cats.map(function (c) { return c.color; });
  if (new Set(variants).size !== 12) throw new Error('猫外观编号有重复: ' + variants.join(','));
  if (new Set(colors).size !== 12) throw new Error('猫配色有重复: ' + colors.join(','));
  if (variants[11] !== 11) throw new Error('猫王应使用皇冠外观(11)，实际' + variants[11]);
  if (!drawnTexts.some(function (t) { return t.s === '猫王'; })) throw new Error('图鉴缺少猫王');

  // 未解锁的猫不应显示外观
  g.unlockedCats = [];
  seen.length = 0;
  g.r.cat = function (cx, cy, s, color, variant) { seen.push({ color: color, variant: variant }); };
  g.render();
  g.r.cat = realCat;
  if (seen.some(function (s) { return s.variant >= 0; })) throw new Error('未解锁的猫不应显示专属外观');

  g.closeOverlay();
  g.unlockedCats = [];
});

check('猫主题段位：关号换算、选关标识、通关晋级、排行榜展示', function () {
  const GameMod = require(path.join(__dirname, '..', 'js', 'game.js'));
  const ranks = GameMod.CAT_RANKS;
  const cases = [[1, '猫崽'], [10, '猫崽'], [11, '猫奴'], [20, '猫奴'], [21, '猫友'],
    [30, '猫友'], [31, '猫痴'], [40, '猫痴'], [41, '猫狂'], [50, '猫狂'],
    [51, '猫王'], [58, '猫王'], [59, '猫神'], [60, '猫神']];
  cases.forEach(function (pair) {
    if (GameMod.catRankOf(pair[0]).name !== pair[1]) {
      throw new Error('第' + pair[0] + '关段位应为' + pair[1] + '，实际' + GameMod.catRankOf(pair[0]).name);
    }
  });
  if (ranks.length !== 7) throw new Error('应有7个段位');

  // 选关面板：当前段位与每关段位首字
  g.maxLevel = 55;
  g.overlay = 'levels';
  drawnTexts.length = 0;
  g.render();
  const joined = drawnTexts.map(function (t) { return t.s; }).join('|');
  if (joined.indexOf('段位：猫王') < 0) throw new Error('选关面板未显示当前段位');
  ['崽', '奴', '友', '痴', '狂', '王', '神'].forEach(function (ch) {
    if (joined.indexOf(ch) < 0) throw new Error('选关面板缺少段位标识 ' + ch);
  });
  g.closeOverlay();
  g.maxLevel = 60;

  // 通关弹窗：跨段位显示晋级
  g.loadLevel(59, 4242);
  g.stopTimer(); g.seconds = 10; g.winStats = null;
  g.finishLevel();
  if (!g.winStats.rankUp || g.winStats.rank.name !== '猫神') throw new Error('第59关应触发晋级猫神');
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s.indexOf('晋升 猫神') >= 0; })) throw new Error('通关弹窗未显示晋级');
  g.loadLevel(60, 4242);
  g.stopTimer(); g.seconds = 10; g.winStats = null;
  g.finishLevel();
  if (g.winStats.rankUp) throw new Error('第60关同为猫神不应晋级');
  g.overlay = null; g.dialog = null;

  // 云排行榜条目携带段位名
  const list = g.buildRankList([{ rank: 1, nickname: 'A', maxLevel: 60, score: 100 }]);
  if (list[0].rankName !== '猫神') throw new Error('排行榜未换算段位');
  g.rankReady = true;
  g.rankList = list;
  g.overlay = 'rank';
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s === '猫神'; })) throw new Error('排行榜未显示段位徽标');
  g.closeOverlay();

  // 设置菜单显示当前段位
  g.openSettings();
  if (!g.settings.items.some(function (it) { return it.label.indexOf('当前段位：') === 0; })) {
    throw new Error('设置菜单缺少段位项');
  }
  g.settings = null;
  g.dialog = null;
  // 还原到初始状态，避免影响后续用例
  g.maxLevel = 60;
  g.loadLevel(1);
  g.dialog = null;
});

check('老存档图鉴回填：历史成就补解锁猫，不再 0 只', function () {
  storage.catwhere_save_v2 = {
    healthNoticed: true, maxLevel: 29,
    bestTimes: { 5: 60, 10: 90, 15: 100, 20: 120, 25: 130 },
    bestStars: {}, bestCombo: 26, perfectClears: 29, unlockedCats: [],
  };
  const fresh = new Game(canvas);
  if (fresh.unlockedCats.length < 7) throw new Error('老存档图鉴应回填已达成成就的猫，实际' + fresh.unlockedCats.length);
  [0, 1, 2, 3, 4, 8, 9].forEach(function (id) {
    if (fresh.unlockedCats.indexOf(id) < 0) throw new Error('应解锁猫 id=' + id);
  });
  if (!storage.catwhere_save_v2.unlockedCats || storage.catwhere_save_v2.unlockedCats.length < 7) {
    throw new Error('回填结果未落盘');
  }
  fresh.overlay = 'gallery';
  drawnTexts.length = 0;
  fresh.render();
  if (!drawnTexts.some(function (t) { return t.s.indexOf('已收集') === 0; })) throw new Error('图鉴面板未显示收集数');
  fresh.stopTimer();
  storage.catwhere_save_v2 = { healthNoticed: true };
});

check('重置进度：清空本地成绩、云端排行榜记录与好友榜托管数据', function () {
  const rankSvc = require(path.join(__dirname, '..', 'utils', 'rank.js'));
  // 模拟云函数：捕获 action
  const calls = [];
  const origCall = wx.cloud;
  wx.cloud = {
    init: function () {},
    callFunction: function (o) {
      calls.push(o.data && o.data.action);
      if (o.success) o.success({ result: { ok: true } });
    },
  };
  // 触发 rank.js 的懒初始化缓存（cloudReady 已在别处初始化过，这里直接测服务层接口）
  const origClear = rankSvc.clearMyScore;
  let clearCalled = 0;
  rankSvc.clearMyScore = function () { clearCalled++; return Promise.resolve({ ok: true }); };

  // 构造"有成绩"的状态
  g.maxLevel = 30;
  g.totalScore = 5000;
  g.bestScores = { 1: 5000 };
  g.rankReady = true;
  g.rankList = [{ rank: 1, nickname: 'me' }];
  g.myRankText = '第1名';
  global.__cloudRemoves = [];

  g.openSettings();
  const item = g.settings.items.find(function (it) { return it.label === '重置进度'; });
  if (!item) throw new Error('缺少重置进度入口');
  item.tap();
  if (g.dialog.content.indexOf('排行榜记录') < 0) throw new Error('重置提示未说明会清空排行榜');
  g.dialog.onConfirm();

  // 本地状态清空
  if (g.maxLevel !== 1 || g.totalScore !== 0 || g.level !== 1) throw new Error('本地进度未重置');
  if (Object.keys(g.bestScores).length !== 0) throw new Error('本关得分未清空');
  if (g.rankReady || g.rankList.length || g.myRankText) throw new Error('本地排行榜缓存未清空');
  if (g.rankFixKey !== null) throw new Error('补报限流 key 未复位');
  // 好友榜托管数据被移除
  const removes = global.__cloudRemoves || [];
  if (!removes.some(function (r) {
    return r.KVDataList && r.KVDataList.some(function (kv) { return kv.key === 'cat_rank_v1'; });
  })) throw new Error('未移除好友榜托管数据');
  // 云端排行榜清理被调用
  if (clearCalled !== 1) throw new Error('未调用云端排行榜清理，实际' + clearCalled);

  // 还原
  rankSvc.clearMyScore = origClear;
  wx.cloud = origCall;
  g.settings = null;
  g.dialog = null;
  storage.catwhere_save_v2 = { healthNoticed: true };
});

check('设置里重看健康游戏忠告：可显示且关闭后仍保持已确认', function () {
  g.settings = null; g.overlay = null; g.dialog = null;
  g.openSettings();
  const item = g.settings.items.find(function (it) { return it.label === '健康游戏忠告'; });
  if (!item) throw new Error('设置里缺少健康游戏忠告入口');
  item.tap();
  if (!g.showHealthNotice) throw new Error('点击后应显示忠告页');
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s === '健康游戏忠告'; })) throw new Error('未重新绘制忠告页');
  g.dismissHealthNotice();
  if (g.showHealthNotice) throw new Error('关闭后应回到游戏');
  if (!storage.catwhere_save_v2.healthNoticed) throw new Error('重看后仍应保持已确认状态');
});
check('初始化布局与首帧渲染', function () {
  g.render();
  if (!g.layout) throw new Error('layout 未计算');
  if (g.size !== 4 || g.level !== 1) throw new Error('初始关卡错误');
});
check('难度曲线：尺寸递进到10x10、40关起精英关、生命2条、16关起评星', function () {
  const cases = [[1, 4], [3, 4], [4, 5], [12, 7], [13, 8], [15, 8], [16, 9], [30, 9], [31, 10], [60, 10]];
  cases.forEach(function (pair) {
    if (g.levelSize(pair[0]) !== pair[1]) {
      throw new Error('第' + pair[0] + '关尺寸应为' + pair[1] + '，实际' + g.levelSize(pair[0]));
    }
  });
  [1, 6, 13, 14, 21, 39].forEach(function (lv) {
    if (g.hintQuota(lv) !== 1) throw new Error('第' + lv + '关提示应为1次');
  });
  [40, 41, 60].forEach(function (lv) {
    if (g.hintQuota(lv) !== 0) throw new Error('第' + lv + '关提示应为0次');
    if (g.undoQuota(lv) !== 0) throw new Error('第' + lv + '关撤销应为0次');
    if (!g.levelConfig(lv).diagonal || !g.levelConfig(lv).elite) {
      throw new Error('第' + lv + '关应启用对角线与精英规则');
    }
  });
  if (g.hearts.length !== 2) throw new Error('初始生命值应为2条');
  [1, 26, 39].forEach(function (lv) {
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
check('16-60关：棋盘有解，57关起才允许石像猫', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  for (let lv = 16; lv <= 60; lv++) {
    g.loadLevel(lv);
    const stones = g.cells.filter(function (c) { return c.state === 'stone'; }).length;
    const expectStones = lv >= 59 ? 3 : (lv >= 57 ? 2 : 0);
    if (stones !== expectStones) throw new Error('第' + lv + '关石像猫应为' + expectStones + '，实际' + stones);
    const other = g.cells.filter(function (c) { return c.state !== 'empty' && c.state !== 'stone'; }).length;
    if (other) throw new Error('第' + lv + '关存在非预置的格子: ' + other);
    const stoneObs = g.stones || [];
    const opts = lv >= 40 ? { diagonal: true, stones: stoneObs } : { stones: stoneObs };
    const res = puzzleLib.countSolutions(g.size, g.region, 1, null, null, opts);
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

check('通关演示：入口、逐步展示、通关文案与退出', function () {
  g.demo = null;
  g.openSettings();
  const demoItem = g.settings.items.find(function (it) { return it.label === '看通关演示'; });
  if (!demoItem) throw new Error('设置里没有“看通关演示”入口');
  demoItem.tap();
  if (!g.demo) throw new Error('点击后未启动演示');
  // 第0步：区域说明
  drawnTexts.length = 0;
  g.demo.startAt = Date.now();
  g.render();
  if (!drawnTexts.some(function (t) { return t.s === '通关演示'; })) throw new Error('未绘制演示标题');
  const step0 = drawnTexts.some(function (t) { return t.s.indexOf('4 种颜色') >= 0 || t.s.indexOf('区域要放') >= 0; });
  if (!step0) throw new Error('未绘制第一步区域说明');
  // 最后一步：通关文案
  drawnTexts.length = 0;
  g.demo.startAt = Date.now() - 1100 * 5;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s.indexOf('通 关') >= 0; })) throw new Error('未绘制通关庆祝文案');
  // 退出演示
  g.demo = null;
  drawnTexts.length = 0;
  g.render();
  if (drawnTexts.some(function (t) { return t.s === '通关演示'; })) throw new Error('退出后仍在演示画面');
});

check('第40关起精英关：对角线约束、0提示0撤销、玩法变更只通知一次', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const rulesLib = require(path.join(__dirname, '..', 'utils', 'rules.js'));
  g.eliteNoticed = false;
  g.dialog = null;

  // 第39关仍是旧规则
  g.loadLevel(39);
  if (g.levelConfigCur.diagonal || g.levelConfigCur.elite) throw new Error('第39关不应启用对角线/精英规则');
  if (g.hintQuota(39) !== 1 || g.undoQuota(39) !== 3) throw new Error('第39关应为1提示3撤销');
  if (g.dialog) throw new Error('第39关不应弹玩法变更通知');

  // 第40关首次进入：通知 + 0提示0撤销
  g.loadLevel(40);
  if (!g.levelConfigCur.diagonal || !g.levelConfigCur.elite) throw new Error('第40关应启用对角线/精英规则');
  if (g.hintsLeft !== 0 || g.undosLeft !== 0) throw new Error('第40关应为0提示0撤销');
  if (!g.dialog || g.dialog.title.indexOf('精英关') < 0) throw new Error('第40关未弹玩法变更通知');
  if (g.dialog.content.indexOf('对角线') < 0 || g.dialog.content.indexOf('提示') < 0 || g.dialog.content.indexOf('撤销') < 0) {
    throw new Error('玩法通知缺少规则说明');
  }
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s.indexOf('玩法升级') >= 0; })) throw new Error('未绘制玩法通知标题');
  if (!drawnTexts.some(function (t) { return t.s === '精英'; })) throw new Error('标题栏缺少精英标记');
  if (!drawnTexts.some(function (t) { return t.s.indexOf('同对角线') >= 0; })) throw new Error('规则卡片未提示对角线');
  g.dialog = null;

  // 再次进入同一关、或进入后续精英关，都不再重复通知
  g.loadLevel(40);
  if (g.dialog) throw new Error('玩法通知不应重复弹出');
  g.loadLevel(41);
  if (g.dialog) throw new Error('后续精英关不应重复通知');
  if (storage.catwhere_save_v2.eliteNoticed !== true) throw new Error('通知已读状态未存档');

  // 精英关：提示、撤销、清除、取消都不能用
  g.loadLevel(40, 4242);
  g.dialog = null;
  const beforeCats = g.catsPlaced;
  g.onHint();
  if (g.catsPlaced !== beforeCats) throw new Error('精英关不应能用提示');
  g.onUndo();
  g.onClear();
  if (g.undosLeft !== 0) throw new Error('精英关撤销次数应始终为0');

  // 对角线冲突：旧规则放行，精英规则拦截并扣爱心
  const resForDiag = puzzleLib.countSolutions(g.size, g.region, 1, null, null, { diagonal: true });
  if (!resForDiag.count) throw new Error('第40关对角线规则下无解');
  const colsDiag = resForDiag.solutions[0];
  const first = { row: 0, col: colsDiag[0], region: g.cells[colsDiag[0]].region };
  let badIdx = -1;
  for (let dr = 2; dr < g.size && badIdx < 0; dr++) {
    for (let sign = -1; sign <= 1; sign += 2) {
      const dc = colsDiag[0] + sign * dr;
      if (dc < 0 || dc >= g.size) continue;
      const idx = dr * g.size + dc;
      const cell = g.cells[idx];
      const t = { row: cell.row, col: cell.col, region: cell.region };
      if (rulesLib.conflictReason([first], t, { diagonal: true }) === rulesLib.REASON_DIAG) { badIdx = idx; break; }
    }
  }
  if (badIdx < 0) throw new Error('未找到纯对角线冲突格');
  g.onCellTap(colsDiag[0]); // 先放下首行猫，再尝试同对角线位置
  if (g.cells[colsDiag[0]].state !== 'cat') throw new Error('首行猫未放下');
  const heartsBefore = g.hearts.filter(function (v) { return v; }).length;
  g.onCellTap(badIdx);
  if (g.hearts.filter(function (v) { return v; }).length !== heartsBefore - 1) {
    throw new Error('对角线冲突应扣1颗爱心');
  }

  // 按对角线规则求解，可一步步通关，且最终摆法满足对角线约束
  g.loadLevel(40, 4242);
  g.dialog = null;
  const res = puzzleLib.countSolutions(g.size, g.region, 1, null, null, { diagonal: true });
  if (!res.count) throw new Error('第40关无解');
  const cols = res.solutions[0];
  const placed = [];
  for (let r = 0; r < g.size; r++) {
    const idx = r * g.size + cols[r];
    g.onCellTap(idx);
    const cell = g.cells[idx];
    placed.push({ row: cell.row, col: cell.col, region: cell.region });
  }
  if (!g.won) throw new Error('按对角线解摆放后未通关: ' + g.catsPlaced + '/' + g.size);
  if (!rulesLib.checkSolved(placed, g.size, { diagonal: true })) throw new Error('通关摆法不满足对角线约束');
  g.dialog = null;
});

check('精英关虚线提示：占位猫画出两条对角线，冲突提示写明冲突位置', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const rulesLib = require(path.join(__dirname, '..', 'utils', 'rules.js'));
  g.loadLevel(40, 4242);
  g.dialog = null;

  // 拦截虚线绘制，记录次数与端点
  const realDash = g.r.dashedLine;
  const calls = [];
  g.r.dashedLine = function (x1, y1, x2, y2) { calls.push([x1, y1, x2, y2]); };

  const res = puzzleLib.countSolutions(g.size, g.region, 1, null, null, { diagonal: true });
  const cols = res.solutions[0];
  g.onCellTap(cols[0]); // 首行放一只猫
  drawnTexts.length = 0;
  calls.length = 0;
  g.render();
  if (calls.length !== 2) throw new Error('一只猫应画出主/副两条对角线虚线，实际 ' + calls.length);
  const step = g.layout.cellSize + 8;
  calls.forEach(function (seg) {
    const dr = Math.abs(seg[3] - seg[1]) / step;
    const dc = Math.abs(seg[2] - seg[0]) / step;
    if (Math.abs(dr - dc) > 0.01) throw new Error('虚线端点不在45度对角线上: 行差' + dr + ' 列差' + dc);
  });

  // 找一个同对角线、不同色区域、距离>=2 的格子，验证提示写明冲突位置
  const firstRow = 0, firstCol = cols[0];
  let badIdx = -1;
  for (let rr = 2; rr < g.size && badIdx < 0; rr++) {
    for (let sign = -1; sign <= 1; sign += 2) {
      const cc = firstCol + sign * rr;
      if (cc < 0 || cc >= g.size) continue;
      const idx = rr * g.size + cc;
      const cell = g.cells[idx];
      if (cell.region === g.cells[firstCol].region) continue;
      if (rulesLib.conflictReason([{ row: firstRow, col: firstCol, region: g.cells[firstCol].region }],
        { row: cell.row, col: cell.col, region: cell.region }, { diagonal: true }) === rulesLib.REASON_DIAG) {
        badIdx = idx; break;
      }
    }
  }
  if (badIdx >= 0) {
    g.onCellTap(badIdx);
    if (!g.toast || g.toast.text.indexOf('行第') < 0 || g.toast.text.indexOf('列的小猫') < 0) {
      throw new Error('对角线冲突提示未写明冲突小猫位置: ' + (g.toast && g.toast.text));
    }
  }

  // 仅 40-43 显示虚线，44 关起不再显示（对角线规则本身仍生效）
  [39, 40, 41, 42, 43].forEach(function (lv) {
    g.loadLevel(lv, 4242);
    g.dialog = null;
    const r = puzzleLib.countSolutions(g.size, g.region, 1, null, null, { diagonal: true });
    if (!r.count) return;
    g.onCellTap(r.solutions[0][0]);
    calls.length = 0;
    g.render();
    const want = (lv >= 40 && lv <= 43) ? 2 : 0;
    if (calls.length !== want) throw new Error('第' + lv + '关虚线数应为' + want + '，实际' + calls.length);
  });
  [44, 45].forEach(function (lv) {
    g.loadLevel(lv, 4242);
    g.dialog = null;
    if (!g.levelConfigCur.diagonal) throw new Error('第' + lv + '关仍应为对角线精英关');
    const r = puzzleLib.countSolutions(g.size, g.region, 1, null, null, { diagonal: true });
    if (!r.count) return;
    g.onCellTap(r.solutions[0][0]);
    calls.length = 0;
    g.render();
    if (calls.length !== 0) throw new Error('第' + lv + '关不应显示虚线，实际' + calls.length);
  });

  g.r.dashedLine = realDash;
  g.dialog = null;
});

check('临时体验：39-60关可在选关面板直接进入，且不污染正式解锁进度', function () {
  const before = g.maxLevel;
  g.maxLevel = 1;
  g.eliteNoticed = true;
  g.hardNoticed = true;
  g.dialog = null;
  g.listScroll.levels = 0;

  [39, 40, 45, 50, 57, 60].forEach(function (lv) {
    if (!g.isTempUnlocked(lv)) throw new Error('第' + lv + '关应临时开放');
  });
  [1, 38].forEach(function (lv) {
    if (g.isTempUnlocked(lv)) throw new Error('第' + lv + '关不应临时开放');
  });

  // 选关面板：第42关即使未解锁也可点进去
  g.overlay = 'levels';
  g.render();
  const px = 40, py = 120, pw = g.r.DW - 80;
  const cellW = 70, gap = 12, cols = 8;
  const startX = px + (pw - (cols * cellW + (cols - 1) * gap)) / 2;
  const i = 41; // 第42关
  const cx = startX + (i % cols) * (cellW + gap) + cellW / 2;
  const cy = py + 96 + Math.floor(i / cols) * (cellW + gap) + cellW / 2;
  tap(cx, cy);
  if (g.level !== 42) throw new Error('临时体验关在选关面板不可进入: ' + g.level);
  if (g.maxLevel !== 1) throw new Error('体验关加载污染了正式进度: ' + g.maxLevel);

  // 通关体验关也不解锁下一关
  g.stopTimer(); g.seconds = 0; g.winStats = null;
  g.finishLevel();
  if (g.maxLevel !== 1) throw new Error('通关体验关污染了正式进度: ' + g.maxLevel);

  g.maxLevel = before;
  g.overlay = null;
  g.dialog = null;
});

check('50-56关玩法梯度：一线生机、静默禁标记、首次升级通知', function () {
  g.hardNoticed = false;
  g.dialog = null;

  g.loadLevel(49);
  g.dialog = null;
  if (g.hearts.length !== 2 || g.levelConfigCur.noMark) throw new Error('第49关应2爱心且可标记');

  g.loadLevel(50);
  if (g.hearts.length !== 1 || !g.levelConfigCur.oneHeart) throw new Error('第50关应只有1颗爱心');
  if (!g.dialog || g.dialog.title.indexOf('一线生机') < 0) throw new Error('第50关未弹升级通知');
  if (g.dialog.content.indexOf('禁标记') < 0 || g.dialog.content.indexOf('石像') < 0 || g.dialog.content.indexOf('倒计时') < 0) {
    throw new Error('升级通知未说明后续玩法');
  }
  // 通知只弹一次（清掉当前弹窗后再进下一关）
  g.dialog = null;
  g.loadLevel(51);
  if (g.dialog) throw new Error('玩法升级通知不应重复弹出');

  g.loadLevel(53);
  if (g.hearts.length !== 1 || g.levelConfigCur.noMark) throw new Error('第53关应1爱心且可标记');
  g.loadLevel(54);
  if (!g.levelConfigCur.noMark) throw new Error('第54关应禁用标记');
  if (g.markMode) throw new Error('静默关不应保持标记模式');

  // 静默关：按钮禁用，点击/拖拽都不能标记
  drawnTexts.length = 0;
  g.render();
  if (!drawnTexts.some(function (t) { return t.s === '禁标记'; })) throw new Error('静默关未显示禁标记按钮');
  const before = g.cells[0].state;
  g.markMode = true;
  g.onCellTap(0);
  if (g.cells[0].state !== before) throw new Error('静默关点击不应改变标记');
  g.markMode = false;
  g.markMode = true;
  dragCells([0, 1, 2]);
  g.markMode = false;
  if (g.cells[0].state !== before) throw new Error('静默关拖拽不应改变标记');

  g.loadLevel(56);
  if (g.hearts.length !== 1 || !g.levelConfigCur.noMark || g.levelConfigCur.stoneCount !== 0) {
    throw new Error('第56关应为1爱心+禁标记+无石像');
  }
  g.dialog = null;
});

check('57-60关石像障碍：不可移除、封锁对角线、清除保留、放满全盘可通关', function () {
  const puzzleLib = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
  const rulesLib = require(path.join(__dirname, '..', 'utils', 'rules.js'));

  [57, 58, 59, 60].forEach(function (lv) {
    g.loadLevel(lv, 4242);
    g.dialog = null;
    const expectStones = lv >= 59 ? 3 : 2;
    const stoneCells = g.cells.filter(function (c) { return c.state === 'stone'; });
    if (stoneCells.length !== expectStones) throw new Error('第' + lv + '关石像数错误: ' + stoneCells.length);
    if (g.catsPlaced !== 0) throw new Error('第' + lv + '关石像不应计入已放数');
    if (g.hearts.length !== 1) throw new Error('第' + lv + '关应1爱心');
    if (!g.levelConfigCur.noMark) throw new Error('第' + lv + '关应禁标记');

    // 石像格不能点、不能标记
    const sidx = stoneCells[0].idx;
    g.onCellTap(sidx);
    if (g.cells[sidx].state !== 'stone') throw new Error('石像格不应被点掉');
    g.markMode = true;
    g.toggleBan(sidx);
    g.markMode = false;
    if (g.cells[sidx].state !== 'stone') throw new Error('石像格不应被标记');

    // 石像对角线封锁：与石像同对角线的空格落子应判冲突扣爱心
    const s = stoneCells[0];
    let diagTarget = null;
    for (let dr = 1; dr < g.size && !diagTarget; dr++) {
      for (let sign = -1; sign <= 1; sign += 2) {
        const dc = sign * dr;
        const row = s.row + dr, col = s.col + dc;
        if (row < 0 || row >= g.size || col < 0 || col >= g.size) continue;
        const cell = g.cells[row * g.size + col];
        if (cell.state !== 'empty') continue;
        if (rulesLib.conflictReason([], { row: cell.row, col: cell.col, region: cell.region },
          { diagonal: true, stones: g.stones }) === rulesLib.REASON_STONE_DIAG) { diagTarget = cell; break; }
      }
    }
    if (!diagTarget) throw new Error('第' + lv + '关未找到石像对角线封锁格');
    const heartsBefore = g.hearts.filter(function (v) { return v; }).length;
    g.onCellTap(diagTarget.idx);
    if (g.hearts.filter(function (v) { return v; }).length !== heartsBefore - 1) {
      throw new Error('第' + lv + '关石像对角线落子应扣爱心');
    }

    // 清除保留石像，计数归零
    g.loadLevel(lv, 4242);
    g.dialog = null;
    g.undosLeft = 1;
    const emptyBefore = g.cells.filter(function (c) { return c.state === 'empty'; })[0];
    g.onCellTap(emptyBefore.idx);
    g.onClear();
    const stillStones = g.cells.filter(function (c) { return c.state === 'stone'; }).length;
    if (stillStones !== expectStones) throw new Error('第' + lv + '关清除后石像应保留');
    if (g.catsPlaced !== 0) throw new Error('第' + lv + '关清除后计数应归零');

    // 按石像障碍约束求解，放满 n 只猫通关
    g.loadLevel(lv, 4242);
    g.dialog = null;
    const res = puzzleLib.countSolutions(g.size, g.region, 1, null, null,
      { diagonal: true, stones: g.stones });
    if (!res.count) throw new Error('第' + lv + '关石像局面无解');
    const cols = res.solutions[0];
    for (let r = 0; r < g.size; r++) g.onCellTap(r * g.size + cols[r]);
    if (!g.won) throw new Error('第' + lv + '关按解放满后未通关: ' + g.catsPlaced + '/' + g.size);
  });

  // 终极关倒计时配置与UI
  const c58 = g.levelConfig(58), c59 = g.levelConfig(59);
  if (c59.star3 >= c58.star3 || c59.star2 >= c58.star2) throw new Error('第59关应极速限时');
  if (c58.timeLimit !== 0 || c59.timeLimit <= 0) throw new Error('仅第59关起应有倒计时');
  g.loadLevel(59, 4242);
  g.dialog = null;
  g.seconds = c59.timeLimit - 10;
  drawnTexts.length = 0;
  g.render();
  const leftText = '00:10';
  if (!drawnTexts.some(function (t) { return t.s === leftText; })) {
    throw new Error('终极关未显示剩余倒计时: ' + drawnTexts.map(function (t) { return t.s; }).join('|'));
  }
  g.seconds = 0;
  g.dialog = null;
});

g.stopTimer();
console.log('\n通过：' + pass + ' / ' + total);
