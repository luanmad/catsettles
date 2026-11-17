// 音效生成脚本（Node 环境：node tools/gen-sounds.js）
// 合成小游戏用的短音效 WAV 到 assets/sounds/，改音效后重新运行即可。
const fs = require('fs');
const path = require('path');

const SR = 44100; // 采样率
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

// 合成一段音频：segments 顺序拼接
// seg: { freq, dur, type: 'sine'|'square'|'saw'|'noise', vol, sweepTo }
function synth(segments) {
  const samples = [];
  for (const seg of segments) {
    const n = Math.floor(SR * seg.dur);
    const vol = seg.vol == null ? 0.5 : seg.vol;
    const from = seg.freq;
    const to = seg.sweepTo == null ? seg.freq : seg.sweepTo;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const freq = from + (to - from) * (i / n);
      let v;
      if (seg.type === 'square') {
        v = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
      } else if (seg.type === 'saw') {
        v = 2 * ((freq * t) % 1) - 1;
      } else if (seg.type === 'noise') {
        v = Math.random() * 2 - 1;
      } else {
        v = Math.sin(2 * Math.PI * freq * t);
      }
      // 包络：5ms 快速起音 + 指数衰减，避免爆音
      const attack = Math.min(1, i / (SR * 0.005));
      const decay = Math.exp(-4 * (i / n));
      samples.push(v * vol * attack * decay);
    }
  }
  return samples;
}

function toWav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // PCM chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);    // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

const NOTE = {
  C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5,
};

const sounds = {
  // 轻点：短促高频嗒声
  'tap.wav': synth([
    { freq: 1100, dur: 0.05, type: 'sine', vol: 0.45 },
    { freq: 1500, dur: 0.03, type: 'sine', vol: 0.25 },
  ]),
  // 放猫：上扬双音"啵咚"
  'place.wav': synth([
    { freq: 660, dur: 0.08, type: 'sine', vol: 0.5 },
    { freq: 990, dur: 0.12, type: 'sine', vol: 0.5 },
  ]),
  // 出错：低沉蜂鸣
  'error.wav': synth([
    { freq: 220, dur: 0.12, type: 'square', vol: 0.3 },
    { freq: 170, dur: 0.16, type: 'square', vol: 0.3 },
  ]),
  // 过关：C-E-G-C 上行琶音
  'win.wav': synth([
    { freq: NOTE.C5, dur: 0.11, type: 'sine', vol: 0.5 },
    { freq: NOTE.E5, dur: 0.11, type: 'sine', vol: 0.5 },
    { freq: NOTE.G5, dur: 0.11, type: 'sine', vol: 0.5 },
    { freq: NOTE.C6, dur: 0.26, type: 'sine', vol: 0.55 },
    { freq: NOTE.E6, dur: 0.3, type: 'sine', vol: 0.4 },
  ]),
  // 提示：高频上滑星光感
  'hint.wav': synth([
    { freq: 900, sweepTo: 1700, dur: 0.18, type: 'sine', vol: 0.4 },
    { freq: 1700, dur: 0.08, type: 'sine', vol: 0.3 },
  ]),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  fs.writeFileSync(path.join(OUT_DIR, name), toWav(samples));
  console.log('生成 ' + name + '（' + Math.round(samples.length / SR * 1000) + 'ms）');
}
console.log('完成，输出目录：' + OUT_DIR);
