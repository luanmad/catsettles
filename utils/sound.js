// 音效管理（微信小游戏真机兼容版）
// 音频文件：assets/sounds/*.mp3（由 gen-sounds.js 生成 WAV 后转 MP3，真机兼容性最好）
const FILES = {
  tap: 'tap.mp3',
  place: 'place.mp3',
  error: 'error.mp3',
  win: 'win.mp3',
  hint: 'hint.mp3',
};

let enabled = true;
let globalOptionSet = false;
const ctxs = {};

function support() {
  return typeof wx !== 'undefined' && !!wx.createInnerAudioContext;
}

// 全局关闭静音跟随（iOS 真机外放无声的常见原因），只需设置一次
function ensureGlobalOption() {
  if (globalOptionSet) return;
  globalOptionSet = true;
  try {
    if (typeof wx.setInnerAudioOption === 'function') {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        success: function () {},
        fail: function (e) { console.warn('[音效] setInnerAudioOption 失败:', e && e.errMsg || e); },
      });
    }
  } catch (e) { /* 旧版本基础库不支持 */ }
}

function createCtx(name) {
  ensureGlobalOption();
  const c = wx.createInnerAudioContext();
  // 小游戏包内资源相对路径，不带前导斜杠
  c.src = 'assets/sounds/' + FILES[name];
  c.volume = 0.9;
  // 单实例上也设置一次，双保险
  try { if ('obeyMuteSwitch' in c) c.obeyMuteSwitch = false; } catch (e) {}
  c.onError(function (e) {
    console.warn('[音效] 加载/播放失败 ' + name + ':', e && (e.errMsg || e.errCode) || e);
  });
  ctxs[name] = c;
  return c;
}

function ctxOf(name) {
  if (!support()) return null;
  return ctxs[name] || createCtx(name);
}

function play(name) {
  if (!enabled || !FILES[name]) return;
  try {
    const c = ctxOf(name);
    if (!c) return;
    // 同一个 context 重复播放：先 stop 再 play（真机可靠做法）
    c.stop();
    c.play();
  } catch (e) { console.warn('[音效] play 异常:', e); }
}

function setEnabled(v) {
  enabled = !!v;
}

function isEnabled() {
  return enabled;
}

module.exports = {
  play: play,
  setEnabled: setEnabled,
  isEnabled: isEnabled,
};
