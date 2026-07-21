/**
 * 数字人 Canvas 自定义组件
 * 独立渲染作用域，避免页面 setData 触发 Canvas 2D 的 _getData 错误
 */
const FaceRenderer = require('../../utils/face-renderer');

Component({
  properties: {},

  data: {
    _inited: false,
    _renderer: null,
    _canvas: null,
    _ctx: null,
    _dpr: 1,
    _lastTime: 0,
    _rafId: 0,
    _sleeping: false,
    _touchMode: false,
    _canvasW: 300,
    _canvasH: 350,
    _isSpeaking: false,
    _mouthTimer: null,
  },

  lifetimes: {
    ready() {
      // ready 生命周期在组件布局完成后触发，此时 DOM 完全就绪
      // 延迟确保渲染层稳定
      setTimeout(() => this._initCanvas(), 300);
    },
    detached() {
      this._stopLoop();
      if (this._mouthTimer) clearInterval(this._mouthTimer);
    },
  },

  pageLifetimes: {
    show() { this._startLoop(); },
    hide() { this._stopLoop(); },
  },

  methods: {
    // ========== Canvas 初始化 ==========
    _initCanvas() {
      if (this.data._inited) return;
      const query = this.createSelectorQuery();
      query.select('#faceCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.warn('[Avatar] Canvas 2D 不可用');
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.warn('[Avatar] getContext 失败');
            return;
          }
          const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : null) || 1;
          canvas.width = this.data._canvasW * dpr;
          canvas.height = this.data._canvasH * dpr;
          ctx.scale(dpr, dpr);

          this.data._canvas = canvas;
          this.data._ctx = ctx;
          this.data._dpr = dpr;
          this.data._renderer = new FaceRenderer(canvas, ctx, dpr);
          this.data._lastTime = Date.now();
          this.data._inited = true;

          // 再延迟启动动画循环，确保渲染层完成首次绘制
          setTimeout(() => this._startLoop(), 100);
          console.log('[Avatar] Canvas 2D 初始化成功');
        });
    },

    // ========== 动画循环 ==========
    // 注意：使用 setTimeout 而非 canvas.requestAnimationFrame，
    // 避免 Canvas 2D RAF 与微信渲染层交互触发 _getData 错误
    _startLoop() {
      if (!this.data._renderer || this.data._rafId) return;
      this.data._lastTime = Date.now();
      const renderer = this.data._renderer;
      const self = this;

      const loop = () => {
        if (!self.data._renderer) return;
        try {
          const now = Date.now();
          const dt = (now - self.data._lastTime) / 1000;
          self.data._lastTime = now;
          renderer.update(dt);
          renderer.render();
        } catch (e) {
          console.error('[Avatar] 渲染异常:', e);
        }
        self.data._rafId = setTimeout(loop, 16);
      };

      this.data._rafId = setTimeout(loop, 16);
    },

    _stopLoop() {
      if (this.data._rafId) {
        clearTimeout(this.data._rafId);
        this.data._rafId = 0;
      }
    },

    // ========== 对外方法 ==========
    setExpression(expr) {
      const r = this.data._renderer;
      if (!r) return;
      if (expr === 'sleepy') {
        this.data._sleeping = true;
      } else if (this.data._sleeping) {
        this.data._sleeping = false;
      }
      r.setExpression(expr);
    },

    setPupilTarget(x, y) {
      const r = this.data._renderer;
      if (r) r.setPupilTarget(x, y);
    },

    resetPupil() {
      const r = this.data._renderer;
      if (r) r.setPupilTarget(0, 0);
    },

    startSpeaking(text) {
      const r = this.data._renderer;
      if (!r || this.data._isSpeaking) return;
      this.data._isSpeaking = true;
      r.startSpeaking(text);
    },

    stopSpeaking() {
      this.data._isSpeaking = false;
      const r = this.data._renderer;
      if (r) r.stopSpeaking();
    },

    isSleeping() {
      return this.data._sleeping;
    },

    // ========== 触摸事件（透传给页面） ==========
    onTouchStart(e) {
      this.data._touchMode = true;
      this._updatePupil(e);
      this.triggerEvent('touchstart', e.detail);
    },

    onTouchMove(e) {
      this._updatePupil(e);
    },

    onTouchEnd() {
      this.data._touchMode = false;
      const r = this.data._renderer;
      if (r) r.setPupilTarget(0, 0);
    },

    onTap() {
      this.triggerEvent('tap');
    },

    _updatePupil(e) {
      const r = this.data._renderer;
      if (!r || this.data._sleeping) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;

      const query = this.createSelectorQuery();
      query.select('#faceCanvas').boundingClientRect((rect) => {
        if (!rect) return;
        const nx = ((touch.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((touch.clientY - rect.top) / rect.height - 0.5) * 2;
        r.setPupilTarget(
          Math.max(-1, Math.min(1, nx)),
          Math.max(-1, Math.min(1, ny))
        );
      }).exec();
    },
  },
});
