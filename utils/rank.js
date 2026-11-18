// 排行榜服务：基于微信云开发（云函数 rank + 集合 rankings）。
// 在下方 CLOUD_ENV 填入云开发环境ID后即生效；未配置或调用失败时自动降级，
// 页面会隐藏排行榜入口，游戏本身不受影响。
const CLOUD_ENV = 'cloud1-d4gy5xsf1bc90ed44'; // TODO: 填入你的云开发环境ID，例如 'cat-1a2b3c'
const FUNC_NAME = 'rank';
let cloudInited = false;

function cloudReady() {
  if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return false;
  if (!cloudInited) {
    try {
      wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
      cloudInited = true;
    } catch (e) {
      return false;
    }
  }
  return true;
}

function call(action, data) {
  return new Promise(function (resolve, reject) {
    if (!cloudReady()) {
      reject(new Error('cloud-disabled'));
      return;
    }
    wx.cloud.callFunction({
      name: FUNC_NAME,
      data: Object.assign({ action: action }, data || {}),
      success: function (res) {
        resolve(res && res.result);
      },
      fail: reject,
    });
  });
}

// 上报成绩：level=已到达关数，total=总通关时间（秒），time=本关用时（秒），score=累计得分
function submitScore(level, total, seconds, nickname, score, lastScore) {
  return call('submit', {
    level: level,
    total: total,
    time: seconds,
    score: score || 0,
    lastScore: lastScore || 0,
    nickname: nickname || '喵友',
  }).then(function (result) {
    return result || {};
  });
}

// 拉取排行榜：{ top: [{rank, nickname, maxLevel, time, isMe}], me: {...}|null }
function fetchRanking() {
  return call('top', {}).then(function (result) {
    return result || { top: [], me: null };
  });
}

module.exports = {
  submitScore: submitScore,
  fetchRanking: fetchRanking,
  isEnabled: cloudReady,
};
