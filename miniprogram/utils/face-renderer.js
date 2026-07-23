/**
 * 数字人面部渲染引擎 v5 — 表情图切换
 *
 * 资产结构：
 *   images/avatar/
 *   ├── base.jpg                           默认底图
 *   ├── expressions/{neutral,happy,...}.jpg  表情图
 *   └── assets.json                        资产清单
 *
 * 渲染管线：
 *   1) 绘制当前表情图（表情切换透明度淡入淡出）
 *   2) 说话时自动切到 surprised 张嘴表情，说完恢复
 *
 * 更换设计：替换 images/avatar/ 下图片即可。
 */

const ASSET_BASE = '/images/avatar/';
let ASSET_MANIFEST = null;
try {
  ASSET_MANIFEST = require('../images/avatar/assets.json');
} catch (e) {
  console.warn('[Face] assets.json 读取失败，将使用 fallback');
}

class FaceRenderer {
  constructor(canvas, ctx, dpr) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dpr = dpr;
    this.w = canvas.width / dpr;
    this.h = canvas.height / dpr;
    this.scale = Math.min(this.w / 210, this.h / 210);
    this.offX = (this.w - 210 * this.scale) / 2;
    this.offY = (this.h - 210 * this.scale) / 2;

    this._manifest = ASSET_MANIFEST || {
      base: 'base.jpg',
      expressions: { neutral: 'base.jpg' },
    };
    this._baseImg = null;
    this._exprImgs = {};
    this._loadedCount = 0;
    this._totalCount = 0;
    this._ready = false;

    // 表情状态
    this.currentExpr = 'neutral';
    this._prevExpr = 'neutral';
    this._exprAlpha = 1;
    this._exprTransition = 0;

    // 说话状态
    this.isSpeaking = false;
    this._speakT = 0;
    this._speakDur = 0;
    this._savedExpr = null;

    // 动画
    this._time = 0;
    this._breathPhase = 0;
    this._nodPhase = 0;

    // 弹簧物理
    this._hx = 0; this._hvx = 0;
    this._hy = 0; this._hvy = 0;
    this._ht = 0; this._hvt = 0;
    this._thx = 0; this._thy = 0; this._tht = 0;

    this._loadAssets();
  }

  _loadAssets() {
    const m = this._manifest;
    const tasks = [];

    // base
    tasks.push({ key: 'base', url: ASSET_BASE + m.base, type: 'base' });

    // expressions
    Object.keys(m.expressions || {}).forEach((name) => {
      tasks.push({ key: name, url: ASSET_BASE + m.expressions[name], type: 'expr' });
    });

    this._totalCount = tasks.length;
    if (this._totalCount === 0) {
      this._ready = true;
      return;
    }

    tasks.forEach((t) => {
      const img = this.canvas.createImage();
      img.onload = () => {
        if (t.type === 'base') this._baseImg = img;
        if (t.type === 'expr') this._exprImgs[t.key] = img;
        this._loadedCount++;
        if (this._loadedCount >= this._totalCount) {
          this._ready = true;
          console.log('[Face] 全部分层资产加载完成');
        }
      };
      img.onerror = () => {
        console.warn('[Face] 资产加载失败:', t.url);
        this._loadedCount++;
        if (this._loadedCount >= this._totalCount) this._ready = true;
      };
      img.src = t.url;
    });
  }

  update(dt) {
    if (!this._ready) return;
    if (dt > 0.1) dt = 0.1;
    this._time += dt;

    // 弹簧物理
    const k = 8, d = 12;
    this._hvx += ((this._thx - this._hx) * k - this._hvx * d) * dt;
    this._hvy += ((this._thy - this._hy) * k - this._hvy * d) * dt;
    this._hvt += ((this._tht - this._ht) * k - this._hvt * d) * dt;
    this._hx += this._hvx * dt;
    this._hy += this._hvy * dt;
    this._ht += this._hvt * dt;

    // 空闲微动
    if (!this.isSpeaking) {
      this._idleT = (this._idleT || 0) + dt * 1000;
      if (this._idleT >= (this._idleIvl || 0)) {
        this._idleT = 0;
        this._idleIvl = 2500 + Math.random() * 3500;
        this._thx = (Math.random() - 0.5) * 1.2;
        this._thy = (Math.random() - 0.5) * 0.6;
        this._tht = (Math.random() - 0.5) * 2.5;
      }
      if (Math.abs(this._thx) < 0.02 && Math.abs(this._thy) < 0.02) {
        this._thx += (Math.random() - 0.5) * 0.08;
        this._thy += (Math.random() - 0.5) * 0.06;
        this._tht += (Math.random() - 0.5) * 0.5;
      }
    }

    // 表情淡入淡出 (~170ms)
    if (this._exprTransition > 0) {
      this._exprTransition -= dt * 6;
      if (this._exprTransition <= 0) {
        this._exprTransition = 0;
        this._prevExpr = this.currentExpr;
        this._exprAlpha = 1;
      } else {
        this._exprAlpha = 1 - this._exprTransition;
      }
    }

    // 说话时点头动画
    if (this.isSpeaking) {
      this._speakT += dt * 1000;
      this._nodPhase += dt * 5.5;
      this._thy = -0.5 + Math.sin(this._nodPhase) * 0.4;
      this._thx = Math.sin(this._nodPhase * 0.7) * 0.25;
      if (this._speakT > this._speakDur) {
        this.stopSpeaking(); // 超时自动闭嘴 + 恢复表情
      }
    }

    // 呼吸
    this._breathPhase += dt * 0.8;
  }

  setExpression(expr) {
    if (this.currentExpr === expr) return;
    if (!this._manifest || !this._manifest.expressions[expr]) {
      console.warn('[Face] 未知表情:', expr);
      return;
    }
    this._prevExpr = this.currentExpr;
    this.currentExpr = expr;
    this._exprTransition = 1;
    this._exprAlpha = 0;
  }

  setPupilTarget() { /* 保留兼容 */ }

  setHeadTarget(hx, hy, ht) {
    this._thx = hx;
    this._thy = hy;
    this._tht = ht;
  }

  startSpeaking(text) {
    if (this.isSpeaking) return;
    this._savedExpr = this.currentExpr;     // 记下说话前的表情
    this.isSpeaking = true;
    this._speakT = 0;
    this._speakDur = (text || '').length * 70 + 200;
    this._nodPhase = 0;
    // 切到张嘴表情（surprised 嘴张最大，近似说话效果）
    this.setExpression('surprised');
  }

  stopSpeaking() {
    if (!this.isSpeaking) return;
    this.isSpeaking = false;
    // 恢复说话前的表情
    const restore = this._savedExpr || 'neutral';
    this.setExpression(restore);
  }

  setViseme(visemeId) {
    // 表情图自带嘴型，不需要程序化嘴型绘制；
    // 仅保留此接口兼容，不做额外处理
  }

  render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    // 背景
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, this.w, this.h);

    if (!this._ready) {
      c.fillStyle = '#999';
      c.font = '14px sans-serif';
      c.textAlign = 'center';
      c.fillText('加载中...', this.w / 2, this.h / 2);
      c.textAlign = 'start';
      return;
    }

    const s = this.scale;
    const ox = this.offX, oy = this.offY;

    // 头部变换
    const cx = this.w / 2 + this._hx * 4;
    const cy = this.h * 0.4 + this._hy * 3;
    const bs = 1 + Math.sin(this._breathPhase) * 0.01;

    c.save();
    c.translate(cx, cy);
    c.rotate(this._ht * Math.PI / 180);
    c.scale(bs, bs);
    c.translate(-cx, -cy);

    // 表情底图
    const drawExpr = (img, alpha) => {
      if (!img) return;
      c.save();
      c.globalAlpha = alpha;
      c.drawImage(img, ox, oy, 210 * s, 210 * s);
      c.restore();
    };

    const prevImg = this._exprImgs[this._prevExpr] || this._baseImg;
    const curImg = this._exprImgs[this.currentExpr] || this._baseImg;

    if (this._exprTransition > 0) {
      drawExpr(prevImg, 1);
      drawExpr(curImg, this._exprAlpha);
    } else {
      drawExpr(curImg, 1);
    }

    c.restore();
  }
}

module.exports = FaceRenderer;
