// Canvas 绘制工具：750 逻辑宽度坐标 + 命中区域管理。
// 所有 UI 用逻辑坐标绘制，Renderer 负责把逻辑坐标映射到真实像素。

class Renderer {
  constructor(canvas, designWidth) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.DW = designWidth || 750;
    this.scale = 1;
    this.dpr = 1;
    this.DH = this.DW;
    this.hitAreas = [];
    this._stack = [];
  }

  // 根据窗口信息适配画布尺寸
  resize(info) {
    const w = info.windowWidth || 375;
    const h = info.windowHeight || 667;
    const dpr = info.pixelRatio || 1;
    this.dpr = dpr;
    this.scale = w / this.DW;
    this.DH = h / this.scale;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
  }

  // 每帧开始：清空命中区域
  begin() {
    this.hitAreas = [];
  }

  // 注册命中区域。handler(tapInfo) 在点击时调用。
  addHit(x, y, w, h, handler, data) {
    this.hitAreas.push({ x, y, w, h, handler, data: data || null });
  }

  // 命中检测：返回最上层(最后注册)的区域
  hitTest(x, y) {
    for (let i = this.hitAreas.length - 1; i >= 0; i--) {
      const a = this.hitAreas[i];
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
    }
    return null;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.DW, this.DH);
  }

  setFill(color) { this.ctx.fillStyle = color; }
  setStroke(color, width) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width || 1;
  }

  // 圆角矩形路径
  roundRectPath(x, y, w, h, r) {
    const c = this.ctx;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.arcTo(x + w, y, x + w, y + rr, rr);
    c.lineTo(x + w, y + h - rr);
    c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    c.lineTo(x + rr, y + h);
    c.arcTo(x, y + h, x, y + h - rr, rr);
    c.lineTo(x, y + rr);
    c.arcTo(x, y, x + rr, y, rr);
    c.closePath();
  }

  fillRoundRect(x, y, w, h, r, color) {
    this.ctx.fillStyle = color;
    this.roundRectPath(x, y, w, h, r);
    this.ctx.fill();
  }

  strokeRoundRect(x, y, w, h, r, color, width) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width || 1;
    this.roundRectPath(x, y, w, h, r);
    this.ctx.stroke();
  }

  fillRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  // 文本：align(left/center/right), baseline(top/middle/bottom)
  text(str, x, y, size, color, align, baseline, weight) {
    const c = this.ctx;
    c.font = (weight ? weight + ' ' : '') + size + 'px -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif';
    c.fillStyle = color;
    c.textAlign = align || 'left';
    c.textBaseline = baseline || 'middle';
    c.fillText(String(str), x, y);
  }

  // 测量文本像素宽度（用于自适应字号）
  measureText(str, size) {
    const c = this.ctx;
    c.font = 'bold ' + size + 'px -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif';
    return c.measureText(String(str)).width;
  }

  // 带阴影的文本（用于标记符号）
  textShadow(str, x, y, size, color, align, baseline, shadowColor, blur) {
    const c = this.ctx;
    c.save();
    c.shadowColor = shadowColor || 'rgba(0,0,0,0.35)';
    c.shadowBlur = blur || 4;
    this.text(str, x, y, size, color, align, baseline);
    c.restore();
  }

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(x, y) { this.ctx.translate(x, y); }
  scaleBy(s) { this.ctx.scale(s, s); }
  rotate(a) { this.ctx.rotate(a); }
  globalAlpha(a) { this.ctx.globalAlpha = a; }

  /* ---------------- 矢量图标（避免 iOS 上 emoji 渲染异常） ---------------- */
  // 爱心：cx,cy 中心，s 尺寸，filled 实心/空心
  heart(cx, cy, s, color, filled) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.beginPath();
    c.moveTo(0, k * 0.95);
    c.bezierCurveTo(-k * 1.4, k * 0.1, -k, -k * 1.1, 0, -k * 0.35);
    c.bezierCurveTo(k, -k * 1.1, k * 1.4, k * 0.1, 0, k * 0.95);
    c.closePath();
    c.fillStyle = color;
    if (filled) {
      c.fill();
    } else {
      c.strokeStyle = color;
      c.lineWidth = Math.max(2, s * 0.1);
      c.stroke();
    }
    c.restore();
  }

  // 猫脸：cx,cy 中心，s 尺寸，color 主色
  cat(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    // 耳朵（三角）
    c.beginPath();
    c.moveTo(-k * 0.85, -k * 0.35);
    c.lineTo(-k * 0.7, -k * 1.05);
    c.lineTo(-k * 0.15, -k * 0.62);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(k * 0.85, -k * 0.35);
    c.lineTo(k * 0.7, -k * 1.05);
    c.lineTo(k * 0.15, -k * 0.62);
    c.closePath();
    c.fill();
    // 脸（圆）
    c.beginPath();
    c.arc(0, 0, k * 0.8, 0, Math.PI * 2);
    c.fill();
    // 眼睛
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-k * 0.3, -k * 0.1, k * 0.13, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(k * 0.3, -k * 0.1, k * 0.13, 0, Math.PI * 2); c.fill();
    c.fillStyle = color;
    c.beginPath(); c.arc(-k * 0.3, -k * 0.1, k * 0.07, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(k * 0.3, -k * 0.1, k * 0.07, 0, Math.PI * 2); c.fill();
    // 鼻子
    c.beginPath();
    c.moveTo(0, k * 0.18);
    c.lineTo(-k * 0.12, k * 0.02);
    c.lineTo(k * 0.12, k * 0.02);
    c.closePath();
    c.fill();
    c.restore();
  }

  // 齿轮
  gear(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    const teeth = 8;
    c.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (Math.PI * 2 * i) / (teeth * 2);
      const rr = i % 2 === 0 ? k : k * 0.72;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    // 中心孔
    c.fillStyle = C_PAGE_BG;
    c.beginPath(); c.arc(0, 0, k * 0.32, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // 菜单（三横线）
  menu(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = Math.max(2.5, s * 0.09);
    c.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const y = cy + i * k * 0.55;
      c.beginPath(); c.moveTo(cx - k * 0.8, y); c.lineTo(cx + k * 0.8, y); c.stroke();
    }
    c.restore();
  }

  // 问号
  question(cx, cy, s, color) {
    this.text('?', cx, cy, s, color, 'center', 'middle', 'bold');
  }

  // 垃圾桶（清除）
  trash(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, s * 0.09);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-k * 0.7, -k * 0.5); c.lineTo(k * 0.7, -k * 0.5); c.stroke();
    c.beginPath(); c.moveTo(-k * 0.25, -k * 0.5); c.lineTo(-k * 0.25, -k * 0.72); c.lineTo(k * 0.25, -k * 0.72); c.lineTo(k * 0.25, -k * 0.5); c.stroke();
    c.beginPath();
    c.moveTo(-k * 0.55, -k * 0.5);
    c.lineTo(-k * 0.42, k * 0.8);
    c.lineTo(k * 0.42, k * 0.8);
    c.lineTo(k * 0.55, -k * 0.5);
    c.stroke();
    c.beginPath(); c.moveTo(-k * 0.25, -k * 0.2); c.lineTo(-k * 0.25, k * 0.5); c.stroke();
    c.beginPath(); c.moveTo(k * 0.25, -k * 0.2); c.lineTo(k * 0.25, k * 0.5); c.stroke();
    c.restore();
  }

  // 撤销箭头
  undo(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, s * 0.1);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.arc(0, 0, k * 0.65, Math.PI * 0.25, Math.PI * 1.6);
    c.stroke();
    // 箭头
    c.beginPath();
    c.moveTo(-k * 0.62, -k * 0.1);
    c.lineTo(-k * 0.85, -k * 0.62);
    c.lineTo(-k * 0.25, -k * 0.62);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.restore();
  }

  // 灯泡（提示）
  bulb(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = Math.max(2, s * 0.09);
    c.beginPath();
    c.arc(0, -k * 0.2, k * 0.55, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-k * 0.3, k * 0.35);
    c.lineTo(k * 0.3, k * 0.35);
    c.lineTo(k * 0.2, k * 0.62);
    c.lineTo(-k * 0.2, k * 0.62);
    c.closePath();
    c.fill();
    c.restore();
  }

  // 眼睛（色盲模式）
  eye(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = Math.max(2, s * 0.08);
    c.beginPath();
    c.moveTo(-k * 0.9, 0);
    c.quadraticCurveTo(0, -k * 0.85, k * 0.9, 0);
    c.quadraticCurveTo(0, k * 0.85, -k * 0.9, 0);
    c.stroke();
    c.beginPath(); c.arc(0, 0, k * 0.28, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // 时钟（计时胶囊）
  clock(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, s * 0.09);
    c.beginPath(); c.arc(0, 0, k * 0.8, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -k * 0.5); c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(k * 0.4, k * 0.15); c.stroke();
    c.restore();
  }

  // 奖杯（排行榜胶囊）
  trophy(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-k * 0.55, -k * 0.8);
    c.lineTo(k * 0.55, -k * 0.8);
    c.lineTo(k * 0.3, -k * 0.1);
    c.lineTo(-k * 0.3, -k * 0.1);
    c.closePath();
    c.fill();
    c.fillRect(-k * 0.12, -k * 0.05, k * 0.24, k * 0.5);
    c.fillRect(-k * 0.45, k * 0.45, k * 0.9, k * 0.22);
    c.restore();
  }

  // 五角星图标：表示本关得分
  star(cx, cy, s, color) {
    const c = this.ctx;
    const R = s / 2, r = R * 0.45;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = (i % 2 === 0) ? R : r;
      const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  // 金币图标：表示累计总得分
  coin(cx, cy, s, color) {
    const c = this.ctx;
    const R = s / 2;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C_PAGE_BG;
    c.beginPath();
    c.arc(0, 0, R * 0.72, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.font = 'bold ' + Math.round(R * 1.05) + 'px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('¥', 0, 1);
    c.restore();
  }

  // 奖章图标：表示本关得分（与 trophy 的总得分区分）
  medal(cx, cy, s, color) {
    const c = this.ctx;
    const k = s / 2;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-k * 0.18, -k * 0.95);
    c.lineTo(-k * 0.02, -k * 0.42);
    c.lineTo(-k * 0.62, -k * 0.42);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(k * 0.18, -k * 0.95);
    c.lineTo(k * 0.02, -k * 0.42);
    c.lineTo(k * 0.62, -k * 0.42);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(0, k * 0.16, k * 0.66, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C_PAGE_BG;
    c.font = 'bold ' + Math.round(k * 0.8) + 'px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('★', 0, k * 0.18);
    c.restore();
  }
}

// 齿轮中心孔颜色（页面背景），避免依赖外部实例
const C_PAGE_BG = '#f5f7fa';

module.exports = Renderer;
