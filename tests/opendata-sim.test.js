// 开放数据域模拟测试：mock 子域 wx API，验证好友榜数据解析/排序/通信/绘制无异常。
const path = require('path');
const fs = require('fs');

let onMessageCb = null;
let getFriendCb = null;
let posted = [];

function ctxMock() {
  const noop = function () {};
  return {
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    arcTo: noop, arc: noop, closePath: noop, fill: noop, stroke: noop, fillRect: noop,
    fillText: function (s) { (global.__drawTexts || (global.__drawTexts = [])).push(String(s)); },
    save: noop, restore: noop, rect: noop, clip: noop, drawImage: noop,
    measureText: function (s) { return { width: String(s).length * 12 }; },
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {},
    set textAlign(v) {}, set textBaseline(v) {},
  };
}

global.wx = {
  createCanvas: function () { return { width: 300, height: 150, getContext: function () { return ctxMock(); } }; },
  createImage: function () {
    const img = {};
    Object.defineProperty(img, 'src', { set: function (v) { if (img.onload) img.onload(); } });
    return img;
  },
  onMessage: function (cb) { onMessageCb = cb; },
  getFriendCloudStorage: function (opts) { getFriendCb = opts; },
};
let rafCb = null;
global.requestAnimationFrame = function (cb) { rafCb = cb; }; // 收集循环回调，按需手动触发

// 加载子域代码
require(path.join(__dirname, '..', 'openDataContext', 'index.js'));

let pass = 0, total = 0;
function check(name, fn) {
  total++;
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); process.exitCode = 1; }
}

function mkUser(nickname, level, total, time, score, lastScore) {
  return {
    avatarUrl: 'http://img/' + nickname,
    nickname: nickname,
    KVDataList: [{ key: 'cat_rank_v1', value: JSON.stringify({ level: level, total: total, time: time, score: score, lastScore: lastScore || 0 }) }],
  };
}

console.log('开放数据域模拟：');
check('注册消息监听', function () {
  if (typeof onMessageCb !== 'function') throw new Error('未注册 wx.onMessage');
});
check('收到 show 后拉取好友数据', function () {
  onMessageCb({ action: 'show', view: { x: 0, y: 0, w: 670, h: 600, scale: 1 }, dpr: 2 });
  if (!getFriendCb) throw new Error('未调用 getFriendCloudStorage');
  if (getFriendCb.keyList[0] !== 'cat_rank_v1') throw new Error('key 不匹配');
});
check('数据解析与排序（得分降序优先）', function () {
  const res = {
    data: [
      mkUser('小明', 3, 200, 50, 9000), // 得分最高，应排第一（即使关数最低）
      mkUser('小红', 5, 300, 30, 8000),
      mkUser('小刚', 5, 250, 20, 8000), // 同分，关数相同总用时更短应排前
      mkUser('小强', 5, 250, 15, 8000), // 同分同关同总用时，单关更短排前
      { nickname: '无数据用户', avatarUrl: '', KVDataList: [] }, // 应被过滤
    ],
  };
  global.__drawTexts = [];
  getFriendCb.success(res); // 拉取成功后子域更新榜单数据
  if (rafCb) rafCb(); // 手动触发一帧绘制
  const texts = global.__drawTexts || [];
  const xm = texts.indexOf('小明'), xh = texts.indexOf('小红'), xg = texts.indexOf('小刚'), xq = texts.indexOf('小强');
  // 小明得分最高第一；同分组按关数→总用时→单关用时：小强、小刚、小红
  if (!(xm >= 0 && xm < xq && xq < xg && xg < xh)) {
    throw new Error('好友榜未按得分/关数/用时排序: 小明' + xm + ' 小强' + xq + ' 小刚' + xg + ' 小红' + xh);
  }
});
check('scroll 与 hide 消息无异常', function () {
  onMessageCb({ action: 'scroll', dy: -50 });
  onMessageCb({ action: 'hide' });
  onMessageCb({ action: 'unknown' });
});
check('空列表与错误分支', function () {
  onMessageCb({ action: 'show', view: { x: 0, y: 0, w: 670, h: 600, scale: 1 }, dpr: 1 });
  getFriendCb.success({ data: [{ nickname: '无数据', avatarUrl: '', KVDataList: [] }] });
  onMessageCb({ action: 'show', view: { x: 0, y: 0, w: 670, h: 600, scale: 1 }, dpr: 1 });
  getFriendCb.fail({ errMsg: 'network error' });
});

console.log('\n通过：' + pass + ' / ' + total);
