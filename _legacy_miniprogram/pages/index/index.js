const puzzle = require('../../utils/puzzle.js');
const rules = require('../../utils/rules.js');
const rankService = require('../../utils/rank.js');
const sound = require('../../utils/sound.js');

const SAVE_KEY = 'catwhere_save_v2';
const TOTAL_LEVELS = 60;
const PALETTE = ['#f4756b', '#6fd8c6', '#f78fb3', '#c9a7f5', '#ffd166', '#7fb3f5', '#f5a35c', '#9fd977'];
const SYMBOLS = ['●', '▲', '■', '★', '◆', '♥', '✚', '♠'];
const MAX_HEARTS = 3;
const CELL_GAP = 4;
const MAX_HISTORY = 60;

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
}

Page({
  data: {
    level: 1,
    maxLevel: 1,
    size: 4,
    cells: [],
    catsPlaced: 0,
    heartSlots: [],
    heartShake: false,
    colorblind: false,
    markMode: false,
    soundOn: true,
    hintsLeft: 1,
    undoLeft: 0,
    won: false,
    isNewBest: false,
    bestText: '',
    seconds: 0,
    timeText: '00:00',
    cellSize: 70,
    cellFont: 38,
    boardInner: 300,
    levelList: [],
    showLevels: false,
    rankReady: false,
    myRankText: '',
    showRank: false,
    rankList: [],
    meInfo: null,
    allCleared: false,
  },

  onLoad: function () {
    let info = { windowWidth: 375 };
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) { /* 使用默认宽度 */ }
    this.windowWidth = info.windowWidth || 375;

    let save = {};
    try { save = wx.getStorageSync(SAVE_KEY) || {}; } catch (e) { /* 读写失败时从头开始 */ }
    this.bestTimes = save.bestTimes || {};
    this.maxLevel = Math.max(save.maxLevel || 1, 1);
    this.history = [];
    this.timer = null;
    this.nickname = save.nickname || ('喵友' + String(1000 + Math.floor(Math.random() * 9000)));

    const level = Math.min(Math.max(save.level || 1, 1), this.maxLevel);
    this.loadLevel(level);
    if (save.colorblind) this.setData({ colorblind: true });
    const soundOn = save.sound !== false;
    sound.setEnabled(soundOn);
    this.setData({ soundOn: soundOn });
    this.refreshRank();
  },

  onHide: function () {
    this.stopTimer();
  },

  onShow: function () {
    if (this.data.cells.length && !this.data.won) this.startTimer();
  },

  onUnload: function () {
    this.stopTimer();
  },

  persist: function (nextLevel) {
    try {
      wx.setStorageSync(SAVE_KEY, {
        level: nextLevel || this.data.level,
        maxLevel: this.maxLevel,
        bestTimes: this.bestTimes,
        colorblind: this.data.colorblind,
        nickname: this.nickname,
        sound: this.data.soundOn,
      });
    } catch (e) { /* 存储失败不影响游戏 */ }
  },

  levelSize: function (level) {
    return Math.min(4 + Math.floor((level - 1) / 3), 8);
  },

  hintQuota: function (level) {
    return Math.min(1 + Math.floor((level - 1) / 6), 2);
  },

  buildLevelList: function (level) {
    const list = [];
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      list.push({
        level: i,
        locked: i > this.maxLevel,
        done: !!this.bestTimes[i],
        current: i === level,
      });
    }
    return list;
  },

  loadLevel: function (level) {
    const size = this.levelSize(level);
    const rand = puzzle.rng(level * 1013904223 + 12345);
    const gen = puzzle.generate(size, rand);
    const colorOf = puzzle.assignColors(gen.region, size, PALETTE);
    const symbols = puzzle.shuffle(SYMBOLS.slice(), rand);

    const rpx = this.windowWidth / 750;
    const pagePadding = 24 * rpx * 2;
    const boardPadding = 16 * rpx * 2;
    const avail = this.windowWidth - pagePadding - boardPadding - CELL_GAP * size;
    const cellSize = Math.max(28, Math.floor(avail / size));

    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const reg = gen.region[idx];
        cells.push({
          idx: idx,
          row: r,
          col: c,
          region: reg,
          color: PALETTE[colorOf[reg]],
          symbol: symbols[reg],
          state: 'empty',
          auto: false,
        });
      }
    }

    this.region = gen.region;
    this.solution = gen.cats;
    this.history = [];
    this.stopTimer();
    this.maxLevel = Math.max(this.maxLevel || 1, level);

    this.setData({
      level: level,
      maxLevel: this.maxLevel,
      size: size,
      cells: cells,
      catsPlaced: 0,
      heartSlots: new Array(MAX_HEARTS).fill(1),
      heartShake: false,
      markMode: false,
      hintsLeft: this.hintQuota(level),
      undoLeft: 0,
      won: false,
      isNewBest: false,
      bestText: this.bestTimes[level] ? formatTime(this.bestTimes[level]) : '',
      seconds: 0,
      timeText: '00:00',
      cellSize: cellSize,
      cellFont: Math.max(14, Math.round(cellSize * 0.56)),
      cellFontSmall: Math.max(11, Math.round(cellSize * 0.4)),
      cellFontTiny: Math.max(9, Math.round(cellSize * 0.34)),
      boardInner: cellSize * size + CELL_GAP * size,
      levelList: this.buildLevelList(level),
      showLevels: false,
      allCleared: level >= TOTAL_LEVELS,
    });

    this.persist(level);
    this.startTimer();
  },

  /* ---------- 排行榜 ---------- */
  refreshRank: function () {
    const page = this;
    rankService.fetchRanking().then(function (res) {
      const me = res.me;
      page.setData({
        rankReady: true,
        myRankText: me ? '第' + me.rank + '名' : '未上榜',
        meInfo: me,
        rankList: (res.top || []).map(function (r) {
          return {
            rank: r.rank,
            nickname: r.nickname,
            maxLevel: r.maxLevel,
            timeText: formatTime(r.time),
            isMe: !!r.isMe,
          };
        }),
      });
    }).catch(function (err) {
      // 云开发未配置或网络失败：隐藏排行榜入口，不影响游戏
      console.warn('[排行榜] 不可用：', err && (err.errMsg || err.message) || err);
      page.setData({ rankReady: false });
    });
  },

  submitScore: function (level, seconds) {
    const page = this;
    rankService.submitScore(level, seconds, this.nickname).then(function () {
      page.refreshRank();
    }).catch(function () { /* 未启用排行榜时静默 */ });
  },

  onOpenRank: function () {
    if (!this.data.rankReady) {
      wx.showToast({ title: '排行榜未启用：请先在云开发控制台完成配置', icon: 'none', duration: 2200 });
      return;
    }
    this.setData({ showRank: true });
    this.refreshRank();
  },

  onCloseRank: function () {
    this.setData({ showRank: false });
  },

  /* ---------- 计时 ---------- */
  startTimer: function () {
    const page = this;
    this.stopTimer();
    this.timerBase = this.data.seconds;
    this.timerStart = Date.now();
    this.timer = setInterval(function () {
      const elapsed = page.timerBase + Math.floor((Date.now() - page.timerStart) / 1000);
      if (elapsed !== page.data.seconds) {
        page.setData({ seconds: elapsed, timeText: formatTime(elapsed) });
      }
    }, 500);
  },

  stopTimer: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  /* ---------- 操作历史 ---------- */
  pushHistory: function () {
    if (!this.history) this.history = [];
    this.history.push({
      states: this.data.cells.map(function (c) { return c.state; }),
      autos: this.data.cells.map(function (c) { return !!c.auto; }),
      catsPlaced: this.data.catsPlaced,
      hintsLeft: this.data.hintsLeft,
    });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  },

  currentCats: function () {
    const out = [];
    const cells = this.data.cells;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].state === 'cat') {
        out.push({ row: cells[i].row, col: cells[i].col, region: cells[i].region });
      }
    }
    return out;
  },

  vibrate: function () {
    try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 部分机型不支持 */ }
  },

  /* ---------- 棋盘交互 ---------- */
  onCellTap: function (e) {
    if (this.data.won) return;
    if (this.longPressAt && Date.now() - this.longPressAt < 350) return;

    const idx = Number(e.currentTarget.dataset.idx);
    const cells = this.data.cells;
    const cell = cells[idx];
    if (!cell) return;

    if (this.data.markMode) {
      this.toggleBan(idx);
      return;
    }

    if (cell.state === 'cat') {
      this.pushHistory();
      cell.state = 'empty';
      cell.auto = false;
      sound.play('tap');
      this.setData({ cells: cells, catsPlaced: this.data.catsPlaced - 1, undoLeft: this.history.length });
      return;
    }
    if (cell.state === 'ban') {
      this.pushHistory();
      cell.state = 'empty';
      cell.auto = false;
      sound.play('tap');
      this.setData({ cells: cells, undoLeft: this.history.length });
      return;
    }
    this.tryPlaceCat(idx);
  },

  toggleBan: function (idx) {
    const cells = this.data.cells;
    const cell = cells[idx];
    if (!cell) return;

    this.pushHistory();
    let catsPlaced = this.data.catsPlaced;
    if (cell.state === 'ban') {
      cell.state = 'empty';
      cell.auto = false;
    } else {
      if (cell.state === 'cat') catsPlaced -= 1;
      cell.state = 'ban';
      cell.auto = false;
    }
    sound.play('tap');
    this.vibrate();
    this.setData({ cells: cells, catsPlaced: catsPlaced, undoLeft: this.history.length });
  },

  onCellLongPress: function (e) {
    if (this.data.won) return;
    this.longPressAt = Date.now();
    this.toggleBan(Number(e.currentTarget.dataset.idx));
  },

  tryPlaceCat: function (idx) {
    const cells = this.data.cells;
    const target = cells[idx];
    const reason = rules.conflictReason(this.currentCats(), target);
    if (reason) {
      this.penalize(target, reason);
      return;
    }

    this.pushHistory();
    target.state = 'cat';
    sound.play('place');
    const catsPlaced = this.data.catsPlaced + 1;
    this.setData({ cells: cells, catsPlaced: catsPlaced, undoLeft: this.history.length });

    if (catsPlaced === this.data.size) this.finishLevel();
  },

  penalize: function (target, reason) {
    const page = this;
    this.pushHistory();
    const slots = this.data.heartSlots.slice();
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i]) { slots[i] = 0; break; }
    }
    target.state = 'ban';
    target.auto = true; // 系统判错，和玩家手动标记区分开
    sound.play('error');
    this.setData({
      cells: this.data.cells,
      heartSlots: slots,
      heartShake: true,
      undoLeft: this.history.length,
    });
    setTimeout(function () {
      if (page.data.heartShake) page.setData({ heartShake: false });
    }, 450);
    wx.showToast({ title: reason, icon: 'none', duration: 1600 });

    const alive = slots.some(function (v) { return v; });
    if (!alive) {
      const level = this.data.level;
      setTimeout(function () {
        wx.showModal({
          title: '喵呜～',
          content: '爱心用完了，这一关重新来过吧！',
          showCancel: false,
          confirmText: '重试本关',
          success: function () { page.loadLevel(level); },
        });
      }, 400);
    }
  },

  finishLevel: function () {
    this.stopTimer();
    const level = this.data.level;
    const used = this.data.seconds;
    const prev = this.bestTimes[level];
    const isNewBest = !prev || used < prev;
    if (isNewBest) this.bestTimes[level] = used;
    if (level + 1 > this.maxLevel) this.maxLevel = Math.min(level + 1, TOTAL_LEVELS);
    const allCleared = level >= TOTAL_LEVELS;

    sound.play('win');
    this.vibrate();
    this.setData({
      won: true,
      catsPlaced: this.data.size,
      isNewBest: isNewBest,
      bestText: formatTime(this.bestTimes[level]),
      maxLevel: this.maxLevel,
      allCleared: allCleared,
    });
    this.persist(Math.min(level + 1, this.maxLevel));
    this.setData({ levelList: this.buildLevelList(level) });
    this.submitScore(level, used);
  },

  /* ---------- 工具按钮 ---------- */
  onUndo: function () {
    if (this.data.won) return;
    if (!this.history || !this.history.length) {
      wx.showToast({ title: '没有可以撤销的步骤', icon: 'none' });
      return;
    }
    const snap = this.history.pop();
    const cells = this.data.cells;
    for (let i = 0; i < cells.length; i++) {
      cells[i].state = snap.states[i];
      cells[i].auto = !!snap.autos[i];
    }
    this.setData({
      cells: cells,
      catsPlaced: snap.catsPlaced,
      hintsLeft: Math.min(snap.hintsLeft, this.data.hintsLeft),
      undoLeft: this.history.length,
    });
  },

  onHint: function () {
    if (this.data.won) return;
    if (this.data.hintsLeft <= 0) {
      wx.showToast({ title: '本关提示已用完', icon: 'none' });
      return;
    }

    const cats = this.currentCats();
    const hint = puzzle.nextHint(this.data.size, this.region, cats);
    if (!hint) {
      wx.showToast({ title: '当前摆法走不通，先撤掉几只小猫吧', icon: 'none' });
      return;
    }

    const cells = this.data.cells;
    const idx = hint.row * this.data.size + hint.col;
    this.pushHistory();
    cells[idx].state = 'cat';
    sound.play('hint');
    const catsPlaced = this.data.catsPlaced + 1;
    this.vibrate();
    this.setData({
      cells: cells,
      catsPlaced: catsPlaced,
      hintsLeft: this.data.hintsLeft - 1,
      undoLeft: this.history.length,
    });
    if (catsPlaced === this.data.size) this.finishLevel();
  },

  onClear: function () {
    if (this.data.won) return;
    const cells = this.data.cells;
    let hasAny = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].state !== 'empty') { hasAny = true; break; }
    }
    if (!hasAny) return;
    this.pushHistory();
    for (let i = 0; i < cells.length; i++) cells[i].state = 'empty';
    this.setData({ cells: cells, catsPlaced: 0, undoLeft: this.history.length });
  },

  onToggleColorblind: function () {
    const colorblind = !this.data.colorblind;
    this.setData({ colorblind: colorblind });
    this.persist();
  },

  onToggleMark: function () {
    if (this.data.won) return;
    this.setData({ markMode: !this.data.markMode });
  },

  /* ---------- 关卡与设置 ---------- */
  onOpenLevels: function () {
    this.setData({ showLevels: true, levelList: this.buildLevelList(this.data.level) });
  },

  onCloseLevels: function () {
    this.setData({ showLevels: false });
  },

  onPickLevel: function (e) {
    const level = Number(e.currentTarget.dataset.level);
    if (level > this.maxLevel) {
      wx.showToast({ title: '先通过前面的关卡吧', icon: 'none' });
      return;
    }
    this.loadLevel(level);
  },

  onSettings: function () {
    const page = this;
    wx.showActionSheet({
      itemList: ['选择关卡', '重玩本关', '音效：' + (this.data.soundOn ? '开' : '关'), '重置进度（回到第1关）', '排行榜'],
      success: function (res) {
        if (res.tapIndex === 0) {
          page.onOpenLevels();
        } else if (res.tapIndex === 1) {
          page.loadLevel(page.data.level);
        } else if (res.tapIndex === 2) {
          page.onToggleSound();
        } else if (res.tapIndex === 3) {
          wx.showModal({
            title: '重置进度',
            content: '确定要清空关卡进度和成绩吗？',
            confirmText: '确定重置',
            success: function (m) {
              if (!m.confirm) return;
              page.maxLevel = 1;
              page.bestTimes = {};
              page.loadLevel(1);
            },
          });
        } else if (res.tapIndex === 4) {
          page.onOpenRank();
        }
      },
    });
  },

  onToggleSound: function () {
    const soundOn = !this.data.soundOn;
    sound.setEnabled(soundOn);
    this.setData({ soundOn: soundOn });
    if (soundOn) sound.play('tap');
    this.persist();
  },

  onRules: function () {
    wx.showModal({
      title: '玩法说明',
      content: '每一行、每一列、每个颜色区域各放一只小猫，小猫之间不能相邻（含斜角）。放错会扣一颗爱心，爱心用完要重玩本关。点击底部「✕ 标记」进入标记模式，再点格子可排除它；长按格子也可以随时标记。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  onNextLevel: function () {
    if (this.data.level >= TOTAL_LEVELS) {
      wx.showToast({ title: '已经是最后一关啦', icon: 'none' });
      return;
    }
    this.loadLevel(this.data.level + 1);
  },

  onReplayLevel: function () {
    this.loadLevel(this.data.level);
  },

  onShareAppMessage: function () {
    return {
      title: '猫猫请落座 · 第' + this.data.level + '关',
      path: '/pages/index/index',
    };
  },

  noop: function () { /* 阻止浮层点击穿透 */ },
});
