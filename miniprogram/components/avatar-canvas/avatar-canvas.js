/**
 * avatar-canvas 组件 — Live2D WebGL 数字人渲染
 *
 * 对外 API：
 *   setExpression(name) / setViseme(id) / startSpeaking(text) / stopSpeaking()
 *   setPupilTarget(x,y) / toggleSleep()
 */
console.log('[avatar-canvas] file loaded');

let Live2dRenderer = null;

// Viseme → 嘴型参数映射
const VISEME_MOUTH = {
  0: 0.00, 1: 0.45, 2: 0.95, 3: 0.70, 4: 0.30,
  5: 0.35, 6: 0.12, 7: 0.22, 8: 0.50, 9: 0.60,
  10: 0.55, 11: 0.75, 12: 0.18, 13: 0.28, 14: 0.12,
  15: 0.08, 16: 0.08, 17: 0.12, 18: 0.12, 19: 0.06,
  20: 0.08, 21: 0.03, 22: 0.00,
};

// 显示模式配置（移出 methods，微信 methods 只能放函数）
// ty 为负时，模型在视野中向上移动，可显示更高部位
const AVATAR_MODES = {
  full: { scale: 1.0,  ty:  0.0  },
  half: { scale: 1.6,  ty: -0.35 },
  head: { scale: 2.4,  ty: -0.65 },
};

Component({
  properties: {
    width:  { type: Number, value: 300 },
    height: { type: Number, value: 300 },
    // 显示模式: 'full' 全身 | 'half' 半身 | 'head' 头部
    mode:   { type: String, value: 'half', observer: '_onModeChanged' },
  },

  data: {
    _initialized: false,
    statusText: '数字人加载中...',
  },

  lifetimes: {
    created() {
      console.log('[avatar-canvas] created');
    },
    attached() {
      console.log('[avatar-canvas] attached');
    },
    ready() {
      console.log('[avatar-canvas] ready');
      this._initLive2D();
    },
    detached() {
      this._stopLoop();
      if (Live2dRenderer) Live2dRenderer.destroy();
    },
  },

  methods: {
    // ====== 私有 ======
    _setStatus(text) {
      console.log('[avatar-canvas] status →', text);
      this.setData({ statusText: text });
    },

    _initLive2D() {
      console.log('[avatar-canvas] _initLive2D called, _initialized=', this.data._initialized);
      if (this.data._initialized) return;

      if (!Live2dRenderer) {
        try {
          Live2dRenderer = require('../../utils/live2d-renderer');
          console.log('[avatar-canvas] Live2dRenderer loaded');
        } catch (e) {
          console.error('[avatar-canvas] Live2dRenderer require FAILED:', e);
          this._setStatus('Live2D 模块加载失败');
          this._drawFallback();
          return;
        }
      }

      // 应用显示模式
      this._applyMode(this.properties.mode);

      this._setStatus('初始化画布...');

      const query = this.createSelectorQuery();
      query.select('#live2dCanvas').node((res) => {
        console.log('[avatar-canvas] canvas query result:', !!res, !!(res && res.node));
        if (!res || !res.node) {
          console.error('[avatar-canvas] canvas node not found');
          this._setStatus('画布未找到，重试...');
          this._drawFallback();
          return;
        }

        const canvas = res.node;
        const dpr = wx.getWindowInfo().pixelRatio || 1;
        const cssW = Math.max(this.properties.width, 360);
        const cssH = Math.max(this.properties.height, 480);
        canvas.width  = Math.min(Math.floor(cssW * dpr), 1024);
        canvas.height = Math.min(Math.floor(cssH * dpr), 1280);
        this._cssWidth = cssW;
        this._cssHeight = cssH;

        this._setStatus('启动 Live2D 核心...');

        const hangTimer = setTimeout(() => {
          console.warn('[avatar-canvas] init hang >15s');
          this._setStatus('核心初始化超时');
        }, 15000);

        setTimeout(() => {
          try {
            console.log('[avatar-canvas] calling Live2dRenderer.init');
            Live2dRenderer.init(canvas);
            console.log('[avatar-canvas] Live2dRenderer.init returned');
            clearTimeout(hangTimer);
            this._canvas = canvas;
            this.setData({ _initialized: true });
            this._setStatus('加载模型...');
            this._startLoop();
            this._waitModelReady(0);
          } catch (err) {
            clearTimeout(hangTimer);
            console.error('[avatar-canvas] Live2D init ERROR:', err);
            this._setStatus('加载失败：' + (err && err.message ? err.message : '未知错误'));
            this._drawFallback();
          }
        }, 50);
      }).exec();
    },

    /**
     * 降级渲染：在 canvas 上画一个简单图案证明 canvas 工作正常
     */
    _drawFallback() {
      console.log('[avatar-canvas] _drawFallback');
      const query = this.createSelectorQuery();
      query.select('#live2dCanvas').node((res) => {
        if (!res || !res.node) {
          console.error('[avatar-canvas] fallback canvas not found');
          this._setStatus('画布节点不存在');
          return;
        }
        const canvas = res.node;
        const dpr = 2;
        canvas.width  = 360 * dpr;
        canvas.height = 480 * dpr;
        try {
          const gl = canvas.getContext('webgl');
          if (!gl) {
            console.error('[avatar-canvas] no webgl context');
            this._setStatus('不支持 WebGL');
            return;
          }
          gl.clearColor(0.15, 0.15, 0.2, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          console.log('[avatar-canvas] fallback render: webgl clear done');
        } catch (e) {
          console.error('[avatar-canvas] fallback render error:', e);
          this._setStatus('Canvas 渲染失败');
        }
      }).exec();
    },

    _waitModelReady(retries) {
      retries = retries || 0;
      if (retries > 80) {
        this._setStatus('模型加载超时');
        return;
      }
      if (Live2dRenderer && Live2dRenderer.isReady()) {
        this._setStatus('');
        console.log('[avatar-canvas] model ready');
        return;
      }
      setTimeout(() => this._waitModelReady(retries + 1), 100);
    },

    // ====== 渲染循环 ======
    _startLoop() {
      if (this._rafId) return;
      const canvas = this._canvas;
      const rAF = (canvas && canvas.requestAnimationFrame) || requestAnimationFrame;
      const cAF = (canvas && canvas.cancelAnimationFrame) || cancelAnimationFrame;
      this._rAF = rAF;
      this._cAF = cAF;

      const loop = () => {
        if (Live2dRenderer) Live2dRenderer.render();
        this._rafId = rAF(loop);
      };
      this._rafId = rAF(loop);
    },

    _stopLoop() {
      if (this._rafId && this._rAF) {
        (this._cAF || cancelAnimationFrame)(this._rafId);
        this._rafId = null;
      }
    },

    // ====== 显示模式 ======
    _applyMode(mode) {
      const cfg = AVATAR_MODES[mode] || AVATAR_MODES.half;
      try {
        const LAppDefine = require('../../utils/live2d/lappdefine');
        LAppDefine.scale1 = cfg.scale;
        LAppDefine.translate1 = { x: 0, y: cfg.ty };
        console.log('[avatar-canvas] mode:', mode, 'scale=', cfg.scale, 'ty=', cfg.ty);
      } catch (e) {
        console.warn('[avatar-canvas] LAppDefine not available yet, will retry');
      }
    },

    _onModeChanged(newVal) {
      if (this.data._initialized) {
        // 运行时切换：下次 onUpdate 会生效
        this._applyMode(newVal);
      }
    },

    // ====== 触摸 ======
    onTouchStart(e) {
      const t = e.touches[0];
      if (t && Live2dRenderer) Live2dRenderer.touchBegan(t.x, t.y);
    },
    onTouchMove(e) {
      const t = e.touches[0];
      if (t && Live2dRenderer) Live2dRenderer.touchMoved(t.x, t.y);
    },
    onTouchEnd(e) {
      const t = e.changedTouches[0];
      if (t && Live2dRenderer) Live2dRenderer.touchEnded(t.x, t.y);
    },

    // ====== 公开 API ======
    setExpression(name) {
      if (Live2dRenderer) Live2dRenderer.setExpression(name);
    },

    setViseme(visemeId) {
      const open = VISEME_MOUTH[visemeId] || 0;
      if (Live2dRenderer) Live2dRenderer.setMouthOpen(open);
    },

    setPupilTarget(x, y) {
      if (Live2dRenderer) Live2dRenderer.setEyeTarget(x, y);
    },

    startSpeaking() {
      this.setExpression('surprised');
    },

    stopSpeaking() {
      this.setExpression('neutral');
      if (Live2dRenderer) Live2dRenderer.setMouthOpen(0);
    },

    toggleSleep() {
      this._sleeping = !this._sleeping;
      if (this._sleeping && Live2dRenderer) {
        Live2dRenderer.setExpression('neutral');
      }
    },

    isSleeping() {
      return !!this._sleeping;
    },
  },
});
