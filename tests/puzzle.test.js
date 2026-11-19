// 谜题引擎初测（Node 环境运行：node tests/puzzle.test.js）
const assert = require('assert');
const path = require('path');
const puzzle = require(path.join(__dirname, '..', 'utils', 'puzzle.js'));
const rules = require(path.join(__dirname, '..', 'utils', 'rules.js'));

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(name + ' -> ' + err.message);
  }
}

function levelSize(level) {
  if (level <= 3) return 4;
  if (level <= 6) return 5;
  if (level <= 9) return 6;
  if (level <= 12) return 7;
  if (level <= 15) return 8;
  if (level <= 30) return 9;
  return 10;
}

function seedOf(level) {
  return level * 1013904223 + 12345;
}

function buildLevel(level) {
  const size = levelSize(level);
  const rand = puzzle.rng(seedOf(level));
  const gen = puzzle.generate(size, rand);
  return { size: size, gen: gen, rand: rand };
}

function catsOf(gen, size) {
  return gen.cats.map(function (pos) {
    return { row: pos.row, col: pos.col, region: gen.region[pos.row * size + pos.col] };
  });
}

// 1. 关卡生成：解合法 + 区域连通 + 颜色分区 + 可复现
const started = Date.now();
const LEVELS = 60;
let uniqueCount = 0;

for (let level = 1; level <= LEVELS; level++) {
  const levelStart = Date.now();
  const built = buildLevel(level);
  const size = built.size;
  const gen = built.gen;
  const tag = '第' + level + '关(' + size + 'x' + size + ')';

  check(tag + ' 至少有一个解', function () {
    assert.ok(gen.count >= 1, '无解');
  });

  check(tag + ' 解满足全部规则', function () {
    assert.ok(rules.checkSolved(catsOf(gen, size), size), '解不合法');
  });

  if (size <= 5) {
    check(tag + ' 小棋盘唯一解', function () {
      assert.strictEqual(gen.unique, true, '存在多解，count=' + gen.count);
    });
  }
  if (gen.unique) uniqueCount++;

  check(tag + ' 每格区域编号合法', function () {
    for (let i = 0; i < size * size; i++) {
      const reg = gen.region[i];
      assert.ok(reg >= 0 && reg < size, '区域编号越界：' + reg);
    }
  });

  check(tag + ' 每个区域连通', function () {
    for (let r = 0; r < size; r++) {
      assert.ok(puzzle.isRegionConnected(gen.region, size, r), '区域 ' + r + ' 不连通');
    }
  });

  check(tag + ' 解中每区域各一只', function () {
    const seen = {};
    gen.cats.forEach(function (pos) {
      const reg = gen.region[pos.row * size + pos.col];
      assert.ok(!seen[reg], '区域 ' + reg + ' 有多只猫');
      seen[reg] = true;
    });
    assert.strictEqual(Object.keys(seen).length, size);
  });

  check(tag + ' 相邻区域颜色不同', function () {
    const colorOf = puzzle.assignColors(gen.region, size, ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
    for (let idx = 0; idx < size * size; idx++) {
      const r = Math.floor(idx / size);
      const c = idx % size;
      if (c < size - 1 && gen.region[idx] !== gen.region[idx + 1]) {
        assert.notStrictEqual(colorOf[gen.region[idx]], colorOf[gen.region[idx + 1]], '左右同色');
      }
      if (r < size - 1 && gen.region[idx] !== gen.region[idx + size]) {
        assert.notStrictEqual(colorOf[gen.region[idx]], colorOf[gen.region[idx + size]], '上下同色');
      }
    }
  });

  check(tag + ' 每个区域颜色唯一', function () {
    const colorOf = puzzle.assignColors(gen.region, size, ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
    const seen = {};
    for (let reg = 0; reg < size; reg++) {
      assert.ok(!seen[colorOf[reg]], '区域之间出现同色：' + colorOf[reg]);
      seen[colorOf[reg]] = true;
    }
  });

  check(tag + ' 同一关可复现', function () {
    const again = buildLevel(level);
    assert.deepStrictEqual(again.gen.region, gen.region);
    assert.deepStrictEqual(again.gen.cats, gen.cats);
  });

  const cost = Date.now() - levelStart;
  assert.ok(cost < 3000, '第' + level + '关生成耗时异常：' + cost + 'ms');
}

// 2. 求解器
check('求解器返回的解都合法', function () {
  const size = 4;
  const region = [
    0, 0, 1, 1,
    0, 0, 1, 2,
    0, 3, 1, 2,
    3, 3, 2, 2,
  ];
  const res = puzzle.countSolutions(size, region, 5);
  assert.ok(res.count >= 1);
  res.solutions.forEach(function (cols) {
    const cats = cols.map(function (c, r) {
      return { row: r, col: c, region: region[r * size + c] };
    });
    assert.ok(rules.checkSolved(cats, size), '求解结果不合法：' + cols.join(','));
  });
});

check('求解器能识别多解', function () {
  const region = [
    0, 0, 0, 0,
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
  ];
  const res = puzzle.countSolutions(4, region, 9);
  assert.ok(res.count > 1, '应存在多解');
});

check('固定猫求解：与固定猫一致', function () {
  const size = 4;
  const region = [
    0, 0, 1, 1,
    0, 0, 1, 2,
    0, 3, 1, 2,
    3, 3, 2, 2,
  ];
  const fixed = [{ row: 0, col: 2, region: 1 }];
  const res = puzzle.countSolutions(size, region, 3, fixed);
  assert.ok(res.count >= 1);
  assert.strictEqual(res.solutions[0][0], 2);
});

check('固定猫冲突时无解', function () {
  const size = 4;
  const region = [
    0, 0, 1, 1,
    0, 0, 1, 2,
    0, 3, 1, 2,
    3, 3, 2, 2,
  ];
  const fixed = [
    { row: 0, col: 0, region: 0 },
    { row: 1, col: 0, region: 0 },
  ];
  const res = puzzle.countSolutions(size, region, 1, fixed);
  assert.strictEqual(res.count, 0);
});

check('提示可一步步走完一关', function () {
  for (let level = 1; level <= 12; level++) {
    const built = buildLevel(level);
    const size = built.size;
    const placed = [];
    for (let step = 0; step < size; step++) {
      const hint = puzzle.nextHint(size, built.gen.region, placed);
      assert.ok(hint, '第' + level + '关第' + step + '步无提示可用');
      const cat = { row: hint.row, col: hint.col, region: built.gen.region[hint.row * size + hint.col] };
      assert.strictEqual(rules.conflictReason(placed, cat), '', '第' + level + '关提示位置冲突');
      placed.push(cat);
    }
    assert.ok(rules.checkSolved(placed, size), '第' + level + '关按提示没走通');
  }
});

check('提示在走不通的局面返回 null', function () {
  const size = 4;
  const region = [
    0, 0, 0, 0,
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
  ];
  const dead = [
    { row: 0, col: 0, region: 0 },
    { row: 1, col: 1, region: 1 },
    { row: 2, col: 1, region: 2 },
  ];
  assert.strictEqual(puzzle.nextHint(size, region, dead), null);
});

// 3. 规则判定
check('冲突检测：同行', function () {
  const cats = [{ row: 0, col: 0, region: 0 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 0, col: 3, region: 2 }), rules.REASON_ROW);
});

check('冲突检测：同列', function () {
  const cats = [{ row: 0, col: 0, region: 0 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 3, col: 0, region: 2 }), rules.REASON_COL);
});

check('冲突检测：同色区域', function () {
  const cats = [{ row: 0, col: 0, region: 1 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 2, col: 2, region: 1 }), rules.REASON_REGION);
});

check('冲突检测：斜角相邻', function () {
  const cats = [{ row: 1, col: 1, region: 0 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 2, col: 2, region: 3 }), rules.REASON_ADJ);
});

check('冲突检测：合法位置放行', function () {
  const cats = [{ row: 0, col: 0, region: 0 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 2, col: 3, region: 2 }), '');
});

check('checkSolved：缺一只不算通关', function () {
  const cats = [
    { row: 0, col: 1, region: 0 },
    { row: 1, col: 3, region: 1 },
    { row: 2, col: 0, region: 3 },
  ];
  assert.strictEqual(rules.checkSolved(cats, 4), false);
});

check('checkSolved：错位解不算通关', function () {
  const cats = [
    { row: 0, col: 0, region: 0 },
    { row: 1, col: 2, region: 1 },
    { row: 2, col: 0, region: 3 },
    { row: 3, col: 1, region: 2 },
  ];
  assert.strictEqual(rules.checkSolved(cats, 4), false);
});

// 4. 对角线约束（第40关起精英关）
function buildEliteLevel(level) {
  const size = levelSize(level);
  const rand = puzzle.rng(seedOf(level) + 7777);
  return { size: size, gen: puzzle.generate(size, rand, { diagonal: true }) };
}

check('精英关谜题：40-60关有解且解满足对角线约束', function () {
  for (let level = 40; level <= 60; level++) {
    const built = buildEliteLevel(level);
    const size = built.size;
    if (built.gen.count < 1) throw new Error('第' + level + '关对角线规则下无解');
    const cats = catsOf(built.gen, size);
    if (!rules.checkSolved(cats, size, { diagonal: true })) {
      throw new Error('第' + level + '关解不满足对角线约束');
    }
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        if (rules.isDiagonal(cats[i], cats[j])) {
          throw new Error('第' + level + '关存在同对角线的猫');
        }
      }
    }
  }
});

check('冲突检测：对角线冲突只在精英规则下拦截', function () {
  const cats = [{ row: 0, col: 0, region: 0 }];
  assert.strictEqual(rules.conflictReason(cats, { row: 3, col: 3, region: 2 }), '');
  assert.strictEqual(rules.conflictReason(cats, { row: 3, col: 3, region: 2 }, { diagonal: true }), rules.REASON_DIAG);
  assert.strictEqual(rules.conflictReason(cats, { row: 2, col: 2, region: 2 }, { diagonal: true }), rules.REASON_DIAG);
  const catsB = [{ row: 0, col: 5, region: 0 }];
  assert.strictEqual(rules.conflictReason(catsB, { row: 3, col: 2, region: 2 }, { diagonal: true }), rules.REASON_DIAG);
});

check('checkSolved：精英规则拒绝对角线冲突的摆法', function () {
  const cats = [
    { row: 0, col: 0, region: 0 },
    { row: 1, col: 3, region: 1 },
    { row: 2, col: 1, region: 2 },
    { row: 3, col: 4, region: 3 },
    { row: 4, col: 2, region: 4 },
    { row: 5, col: 5, region: 5 },
  ];
  assert.strictEqual(rules.checkSolved(cats, 6), true, '旧规则下应合法');
  assert.strictEqual(rules.checkSolved(cats, 6, { diagonal: true }), false, '精英规则下应对角线冲突');
});

check('求解器：对角线规则下所有解都是N皇后解', function () {
  const size = 6;
  const region = new Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) region[r * size + c] = r;
  }
  const res = puzzle.countSolutions(size, region, 200, null, null, { diagonal: true });
  assert.ok(res.count > 0, '6皇后应可解');
  res.solutions.forEach(function (cols) {
    for (let r = 0; r < size; r++) {
      for (let rr = r + 1; rr < size; rr++) {
        assert.notStrictEqual(Math.abs(r - rr), Math.abs(cols[r] - cols[rr]), '解含对角线冲突: ' + cols.join(','));
      }
    }
  });
  const plain = puzzle.countSolutions(size, region, 500);
  assert.ok(plain.count > res.count, '对角线约束应减少解数量');
});

check('提示：精英关按对角线规则可走完整关', function () {
  for (let level = 40; level <= 44; level++) {
    const built = buildEliteLevel(level);
    const size = built.size;
    const placed = [];
    for (let step = 0; step < size; step++) {
      const hint = puzzle.nextHint(size, built.gen.region, placed, null, { diagonal: true });
      assert.ok(hint, '第' + level + '关第' + step + '步无提示');
      const cat = { row: hint.row, col: hint.col, region: built.gen.region[hint.row * size + hint.col] };
      assert.strictEqual(rules.conflictReason(placed, cat, { diagonal: true }), '', '提示位置冲突');
      placed.push(cat);
    }
    assert.ok(rules.checkSolved(placed, size, { diagonal: true }), '按提示没走通');
  }
});

const total = Date.now() - started;
console.log('通过用例：' + passed + ' / ' + (passed + failures.length));
console.log('生成 ' + LEVELS + ' 关总耗时：' + total + 'ms，平均 ' + Math.round(total / LEVELS) + 'ms/关');
console.log('唯一解关卡：' + uniqueCount + ' / ' + LEVELS);
if (failures.length) {
  console.error('\n失败用例：');
  failures.forEach(function (f) { console.error(' - ' + f); });
  process.exit(1);
}
console.log('全部用例通过 ✅');
