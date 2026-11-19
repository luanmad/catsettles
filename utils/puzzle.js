// 「猫猫请落座」谜题引擎
// 规则：N x N 棋盘，每行、每列、每个颜色区域各 1 只小猫，小猫不能相邻（含斜角）
// 第40关起（options.diagonal）：额外要求任意两只猫不在同一主/副对角线上

// 可复现的伪随机数（同一关生成同一谜题）
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function range(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i);
  return out;
}

// 生成一组解：每行一只猫（列不重复），相邻行猫的列距必须大于 1（八向不相邻）
// options.diagonal 为 true 时，任意两只猫都不能在同一主/副对角线上（N 皇后约束）
function generateCats(n, rand, options) {
  const diagonal = !!(options && options.diagonal);
  const cols = new Array(n).fill(-1);
  const usedCols = new Array(n).fill(false);

  function diagonalConflict(r, c) {
    if (!diagonal) return false;
    for (let rr = 0; rr < r; rr++) {
      if (Math.abs(r - rr) === Math.abs(c - cols[rr])) return true;
    }
    return false;
  }

  function backtrack(r) {
    if (r === n) return true;
    const candidates = shuffle(range(n), rand);
    for (let k = 0; k < candidates.length; k++) {
      const c = candidates[k];
      if (usedCols[c]) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      if (diagonalConflict(r, c)) continue;
      cols[r] = c;
      usedCols[c] = true;
      if (backtrack(r + 1)) return true;
      usedCols[c] = false;
      cols[r] = -1;
    }
    return false;
  }

  if (!backtrack(0)) return null;
  return cols.map(function (c, r) { return { row: r, col: c }; });
}

// 多源随机生长：从每只猫的格子同时向外扩张，保证每个颜色区域连通
function generateRegions(n, cats, rand) {
  const total = n * n;
  const region = new Array(total).fill(-1);
  const frontier = [];
  for (let i = 0; i < n; i++) {
    const idx = cats[i].row * n + cats[i].col;
    region[idx] = i;
    frontier.push([i, idx]);
  }

  // 每一轮把所有区域的边界格子打乱顺序后依次扩张一格
  let assigned = n;
  while (assigned < total) {
    shuffle(frontier, rand);
    let progressed = false;
    const next = [];
    for (let f = 0; f < frontier.length; f++) {
      const reg = frontier[f][0];
      const idx = frontier[f][1];
      const r = Math.floor(idx / n);
      const c = idx % n;
      const cand = [];
      if (r > 0 && region[idx - n] === -1) cand.push(idx - n);
      if (r < n - 1 && region[idx + n] === -1) cand.push(idx + n);
      if (c > 0 && region[idx - 1] === -1) cand.push(idx - 1);
      if (c < n - 1 && region[idx + 1] === -1) cand.push(idx + 1);
      if (cand.length) {
        const pick = cand[Math.floor(rand() * cand.length)];
        region[pick] = reg;
        assigned++;
        progressed = true;
        next.push([reg, pick]);
        next.push([reg, idx]);
      } else {
        next.push([reg, idx]);
      }
    }
    frontier.length = 0;
    for (let i = 0; i < next.length; i++) frontier.push(next[i]);
    if (!progressed) break;
  }

  // 兜底：把剩余格子并入任一相邻区域（保持连通）
  for (let idx = 0; idx < total; idx++) {
    if (region[idx] !== -1) continue;
    const r = Math.floor(idx / n);
    const c = idx % n;
    if (r > 0 && region[idx - n] !== -1) region[idx] = region[idx - n];
    else if (r < n - 1 && region[idx + n] !== -1) region[idx] = region[idx + n];
    else if (c > 0 && region[idx - 1] !== -1) region[idx] = region[idx - 1];
    else if (c < n - 1 && region[idx + 1] !== -1) region[idx] = region[idx + 1];
    else region[idx] = 0;
  }

  return region;
}

// 区域连通性校验
function isRegionConnected(region, n, regId) {
  const total = n * n;
  let start = -1;
  let count = 0;
  for (let i = 0; i < total; i++) {
    if (region[i] === regId) {
      if (start === -1) start = i;
      count++;
    }
  }
  if (start === -1) return false;
  const seen = new Array(total).fill(false);
  const stack = [start];
  seen[start] = true;
  let visited = 0;
  while (stack.length) {
    const idx = stack.pop();
    visited++;
    const r = Math.floor(idx / n);
    const c = idx % n;
    const nb = [];
    if (r > 0) nb.push(idx - n);
    if (r < n - 1) nb.push(idx + n);
    if (c > 0) nb.push(idx - 1);
    if (c < n - 1) nb.push(idx + 1);
    for (let i = 0; i < nb.length; i++) {
      const k = nb[i];
      if (!seen[k] && region[k] === regId) {
        seen[k] = true;
        stack.push(k);
      }
    }
  }
  return visited === count;
}

// 统计解的数量（最多数到 limit 个）
// fixed 为已放好的猫（{row,col}）；blocked 为禁止放猫的格子下标数组
// options.diagonal 为 true 时启用对角线约束
// options.stones 为石像障碍（{row,col}）：石像格及其主/副对角线上的格子都禁止放猫
// 返回 { count, solutions }，solutions 中每项为"每行猫所在的列"
function countSolutions(n, region, limit, fixed, blocked, options) {
  const lim = limit || 2;
  const diagonal = !!(options && options.diagonal);
  const stones = (options && options.stones) || [];
  const cols = new Array(n).fill(-1);
  const usedCols = new Array(n).fill(false);
  const usedRegions = new Array(n).fill(false);
  const solutions = [];
  const blockedSet = {};
  if (blocked) {
    for (let i = 0; i < blocked.length; i++) blockedSet[blocked[i]] = true;
  }
  // 石像格与其两条对角线上所有格子都不可放猫
  for (let s = 0; s < stones.length; s++) {
    const st = stones[s];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (r === st.row && c === st.col) blockedSet[r * n + c] = true;
        else if (Math.abs(r - st.row) === Math.abs(c - st.col)) blockedSet[r * n + c] = true;
      }
    }
  }

  const fixedCol = new Array(n).fill(-1);
  if (fixed) {
    for (let i = 0; i < fixed.length; i++) {
      const cat = fixed[i];
      if (!cat || cat.row < 0 || cat.row >= n || cat.col < 0 || cat.col >= n) continue;
      fixedCol[cat.row] = cat.col;
    }
  }

  // 检查 (r,c) 是否与任意已放置的猫在同一对角线（主/副）
  function diagonalConflict(r, c) {
    if (!diagonal) return false;
    for (let rr = 0; rr < n; rr++) {
      if (rr === r) continue;
      const cc = fixedCol[rr] >= 0 ? fixedCol[rr] : cols[rr];
      if (cc >= 0 && Math.abs(rr - r) === Math.abs(cc - c)) return true;
    }
    return false;
  }

  // 校验并登记固定猫：落在禁放格、同列、同区域、与上一行相邻或同对角线则无解
  for (let r = 0; r < n; r++) {
    if (fixedCol[r] < 0) continue;
    const c = fixedCol[r];
    if (blockedSet[r * n + c]) return { count: 0, solutions: [] };
    const reg = region[r * n + c];
    if (reg === undefined || reg < 0 || usedRegions[reg]) return { count: 0, solutions: [] };
    if (usedCols[c]) return { count: 0, solutions: [] };
    if (r > 0 && fixedCol[r - 1] >= 0 && Math.abs(fixedCol[r - 1] - c) <= 1) {
      return { count: 0, solutions: [] };
    }
    if (diagonalConflict(r, c)) return { count: 0, solutions: [] };
    usedCols[c] = true;
    usedRegions[reg] = true;
    cols[r] = c;
  }

  function backtrack(r) {
    if (solutions.length >= lim) return;
    if (r === n) { solutions.push(cols.slice()); return; }
    if (fixedCol[r] >= 0) { backtrack(r + 1); return; }
    for (let c = 0; c < n; c++) {
      if (usedCols[c]) continue;
      const idx = r * n + c;
      if (blockedSet[idx]) continue;
      const reg = region[idx];
      if (reg === undefined || reg < 0 || usedRegions[reg]) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      // 下一行为固定猫时也要满足不相邻（含斜角）
      if (r < n - 1 && fixedCol[r + 1] >= 0 && Math.abs(fixedCol[r + 1] - c) <= 1) continue;
      if (diagonalConflict(r, c)) continue;
      usedCols[c] = true;
      usedRegions[reg] = true;
      cols[r] = c;
      backtrack(r + 1);
      usedCols[c] = false;
      usedRegions[reg] = false;
      cols[r] = -1;
      if (solutions.length >= lim) return;
    }
  }

  backtrack(0);
  return { count: solutions.length, solutions: solutions };
}

// 根据当前局面求解，用于提示：返回一个可以安全放置的格子，找不到返回 null
function nextHint(n, region, placedCats, blocked, options) {
  const res = countSolutions(n, region, 1, placedCats, blocked, options);
  if (!res.count) return null;
  const solution = res.solutions[0];
  const used = {};
  for (let i = 0; i < placedCats.length; i++) {
    used[placedCats[i].row + ',' + placedCats[i].col] = true;
  }
  for (let r = 0; r < n; r++) {
    const key = r + ',' + solution[r];
    if (!used[key]) return { row: r, col: solution[r] };
  }
  return null;
}

// 生成谜题：尽量给出唯一解（小棋盘命中率高），
// 大棋盘若迟迟没有唯一解，则返回"解数最少"的结果（游戏按规则判胜，不影响可玩性）
function generate(n, rand, options) {
  const opts = options || {};
  const maxCats = opts.maxCatsAttempts || (n <= 5 ? 12 : 4);
  const maxRegions = opts.maxRegionAttempts || (n <= 5 ? 8 : 2);
  let fallback = null;

  for (let a = 0; a < maxCats; a++) {
    const cats = generateCats(n, rand, opts);
    if (!cats) continue;
    for (let b = 0; b < maxRegions; b++) {
      const region = generateRegions(n, cats, rand);
      const res = countSolutions(n, region, 2, null, null, opts);
      if (res.count === 1) {
        return { cats: cats, region: region, unique: true, count: 1 };
      }
      if (!fallback || res.count < fallback.count) {
        fallback = { cats: cats, region: region, unique: false, count: res.count };
      }
      if (res.count === 0) break;
    }
  }

  if (fallback) return fallback;
  const cats = generateCats(n, rand, opts);
  return { cats: cats, region: generateRegions(n, cats, rand), unique: false, count: 0 };
}

// 挑选石像障碍位置（纯障碍，不是猫）：
// 石像格及其对角线禁止放猫，但玩家仍要放满 n 只猫。
// 必须保证放置石像后谜题仍有解；优先选封锁范围大的组合让推理更难。
function pickStoneObstacles(n, region, cats, stoneCount, rand, options) {
  const k = Math.min(Math.floor(stoneCount || 0), n);
  if (k <= 0) return [];

  // 收集所有候选格，排除完整解中猫的位置（石像不能压住解的猫）
  const occupied = {};
  for (let i = 0; i < cats.length; i++) occupied[cats[i].row * n + cats[i].col] = true;
  const candidates = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!occupied[r * n + c]) candidates.push({ row: r, col: c });
    }
  }
  shuffle(candidates, rand);

  const opts = options || {};
  const withStones = Object.assign({}, opts, { stones: [] });
  let best = null;

  // 尝试多组候选，选有解且封锁范围最大的一组
  const trials = Math.min(60, Math.max(1, Math.floor(candidates.length / k) * 3));
  for (let t = 0; t < trials; t++) {
    const stones = [];
    const used = {};
    for (let s = 0; s < k; s++) {
      for (let i = 0; i < candidates.length; i++) {
        const cc = candidates[(i + t * 7 + s) % candidates.length];
        const key = cc.row + ',' + cc.col;
        if (used[key]) continue;
        // 石像之间不能彼此在对角线上（避免重复封锁同一片区域）
        let ok = true;
        for (let j = 0; j < stones.length; j++) {
          if (Math.abs(stones[j].row - cc.row) === Math.abs(stones[j].col - cc.col)) { ok = false; break; }
        }
        if (!ok) continue;
        stones.push(cc); used[key] = true;
        break;
      }
    }
    if (stones.length < k) continue;
    withStones.stones = stones;
    const res = countSolutions(n, region, 2, null, null, withStones);
    if (!res.count) continue;
    // 封锁格子数（唯一解优先）
    let blockedCnt = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        for (let s = 0; s < stones.length; s++) {
          if (r === stones[s].row && c === stones[s].col) { blockedCnt++; break; }
          if (Math.abs(r - stones[s].row) === Math.abs(c - stones[s].col)) { blockedCnt++; break; }
        }
      }
    }
    const score = (res.count === 1 ? 10000 : 0) + blockedCnt;
    if (!best || score > best.score) best = { stones: stones, score: score, count: res.count };
  }
  return best ? best.stones : [];
}

// 生成带石像障碍的谜题（石像为纯障碍，不计入解）
function generateWithStones(n, rand, options, stoneCount) {
  let gen = null;
  let stones = [];
  // 重试若干次，确保真正放下指定数量的石像且有解
  for (let attempt = 0; attempt < 30; attempt++) {
    gen = generate(n, rand, options);
    if (!gen || !gen.cats) continue;
    stones = pickStoneObstacles(n, gen.region, gen.cats, stoneCount, rand, options);
    if (stones.length === Math.min(Math.floor(stoneCount || 0), n)) break;
  }
  if (!gen) gen = generate(n, rand, options);
  gen.stones = stones;
  gen.stoneCount = stones.length;
  return gen;
}

// 区域着色：优先保证每个区域颜色唯一（玩家按颜色识别区域），调色板不够时才退化为相邻不同色
function assignColors(region, n, palette) {
  const regCount = n;

  // 色板够用：一区域一色，彻底避免"同色但其实是两个区域"的歧义
  if (palette.length >= regCount) {
    const colorOf = new Array(regCount);
    for (let i = 0; i < regCount; i++) colorOf[i] = i;
    return colorOf;
  }

  const adj = [];
  for (let i = 0; i < regCount; i++) adj.push([]);
  for (let idx = 0; idx < n * n; idx++) {
    const r = Math.floor(idx / n);
    const c = idx % n;
    if (c < n - 1 && region[idx] !== region[idx + 1]) {
      adj[region[idx]].push(region[idx + 1]);
      adj[region[idx + 1]].push(region[idx]);
    }
    if (r < n - 1 && region[idx] !== region[idx + n]) {
      adj[region[idx]].push(region[idx + n]);
      adj[region[idx + n]].push(region[idx]);
    }
  }

  const order = range(regCount).sort(function (x, y) { return adj[y].length - adj[x].length; });
  const colorOf = new Array(regCount).fill(-1);
  const usedCount = new Array(palette.length).fill(0);

  for (let i = 0; i < order.length; i++) {
    const reg = order[i];
    const banned = {};
    for (let k = 0; k < adj[reg].length; k++) {
      const nbColor = colorOf[adj[reg][k]];
      if (nbColor >= 0) banned[nbColor] = true;
    }
    let pick = -1;
    for (let ci = 0; ci < palette.length; ci++) {
      if (!banned[ci]) { pick = ci; break; }
    }
    if (pick === -1) {
      // 调色板不够用时选邻接使用最少的颜色
      let best = 0;
      for (let ci = 1; ci < palette.length; ci++) {
        if (usedCount[ci] < usedCount[best]) best = ci;
      }
      pick = best;
    }
    colorOf[reg] = pick;
    usedCount[pick]++;
  }

  return colorOf;
}

module.exports = {
  rng: rng,
  shuffle: shuffle,
  generateCats: generateCats,
  generateRegions: generateRegions,
  isRegionConnected: isRegionConnected,
  countSolutions: countSolutions,
  nextHint: nextHint,
  assignColors: assignColors,
  generate: generate,
  pickStoneObstacles: pickStoneObstacles,
  generateWithStones: generateWithStones,
};
