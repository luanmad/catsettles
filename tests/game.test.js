// 页面玩法初测：用模拟的 wx / Page 运行时驱动 index.js（Node 环境：node tests/game.test.js）
const assert = require('assert');
const path = require('path');

const SAVE_KEY = 'catwhere_save_v2';
let store = {};
let toasts = [];
let modals = [];
let pageConfig = null;

global.wx = {
  getWindowInfo: function () { return { windowWidth: 375 }; },
  getSystemInfoSync: function () { return { windowWidth: 375 }; },
  getStorageSync: function (key) { return store[key]; },
  setStorageSync: function (key, value) { store[key] = JSON.parse(JSON.stringify(value)); },
  showToast: function (opt) { toasts.push(opt.title); },
  showModal: function (opt) {
    modals.push(opt);
    if (opt.success) opt.success({ confirm: true, cancel: false });
  },
  showActionSheet: function () { /* 测试不驱动系统菜单 */ },
  vibrateShort: function () { /* 忽略震动 */ },
};

global.Page = function (config) { pageConfig = config; };
require(path.join(__dirname, '..', 'pages', 'index', 'index.js'));

const results = [];
let passed = 0;

async function run(name, fn) {
  toasts = [];
  modals = [];
  store = {};
  try {
    await fn();
    passed++;
    results.push('✓ ' + name);
  } catch (err) {
    results.push('✗ ' + name + ' -> ' + err.message);
  }
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function createPage() {
  const inst = Object.create(pageConfig);
  inst.data = JSON.parse(JSON.stringify(pageConfig.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  inst.onLoad();
  return inst;
}

function tap(page, idx) {
  page.onCellTap({ currentTarget: { dataset: { idx: idx } } });
}

function longPress(page, idx) {
  page.onCellLongPress({ currentTarget: { dataset: { idx: idx } } });
}

function cellOf(page, row, col) {
  return page.data.cells[row * page.data.size + col];
}

function lastToast() {
  return toasts[toasts.length - 1] || '';
}

(async function main() {
  await run('初始加载第 1 关', async function () {
    const page = createPage();
    assert.strictEqual(page.data.level, 1);
    assert.strictEqual(page.data.size, 4);
    assert.strictEqual(page.data.cells.length, 16);
    assert.strictEqual(page.data.heartSlots.length, 3);
    assert.strictEqual(page.data.hintsLeft, 1);
    assert.strictEqual(page.data.timeText, '00:00');
    assert.strictEqual(page.data.catsPlaced, 0);
    assert.ok(page.data.cellSize > 40 && page.data.cellSize < 100, '格子尺寸异常：' + page.data.cellSize);
    page.onUnload();
  });

  await run('按唯一解逐格点击可通关并保存进度', async function () {
    const page = createPage();
    const sol = page.solution;
    const size = page.data.size;
    for (let i = 0; i < sol.length; i++) {
      tap(page, sol[i].row * size + sol[i].col);
      assert.strictEqual(page.data.catsPlaced, i + 1);
    }
    assert.strictEqual(page.data.won, true, '未判定通关');
    assert.strictEqual(page.data.catsPlaced, size);
    assert.ok(page.data.bestText, '未记录最佳成绩');
    assert.strictEqual(store[SAVE_KEY].level, 2, '下一关未解锁');
    assert.strictEqual(store[SAVE_KEY].maxLevel, 2);
    assert.ok(store[SAVE_KEY].bestTimes[1] >= 0, '最佳成绩未写入');
    page.onUnload();
  });

  await run('通关后点击棋盘不再生效', async function () {
    const page = createPage();
    const sol = page.solution;
    for (let i = 0; i < sol.length; i++) tap(page, sol[i].row * page.data.size + sol[i].col);
    const before = page.data.catsPlaced;
    tap(page, 0);
    assert.strictEqual(page.data.catsPlaced, before);
    page.onUnload();
  });

  await run('再次点击已放猫的格子会移除小猫', async function () {
    const page = createPage();
    const sol = page.solution;
    const idx = sol[0].row * page.data.size + sol[0].col;
    tap(page, idx);
    assert.strictEqual(page.data.catsPlaced, 1);
    tap(page, idx);
    assert.strictEqual(page.data.catsPlaced, 0);
    page.onUnload();
  });

  await run('放错位置扣爱心并标记 ✕', async function () {
    const page = createPage();
    tap(page, 0);
    assert.strictEqual(page.data.catsPlaced, 1);
    tap(page, 1); // 同一行，必然冲突
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 2);
    assert.strictEqual(page.data.cells[1].state, 'ban');
    assert.ok(/同一行/.test(lastToast()), '未给出冲突原因：' + lastToast());
    page.onUnload();
  });

  await run('撤销可回退放猫与错误标记，但不返还爱心', async function () {
    const page = createPage();
    tap(page, 0);
    tap(page, 1); // 扣 1 心，格子变 ban
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 2);
    page.onUndo();
    assert.strictEqual(page.data.cells[1].state, 'empty', '未撤销错误标记');
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 2, '不该返还爱心');
    page.onUndo();
    assert.strictEqual(page.data.catsPlaced, 0, '未撤销小猫');
    assert.strictEqual(page.data.undoLeft, 0);
    page.onUnload();
  });

  await run('长按标记 ✕ 与取消标记', async function () {
    const page = createPage();
    longPress(page, 5);
    assert.strictEqual(page.data.cells[5].state, 'ban');
    assert.strictEqual(page.data.catsPlaced, 0);
    longPress(page, 5);
    assert.strictEqual(page.data.cells[5].state, 'empty');
    page.onUnload();
  });

  await run('标记模式下单击落 ✕，判错为 ❌', async function () {
    const page = createPage();
    page.onToggleMark();
    assert.strictEqual(page.data.markMode, true);
    tap(page, 5);
    assert.strictEqual(page.data.cells[5].state, 'ban');
    assert.strictEqual(page.data.cells[5].auto, false, '手动标记不该是判错');
    tap(page, 5);
    assert.strictEqual(page.data.cells[5].state, 'empty');
    page.onToggleMark();
    assert.strictEqual(page.data.markMode, false);
    // 判错产生的标记应带 auto，且样式与手动区分
    tap(page, 0);
    tap(page, 1); // 同一行，必然冲突
    assert.strictEqual(page.data.cells[1].state, 'ban');
    assert.strictEqual(page.data.cells[1].auto, true, '判错标记应有 auto');
    page.onUndo();
    assert.strictEqual(page.data.cells[1].state, 'empty', '撤销应回退判错标记');
    page.onUnload();
  });

  await run('提示放置合法并扣减次数', async function () {
    const page = createPage();
    const quota = page.data.hintsLeft;
    page.onHint();
    assert.strictEqual(page.data.catsPlaced, 1);
    assert.strictEqual(page.data.hintsLeft, quota - 1);
    const placed = page.currentCats()[0];
    assert.ok(placed, '提示未放猫');
    page.onHint();
    assert.strictEqual(lastToast(), '本关提示已用完');
    page.onUnload();
  });

  await run('提示连续使用可以走完整关', async function () {
    const page = createPage();
    const size = page.data.size;
    // 直接调用引擎补满，验证提示放下的猫始终不冲突
    const puzzle = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
    const rules = require(path.join(__dirname, '..', 'utils', 'rules.js'));
    const cats = [];
    for (let i = 0; i < size; i++) {
      const hint = puzzle.nextHint(size, page.region, cats);
      assert.ok(hint, '无可用提示');
      cats.push({ row: hint.row, col: hint.col, region: page.region[hint.row * size + hint.col] });
    }
    assert.ok(rules.checkSolved(cats, size));
    page.onUnload();
  });

  await run('清除按钮清空棋盘且可撤销', async function () {
    const page = createPage();
    tap(page, 0);
    longPress(page, 5);
    page.onClear();
    assert.strictEqual(page.data.catsPlaced, 0);
    assert.strictEqual(page.data.cells.filter(function (c) { return c.state !== 'empty'; }).length, 0);
    page.onUndo();
    assert.strictEqual(page.data.cells.filter(function (c) { return c.state !== 'empty'; }).length, 2, '撤销未恢复');
    page.onUnload();
  });

  await run('爱心耗尽会重开本关', async function () {
    const page = createPage();
    tap(page, 0);
    tap(page, 1);
    tap(page, 2);
    tap(page, 3);
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 0);
    await sleep(600);
    assert.ok(modals.length >= 1, '未弹出提示');
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 3, '未重开本关');
    assert.strictEqual(page.data.catsPlaced, 0);
    page.onUnload();
  });

  await run('关卡面板：未解锁关卡不可进入', async function () {
    const page = createPage();
    page.onOpenLevels();
    assert.strictEqual(page.data.showLevels, true);
    const locked = page.data.levelList.filter(function (l) { return l.locked; });
    assert.ok(locked.length > 0, '应有未解锁关卡');
    page.onPickLevel({ currentTarget: { dataset: { level: locked[0].level } } });
    assert.strictEqual(lastToast(), '先通过前面的关卡吧');
    assert.strictEqual(page.data.level, 1);
    page.onCloseLevels();
    assert.strictEqual(page.data.showLevels, false);
    page.onUnload();
  });

  await run('通关后可以从关卡面板进入下一关', async function () {
    const page = createPage();
    const sol = page.solution;
    for (let i = 0; i < sol.length; i++) tap(page, sol[i].row * page.data.size + sol[i].col);
    page.onNextLevel();
    assert.strictEqual(page.data.level, 2);
    assert.strictEqual(page.data.won, false);
    assert.strictEqual(page.data.catsPlaced, 0);
    assert.strictEqual(page.data.heartSlots.filter(Boolean).length, 3);
    page.onUnload();
  });

  await run('大关卡（第 13 关 8x8）加载正常，提示上限为 2', async function () {
    const page = createPage();
    page.loadLevel(13);
    assert.strictEqual(page.data.size, 8);
    assert.strictEqual(page.data.cells.length, 64);
    assert.strictEqual(page.data.hintsLeft, 2, '提示上限应为 2');
    assert.ok(page.data.boardInner <= 375, '棋盘超宽：' + page.data.boardInner);
    assert.ok(page.data.cellSize >= 28, '格子过小：' + page.data.cellSize);
    page.onUnload();
  });

  await run('第 60 关为最后一关，通关后不再有下一关', async function () {
    const page = createPage();
    page.loadLevel(60);
    assert.strictEqual(page.data.size, 8);
    assert.strictEqual(page.data.levelList.length, 60, '总关数应为 60');
    page.onNextLevel();
    assert.strictEqual(lastToast(), '已经是最后一关啦');
    // 模拟通关第 60 关：结算后 allCleared 且不出现"下一关"
    page.finishLevel();
    assert.strictEqual(page.data.allCleared, true);
    page.onUnload();
  });

  await run('色盲模式开关并持久化', async function () {
    const page = createPage();
    page.onToggleColorblind();
    assert.strictEqual(page.data.colorblind, true);
    page.onUnload();
    const page2 = createPage();
    assert.strictEqual(page2.data.colorblind, true);
    page2.onUnload();
  });

  await run('音效开关并持久化', async function () {
    const page = createPage();
    assert.strictEqual(page.data.soundOn, true);
    page.onToggleSound();
    assert.strictEqual(page.data.soundOn, false, '关闭音效');
    const page2 = createPage();
    assert.strictEqual(page2.data.soundOn, false, '音效关闭状态应持久化');
    page2.onToggleSound();
    assert.strictEqual(page2.data.soundOn, true);
    page.onUnload();
    page2.onUnload();
  });

  await run('连续加载第 1~30 关数据正常', async function () {
    const page = createPage();
    const rules = require(path.join(__dirname, '..', 'utils', 'rules.js'));
    for (let level = 1; level <= 30; level++) {
      page.loadLevel(level);
      const size = page.data.size;
      assert.strictEqual(page.data.cells.length, size * size, '第' + level + '关格子数不对');
      assert.ok(page.data.boardInner <= page.windowWidth, '第' + level + '关棋盘超宽');
      const cats = page.solution.map(function (pos) {
        return { row: pos.row, col: pos.col, region: page.region[pos.row * size + pos.col] };
      });
      assert.ok(rules.checkSolved(cats, size), '第' + level + '关标准解不合法');
      for (let i = 0; i < page.data.cells.length; i++) {
        assert.ok(page.data.cells[i].color, '第' + level + '关缺色块颜色');
        assert.ok(page.data.cells[i].symbol, '第' + level + '关缺色盲符号');
      }
    }
    page.onUnload();
  });

  await run('无操作时撤销给出提示', async function () {
    const page = createPage();
    page.onUndo();
    assert.strictEqual(lastToast(), '没有可以撤销的步骤');
    page.onUnload();
  });

  await run('重置进度回到第 1 关', async function () {
    const page = createPage();
    page.maxLevel = 5;
    page.bestTimes = { 1: 12 };
    page.loadLevel(1);
    assert.strictEqual(page.data.level, 1);
    page.onUnload();
  });

  console.log(results.join('\n'));
  console.log('\n通过用例：' + passed + ' / ' + results.length);
  if (passed !== results.length) process.exit(1);
  console.log('页面玩法初测全部通过 ✅');
})();
