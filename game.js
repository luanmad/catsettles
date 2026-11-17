// 微信小游戏入口：创建主画布并启动游戏
const Game = require('./js/game.js');
const canvas = wx.createCanvas();
new Game(canvas);
