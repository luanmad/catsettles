// 「猫猫请落座」规则判定（纯函数，页面与测试共用）

const REASON_ROW = '同一行已经有一只小猫啦';
const REASON_COL = '同一列已经有一只小猫啦';
const REASON_REGION = '同一颜色里已经有一只小猫啦';
const REASON_ADJ = '小猫不能相邻哦';
const REASON_DIAG = '小猫不能在同一条对角线上哦';
const REASON_STONE = '这里是石像，不能放猫哦';
const REASON_STONE_DIAG = '石像的对角线上不能放猫哦';

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
}

// 对角线冲突：两只猫位于同一条主/副对角线上（N 皇后规则）
function isDiagonal(a, b) {
  return Math.abs(a.row - b.row) === Math.abs(a.col - b.col);
}

// 返回无法放猫的原因，空字符串表示可以放
// options.diagonal 为 true 时额外启用对角线约束（第40关起）
function conflictReason(cats, target, options) {
  const diagonal = !!(options && options.diagonal);
  const stones = (options && options.stones) || [];
  for (let i = 0; i < stones.length; i++) {
    const s = stones[i];
    if (s.row === target.row && s.col === target.col) return REASON_STONE;
    if (Math.abs(s.row - target.row) === Math.abs(s.col - target.col)) return REASON_STONE_DIAG;
  }
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    if (c === target) continue;
    if (c.row === target.row) return REASON_ROW;
    if (c.col === target.col) return REASON_COL;
    if (c.region === target.region) return REASON_REGION;
    if (isAdjacent(c, target)) return REASON_ADJ;
    if (diagonal && isDiagonal(c, target)) return REASON_DIAG;
  }
  return '';
}

// 完整通关校验：数量、行列区域覆盖、互不相邻；options.diagonal 时还检查对角线
function checkSolved(cats, size, options) {
  if (!cats || cats.length !== size) return false;
  const diagonal = !!(options && options.diagonal);
  const rows = {};
  const cols = {};
  const regs = {};
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    rows[c.row] = true;
    cols[c.col] = true;
    regs[c.region] = true;
  }
  if (Object.keys(rows).length !== size) return false;
  if (Object.keys(cols).length !== size) return false;
  if (Object.keys(regs).length !== size) return false;
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      if (isAdjacent(cats[i], cats[j])) return false;
      if (diagonal && isDiagonal(cats[i], cats[j])) return false;
    }
  }
  return true;
}

module.exports = {
  conflictReason: conflictReason,
  checkSolved: checkSolved,
  isAdjacent: isAdjacent,
  isDiagonal: isDiagonal,
  REASON_ROW: REASON_ROW,
  REASON_COL: REASON_COL,
  REASON_REGION: REASON_REGION,
  REASON_ADJ: REASON_ADJ,
  REASON_DIAG: REASON_DIAG,
  REASON_STONE: REASON_STONE,
  REASON_STONE_DIAG: REASON_STONE_DIAG,
};
