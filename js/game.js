// 「猫猫请落座」微信小游戏主逻辑
// 复用 utils/puzzle.js / rules.js / rank.js / sound.js，UI 全部用 canvas 自绘。
const Renderer = require('./renderer.js');
const puzzle = require('../utils/puzzle.js');
const rules = require('../utils/rules.js');
const rankService = require('../utils/rank.js');
const sound = require('../utils/sound.js');

const DW = 750;
const SAVE_KEY = 'catwhere_save_v2';
const TOTAL_LEVELS = 60;
const PALETTE = ['#f4756b', '#6fd8c6', '#f78fb3', '#c9a7f5', '#ffd166', '#7fb3f5', '#f5a35c', '#9fd977', '#2e8b8b', '#a66a3f'];
const SYMBOLS = ['●', '▲', '■', '★', '◆', '♥', '✚', '♠', '▼', '◇'];
const MAX_HEARTS = 2;
const MAX_UNDOS = 3;
const CELL_GAP = 8;
const MAX_HISTORY = 60;

// 猫咪图鉴：按关数/星数/连击/完美通关逐步解锁
const CAT_COLLECTION = [
  { id: 0, name: '橘座', color: '#f5a35c', hint: '通关第 5 关', cond: { level: 5 } },
  { id: 1, name: '奶糖', color: '#f78fb3', hint: '通关第 10 关', cond: { level: 10 } },
  { id: 2, name: '青团', color: '#6fd8c6', hint: '通关第 15 关', cond: { level: 15 } },
  { id: 3, name: '蓝莓', color: '#7fb3f5', hint: '通关第 20 关', cond: { level: 20 } },
  { id: 4, name: '葡萄', color: '#c9a7f5', hint: '通关第 25 关', cond: { level: 25 } },
  { id: 5, name: '抹茶', color: '#9fd977', hint: '通关第 30 关', cond: { level: 30 } },
  { id: 6, name: '珊瑚', color: '#f4756b', hint: '通关第 35 关', cond: { level: 35 } },
  { id: 7, name: '星砂', color: '#ffd166', hint: '累计 20 颗星', cond: { stars: 20 } },
  { id: 8, name: '闪电', color: '#ff8a3d', hint: '单关达成 6 连击', cond: { combo: 6 } },
  { id: 9, name: '团子', color: '#2e8b8b', hint: '首次完美通关', cond: { perfect: 1 } },
  { id: 10, name: '夜影', color: '#a66a3f', hint: '通关第 45 关', cond: { level: 45 } },
  { id: 11, name: '猫王', color: '#2f8c78', hint: '通关全部 60 关', cond: { level: 60 } },
];

// 颜色主题（对应原 wxss）
const C = {
  pageBg: '#f5f7fa',
  card: '#ffffff',
  text: '#3d4667',
  subText: '#8a94b3',
  lightBg: '#eef2f7',
  border: '#dde4ee',
  coral: '#f4756b',
  green: '#6fd8c6',
  greenDeep: '#2f8c78',
  purple: '#c9a7f5',
  orange: '#ff8a3d',
  mask: 'rgba(61,70,103,0.5)',
  toolActive: '#bfe8dc',
};

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
}

// 关卡种子码：编码"关号 + 随机棋盘种子"，同一码进同一关且棋盘完全相同，供同题分享比拼。
// 格式 S<关号36>-<种子36>，例如 SC-1A2B3C；旧格式 S<关号> 仍兼容（沿用固定种子）。
function seedCode(level, seed) {
  const lv = Math.max(1, Math.floor(level)).toString(36).toUpperCase();
  if (typeof seed !== 'number' || !isFinite(seed)) return 'S' + lv;
  return 'S' + lv + '-' + (seed >>> 0).toString(36).toUpperCase();
}
function parseSeedCode(code) {
  if (!code || typeof code !== 'string' || code.charAt(0) !== 'S') return null;
  const parts = code.slice(1).split('-');
  const lv = parseInt(parts[0], 36);
  if (!(lv >= 1 && lv <= TOTAL_LEVELS)) return null;
  const seed = parts.length > 1 ? parseInt(parts[1], 36) : null;
  return { level: lv, seed: (seed !== null && isFinite(seed)) ? (seed >>> 0) : null };
}

class Game {
  constructor(canvas) {
    this.r = new Renderer(canvas, DW);
    let info = { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (e) {}
    this.r.resize(info);

    // 顶部安全区（避开刘海/灵动岛），换算为逻辑坐标
    let safeTopPx = 0;
    try {
      if (info.safeArea && typeof info.safeArea.top === 'number') {
        safeTopPx = info.safeArea.top;
      }
    } catch (e) {}
    this.topInset = Math.max(0, Math.round(safeTopPx / this.r.scale));

    // 状态（对应原 Page.data 与实例属性）
    let save = {};
    try { save = wx.getStorageSync(SAVE_KEY) || {}; } catch (e) {}
    this.bestTimes = save.bestTimes || {};
    this.bestStars = save.bestStars || {}; // 每关最佳星级
    this.bestScores = save.bestScores || {}; // 每关最高得分
    this.totalScore = save.totalScore || 0; // 累计得分（各关最高分之和）
    this.bestTotal = save.bestTotal || 0; // 历史最佳总通关用时
    this.maxLevel = Math.max(save.maxLevel || 1, 1);
    this.unlockedCats = Array.isArray(save.unlockedCats) ? save.unlockedCats : [];
    this.levelSeeds = save.levelSeeds || {}; // { 关号: 棋盘随机种子 }
    this.foundSolutions = save.foundSolutions || {}; // { 关号: { 解法编码: 1 } }
    this.bestCombo = save.bestCombo || 0;
    this.perfectClears = save.perfectClears || 0;
    this.nickname = save.nickname || ('喵友' + String(1000 + Math.floor(Math.random() * 9000)));
    this.colorblind = !!save.colorblind;
    this.soundOn = save.sound !== false;
    sound.setEnabled(this.soundOn);

    // 启动页《健康游戏忠告》：每个安装首次进入显示一次，确认后写入存档不再重复
    this.showHealthNotice = !save.healthNoticed;

    this.level = 1;
    this.size = 4;
    this.cells = [];
    this.region = [];
    this.catsPlaced = 0;
    this.hearts = [1, 1];
    this.heartShakeUntil = 0;
    this.markMode = false;
    this.hintsLeft = 1;
    this.undosLeft = MAX_UNDOS;
    this.usedHint = false;
    this.combo = 0;
    this.history = [];
    this.seconds = 0;
    this.timerBase = 0;
    this.timerStart = 0;
    this.timer = null;
    this.won = false;
    this.isNewBest = false;
    this.allCleared = false;

    this.overlay = null; // null | 'levels' | 'rank' | 'win' | 'rules' | 'settings' | 'hearts'
    this.toast = null; // { text, until }
    this.dialog = null; // 自绘确认弹窗
    this.settings = null; // 自绘菜单

    this.touchStartPos = null;
    this.touchStartIdx = -1;
    this.highlightRegion = -1; // 按住格子时高亮同区域
    this.suppressTap = false; // 拖动/长按已触发时抑制随后的 tap
    this.listScroll = { levels: 0, rank: 0, gallery: 0 };

    this.rankReady = false;
    this.myRankText = '';
    this.rankList = [];
    this.meInfo = null;
    this.rankFixTried = false; // 旧记录补报总用时的重试保护

    // 微信好友排行榜（开放数据域）
    this.openDataContext = null;
    this.sharedCanvas = null;
    this.friendRankActive = false;
    try {
      if (typeof wx.getOpenDataContext === 'function') {
        this.openDataContext = wx.getOpenDataContext();
        this.sharedCanvas = this.openDataContext && this.openDataContext.canvas;
      }
    } catch (e) { /* 不支持开放数据域时降级 */ }

    // 布局缓存
    this.layout = null;
    this.boardHit = []; // 每格命中矩形，长按检测用

    // 分享进入：解析 query 中的种子码，跳到同一关、同一随机棋盘比拼
    let startLevel = Math.min(Math.max(save.level || 1, 1), this.maxLevel);
    let startSeed = null;
    try {
      const opts = (typeof wx.getLaunchOptionsSync === 'function') ? wx.getLaunchOptionsSync() : null;
      const q = (opts && opts.query) || {};
      const parsed = parseSeedCode(q.seed);
      if (parsed) { startLevel = parsed.level; startSeed = parsed.seed; }
      else {
        const fromLevel = parseInt(q.level, 10);
        if (fromLevel >= 1 && fromLevel <= TOTAL_LEVELS) startLevel = fromLevel;
      }
    } catch (e) {}
    this.loadLevel(startLevel, startSeed);
    this.bindInput();
    this.setupShare();
    this.refreshRank();
    this.loop();
  }

  // 配置分享：注册被动转发（右上角 ··· → 转发），开发版也能用
  setupShare() {
    try {
      if (typeof wx.showShareMenu === 'function') {
        wx.showShareMenu({ withShareTicket: true });
      }
      if (typeof wx.onShareAppMessage === 'function') {
        const self = this;
        wx.onShareAppMessage(function () {
          const code = seedCode(self.level, self.currentSeed);
          return {
            title: '猫猫请落座 · 挑战同题第' + self.level + '关（种子' + code + '）！',
            query: 'from=invite&level=' + self.level + '&seed=' + code,
            imageUrl: '',
          };
        });
      }
    } catch (e) { /* 分享能力不可用时静默降级 */ }
  }

  /* ---------------- 存档与关卡 ---------------- */
  persist(nextLevel) {
    try {
      wx.setStorageSync(SAVE_KEY, {
        level: nextLevel || this.level,
        maxLevel: this.maxLevel,
        bestTimes: this.bestTimes,
        bestStars: this.bestStars,
        bestScores: this.bestScores,
        totalScore: this.totalScore,
        bestTotal: this.bestTotal,
        unlockedCats: this.unlockedCats,
        levelSeeds: this.levelSeeds,
        foundSolutions: this.foundSolutions,
        bestCombo: this.bestCombo,
        perfectClears: this.perfectClears,
        colorblind: this.colorblind,
        nickname: this.nickname,
        sound: this.soundOn,
        healthNoticed: !this.showHealthNotice,
      });
    } catch (e) {}
  }

  // 难度曲线：4x4→10x10 逐级解锁；16关起启用限时星级
  // 棋盘保持纯色块 + 猫，不设障碍/诱饵；难度由尺寸、1次提示、2条命和限时星级承担
  // 返回 { size, starEnabled, star3, star2 }
  levelConfig(level) {
    let size;
    if (level <= 3) size = 4;
    else if (level <= 6) size = 5;
    else if (level <= 9) size = 6;
    else if (level <= 12) size = 7;
    else if (level <= 15) size = 8;
    else if (level <= 30) size = 9;
    else size = 10;

    const starEnabled = level >= 16;            // 16关起按用时评星

    // 星级时间阈值（秒）：棋盘越大越宽松；用时≤star3三星，≤star2二星，否则一星
    const star3 = Math.round(size * size * 1.6 + 10);
    const star2 = Math.round(star3 * 1.9);
    return { size: size, starEnabled: starEnabled, star3: star3, star2: star2 };
  }

  levelSize(level) { return this.levelConfig(level).size; }
  hintQuota(level) { return 1; }

  loadLevel(level, seedOverride) {
    const cfg = this.levelConfig(level);
    const size = cfg.size;
    // 关卡棋盘种子：优先用指定种子（分享进入/换题），否则取存档，首次随机生成并存档
    let seed = (typeof seedOverride === 'number' && isFinite(seedOverride))
      ? (seedOverride >>> 0)
      : this.levelSeeds[level];
    if (typeof seed !== 'number' || !isFinite(seed)) {
      seed = Math.floor(Math.random() * 4294967296) >>> 0;
    }
    this.levelSeeds[level] = seed; // 指定/随机种子都写回存档
    this.currentSeed = seed;
    const rand = puzzle.rng(seed);
    const gen = puzzle.generate(size, rand);
    const colorOf = puzzle.assignColors(gen.region, size, PALETTE);
    const symbols = puzzle.shuffle(SYMBOLS.slice(), rand);

    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const reg = gen.region[idx];
        cells.push({
          idx, row: r, col: c, region: reg,
          color: PALETTE[colorOf[reg]], symbol: symbols[reg],
          state: 'empty', auto: false,
        });
      }
    }
    this.region = gen.region;
    this.cells = cells;
    this.levelConfigCur = cfg;
    this.level = level;
    this.size = size;
    this.maxLevel = Math.max(this.maxLevel || 1, level);
    this.catsPlaced = 0; // 不再送预置猫，全部由玩家放置
    this.hearts = new Array(MAX_HEARTS).fill(1);
    this.markMode = false;
    this.hintsLeft = this.hintQuota(level);
    this.undosLeft = MAX_UNDOS;
    this.usedHint = false;
    this.combo = 0;
    this.history = [];
    this.won = false;
    this.isNewBest = false;
    this.allCleared = level >= TOTAL_LEVELS;
    this.overlay = null;
    this.listScroll.levels = 0;
    this.listScroll.gallery = 0;
    this.seconds = 0; // 每关计时从零开始（关键：不能延续上一关）
    this.stopTimer();
    this.persist(level);
    this.startTimer();
  }

  /* ---------------- 计时 ---------------- */
  startTimer() {
    this.stopTimer();
    this.timerBase = this.seconds;
    this.timerStart = Date.now();
    const self = this;
    this.timer = setInterval(function () {
      if (self.showHealthNotice || self.won || self.overlay) return;
      self.seconds = self.timerBase + Math.floor((Date.now() - self.timerStart) / 1000);
    }, 300);
  }
  stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  pauseTimer() {
    if (!this.timer) return;
    this.seconds = this.timerBase + Math.floor((Date.now() - this.timerStart) / 1000);
    clearInterval(this.timer);
    this.timer = null;
  }
  resumeTimer() {
    if (this.won || this.timer) return;
    this.startTimer();
  }

  /* ---------------- 排行榜 ---------------- */
  refreshRank() {
    const self = this;
    rankService.fetchRanking().then(function (res) {
      self.rankReady = true;
      self.meInfo = res.me || null;
      self.myRankText = res.me ? ('第' + res.me.rank + '名') : '未上榜';
      self.rankList = (res.top || []).map(function (r) {
        return {
          rank: r.rank, nickname: r.nickname, maxLevel: r.maxLevel,
          score: r.score || 0, totalText: formatTime(r.total), timeText: formatTime(r.time), isMe: !!r.isMe,
        };
      });
      // 兼容旧记录：我的成绩有本关用时但缺总用时，用本地数据补报一次（只尝试一次，避免死循环）
      if (res.me && res.me.time > 0 && (!res.me.total || res.me.total <= 0) && !self.rankFixTried) {
        self.rankFixTried = true;
        const localTotal = self.totalTime();
        if (localTotal > 0) {
          rankService.submitScore(self.maxLevel, localTotal, res.me.time, self.nickname)
            .then(function () { self.refreshRank(); })
            .catch(function () {});
        }
      }
    }).catch(function () {
      self.rankReady = false;
    });
  }
  // 总通关时间：所有已通关关卡最佳用时之和
  totalTime() {
    let sum = 0;
    for (const k in this.bestTimes) {
      sum += this.bestTimes[k] || 0;
    }
    return Math.floor(sum);
  }

  submitScore(level, total, single, score) {
    rankService.submitScore(level, total, single, this.nickname, score).then(() => this.refreshRank()).catch(() => {});
  }

  /* ---------------- 游戏操作（复用原逻辑） ---------------- */
  pushHistory() {
    this.history.push({
      states: this.cells.map(function (c) { return c.state; }),
      autos: this.cells.map(function (c) { return !!c.auto; }),
      catsPlaced: this.catsPlaced,
      hintsLeft: this.hintsLeft,
    });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  currentCats() {
    const out = [];
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.state === 'cat') out.push({ row: c.row, col: c.col, region: c.region });
    }
    return out;
  }

  vibrate() { try { wx.vibrateShort({ type: 'light' }); } catch (e) {} }
  showToast(text, dur) { this.toast = { text, until: Date.now() + (dur || 1600) }; }

  onCellTap(idx) {
    if (this.won || this.overlay || this.dialog) return;
    if (this.suppressTap) { this.suppressTap = false; return; }
    const cell = this.cells[idx];
    if (!cell) return;
    if (this.markMode) { this.toggleBan(idx); return; }
    if (cell.state === 'cat') {
      if (this.undosLeft <= 0) { this.showToast('本关撤销次数已用完'); return; }
      this.undosLeft -= 1; // 点格子取消也算一次撤销
      this.combo = 0; // 取消打破连续正确
      this.pushHistory();
      cell.state = 'empty'; cell.auto = false;
      sound.play('tap');
      this.catsPlaced--;
      return;
    }
    if (cell.state === 'ban') {
      this.pushHistory();
      cell.state = 'empty'; cell.auto = false;
      sound.play('tap');
      return;
    }
    this.tryPlaceCat(idx);
  }

  toggleBan(idx) {
    const cell = this.cells[idx];
    if (!cell) return;
    this.pushHistory();
    if (cell.state === 'ban') {
      cell.state = 'empty'; cell.auto = false;
    } else {
      if (cell.state === 'cat') { this.catsPlaced -= 1; this.combo = 0; }
      cell.state = 'ban'; cell.auto = false;
    }
    sound.play('tap');
    this.vibrate();
  }

  tryPlaceCat(idx) {
    const target = this.cells[idx];
    if (!target) return;
    const reason = rules.conflictReason(this.currentCats(), target, []);
    if (reason) { this.penalize(target, reason); return; }
    this.pushHistory();
    target.state = 'cat';
    sound.play('place');
    this.catsPlaced += 1;
    this.combo += 1;
    if (this.catsPlaced === this.size) this.finishLevel();
  }

  penalize(target, reason) {
    this.pushHistory();
    this.combo = 0;
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      if (this.hearts[i]) { this.hearts[i] = 0; break; }
    }
    target.state = 'ban';
    target.auto = true;
    sound.play('error');
    this.heartShakeUntil = Date.now() + 450;
    this.showToast(reason, 1600);
    const alive = this.hearts.some(function (v) { return v; });
    if (!alive) {
      const self = this;
      const level = this.level;
      setTimeout(function () {
        if (!self.won) self.dialog = {
          title: '喵呜～',
          content: '爱心用完了，这一关重新来过吧！',
          confirm: '重试本关', showCancel: false,
          onConfirm: function () { self.loadLevel(level); },
        };
      }, 400);
    }
  }

  totalStars() {
    let sum = 0;
    for (const lv in this.bestStars) sum += this.bestStars[lv] || 0;
    return sum;
  }

  // 单关得分：难度基础 + 用时 + 连击 + 完美 + 星级 - 取消 - 生命消耗
  calcScore(level, used, combo, perfect, stars) {
    const cfg = this.levelConfig(level);
    const cancels = Math.max(0, MAX_UNDOS - (this.undosLeft != null ? this.undosLeft : MAX_UNDOS));
    const lostHearts = Math.max(0, MAX_HEARTS - this.hearts.filter(function (v) { return v; }).length);
    const timeBonus = Math.max(0, Math.round(cfg.star2 - used) * 5);
    const base = level * 100;
    const score = base + timeBonus + combo * 30 + (perfect ? 200 : 0) + stars * 50
      - cancels * 40 - lostHearts * 80;
    return Math.max(0, score);
  }

  // 当前棋盘摆法编码：每行猫所在列拼接，作为解的唯一标识
  currentSolutionKey() {
    const cols = new Array(this.size).fill(-1);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.state === 'cat') cols[c.row] = c.col;
    }
    return cols.join(',');
  }

  solutionKeyFor(level, seed) { return level + ':' + seed; }

  foundSolutionCount(level, seed) {
    const key = this.solutionKeyFor(level, typeof seed === 'number' ? seed : this.levelSeeds[level]);
    const set = this.foundSolutions[key];
    return set ? Object.keys(set).length : 0;
  }

  // 按关卡/星数/连击/完美通关条件解锁猫咪，返回本次新解锁项
  checkCatUnlocks() {
    const earned = [];
    for (let i = 0; i < CAT_COLLECTION.length; i++) {
      const cat = CAT_COLLECTION[i];
      if (this.unlockedCats.indexOf(cat.id) >= 0) continue;
      const cond = cat.cond;
      let ok = false;
      if (cond.level) ok = !!this.bestTimes[cond.level] || this.maxLevel > cond.level;
      else if (cond.stars) ok = this.totalStars() >= cond.stars;
      else if (cond.combo) ok = this.bestCombo >= cond.combo;
      else if (cond.perfect) ok = this.perfectClears >= cond.perfect;
      if (ok) { this.unlockedCats.push(cat.id); earned.push(cat); }
    }
    return earned;
  }

  finishLevel() {
    this.stopTimer();
    const level = this.level;
    const used = this.seconds;
    const prev = this.bestTimes[level];
    const isNewBest = !prev || used < prev;
    if (isNewBest) this.bestTimes[level] = used;
    if (level + 1 > this.maxLevel) this.maxLevel = Math.min(level + 1, TOTAL_LEVELS);
    this.won = true;
    this.isNewBest = isNewBest;
    this.allCleared = level >= TOTAL_LEVELS;
    sound.play('win');
    this.vibrate();
    this.overlay = 'win';
    const total = this.totalTime();
    // 更新历史最佳总用时（总用时越小越好）
    if (!this.bestTotal || total < this.bestTotal) this.bestTotal = total;
    this.persist(Math.min(level + 1, this.maxLevel));
    // 结算页 4 项数据：本关用时、总通关用时、最佳本关、最佳总通关
    // 星级：16关起启用，按本关用时评定（3星最快），存档记录每关最佳星级
    let stars = 0;
    const cfg = this.levelConfigCur || this.levelConfig(level);
    if (cfg.starEnabled) {
      stars = used <= cfg.star3 ? 3 : (used <= cfg.star2 ? 2 : 1);
      if (this.usedHint) stars = Math.min(stars, 2); // 用过提示最高2星
      if (!this.bestStars) this.bestStars = {};
      if ((this.bestStars[level] || 0) < stars) {
        this.bestStars[level] = stars;
        this.persist(Math.min(level + 1, this.maxLevel));
      }
    }
    // 记录本次发现的摆法（按当前随机棋盘种子归档）
    const solKey = this.solutionKeyFor(level, this.currentSeed);
    if (!this.foundSolutions[solKey]) this.foundSolutions[solKey] = {};
    this.foundSolutions[solKey][this.currentSolutionKey()] = 1;
    const perfect = this.combo >= this.size && !this.usedHint;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (perfect) this.perfectClears = (this.perfectClears || 0) + 1;
    // 得分：记录本关最高分，累计得分为各关最高分之和
    const score = this.calcScore(level, used, this.combo, perfect, stars);
    if (!this.bestScores) this.bestScores = {};
    const isNewScore = score > (this.bestScores[level] || 0);
    if (isNewScore) this.bestScores[level] = score;
    this.totalScore = 0;
    for (const k in this.bestScores) this.totalScore += this.bestScores[k] || 0;
    this.winStats = {
      single: used,
      total: total,
      bestSingle: this.bestTimes[level],
      bestTotal: this.bestTotal,
      stars: stars,
      starEnabled: cfg.starEnabled,
      combo: this.combo,
      perfect: perfect,
      usedHint: this.usedHint,
      solutions: this.foundSolutionCount(level, this.currentSeed),
      score: score,
      bestScore: this.bestScores[level],
      isNewScore: isNewScore,
    };
    const earned = this.checkCatUnlocks();
    this.persist(Math.min(level + 1, this.maxLevel));
    if (earned.length) {
      this.showToast('解锁新猫咪：' + earned.map(function (c) { return c.name; }).join('、'), 2200);
    }
    this.submitScore(level, total, used, this.totalScore);
    this.reportFriendScore(level, total, used, this.totalScore);
  }

  // 上报成绩到微信托管数据，供开放数据域好友榜读取（真实微信昵称/头像由微信提供）
  reportFriendScore(level, total, seconds, score) {
    if (!this.openDataContext) return;
    try {
      if (typeof wx.setUserCloudStorage !== 'function') return;
      const bestLevel = Math.max(level, 1);
      // value 必须是字符串；存累计得分、关数、总通关时间、单关时间
      const value = JSON.stringify({
        score: Math.max(0, Math.floor(score || 0)),
        level: bestLevel,
        total: Math.max(0, Math.floor(total)),
        time: Math.max(0, Math.floor(seconds)),
      });
      wx.setUserCloudStorage({
        KVDataList: [{ key: 'cat_rank_v1', value: value }],
        success: function () {},
        fail: function (e) { console.warn('[好友榜] 成绩上报失败:', e && e.errMsg || e); },
      });
    } catch (e) { console.warn('[好友榜] 成绩上报异常:', e); }
  }

  onUndo() {
    if (this.won || this.overlay) return;
    if (!this.history.length) { this.showToast('没有可以撤销的步骤'); return; }
    if (this.undosLeft <= 0) { this.showToast('本关撤销次数已用完'); return; }
    this.undosLeft -= 1;
    const snap = this.history.pop();
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].state = snap.states[i];
      this.cells[i].auto = !!snap.autos[i];
    }
    this.catsPlaced = snap.catsPlaced;
    this.hintsLeft = Math.min(snap.hintsLeft, this.hintsLeft);
    this.combo = 0; // 撤销打断连续正确
  }

  onHint() {
    if (this.won || this.overlay) return;
    if (this.hintsLeft <= 0) { this.showToast('本关提示已用完'); return; }
    const cats = this.currentCats();
    const hint = puzzle.nextHint(this.size, this.region, cats);
    if (!hint) { this.showToast('当前摆法走不通，先撤掉几只小猫吧', 2000); return; }
    const idx = hint.row * this.size + hint.col;
    this.pushHistory();
    this.cells[idx].state = 'cat';
    sound.play('hint');
    this.catsPlaced += 1;
    this.hintsLeft -= 1;
    this.usedHint = true;
    this.vibrate();
    if (this.catsPlaced === this.size) this.finishLevel();
  }

  onClear() {
    if (this.won || this.overlay) return;
    let hasAny = false;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.state === 'cat' || c.state === 'ban') { hasAny = true; break; }
    }
    if (!hasAny) return;
    this.pushHistory();
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].state = 'empty';
      this.cells[i].auto = false;
    }
    this.catsPlaced = 0;
    this.combo = 0;
  }

  // 拖拽批量标记：一次拖拽算一步历史，可一次撤销
  beginDragMark(idx) {
    const cell = this.cells[idx];
    if (!cell) return false;
    const target = (cell.state === 'ban') ? 'empty' : 'ban';
    this.pushHistory();
    this.dragMark = { target: target, visited: {}, soundPlayed: false };
    this.applyDragMark(idx);
    return true;
  }

  // 对划过的格子施加与起始格相同的标记（ban 或 清除）
  applyDragMark(idx) {
    const d = this.dragMark;
    if (!d || d.visited[idx]) return;
    const cell = this.cells[idx];
    if (!cell) return;
    d.visited[idx] = true;
    if (d.target === 'ban') {
      if (cell.state === 'cat') { this.catsPlaced -= 1; this.combo = 0; }
      cell.state = 'ban';
      cell.auto = false;
    } else {
      if (cell.state !== 'ban') return;
      cell.state = 'empty';
      cell.auto = false;
    }
    if (!d.soundPlayed) { sound.play('tap'); d.soundPlayed = true; }
  }

  onNextLevel() {
    if (this.level >= TOTAL_LEVELS) { this.showToast('已经是最后一关啦'); return; }
    this.loadLevel(this.level + 1);
  }

  // 换一题：当前关换一个随机棋盘（成绩按关号保留，解法收集按新棋盘重新记）
  rerollLevel() {
    const seed = Math.floor(Math.random() * 4294967296) >>> 0;
    this.loadLevel(this.level, seed);
    this.showToast('换了一道新题，加油！');
  }

  // 邀请好友：优先主动拉起转发；开发版受限时引导用户点右上角 ···
  inviteFriend() {
    try {
      if (typeof wx.shareAppMessage === 'function') {
        const code = seedCode(this.level, this.currentSeed);
        wx.shareAppMessage({
          title: '猫猫请落座 · 挑战同题第' + this.level + '关（种子' + code + '）！',
          query: 'from=invite&level=' + this.level + '&seed=' + code,
          imageUrl: '',
        });
        // 主动转发在开发/体验版常被微信限制；提示兜底路径
        this.showToast('若没弹出，请点右上角 ··· 转发', 2200);
      } else {
        this.showToast('点击右上角 ··· 转发给好友', 2200);
      }
    } catch (e) {
      this.showToast('点击右上角 ··· 转发给好友', 2200);
    }
  }

  /* ---------------- 输入 ---------------- */
  bindInput() {
    const self = this;
    const DRAG_THRESHOLD = 12; // 逻辑像素：手指移动超过此距离即视为拖动标记
    const cellAt = function (clientX, clientY) {
      const a = self.r.hitTest(clientX / self.r.scale, clientY / self.r.scale);
      return a && a.data && a.data.longPress ? a.data.idx : -1;
    };

    wx.onTouchStart(function (e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      self.touchStartPos = { x: t.clientX, y: t.clientY };
      self.touchStartIdx = cellAt(t.clientX, t.clientY);
      self.highlightRegion = -1;
      if (self.touchStartIdx >= 0 && !self.won && !self.overlay && !self.dialog && self.cells[self.touchStartIdx]) {
        self.highlightRegion = self.cells[self.touchStartIdx].region;
      }
      self.suppressTap = false;
      self.dragMark = null;
      // 标记模式下按下即标记，便于逐格点选；普通模式等拖动超过阈值再标记
      if (self.markMode && self.touchStartIdx >= 0 && !self.won && !self.overlay && !self.dialog) {
        self.beginDragMark(self.touchStartIdx);
        self.suppressTap = true;
      }
    });

    wx.onTouchMove(function (e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (self.dragMark) {
        self.highlightRegion = -1; // 进入拖拽标记后不再高亮区域
        const idx = cellAt(t.clientX, t.clientY);
        if (idx >= 0) self.applyDragMark(idx);
        return;
      }
      // 普通模式：直接拖动即批量标记，无需先点「标记」按钮
      if (!self.touchStartPos || self.touchStartIdx < 0 || self.won || self.overlay || self.dialog) return;
      const dx = Math.abs(t.clientX - self.touchStartPos.x) / self.r.scale;
      const dy = Math.abs(t.clientY - self.touchStartPos.y) / self.r.scale;
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
      self.highlightRegion = -1;
      if (self.beginDragMark(self.touchStartIdx)) {
        const idx = cellAt(t.clientX, t.clientY);
        if (idx >= 0) self.applyDragMark(idx);
        self.suppressTap = true;
      }
    });

    wx.onTouchEnd(function (e) {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      self.highlightRegion = -1; // 松手后取消高亮
      const lx = t.clientX / self.r.scale;
      const ly = t.clientY / self.r.scale;

      // 拖拽标记会话：本次手势结束，不执行单格 tap
      if (self.dragMark) {
        self.dragMark = null;
        self.touchStartPos = null;
        self.touchStartIdx = -1;
        self.suppressTap = false;
        return;
      }

      // 拖动/标记模式单击已触发：本次 touchend 不执行 tap
      if (self.suppressTap) {
        self.touchStartPos = null;
        self.touchStartIdx = -1;
        self.suppressTap = false;
        return;
      }

      // 浮层滚动：拖动列表
      if (self.touchStartPos) {
        const dy = (t.clientY - self.touchStartPos.y) / self.r.scale;
        const dx = (t.clientX - self.touchStartPos.x) / self.r.scale;
        if (Math.abs(dy) > 12 && (self.overlay === 'levels' || self.overlay === 'rank' || self.overlay === 'friendRank' || self.overlay === 'gallery')) {
          if (self.overlay === 'friendRank') {
            if (self.openDataContext) {
              try { self.openDataContext.postMessage({ action: 'scroll', dy: -dy }); } catch (e) {}
            }
          } else {
            const key = self.overlay;
            const max = self.overlay === 'levels' ? Math.max(0, Math.ceil(TOTAL_LEVELS / 8) * 96 - 780)
              : self.overlay === 'gallery' ? Math.max(0, Math.ceil(CAT_COLLECTION.length / 4) * 164 - 760)
              : Math.max(0, self.rankList.length * 92 - 720);
            self.listScroll[key] = Math.max(0, Math.min(max, self.listScroll[key] - dy));
          }
          self.touchStartPos = null;
          self.touchStartIdx = -1;
          return;
        }
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) { self.touchStartPos = null; self.touchStartIdx = -1; return; }
      }
      self.touchStartPos = null;
      self.touchStartIdx = -1;

      const a = self.r.hitTest(lx, ly);
      if (!a) return;
      if (a.data && a.data.onTap) { a.data.onTap(); return; }
      if (a.handler) a.handler(a.data);
    });

    const onHide = function () { self.pauseTimer(); };
    const onShow = function () { self.resumeTimer(); };
    if (wx.onHide) wx.onHide(onHide);
    if (wx.onShow) wx.onShow(onShow);
  }

  /* ---------------- 主循环 ---------------- */
  loop() {
    const self = this;
    const raf = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame
      : ((wx.requestAnimationFrame && wx.requestAnimationFrame.bind(wx)) || function (cb) { setTimeout(cb, 16); });
    const draw = function () {
      self.render();
      raf(draw);
    };
    raf(draw);
  }

  /* ---------------- 布局 ---------------- */
  computeLayout() {
    const r = this.r;
    const W = r.DW;
    const pad = 30;
    // 顶部偏移 = 系统安全区（刘海）+ 额外下移（避开真机调试悬浮胶囊）
    const oy = (this.topInset || 0) + 44;
    const topBarY = 34 + oy;
    const heartsY = 116 + oy;
    const progressY = 196 + oy;
    const rulesY = 268 + oy;
    const rulesH = 158;

    const boardMaxW = W - pad * 2;
    let cellSize = Math.floor((boardMaxW - CELL_GAP * (this.size + 1)) / this.size);
    cellSize = Math.max(30, Math.min(180, cellSize));
    const boardInner = cellSize * this.size + CELL_GAP * (this.size + 1);
    const boardX = (W - boardInner) / 2;
    const boardY = rulesY + rulesH + 24;
    const bottomY = boardY + boardInner + 28;
    const bottomH = 108;

    this.layout = {
      pad, W, topBarY, heartsY, progressY, rulesY, rulesH,
      cellSize, boardInner, boardX, boardY, bottomY, bottomH,
      cellFont: Math.max(16, Math.round(cellSize * 0.58)),
      cellFontSmall: Math.max(13, Math.round(cellSize * 0.4)),
      cellFontTiny: Math.max(11, Math.round(cellSize * 0.32)),
    };
  }

  /* ---------------- 渲染 ---------------- */
  render() {
    const r = this.r;
    r.begin();
    r.clear();
    if (this.showHealthNotice) { this.drawHealthNotice(); return; }
    this.computeLayout();
    r.setFill(C.pageBg);
    r.fillRect(0, 0, r.DW, r.DH);

    this.drawTopBar();
    this.drawHearts();
    this.drawProgress();
    this.drawRulesCard();
    this.drawBoard();
    this.drawBottomBar();

    if (this.overlay === 'levels') this.drawLevelsPanel();
    else if (this.overlay === 'gallery') this.drawGalleryPanel();
    else if (this.overlay === 'rank') this.drawRankPanel();
    else if (this.overlay === 'friendRank') this.drawFriendRankPanel();
    else if (this.overlay === 'win') this.drawWinPanel();

    if (this.dialog) this.drawDialog();
    if (this.settings) this.drawSettings();
    if (this.toast && Date.now() < this.toast.until) this.drawToast();
    else this.toast = null;
  }

  // 启动页：健康游戏忠告（微信平台强制忠告之后、进入游戏之前显示）
  drawHealthNotice() {
    const r = this.r;
    r.setFill(C.pageBg);
    r.fillRect(0, 0, r.DW, r.DH);
    const cx = r.DW / 2;
    const top = (this.topInset || 0) + Math.max(90, r.DH * 0.12);
    const cardW = r.DW - 120;
    const cardX = (r.DW - cardW) / 2;

    r.text('健康游戏忠告', cx, top + 40, 42, C.text, 'center', 'middle', 'bold');
    r.fillRoundRect(cardX, top + 90, cardW, 360, 28, C.card);
    const lines = [
      '抵制不良游戏，拒绝盗版游戏。',
      '注意自我保护，谨防受骗上当。',
      '适度游戏益脑，沉迷游戏伤身。',
      '合理安排时间，享受健康生活。',
    ];
    for (let i = 0; i < lines.length; i++) {
      r.text(lines[i], cx, top + 160 + i * 76, 28, C.text, 'center', 'middle');
    }
    r.text('猫猫请落座', cx, top + 500, 24, C.subText, 'center', 'middle');

    const btnW = 300, btnH = 88, btnY = top + 550;
    r.fillRoundRect(cx - btnW / 2, btnY, btnW, btnH, 44, C.coral);
    r.text('我已阅读并同意', cx, btnY + btnH / 2, 30, '#ffffff', 'center', 'middle', 'bold');
    r.addHit(cx - btnW / 2, btnY, btnW, btnH, null, { onTap: () => this.dismissHealthNotice() });
  }

  dismissHealthNotice() {
    if (!this.showHealthNotice) return;
    this.showHealthNotice = false;
    this.persist();
    // 忠告页停留时间不计入本关用时，重新校准计时基准
    this.timerBase = this.seconds;
    this.timerStart = Date.now();
  }

  drawTopBar() {
    const r = this.r, L = this.layout;
    const cy = L.topBarY + 34;
    // 设置齿轮
    r.gear(66, cy, 40, C.text);
    r.addHit(20, L.topBarY, 92, 68, null, { onTap: () => this.openSettings() });
    // 关卡标题
    r.fillRoundRect(L.W / 2 - 110, L.topBarY + 2, 220, 64, 32, C.card);
    r.text('第' + this.level + '关', L.W / 2, cy, 34, C.text, 'center', 'middle', 'bold');
    r.addHit(L.W / 2 - 110, L.topBarY, 220, 68, null, { onTap: () => { this.overlay = 'levels'; this.listScroll.levels = 0; } });
    // 菜单
    r.menu(L.W - 66, cy, 44, C.text);
    r.addHit(L.W - 112, L.topBarY, 92, 68, null, { onTap: () => { this.overlay = 'levels'; this.listScroll.levels = 0; } });
  }

  drawHearts() {
    const r = this.r, L = this.layout;
    const cy = L.heartsY + 30;
    r.question(66, cy, 46, C.text);
    r.addHit(20, L.heartsY, 92, 60, null, { onTap: () => { this.dialog = {
      title: '玩法说明',
      content: '每一行、每一列、每个颜色区域各放一只小猫，小猫之间不能相邻（含斜角）。每关只有2颗爱心和1次提示，放错会扣爱心，爱心用完要重玩本关。单击格子放猫或移除；按住格子可高亮同色区域方便找区域，按住并划过多个格子可直接批量标记或清除 ✕，无需先点「标记」按钮。每关仅3次撤销，点格子取消已放的猫也扣1次撤销次数，撤销或取消都会打断连击；连续放对不出错可累计连击，完美通关可解锁猫咪图鉴。用过提示本关最高2星；第16关起按用时评1-3星。每关棋盘随机生成，可在设置里「换一题」或用种子码和朋友挑战同一棋盘。通关得分=关卡难度+用时+连击+完美+星级-取消-生命，累计得分越高排行榜越靠前。',
      confirm: '知道了', showCancel: false, onConfirm: null,
    }; } });

    const shaking = Date.now() < this.heartShakeUntil;
    const startX = L.W / 2 - 30 - 42 * (this.hearts.length - 1);
    for (let i = 0; i < this.hearts.length; i++) {
      let off = 0;
      if (shaking) off = Math.sin(Date.now() / 25 + i) * 8;
      const hx = startX + i * 84 + 30 + off;
      if (this.hearts[i]) r.heart(hx, cy, 52, C.coral, true);
      else { r.heart(hx, cy, 52, C.border, false); }
    }
  }

  drawProgress() {
    const r = this.r, L = this.layout;
    const y = L.progressY;
    const h = 60;
    const gap = 16;
    const pills = [
      { icon: 'cat', text: this.catsPlaced + ' / ' + this.size },
      { icon: 'clock', text: formatTime(this.seconds) },
    ];
    if (this.combo >= 2) pills.push({ icon: 'combo', text: this.combo + ' 连击' });
    if (this.rankReady) pills.push({ icon: 'trophy', text: this.myRankText, tap: () => { this.overlay = 'rank'; this.refreshRank(); } });

    const pw = (L.W - L.pad * 2 - gap * (pills.length - 1)) / pills.length;
    for (let i = 0; i < pills.length; i++) {
      const x = L.pad + i * (pw + gap);
      r.fillRoundRect(x, y, pw, h, 30, C.card);
      const cy = y + h / 2;
      const iconW = 48;
      const ix = x + 34;
      if (pills[i].icon === 'cat') r.cat(ix, cy, 34, C.coral);
      else if (pills[i].icon === 'clock') r.clock(ix, cy, 34, C.text);
      else if (pills[i].icon === 'combo') r.text('×', ix, cy, 40, C.orange, 'center', 'middle', 'bold');
      else if (pills[i].icon === 'trophy') r.trophy(ix, cy, 34, C.orange);
      r.text(pills[i].text, x + iconW + 8, cy, 26, C.text, 'left', 'middle', 'bold');
      if (pills[i].tap) r.addHit(x, y, pw, h, null, { onTap: pills[i].tap });
    }
  }

  drawRulesCard() {
    const r = this.r, L = this.layout;
    const y = L.rulesY, h = L.rulesH;
    r.fillRoundRect(L.pad, y, L.W - L.pad * 2, h, 24, C.card);
    const colW = (L.W - L.pad * 2) / 3;
    const items = [
      { sq: [[0, 1, 0], [2, 2, 2]], lines: ['一种颜色', '1只小猫'] },
      { sq: [[1, 2, 0], [2, 2, 3]], lines: ['每行每列', '各1只小猫'] },
      { sq: [[1, 2, 0], [2, 3, 2]], lines: ['小猫不能', '相邻'] },
    ];
    for (let i = 0; i < items.length; i++) {
      const cx = L.pad + colW * i + colW / 2;
      this.drawMiniGrid(cx - 42, y + 22, items[i].sq);
      r.text(items[i].lines[0], cx, y + 112, 20, C.text, 'center', 'middle');
      r.text(items[i].lines[1], cx, y + 136, 20, C.text, 'center', 'middle');
    }
  }

  drawMiniGrid(gx, gy, map) {
    const r = this.r;
    const miniColors = [C.coral, C.green, C.purple, '#ffd166'];
    const s = 26, g = 4;
    for (let row = 0; row < map.length; row++) {
      for (let col = 0; col < map[row].length; col++) {
        const v = map[row][col];
        if (v === 2) continue;
        const x = gx + col * (s + g), y = gy + row * (s + g);
        r.fillRoundRect(x, y, s, s, 6, miniColors[v] || C.lightBg);
        if (v === 1 || v === 3) r.cat(x + s / 2, y + s / 2 + 1, 20, '#3d4667');
      }
    }
  }

  // 矢量叉号：手动标记为带阴影白色，自动判错为纯白
  drawCross(cx, cy, size, color, plain) {
    const r = this.r, c = r.ctx;
    const k = size * 0.42;
    c.save();
    if (!plain) {
      c.shadowColor = 'rgba(0,0,0,0.45)';
      c.shadowBlur = 5;
    }
    c.strokeStyle = color;
    c.lineWidth = Math.max(3, size * 0.14);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - k, cy - k); c.lineTo(cx + k, cy + k); c.stroke();
    c.beginPath(); c.moveTo(cx + k, cy - k); c.lineTo(cx - k, cy + k); c.stroke();
    c.restore();
  }

  drawBoard() {
    const r = this.r, L = this.layout;
    const bx = L.boardX, by = L.boardY, cs = L.cellSize, gap = CELL_GAP, n = this.size;
    r.fillRoundRect(bx - 12, by - 12, L.boardInner + 24, L.boardInner + 24, 20, C.card);
    this.boardHit = [];
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const x = bx + gap + cell.col * (cs + gap);
      const y = by + gap + cell.row * (cs + gap);

      r.fillRoundRect(x, y, cs, cs, 10, cell.color);
      if (cell.state === 'cat') {
        r.cat(x + cs / 2, y + cs / 2 + 2, cs * 0.72, cell.auto ? C.greenDeep : C.text);
      } else if (cell.state === 'ban') {
        this.drawCross(x + cs / 2, y + cs / 2 + 1, L.cellFontSmall, '#ffffff', cell.auto);
      } else if (this.colorblind) {
        r.textShadow(cell.symbol, x + cs / 2, y + cs / 2 + 1, L.cellFontTiny, '#ffffff', 'center', 'middle', 'rgba(0,0,0,0.35)', 3);
      }
      if (this.highlightRegion >= 0 && cell.region === this.highlightRegion) {
        r.strokeRoundRect(x + 3, y + 3, cs - 6, cs - 6, 8, '#ffffff', Math.max(4, cs * 0.09));
      }

      r.addHit(x, y, cs, cs, null, { idx: i, longPress: true, onTap: () => this.onCellTap(i) });
    }
  }

  drawBottomBar() {
    const r = this.r, L = this.layout;
    const y = L.bottomY, h = L.bottomH;
    const tools = [
      { icon: 'trash', label: '清除', tap: () => this.onClear(), muted: false, active: false },
      { icon: 'undo', label: '撤销', tap: () => this.onUndo(), muted: this.history.length === 0 || this.undosLeft <= 0, active: false, badge: this.undosLeft },
      { icon: 'cross', label: '标记', tap: () => { if (!this.won) this.markMode = !this.markMode; }, muted: false, active: this.markMode },
      { icon: 'bulb', label: '提示', tap: () => this.onHint(), muted: this.hintsLeft <= 0, active: false, badge: this.hintsLeft },
      { icon: 'eye', label: '色盲模式', tap: () => { this.colorblind = !this.colorblind; this.persist(); }, muted: false, active: this.colorblind },
    ];
    const tw = (L.W - L.pad * 2 - 12 * 4) / 5;
    for (let i = 0; i < tools.length; i++) {
      const x = L.pad + i * (tw + 12);
      const t = tools[i];
      r.fillRoundRect(x, y, tw, h, 18, t.active ? C.toolActive : C.card);
      r.globalAlpha(t.muted ? 0.45 : 1);
      const ix = x + tw / 2, iy = y + 38;
      if (t.icon === 'trash') r.trash(ix, iy, 38, C.text);
      else if (t.icon === 'undo') r.undo(ix, iy, 38, C.text);
      else if (t.icon === 'cross') this.drawCross(ix, iy, 34, C.text, true);
      else if (t.icon === 'bulb') r.bulb(ix, iy, 38, C.text);
      else if (t.icon === 'eye') r.eye(ix, iy, 40, C.text);
      r.text(t.label, x + tw / 2, y + 82, 19, C.text, 'center', 'middle');
      r.globalAlpha(1);
      if (t.badge > 0) {
        r.fillRoundRect(x + tw - 30, y + 8, 26, 26, 13, C.orange);
        r.text(String(t.badge), x + tw - 17, y + 21, 16, '#ffffff', 'center', 'middle', 'bold');
      }
      r.addHit(x, y, tw, h, null, { onTap: t.tap });
    }
  }

  /* ---------------- 浮层面板 ---------------- */
  panelFrame(titleW) {
    const r = this.r;
    r.fillRect(0, 0, r.DW, r.DH, C.mask);
    r.addHit(0, 0, r.DW, r.DH, null, { onTap: () => { this.closeOverlay(); } }); // 遮罩关闭
    const px = 40, py = 120, pw = r.DW - 80, ph = r.DH - 200;
    r.fillRoundRect(px, py, pw, ph, 32, C.card);
    r.addHit(px, py, pw, ph, null, { onTap: () => {} }); // 阻止穿透
    r.text(titleW, px + 40, py + 52, 32, C.text, 'left', 'middle', 'bold');
    // 关闭按钮避开右上角微信胶囊（胶囊约占据右侧 190 逻辑px），左移防止误触退出小程序
    const closeX = px + pw - 200;
    r.text('✕', closeX, py + 52, 30, C.subText, 'center', 'middle');
    r.addHit(closeX - 34, py + 24, 68, 60, null, { onTap: () => { this.closeOverlay(); } });
    return { px, py, pw, ph, listY: py + 96 };
  }

  drawLevelsPanel() {
    const r = this.r;
    const p = this.panelFrame('选择关卡');
    const cols = 8, cellW = 70, gap = 12;
    const startX = p.px + (p.pw - (cols * cellW + (cols - 1) * gap)) / 2;
    const clipTop = p.listY;
    const clipBottom = p.py + p.ph - 24;
    this.clipRegion(p.px, clipTop, p.pw, clipBottom - clipTop);

    for (let i = 0; i < TOTAL_LEVELS; i++) {
      const lv = i + 1;
      const row = Math.floor(i / cols), col = i % cols;
      const x = startX + col * (cellW + gap);
      const y = clipTop + row * (cellW + gap) - this.listScroll.levels;
      if (y + cellW < clipTop || y > clipBottom) continue;
      const locked = lv > this.maxLevel;
      const done = !!this.bestTimes[lv];
      const current = lv === this.level;
      let bg = C.lightBg;
      if (done) bg = C.green;
      if (current) bg = C.coral;
      if (locked) bg = C.border;
      r.fillRoundRect(x, y, cellW, cellW, 12, bg);
      r.text(String(lv), x + cellW / 2, y + cellW / 2, 28, locked ? C.subText : '#ffffff', 'center', 'middle', 'bold');
      if (done) r.text('✓', x + cellW - 18, y + 16, 18, '#ffffff', 'center', 'middle');
      const lvStars = this.bestStars && this.bestStars[lv];
      if (lvStars) r.text('★', x + 16, y + cellW - 14, 18, '#ffd166', 'center', 'middle', 'bold');
      const solCount = done ? this.foundSolutionCount(lv) : 0;
      if (solCount > 1) r.text('×' + solCount, x + cellW - 20, y + cellW - 14, 16, '#ffffff', 'center', 'middle', 'bold');
      if (!locked) r.addHit(x, y, cellW, cellW, null, { onTap: () => this.loadLevel(lv) });
    }
    r.restore();
  }

  drawGalleryPanel() {
    const r = this.r;
    const p = this.panelFrame('猫咪图鉴');
    const cols = 4, cellW = 148, gap = 16;
    const startX = p.px + (p.pw - (cols * cellW + (cols - 1) * gap)) / 2;
    const clipTop = p.listY;
    const clipBottom = p.py + p.ph - 24;
    r.text('已收集 ' + this.unlockedCats.length + ' / ' + CAT_COLLECTION.length + ' 只 · 最佳连击 ' + this.bestCombo + ' · 完美通关 ' + (this.perfectClears || 0) + ' 次',
      p.px + 40, p.listY - 4, 22, C.subText, 'left', 'middle');
    this.clipRegion(p.px, clipTop + 32, p.pw, clipBottom - clipTop - 32);
    for (let i = 0; i < CAT_COLLECTION.length; i++) {
      const cat = CAT_COLLECTION[i];
      const row = Math.floor(i / cols), col = i % cols;
      const x = startX + col * (cellW + gap);
      const y = clipTop + 40 + row * (cellW + gap) - this.listScroll.gallery;
      if (y + cellW < clipTop + 32 || y > clipBottom) continue;
      const unlocked = this.unlockedCats.indexOf(cat.id) >= 0;
      r.fillRoundRect(x, y, cellW, cellW, 18, unlocked ? C.lightBg : C.border);
      r.cat(x + cellW / 2, y + 54, 68, unlocked ? cat.color : '#b6bfd2');
      r.text(unlocked ? cat.name : '???', x + cellW / 2, y + 102, 24, unlocked ? C.text : C.subText, 'center', 'middle', 'bold');
      r.text(unlocked ? cat.hint : '未解锁', x + cellW / 2, y + 130, 18, unlocked ? C.subText : '#aeb8ce', 'center', 'middle');
    }
    r.restore();
  }

  drawRankPanel() {
    const r = this.r;
    const p = this.panelFrame('排行榜 TOP20');
    const meText = !this.rankReady ? '未启用' : (this.meInfo ? ('第' + this.meInfo.rank + '名') : '未上榜');
    // 排名规则说明：得分越高越靠前
    r.text('按 累计得分 排名，得分越高越靠前', p.px + 40, p.py + 76, 17, C.subText, 'left', 'middle');
    r.text('得分 = 难度 + 用时 + 连击 + 完美 + 星级 - 取消 - 生命', p.px + 40, p.py + 98, 17, C.subText, 'left', 'middle');
    // 统一列坐标（表头与数据行共用，避免错位）
    const colLevel = p.px + 410;
    const colScore = p.px + 530;
    const colSingle = p.px + p.pw - 24; // 右对齐
    const headY = p.py + 128;
    r.text('我的排名：' + meText, p.px + 40, headY, 21, C.coral, 'left', 'middle', 'bold');
    r.text('关数', colLevel, headY, 20, C.subText, 'center', 'middle', 'bold');
    r.text('得分', colScore, headY, 20, C.subText, 'center', 'middle', 'bold');
    r.text('本关', colSingle, headY, 20, C.subText, 'right', 'middle', 'bold');
    const listY = p.py + 150;
    const clipBottom = p.py + p.ph - 20;
    this.clipRegion(p.px, listY, p.pw, clipBottom - listY);
    if (!this.rankReady) {
      this.wrapText('排行榜未启用：请先在云开发控制台开通云开发、填入环境 ID 并部署 rank 云函数后重启游戏。',
        p.px + p.pw / 2, listY + 80, p.pw - 60, 24, C.subText);
    } else if (!this.rankList.length) {
      r.text('还没有人上榜，快来抢占第一名！', p.px + p.pw / 2, listY + 80, 24, C.subText, 'center', 'middle');
    }
    const medals = [
      { row: '#fff4d6', badge: '#f5b942', label: '冠' },
      { row: '#eef1f6', badge: '#b7c2d6', label: '亚' },
      { row: '#fbeee2', badge: '#d98a56', label: '季' },
    ];
    for (let i = 0; i < this.rankList.length; i++) {
      const item = this.rankList[i];
      const y = listY + i * 92 - this.listScroll.rank;
      if (y + 84 < listY || y > clipBottom) continue;
      const medal = i < 3 ? medals[i] : null;
      if (medal) {
        // 前三名：整行淡色高亮 + 金银铜徽章 + 称号，视觉上明显区别于其余名次
        r.fillRoundRect(p.px + 12, y, p.pw - 24, 84, 14, medal.row);
        r.fillRoundRect(p.px + 32, y + 18, 48, 48, 24, '#ffffff');
        r.fillRoundRect(p.px + 35, y + 21, 42, 42, 21, medal.badge);
        r.text(String(i + 1), p.px + 56, y + 42, 24, '#ffffff', 'center', 'middle', 'bold');
      } else {
        if (item.isMe) r.fillRoundRect(p.px + 12, y, p.pw - 24, 84, 14, C.toolActive);
        r.text(String(item.rank), p.px + 56, y + 42, 26, C.subText, 'center', 'middle');
      }
      const nameText = item.isMe ? item.nickname + '（我）' : item.nickname;
      r.text(nameText, p.px + 108, y + 42, 24, C.text, 'left', 'middle');
      if (medal) {
        const nw = r.ctx.measureText(nameText).width;
        const lx = Math.min(p.px + 108 + nw + 10, colLevel - 30);
        r.text(medal.label, lx, y + 42, 18, medal.badge, 'left', 'middle', 'bold');
      }
      r.text(String(item.maxLevel), colLevel, y + 42, 24, C.subText, 'center', 'middle');
      r.text(String(item.score || 0), colScore, y + 42, 24, C.orange, 'center', 'middle', 'bold');
      r.text(item.timeText, colSingle, y + 42, 23, C.subText, 'right', 'middle');
    }
    r.restore();
  }

  // 统一关闭浮层：好友榜需要通知子域隐藏并重置状态
  closeOverlay() {
    if (this.overlay === 'friendRank' && this.openDataContext) {
      this.friendRankActive = false;
      try { this.openDataContext.postMessage({ action: 'hide' }); } catch (e) {}
    }
    this.overlay = null;
  }

  // 微信好友排行榜面板：主域画框架，子域 canvas 贴到列表区
  drawFriendRankPanel() {
    const r = this.r;
    const p = this.panelFrame('微信好友排行榜');
    // 列表区域（子域 canvas 将贴到这里）
    const listX = p.px + 12;
    const listY = p.py + 96;
    const listW = p.pw - 24;
    const listH = p.ph - 116;

    if (!this.openDataContext || !this.sharedCanvas) {
      r.text('当前环境不支持好友排行榜', r.DW / 2, listY + listH / 2, 26, C.subText, 'center', 'middle');
      return;
    }

    // 首次打开时：主域设置共享画布尺寸（微信官方要求），再通知子域拉取数据
    if (!this.friendRankActive) {
      this.friendRankActive = true;
      const pxW = Math.round(listW * r.dpr);
      const pxH = Math.round(listH * r.dpr);
      if (this.sharedCanvas.width !== pxW || this.sharedCanvas.height !== pxH) {
        this.sharedCanvas.width = pxW;
        this.sharedCanvas.height = pxH;
      }
      const view = { w: listW, h: listH, scale: r.scale };
      try {
        this.openDataContext.postMessage({ action: 'show', view: view, dpr: r.dpr });
      } catch (e) { console.warn('[好友榜] 通知子域失败:', e); }
    }

    // 把子域 canvas 贴到列表区
    try {
      r.save();
      r.ctx.drawImage(this.sharedCanvas, listX, listY, listW, listH);
      r.restore();
    } catch (e) {
      r.text('好友榜加载中…', r.DW / 2, listY + listH / 2, 26, C.subText, 'center', 'middle');
    }
  }

  clipRegion(x, y, w, h) {
    const c = this.r.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
  }

  drawWinPanel() {
    const r = this.r;
    r.fillRect(0, 0, r.DW, r.DH, C.mask);
    r.addHit(0, 0, r.DW, r.DH, null, { onTap: () => {} });
    const cw = 560;
    const hasNew = !!this.isNewBest;
    const ws = this.winStats || {
      single: this.seconds, total: this.totalTime(),
      bestSingle: this.bestTimes[this.level], bestTotal: this.bestTotal,
      stars: 0, starEnabled: false,
    };
    const showStars = !!ws.starEnabled;
    const showCombo = (ws.combo || 0) >= 2;
    const ch = 790 + (this.allCleared ? 0 : 16) + (hasNew ? 52 : 0) + (showStars ? 62 : 0) + (showCombo ? 54 : 0);
    const y = Math.max(20, (r.DH - ch) / 2);
    const x = (r.DW - cw) / 2;
    r.fillRoundRect(x, y, cw, ch, 32, C.card);
    r.cat(r.DW / 2, y + 96, 108, this.allCleared ? C.coral : C.greenDeep);
    r.text('第' + this.level + '关通过！', r.DW / 2, y + 180, 40, C.text, 'center', 'middle', 'bold');
    r.text(this.allCleared ? '全部 60 关通关！你就是最强大的铲屎官' : '喵呜～小猫们都找对位置啦',
      r.DW / 2, y + 226, 22, C.subText, 'center', 'middle');
    if (typeof ws.score === 'number') {
      r.text('本关得分 ' + ws.score + (ws.isNewScore ? '  新高分！' : '  最高 ' + ws.bestScore),
        r.DW / 2, y + 248, 22, C.orange, 'center', 'middle', 'bold');
    } else if (ws.solutions) {
      r.text('本关已发现 ' + ws.solutions + ' 种摆法', r.DW / 2, y + 248, 18, C.subText, 'center', 'middle');
    }
    if (showStars) {
      const stars = ws.stars || 0;
      for (let i = 0; i < 3; i++) {
        r.text('★', r.DW / 2 + (i - 1) * 56, y + 262, 44, i < stars ? C.orange : C.border, 'center', 'middle', 'bold');
      }
    }
    // 连击/完美展示
    if (showCombo) {
      const msg = ws.perfect ? '完美通关！' + ws.combo + ' 连击，全程零失误' : ws.combo + ' 连击！再接再厉';
      r.text(msg, r.DW / 2, y + 292 + (showStars ? 62 : 0), 24, ws.perfect ? C.orange : C.subText, 'center', 'middle', 'bold');
    }
    // 统计四宫格：本关用时 / 总通关用时 / 最佳本关 / 最佳总通关
    const sy = y + 278 + (showStars ? 62 : 0) + (showCombo ? 54 : 0);
    const boxH = 168;
    r.fillRoundRect(x + 50, sy, cw - 100, boxH, 20, C.lightBg);
    r.fillRect(x + cw / 2 - 1, sy + 16, 2, boxH - 32, C.border);
    r.fillRect(x + 60, sy + boxH / 2 - 1, cw - 120, 2, C.border);
    const qw = (cw - 100) / 2;
    const qh = boxH / 2;
    const t = function (v) { return v ? formatTime(v) : '--:--'; };
    // 左上：本关用时
    r.text('本关用时', x + 50 + qw / 2, sy + qh * 0.32, 20, C.subText, 'center', 'middle');
    r.text(t(ws.single), x + 50 + qw / 2, sy + qh * 0.72, 32, C.text, 'center', 'middle', 'bold');
    // 右上：总通关用时
    r.text('总通关用时', x + 50 + qw * 1.5, sy + qh * 0.32, 20, C.subText, 'center', 'middle');
    r.text(t(ws.total), x + 50 + qw * 1.5, sy + qh * 0.72, 32, C.text, 'center', 'middle', 'bold');
    // 左下：最佳本关
    r.text('最佳本关', x + 50 + qw / 2, sy + qh * 1.32, 20, C.subText, 'center', 'middle');
    r.text(t(ws.bestSingle), x + 50 + qw / 2, sy + qh * 1.72, 32, C.greenDeep, 'center', 'middle', 'bold');
    // 右下：最佳总通关
    r.text('最佳总通关', x + 50 + qw * 1.5, sy + qh * 1.32, 20, C.subText, 'center', 'middle');
    r.text(t(ws.bestTotal), x + 50 + qw * 1.5, sy + qh * 1.72, 32, C.greenDeep, 'center', 'middle', 'bold');
    let by = sy + boxH + 22;
    if (this.isNewBest) {
      r.text('★ 新纪录 ★', r.DW / 2, by, 26, C.orange, 'center', 'middle', 'bold');
      by += 52;
    }
    if (!this.allCleared) {
      r.fillRoundRect(x + 80, by, cw - 160, 76, 38, C.coral);
      r.text('下一关', r.DW / 2, by + 38, 30, '#ffffff', 'center', 'middle', 'bold');
      r.addHit(x + 80, by, cw - 160, 76, null, { onTap: () => this.onNextLevel() });
      by += 92;
    }
    r.fillRoundRect(x + 80, by, cw - 160, 68, 34, C.lightBg);
    r.text('选择关卡', r.DW / 2, by + 34, 26, C.text, 'center', 'middle');
    r.addHit(x + 80, by, cw - 160, 68, null, { onTap: () => { this.overlay = 'levels'; this.listScroll.levels = 0; } });
    by += 80;
    r.fillRoundRect(x + 80, by, cw - 160, 68, 34, C.greenDeep);
    r.text('邀请好友', r.DW / 2, by + 34, 26, '#ffffff', 'center', 'middle', 'bold');
    r.addHit(x + 80, by, cw - 160, 68, null, { onTap: () => this.inviteFriend() });
  }

  drawDialog() {
    const r = this.r;
    const d = this.dialog;
    r.fillRect(0, 0, r.DW, r.DH, C.mask);
    r.addHit(0, 0, r.DW, r.DH, null, { onTap: () => {} });
    const w = 600;
    const fontSize = 28, lineH = 42;
    const titleH = d.title ? 100 : 60;
    const btnH = 76;
    // 先测量文字行数，动态决定弹窗高度
    const lines = this.measureLines(d.content || '', w - 100, fontSize);
    const contentH = lines.length * lineH;
    const h = Math.min(r.DH - 120, titleH + contentH + 40 + btnH + 40);
    const x = (r.DW - w) / 2, y = (r.DH - h) / 2;
    r.fillRoundRect(x, y, w, h, 32, C.card);

    let cy = y + titleH - 20;
    if (d.title) {
      r.text(d.title, r.DW / 2, y + 56, 36, C.text, 'center', 'middle', 'bold');
    }
    // 绘制正文
    for (let i = 0; i < lines.length; i++) {
      r.text(lines[i], r.DW / 2, cy + 20 + i * lineH, fontSize, C.text, 'center', 'middle');
    }
    const by = y + h - btnH - 36;
    if (d.showCancel !== false) {
      const bw = (w - 130) / 2;
      r.fillRoundRect(x + 50, by, bw, btnH, 20, C.lightBg);
      r.text('取消', x + 50 + bw / 2, by + btnH / 2, 28, C.text, 'center', 'middle');
      r.addHit(x + 50, by, bw, btnH, null, { onTap: () => { this.dialog = null; } });
      const cx2 = x + 50 + bw + 30;
      r.fillRoundRect(cx2, by, bw, btnH, 20, C.coral);
      r.text(d.confirm || '确定', cx2 + bw / 2, by + btnH / 2, 28, '#ffffff', 'center', 'middle');
      r.addHit(cx2, by, bw, btnH, null, { onTap: () => { const cb = d.onConfirm; this.dialog = null; if (cb) cb(); } });
    } else {
      r.fillRoundRect(x + 80, by, w - 160, btnH, 38, C.coral);
      r.text(d.confirm || '知道了', r.DW / 2, by + btnH / 2, 28, '#ffffff', 'center', 'middle', 'bold');
      r.addHit(x + 80, by, w - 160, btnH, null, { onTap: () => { const cb = d.onConfirm; this.dialog = null; if (cb) cb(); } });
    }
  }

  // 按像素宽度测量并折行，返回行数组
  measureLines(str, maxW, size) {
    const r = this.r;
    r.ctx.font = size + 'px -apple-system, "PingFang SC", sans-serif';
    const chars = String(str).split('');
    let line = '';
    const lines = [];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      const test = line + ch;
      if (r.ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  wrapText(str, cx, y, maxW, size, color) {
    const lines = this.measureLines(str, maxW, size);
    for (let i = 0; i < lines.length; i++) {
      this.r.text(lines[i], cx, y + i * (size + 12), size, color, 'center', 'middle');
    }
  }

  openSettings() {
    this.settings = {
      items: [
        { label: '选择关卡', tap: () => { this.overlay = 'levels'; this.listScroll.levels = 0; } },
        { label: '本关种子：' + seedCode(this.level, this.currentSeed) + '（同题挑战）', tap: () => this.inviteFriend() },
        { label: '换一题（随机新棋盘）', tap: () => this.rerollLevel() },
        { label: '猫咪图鉴 ' + this.unlockedCats.length + '/' + CAT_COLLECTION.length, tap: () => { this.overlay = 'gallery'; this.listScroll.gallery = 0; } },
        { label: '重玩本关', tap: () => this.loadLevel(this.level) },
        { label: '音效：' + (this.soundOn ? '开' : '关'), tap: () => { this.soundOn = !this.soundOn; sound.setEnabled(this.soundOn); if (this.soundOn) sound.play('tap'); this.persist(); } },
        { label: '重置进度', tap: () => { this.dialog = {
          title: '重置进度', content: '确定要清空关卡进度和成绩吗？', confirm: '确定重置', showCancel: true,
          onConfirm: () => { this.maxLevel = 1; this.bestTimes = {}; this.bestStars = {}; this.bestScores = {}; this.totalScore = 0; this.bestTotal = 0; this.unlockedCats = []; this.levelSeeds = {}; this.foundSolutions = {}; this.bestCombo = 0; this.perfectClears = 0; this.loadLevel(1); },
        }; } },
        { label: '好友排行榜', tap: () => { this.overlay = 'friendRank'; this.friendRankActive = false; } },
        { label: '排行榜', tap: () => { this.overlay = 'rank'; this.refreshRank(); } },
        { label: '邀请好友', tap: () => this.inviteFriend() },
      ],
    };
  }

  drawSettings() {
    const r = this.r;
    r.fillRect(0, 0, r.DW, r.DH, C.mask);
    const items = this.settings.items;
    const w = 560, ih = 88;
    const h = items.length * ih + 90;
    const x = (r.DW - w) / 2, y = (r.DH - h) / 2;
    r.fillRoundRect(x, y, w, h, 32, C.card);
    r.text('设置', r.DW / 2, y + 52, 32, C.text, 'center', 'middle', 'bold');
    for (let i = 0; i < items.length; i++) {
      const iy = y + 90 + i * ih;
      r.text(items[i].label, x + 40, iy + ih / 2, 28, C.text, 'left', 'middle');
      if (i < items.length - 1) r.fillRect(x + 30, iy + ih - 2, w - 60, 2, C.border);
      r.addHit(x, iy, w, ih, null, { onTap: () => { this.settings = null; items[i].tap(); } });
    }
    r.addHit(0, y - 200, r.DW, 200, null, { onTap: () => { this.settings = null; } });
    r.addHit(0, y + h, r.DW, 200, null, { onTap: () => { this.settings = null; } });
  }

  drawToast() {
    const r = this.r;
    const text = this.toast.text;
    r.ctx.font = '26px sans-serif';
    const w = Math.min(r.DW - 100, r.ctx.measureText(text).width + 60);
    const x = (r.DW - w) / 2, y = r.DH - 200;
    r.fillRoundRect(x, y, w, 64, 32, 'rgba(61,70,103,0.88)');
    r.text(text, r.DW / 2, y + 32, 26, '#ffffff', 'center', 'middle');
  }
}

module.exports = Game;
