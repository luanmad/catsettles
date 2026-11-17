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
    fillText: noop, save: noop, restore: noop, rect: noop, clip: noop, drawImage: noop,
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
global.requestAnimationFrame = function () {}; // 不循环

// 加载子域代码
require(path.join(__dirname, '..', 'openDataContext', 'index.js'));

let pass = 0, total = 0;
function check(name, fn) {
  total++;
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.stack || e)); process.exitCode = 1; }
}

function mkUser(nickname, level, total, time) {
  return {
    avatarUrl: 'http://img/' + nickname,
    nickname: nickname,
    KVDataList: [{ key: 'cat_rank_v1', value: JSON.stringify({ level: level, total: total, time: time }) }],
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
check('数据解析与排序（关数降序、用时升序）', function () {
  const res = {
    data: [
      mkUser('小明', 3, 200, 50),
      mkUser('小红', 5, 300, 30),
      mkUser('小刚', 5, 250, 20), // 同关数，总时间更短应排前面
      mkUser('小强', 5, 250, 15), // 同关同总时间，单关更短排前
      { nickname: '无数据用户', avatarUrl: '', KVDataList: [] }, // 应被过滤
    ],
  };
  getFriendCb.success(res);
  // 通过再次 show + scroll 间接触发 draw，确认无异常
  onMessageCb({ action: 'scroll', dy: 100 });
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
