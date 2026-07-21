/**
 * 数字人面部渲染引擎 - 完整表情图片版
 * 使用多张完整表情头像按表情切换，配合呼吸、眨眼、头部微动等动画。
 */

const IMG_BASE = '/images';

// 表情图片映射：完整 210x210 头像
const AVATAR_PATHS = {
  neutral:   IMG_BASE + '/avatar.png',
  happy:     IMG_BASE + '/avatar_happy.png',
  sad:       IMG_BASE + '/avatar_sad.png',
  surprised: IMG_BASE + '/avatar_surprised.png',
  angry:     IMG_BASE + '/avatar_angry.png',
  wink:      IMG_BASE + '/avatar_wink.png',
  blink:     IMG_BASE + '/avatar_blink.png',
};

const SRC_W = 210;
const SRC_H = 210;

class FaceRenderer {
  constructor(canvas, ctx, dpr) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dpr = dpr;
    this.w = canvas.width / dpr;   // CSS 像素宽
    this.h = canvas.height / dpr;  // CSS 像素高

    // 缩放：把 210x210 图片适配到画布
    this.scale = Math.min(this.w / SRC_W, this.h / SRC_H);
    this.offX = (this.w - SRC_W * this.scale) / 2;
    this.offY = (this.h - SRC_H * this.scale) / 2;

    // 图片缓存：key -> Image
    this.imgs = {};
    this.ready = false;

    // ---- 动画状态 ----
    this.time = 0;
    this.breathPhase = 0;

    // 头部弹簧物理
    this.headX = 0; this.headVX = 0;
    this.headY = 0; this.headVY = 0;
    this.headTilt = 0; this.headTiltV = 0;
    this.targetHeadX = 0;
    this.targetHeadY = 0;
    this.targetHeadTilt = 0;

    // 眨眼
    this.eyeOpen = true;
    this.blinkTimer = 0;
    this.nextBlink = 2000 + Math.random() * 3000;
    this.isBlinking = false;
    this.blinkHoldStart = null;

    // 表情
    this.currentExpr = 'neutral';

    // 空闲微动
    this.idleTimer = 0;
    this.idleInterval = 3000 + Math.random() * 2000;

    // 说话
    this.isSpeaking = false;
    this.speakTime = 0;
    this.speakDuration = 0;
    this.speakNodPhase = 0;

    // 开始加载图片
    this._loadAll(canvas);
  }

  // ==================== 图片加载 ====================
  _loadOne(canvas, src) {
    return new Promise((resolve) => {
      try {
        const img = canvas.createImage();
        img.onload = () => resolve(img);
        img.onerror = (e) => { console.warn('[Face] 图片加载失败:', src, e); resolve(null); };
        img.src = src;
      } catch (e) {
        console.warn('[Face] createImage 失败:', src, e);
        resolve(null);
      }
    });
  }

  async _loadAll(canvas) {
    console.log('[Face] 开始加载表情图片...');
    const tasks = [];
    for (const [key, src] of Object.entries(AVATAR_PATHS)) {
      tasks.push(
        this._loadOne(canvas, src).then(img => { this.imgs[key] = img; })
      );
    }

    await Promise.all(tasks);
    this.ready = true;
    console.log('[Face] 所有表情图片加载完成');
  }

  // ==================== 物理更新 ====================
  update(dt) {
    if (!this.ready) return;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;

    const k = 8, damp = 12;
    const ax = (this.targetHeadX - this.headX) * k - this.headVX * damp;
    const ay = (this.targetHeadY - this.headY) * k - this.headVY * damp;
    const at = (this.targetHeadTilt - this.headTilt) * k - this.headTiltV * damp;
    this.headVX += ax * dt;
    this.headVY += ay * dt;
    this.headTiltV += at * dt;
    this.headX += this.headVX * dt;
    this.headY += this.headVY * dt;
    this.headTilt += this.headTiltV * dt;

    // 眨眼
    this.blinkTimer += dt * 1000;
    if (!this.isBlinking && this.blinkTimer >= this.nextBlink) {
      this._startBlink();
    }
    if (this.isBlinking) this._updateBlink(dt);

    // 空闲微动
    if (!this.isSpeaking) {
      this.idleTimer += dt * 1000;
      if (this.idleTimer >= this.idleInterval) {
        this.idleTimer = 0;
        this.idleInterval = 2500 + Math.random() * 3500;
        this.targetHeadX = (Math.random() - 0.5) * 1.2;
        this.targetHeadY = (Math.random() - 0.5) * 0.6;
        this.targetHeadTilt = (Math.random() - 0.5) * 2.5;
      }
      if (!this.isBlinking && Math.abs(this.targetHeadX) < 0.02 && Math.abs(this.targetHeadY) < 0.02) {
        this.targetHeadX += (Math.random() - 0.5) * 0.08;
        this.targetHeadY += (Math.random() - 0.5) * 0.06;
        this.targetHeadTilt += (Math.random() - 0.5) * 0.5;
      }
    }

    // 说话动画：点头 + 轻微张嘴模拟
    if (this.isSpeaking) {
      this.speakTime += dt * 1000;
      this.speakNodPhase += dt * 5.5;
      this.targetHeadY = -0.5 + Math.sin(this.speakNodPhase) * 0.4;
      this.targetHeadX = Math.sin(this.speakNodPhase * 0.7) * 0.25;

      if (this.speakTime > this.speakDuration) {
        this.isSpeaking = false;
        this.targetHeadY += (0 - this.targetHeadY) * 3 * dt;
        this.targetHeadX += (0 - this.targetHeadX) * 3 * dt;
      }
    }

    // 呼吸
    this.breathPhase += dt * 0.8;
  }

  _startBlink() {
    this.isBlinking = true;
    this.eyeOpen = false;
    this.blinkHoldStart = null;
  }

  _updateBlink(dt) {
    if (!this.eyeOpen) {
      if (!this.blinkHoldStart) this.blinkHoldStart = this.time;
      if (this.time - this.blinkHoldStart > 0.12) {
        this.eyeOpen = true;
      }
    } else {
      this.isBlinking = false;
      this.blinkHoldStart = null;
      this.blinkTimer = 0;
      this.nextBlink = 2000 + Math.random() * 3000;
    }
  }

  // ==================== 公开 API ====================

  /** 设置表情 */
  setExpression(expr) {
    if (this.currentExpr === expr) return;
    // 如果没有对应图片，回退到 neutral
    if (!AVATAR_PATHS[expr]) {
      // 映射特殊表情
      if (expr === 'sleepy') {
        this.currentExpr = 'sleepy';  // 状态记录，图片用 blink
      } else {
        this.currentExpr = 'neutral';
      }
      return;
    }
    this.currentExpr = expr;
  }

  /** 瞳孔跟踪（图片版保留接口兼容） */
  setPupilTarget(nx, ny) {
    // 图片版不追踪瞳孔，保持接口兼容
  }

  /** 头部目标 */
  setHeadTarget(hx, hy, ht) {
    this.targetHeadX = hx;
    this.targetHeadY = hy;
    this.targetHeadTilt = ht;
  }

  /** 开始说话 */
  startSpeaking(text) {
    this.isSpeaking = true;
    this.speakTime = 0;
    this.speakDuration = (text || '').length * 70 + 200; // ~70ms per char
    this.speakNodPhase = 0;
  }

  /** 停止说话 */
  stopSpeaking() {
    this.isSpeaking = false;
  }

  // ==================== 主渲染 ====================
  render() {
    if (!this.ready) {
      // 还未加载完，画一个提示
      const c = this.ctx;
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, this.w, this.h);
      c.fillStyle = '#999';
      c.font = '14px sans-serif';
      c.textAlign = 'center';
      c.fillText('加载中...', this.w / 2, this.h / 2);
      c.textAlign = 'start';
      return;
    }

    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    // 背景
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, this.w, this.h);

    c.save();

    // 头部变换中心（在画布坐标中）
    const cx = this.w / 2 + this.headX * 4;
    const cy = this.h * 0.4 + this.headY * 3;
    c.translate(cx, cy);
    c.rotate(this.headTilt * Math.PI / 180);
    const bs = 1 + Math.sin(this.breathPhase) * 0.012;
    c.scale(bs, bs);
    // 偏移回去，让坐标原点回到 0,0（模型空间）
    c.translate(-cx, -cy);

    // 选择当前要显示的完整头像
    let imgKey = this.currentExpr;

    // sleepy 表情 → 闭眼
    if (imgKey === 'sleepy') imgKey = 'blink';

    // 眨眼时优先显示闭眼图
    if (!this.eyeOpen && this.imgs.blink && imgKey !== 'sleepy') {
      imgKey = 'blink';
    }

    // 回退
    if (!AVATAR_PATHS[imgKey] || !this.imgs[imgKey]) {
      imgKey = 'neutral';
    }

    const img = this.imgs[imgKey];
    if (img) {
      const s = this.scale;
      const dx = this.offX;
      const dy = this.offY;
      const dw = SRC_W * s;
      const dh = SRC_H * s;
      this.ctx.drawImage(img, dx, dy, dw, dh);
    }

    c.restore();
  }
}

module.exports = FaceRenderer;
