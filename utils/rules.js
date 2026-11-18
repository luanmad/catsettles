// 「猫猫请落座」规则判定（纯函数，页面与测试共用）

const REASON_ROW = '同一行已经有一只小猫啦';
const REASON_COL = '同一列已经有一只小猫啦';
const REASON_REGION = '同一颜色里已经有一只小猫啦';
const REASON_ADJ = '小猫不能相邻哦';
const REASON_BLOCKED = '这个格子被挡住啦，不能放猫';

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
}

// 返回无法放猫的原因，空字符串表示可以放
// blocked 为禁放格子下标集合（障碍格与诱饵猫，可选，Set 或数组）
function conflictReason(cats, target, blocked) {
  if (blocked && target && target.idx !== undefined) {
    const isBlocked = (typeof blocked.has === 'function') ? blocked.has(target.idx) : blocked.indexOf(target.idx) >= 0;
    if (isBlocked) return REASON_BLOCKED;
  }
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i];
    if (c === target) continue;
    if (c.row === target.row) return REASON_ROW;
    if (c.col === target.col) return REASON_COL;
    if (c.region === target.region) return REASON_REGION;
    if (isAdjacent(c, target)) return REASON_ADJ;
  }
  return '';
}

// 完整通关校验：数量、行列区域覆盖、互不相邻
function checkSolved(cats, size) {
  if (!cats || cats.length !== size) return false;
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
    }
  }
  return true;
}

module.exports = {
  conflictReason: conflictReason,
  checkSolved: checkSolved,
  isAdjacent: isAdjacent,
  REASON_ROW: REASON_ROW,
  REASON_COL: REASON_COL,
  REASON_REGION: REASON_REGION,
  REASON_ADJ: REASON_ADJ,
  REASON_BLOCKED: REASON_BLOCKED,
};
