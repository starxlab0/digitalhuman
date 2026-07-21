/**
 * 数字人主页面 - 微信小程序
 * Canvas 渲染已拆分到 avatar-canvas 独立组件，避免 _getData 错误
 */
let VoiceManager;
try {
  VoiceManager = require('../../utils/voice');
  console.log('[Page] voice 加载成功');
} catch (e) {
  console.error('[Page] voice 加载失败:', e);
  VoiceManager = null;
}

Page({
  data: {
    currentExpr: 'neutral',
    bubbleShow: false,
    bubbleText: '',
    voiceActive: false,
    voiceHint: '正在听...',
    voiceRecording: false,
    autoMode: false,
    debugText: '',
    lang: 'zh-CN',
    langLabel: '粤',
    canvasReady: false  // 控制组件延迟创建
  },

  _autoInterval: null,
  _bubbleTimer: null,
  _sleeping: false,
  _isSpeaking: false,
  _voiceTimeout: null,
  _mouthDemoTimer: null,

  // ========== 获取组件引用 ==========
  _avatar() {
    return this.selectComponent('#avatar');
  },

  onLoad() {
    if (!VoiceManager) {
      this.setData({ debugText: '❌ voice 加载失败' });
      return;
    }
    VoiceManager.init();
    this.setData({ debugText: '✅ 模块加载完成...' });
  },

  onReady() {
    // 先创建组件 DOM，再初始化
    this.setData({ canvasReady: true, debugText: 'Canvas 组件已创建' });
    setTimeout(() => {
      const avatar = this._avatar();
      if (avatar) {
        this.setData({ debugText: '' });
      } else {
        this.setData({ debugText: '⚠️ 组件引用失败' });
      }
    }, 400);
  },

  onShow() {
    // 组件自己管理动画循环
  },

  onHide() {
    // 组件自己管理动画循环
  },

  onUnload() {
    if (this._autoInterval) clearInterval(this._autoInterval);
    if (this._voiceTimeout) clearTimeout(this._voiceTimeout);
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (this._mouthDemoTimer) clearTimeout(this._mouthDemoTimer);
    this._stopMouthAnim();
    VoiceManager.stop();
  },

  // ========== 欢迎提示 ==========
  _showWelcome() {
    setTimeout(() => this._showBubble('你好！我是桌面数字人~'), 800);
    setTimeout(() => this._showBubble('点 🎤 语音可以和我对话'), 3600);
  },

  // ========== 组件触摸事件 ==========
  onAvatarTouchStart(e) {
    const avatar = this._avatar();
    if (avatar && !avatar.isSleeping()) {
      // 瞳孔由组件内部处理
    }
  },

  onAvatarTap(e) {
    if (this._sleeping) return;
    const prev = this.data.currentExpr;
    const micros = ['surprised', 'wink', 'happy'];
    const expr = micros[Math.floor(Math.random() * micros.length)];
    this._applyExpression(expr);
    setTimeout(() => {
      if (this.data.currentExpr === expr) this._applyExpression(prev);
    }, expr === 'wink' ? 500 : 700);
  },

  // ========== 表情 ==========
  setExpr(e) {
    const expr = e.currentTarget.dataset.expr;
    this._applyExpression(expr);
  },

  _applyExpression(expr, withSpeech) {
    const prev = this.data.currentExpr;
    if (expr === 'sleepy') {
      this._sleeping = true;
    } else if (prev === 'sleepy' && expr !== 'sleepy') {
      this._sleeping = false;
    }

    const avatar = this._avatar();
    if (avatar) avatar.setExpression(expr);
    this.setData({ currentExpr: expr });

    const isCantonese = this.data.lang === 'zh-HK';
    const texts = isCantonese ? {
      neutral: '今日天氣幾好喎~', happy: '好開心呀！哈哈！',
      sad: '有啲唔開心…', surprised: '哇！真係㗎？！',
      angry: '哼！好嬲呀！', wink: '嘿，你好呀~',
      love: '好鍾意你！', cool: '我好型㗎~',
      silly: '咧咧咧~', sleepy: '好眼瞓…Zzz…'
    } : {
      neutral: '今天天气不错~', happy: '太开心啦！哈哈！',
      sad: '有点难过…', surprised: '哇！真的吗？！',
      angry: '哼！好生气！', wink: '嘿，你好呀~',
      love: '好喜欢你！', cool: '我很酷吧~',
      silly: '略略略~', sleepy: '好困…Zzz…'
    };

    if (texts[expr]) {
      setTimeout(() => this._showBubble(texts[expr]), 300);
    }
    if (withSpeech !== false && texts[expr] && !this._isSpeaking) {
      this._startMouthAnim(texts[expr]);
      if (this._mouthDemoTimer) clearTimeout(this._mouthDemoTimer);
      this._mouthDemoTimer = setTimeout(() => {
        if (!this._isSpeaking) return;
        this._stopMouthAnim();
      }, texts[expr].length * 70 + 300);
    }
  },

  // ========== 气泡 ==========
  _showBubble(text) {
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    this.setData({ bubbleText: text, bubbleShow: true });
    this._bubbleTimer = setTimeout(() => {
      this.setData({ bubbleShow: false });
      this._bubbleTimer = null;
    }, 2200);
  },

  // ========== 自动轮播 ==========
  toggleAuto() {
    const autoMode = !this.data.autoMode;
    this.setData({ autoMode });
    if (autoMode) {
      const expressions = ['neutral','happy','sad','surprised','angry','wink','love','cool','silly'];
      let i = expressions.indexOf(this.data.currentExpr);
      this._autoInterval = setInterval(() => {
        i = (i + 1) % expressions.length;
        this._applyExpression(expressions[i]);
      }, 2500);
      this._showWelcome();
    } else {
      clearInterval(this._autoInterval);
      this._autoInterval = null;
    }
  },

  // ========== 语音 ==========
  toggleVoice() {
    if (VoiceManager.isRecording()) {
      VoiceManager.stopRecord();
      this.setData({ voiceRecording: false, voiceActive: false });
      return;
    }
    if (this._isSpeaking) {
      VoiceManager.stopSpeak();
      this._stopMouthAnim();
      return;
    }

    const isCantonese = this.data.lang === 'zh-HK';
    console.log('[Page] toggleVoice 触发, isCantonese:', isCantonese);
    this.setData({ voiceRecording: true, voiceActive: true, voiceHint: isCantonese ? '聽緊...' : '正在听...' });

    const handleResult = async (text, detail) => {
      console.log('[Page] 处理语音结果:', JSON.stringify(text), 'detail:', JSON.stringify(detail));
      this.setData({ voiceActive: false, voiceRecording: false });
      if (!text) text = '';

      // 定义兜底回复
      const isCantonese = this.data.lang === 'zh-HK';
      const fallbackUnknown = isCantonese ? '嗯…聽唔清楚，再試下？' : '嗯…没听清，再试试？';
      const fallbackEmpty  = isCantonese ? '你想講咩呀？我聽緊~' : '你想说什么呀？我在听~';

      // 没识别到文字
      if (!text && detail) {
        let diagMsg = fallbackUnknown;
        if (detail.requestFail) {
          diagMsg = '❌ 网络请求失败: ' + (detail.errMsg || '');
        } else if (detail.code && detail.code !== 0) {
          diagMsg = '❌ 错误 code=' + detail.code + ': ' + (detail.desc || '');
        } else if (detail.msgs && detail.msgs.length === 0) {
          diagMsg = '❌ 未收到响应';
        } else {
          diagMsg = '⚠️ 未识别到文字';
        }
        this.setData({ debugText: diagMsg });
        setTimeout(() => this.setData({ debugText: '' }), 5000);
        this._showBubble(diagMsg);
        return;
      }

      if (!text) {
        this._showBubble(fallbackEmpty);
        return;
      }

      // 显示等待状态
      this.setData({ debugText: '🤖 思考中...' });
      wx.showToast({ title: '思考中...', icon: 'loading', duration: 3000 });

      // 调用 LLM 对话
      const llmResult = await VoiceManager.chat(text, this.data.lang);
      this.setData({ debugText: '' });

      let reply = llmResult.reply;
      let expr = llmResult.expr || 'neutral';

      // LLM 失败则回退关键词匹配
      if (!reply) {
        console.warn('[Page] LLM 无回复，回退关键词匹配');
        expr = this._parseVoiceIntent(text);
        const responses = isCantonese ? {
          happy:'哈哈，好開心呀！', sad:'唔緊要，一切都會好㗎~',
          surprised:'嘩！太震驚啦！', angry:'哼，唔好惹我嬲',
          wink:'嗨，你好靚啊~', love:'我都好鍾意你！',
          cool:'冇錯，我好型㗎~', silly:'咧咧咧~',
          sleepy:'好眼瞓...早唞Zzz', neutral:'嗯嗯，我聽緊~',
          greet:'你好呀！有咩想同我傾㗎？', unknown:fallbackUnknown
        } : {
          happy:'哈哈，太开心了！', sad:'别难过，都会好的~',
          surprised:'哇！太惊讶了！', angry:'哼，不要惹我生气',
          wink:'嘿，你好呀~', love:'我也好喜欢你！',
          cool:'没错，我很酷~', silly:'略略略~',
          sleepy:'好困...晚安Zzz', neutral:'嗯嗯，我在听~',
          greet:'你好呀！有什么想和我聊的吗？', unknown:fallbackUnknown
        };
        reply = responses[expr] || responses.unknown;
      }

      console.log('[Page] 最终回复:', reply, '表情:', expr);

      if (expr && expr !== 'unknown') this._applyExpression(expr);
      this._showBubble(reply);

      // TTS 播报
      VoiceManager.speak(reply,
        () => { this._startMouthAnim(reply); },
        () => { this._stopMouthAnim(); }
      );
    };

    VoiceManager.startRecord(
      handleResult,
      () => {
        console.log('[Page] 录音已开始');
        wx.showToast({ title: '请说话...', icon: 'none', duration: 1000 });
      },
      () => {
        console.log('[Page] 录音已结束');
        wx.showToast({ title: '识别中...', icon: 'loading', duration: 2000 });
      }
    );

    this._voiceTimeout = setTimeout(() => {
      if (this.data.voiceRecording && VoiceManager.isRecording()) {
        console.log('[Page] 录音超时，自动停止');
        VoiceManager.stopRecord();
      }
    }, 5000);
  },

  _startMouthAnim(text) {
    if (this._isSpeaking) return;
    this._isSpeaking = true;
    const avatar = this._avatar();
    const speakText = text || this.data.bubbleText || '你好';
    if (avatar) avatar.startSpeaking(speakText);
  },

  _stopMouthAnim() {
    this._isSpeaking = false;
    const avatar = this._avatar();
    if (avatar) avatar.stopSpeaking();
  },

  _parseVoiceIntent(text) {
    if (!text) return 'unknown';
    if (/你好|嗨|hello|hi|早安|晚上好|早晨|早唞|午安/.test(text)) return 'greet';
    const isCantonese = this.data.lang === 'zh-HK';
    const triggers = isCantonese ? {
      happy:     ['開心','高興','快樂','哈哈','笑','好笑','盞鬼'],
      sad:       ['難過','傷心','喊','唔開心','唔舒服','慘'],
      surprised: ['驚訝','唔係啩','真嘅','咩話','哇','嘩','㗎'],
      angry:     ['嬲','煩','憎','死開','哼','好嬲'],
      wink:      ['眨眼','放電','型仔','你好','靚'],
      love:      ['鍾意','愛你','錫','可愛','靚女','靚仔'],
      cool:      ['型','酷','chok'],
      silly:     ['搞怪','百厭','傻','無聊'],
      sleepy:    ['眼瞓','瞓覺','攰','早唞','休息'],
      neutral:   ['普通','正常','返嚟','回復']
    } : {
      happy:     ['开心','高兴','快乐','哈哈','笑'],
      sad:       ['难过','伤心','哭','不开心','郁闷'],
      surprised: ['惊讶','真的','什么','不会吧','哇'],
      angry:     ['生气','烦','讨厌','走开','哼'],
      wink:      ['眨眼','放电','帅气','你好'],
      love:      ['喜欢','爱你','亲','么么','可爱'],
      cool:      ['酷','帅','装酷'],
      silly:     ['搞怪','调皮','略','傻'],
      sleepy:    ['困','睡觉','累了','晚安','休息'],
      neutral:   ['普通','正常','回来','恢复']
    };
    let best = null, bestScore = 0;
    for (const [expr, keywords] of Object.entries(triggers)) {
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > bestScore) { bestScore = score; best = expr; }
    }
    return bestScore > 0 ? best : 'unknown';
  },

  // ========== 语言切换 ==========
  toggleLang() {
    const newLang = this.data.lang === 'zh-CN' ? 'zh-HK' : 'zh-CN';
    VoiceManager.setLanguage(newLang);
    this.setData({
      lang: newLang,
      langLabel: newLang === 'zh-HK' ? '普' : '粤'
    });
    this._applyExpression('neutral', true);
  },
});
