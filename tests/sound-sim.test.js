// 音效模块测试：验证真机兼容配置与播放逻辑。
const path = require('path');

let globalOptions = [];
let created = [];
let plays = [];
let errors = [];

global.wx = {
  createInnerAudioContext: function () {
    const c = {
      _src: '',
      volume: 1,
      obeyMuteSwitch: true,
      stopCount: 0,
      playCount: 0,
      set src(v) { this._src = v; },
      get src() { return this._src; },
      stop: function () { this.stopCount++; },
      play: function () { this.playCount++; plays.push(this._src); },
      onError: function (cb) { this._errCb = cb; },
    };
    created.push(c);
    return c;
  },
  setInnerAudioOption: function (o) { globalOptions.push(o); if (o.success) o.success(); },
};

const sound = require(path.join(__dirname, '..', 'utils', 'sound.js'));

let pass = 0, total = 0;
function check(name, fn) {
  total++;
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' -> ' + (e && e.message || e)); process.exitCode = 1; }
}

console.log('音效模块测试：');
check('启用音效后 play 创建 context 并播放', function () {
  sound.setEnabled(true);
  sound.play('tap');
  if (created.length !== 1) throw new Error('未创建音频 context');
  const c = created[0];
  if (c.src !== 'assets/sounds/tap.mp3') throw new Error('音频路径错误: ' + c.src);
  if (c.src.indexOf('/assets') === 0) throw new Error('路径带了前导斜杠');
  if (c.playCount !== 1) throw new Error('未调用 play');
  if (c.stopCount !== 1) throw new Error('播放前未 stop');
});
check('全局关闭静音跟随只设置一次', function () {
  if (globalOptions.length !== 1) throw new Error('setInnerAudioOption 调用次数: ' + globalOptions.length);
  if (globalOptions[0].obeyMuteSwitch !== false) throw new Error('obeyMuteSwitch 未设为 false');
});
check('单实例也设置 obeyMuteSwitch=false', function () {
  if (created[0].obeyMuteSwitch !== false) throw new Error('实例 obeyMuteSwitch 未关闭');
});
check('重复播放复用 context（不新建）', function () {
  const before = created.length;
  sound.play('tap');
  if (created.length !== before) throw new Error('重复播放创建了新 context');
});
check('不同音效各自独立 context', function () {
  const before = created.length;
  sound.play('win');
  if (created.length !== before + 1) throw new Error('新音效未创建独立 context');
  if (created[created.length - 1].src !== 'assets/sounds/win.mp3') throw new Error('win 路径错误');
});
check('关闭音效后不播放', function () {
  sound.setEnabled(false);
  const n = plays.length;
  sound.play('hint');
  if (plays.length !== n) throw new Error('关闭后仍播放');
  sound.setEnabled(true);
});
check('所有 5 个音效路径正确', function () {
  const names = ['tap', 'place', 'error', 'win', 'hint'];
  names.forEach(function (n) { sound.play(n); });
  const srcs = created.map(function (c) { return c.src; });
  names.forEach(function (n) {
    if (srcs.indexOf('assets/sounds/' + n + '.mp3') < 0) {
      throw new Error(n + ' 未使用正确 mp3 路径, 已创建: ' + srcs.join(','));
    }
  });
  // 检查每个 context 的源都对应某个音效且是 mp3
  created.forEach(function (c) {
    if (!/\.mp3$/.test(c.src)) throw new Error('非 mp3 路径: ' + c.src);
  });
});

console.log('\n通过：' + pass + ' / ' + total);
