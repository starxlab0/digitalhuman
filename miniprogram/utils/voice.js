/**
 * 微信小程序语音互动模块 (Vercel + 讯飞 ASR/TTS)
 * 
 * ASR: 录音 → PCM帧 → WAV → base64 → Vercel函数 → 讯飞语音听写 → 返回文本
 * TTS: 文本 → Vercel函数 → 讯飞语音合成 → 返回base64音频 → 写入本地播放
 * 
 * ---------- 配置 ----------
 * 部署 Vercel 后，将 proxyBase 改为你的域名。
 * 讯飞免费额度: 500次/日，可领5万次/90天免费包，支持粤语
 */

const CONFIG = {
  // 当前语言: 'zh-CN' 普通话 / 'zh-HK' 粤语
  _lang: 'zh-CN',

  // ---- Vercel 部署地址 ----
  // 部署后改为: https://your-project.vercel.app
  proxyBase: 'https://backend-umber-ten-62.vercel.app',

  // 音频参数 (必须与录制一致)
  sampleRate: 16000,
  numberOfChannels: 1,
};

const VoiceManager = {
  _recording: false,
  _recorder: null,
  _audioCtx: null,
  _audioFrames: null,
  _onResult: null,
  _onStart: null,
  _onEnd: null,
  _speaking: false,

  // ===================== 初始化 =====================
  init() {
    if (typeof wx.getRecorderManager !== 'function') {
      console.warn('[Voice] 当前环境不支持录音 API');
      this._recorder = null;
    } else {
      this._initRecorder();
    }
    console.log('[Voice] 语音模块就绪 (proxy: ' + CONFIG.proxyBase + ')');
  },

  // ===================== 录音 =====================
  _initRecorder() {
    this._recorder = wx.getRecorderManager();

    this._recorder.onStart(() => {
      this._recording = true;
      this._audioFrames = [];
      this._recordStartTime = Date.now();
      if (this._onStart) this._onStart();
    });

    this._recorder.onFrameRecorded((res) => {
      // 收集 PCM 帧数据（微信有时 frameBuffer 为 undefined）
      if (this._audioFrames && res.frameBuffer) {
        this._audioFrames.push(res.frameBuffer);
      }
    });

    this._recorder.onStop((res) => {
      this._recording = false;
      if (this._onEnd) this._onEnd();

      const frames = this._audioFrames;
      this._audioFrames = null;

      // 优先用 PCM 帧合成 WAV
      if (frames && frames.length > 0) {
        // 先检查 PCM 是否全静音
        const isSilent = this._isPcmSilent(frames);
        if (isSilent && res.tempFilePath) {
          // PCM 全零 → 回退录制的文件（兼容部分安卓 PCM 帧兼容问题）
          console.log('[Voice] PCM 全静音（' + frames.length + '帧），回退 tempFilePath:', res.tempFilePath);
          this._doASRFromFile(res.tempFilePath, frames);
        } else {
          this._doASRFromFrames(frames);
        }
      } else if (res.tempFilePath) {
        console.log('[Voice] 无帧数据，回退文件:', res.tempFilePath);
        this._doASRFromFile(res.tempFilePath, null);
      } else {
        console.warn('[Voice] 无音频数据');
        if (this._onResult) this._onResult('');
      }
    });

    this._recorder.onError((err) => {
      console.error('[Voice] 录音出错:', err);
      this._recording = false;
      this._audioFrames = null;
      if (this._onEnd) this._onEnd();
      if (this._onResult) this._onResult('');
    });
  },

  /**
   * 将收集的 PCM 帧数组拼接并转为 WAV base64
   */
  _framesToWavBase64(frames) {
    // 合并所有 ArrayBuffer 帧
    let totalLen = 0;
    for (let i = 0; i < frames.length; i++) {
      totalLen += frames[i].byteLength;
    }
    const pcmBuf = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 0; i < frames.length; i++) {
      pcmBuf.set(new Uint8Array(frames[i]), offset);
      offset += frames[i].byteLength;
    }

    // 生成 WAV 文件头 + PCM 数据
    const wav = this._buildWav(pcmBuf.buffer,
      CONFIG.sampleRate, CONFIG.numberOfChannels, 16);

    // 转 base64 (分批处理避免栈溢出)
    return this._arrayBufferToBase64(wav);
  },

  /**
   * 构建 WAV 文件 (16-bit PCM)
   */
  _buildWav(pcmData, sampleRate, numChannels, bitsPerSample) {
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.byteLength;
    const headerSize = 44;
    const buf = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buf);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    new Uint8Array(buf, headerSize, dataSize).set(new Uint8Array(pcmData));
    return buf;
  },

  /**
   * ArrayBuffer → base64 (分批处理)
   */
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    let result = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.subarray(i, i + CHUNK);
      let binary = '';
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
      result += binary;
    }
    // 使用平台的 base64 编码（兼容性更好）
    if (typeof wx.arrayBufferToBase64 === 'function') {
      return wx.arrayBufferToBase64(buffer);
    }
    // 兜底: 手动 btoa
    return btoa(result);
  },

  /**
   * 发送 ASR 请求
   */
  _sendASR(audioBase64) {
    console.log('[Voice] 发送ASR请求, 音频base64大小:', (audioBase64.length / 1024).toFixed(1), 'KB');

    wx.request({
      url: CONFIG.proxyBase + '/api/asr',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        audio: audioBase64,
        lang: CONFIG._lang,
      },
      success: (res) => {
        const json = res.data;
        console.log('[Voice] ASR 响应:', JSON.stringify(json));
        if (json.text) {
          console.log('[Voice] ASR 识别:', json.text);
          if (this._onResult) this._onResult(json.text, json.detail);
        } else {
          const errMsg = json.error
            || (json.azureStatus === 'NoMatch' ? 'Azure NoMatch（未检测到语音）'
              : `Azure状态: ${json.azureStatus || '?'} NBest: ${JSON.stringify(json.azureNBest)}`);
          console.warn('[Voice] ASR 空结果:', errMsg);
          if (this._onResult) this._onResult('', json.detail || { error: errMsg });
        }
      },
      fail: (err) => {
        console.error('[Voice] ASR 请求失败:', JSON.stringify(err));
        if (this._onResult) this._onResult('', { requestFail: true, errMsg: JSON.stringify(err) });
      },
    });
  },

  /**
   * 从录制文件读取音频，失败则回退到 PCM 帧
   */
  _doASRFromFile(filePath, fallbackFrames) {
    const isHttp = typeof filePath === 'string' && filePath.startsWith('http');

    if (isHttp) {
      // DevTools 返回 http://tmp/... URL，用 wx.request 下载
      console.log('[Voice] 通过 HTTP 下载录制文件...');
      wx.request({
        url: filePath,
        responseType: 'arraybuffer',
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            const base64 = wx.arrayBufferToBase64(res.data);
            console.log('[Voice] HTTP下载成功, base64大小:', (base64.length / 1024).toFixed(1), 'KB');
            this._sendASR(base64);
          } else {
            console.warn('[Voice] HTTP下载失败 status:', res.statusCode, '→ 回退 PCM 帧');
            this._tryFallbackFrames(fallbackFrames);
          }
        },
        fail: (err) => {
          console.warn('[Voice] HTTP下载失败:', err.errMsg, '→ 回退 PCM 帧');
          this._tryFallbackFrames(fallbackFrames);
        },
      });
      return;
    }

    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (readRes) => {
        console.log('[Voice] 文件读取成功, base64大小:', (readRes.data.length / 1024).toFixed(1), 'KB');
        this._sendASR(readRes.data);
      },
      fail: (err) => {
        console.warn('[Voice] readFile 失败:', err.errMsg, '→ 回退到 PCM 帧');
        this._tryFallbackFrames(fallbackFrames);
      },
    });
  },

  _tryFallbackFrames(frames) {
    if (frames && frames.length > 0) {
      this._doASRFromFrames(frames);
    } else {
      if (this._onResult) this._onResult('');
    }
  },

  /**
   * 检查 PCM 帧数据是否为全静音
   */
  _isPcmSilent(frames) {
    // 抽查前 5000 个 sample（约 0.3 秒），如果全是 0 则判定静音
    let checked = 0;
    for (const frame of frames) {
      if (!frame) continue;
      const samples = new Int16Array(frame);
      for (let i = 0; i < samples.length && checked < 5000; i++, checked++) {
        if (samples[i] !== 0) return false; // 有一个非零值就不是静音
      }
      if (checked >= 5000) break;
    }
    return true;
  },

  /**
   * 从 PCM 帧合成 WAV 并发送
   */
  _doASRFromFrames(frames) {
    // 过滤无效帧（微信偶尔返回 undefined）
    frames = frames.filter(f => f);
    if (frames.length === 0) {
      console.warn('[Voice] 所有帧无效，无音频数据');
      if (this._onResult) this._onResult('');
      return;
    }

    const totalBytes = frames.reduce((s, f) => s + f.byteLength, 0);
    const actualDuration = this._recordStartTime ? ((Date.now() - this._recordStartTime) / 1000).toFixed(1) : '?';
    const expectedBytes = CONFIG.sampleRate * 2 * actualDuration; // 16kHz * 16bit * 秒数
    console.log('[Voice] PCM帧合成WAV, PCM大小:', (totalBytes / 1024).toFixed(1), 'KB, 帧数:', frames.length,
      '录制时长:', actualDuration + 's', '期望PCM:', (expectedBytes / 1024).toFixed(1), 'KB');

    // 诊断：检查全部PCM是否有非零值（判断是否静音）
    let nonZero = 0, maxVal = 0, totalSamples = 0;
    for (const frame of frames) {
      if (!frame) continue;
      const samples = new Int16Array(frame);
      for (let i = 0; i < samples.length; i++) {
        if (samples[i] !== 0) nonZero++;
        maxVal = Math.max(maxVal, Math.abs(samples[i]));
      }
      totalSamples += samples.length;
    }
    console.log('[Voice] PCM全量诊断: 非零samples=' + nonZero + '/' + totalSamples + ' 最大振幅=' + maxVal +
      ' 帧均能量=' + (totalSamples ? (maxVal / totalSamples).toFixed(2) : '0'));

    const wavBase64 = this._framesToWavBase64(frames);
    console.log('[Voice] WAV base64:', (wavBase64.length / 1024).toFixed(1), 'KB');
    this._sendASR(wavBase64);
  },

  // ===================== TTS: Vercel → 讯飞 REST TTS → base64 → 播放 =====================
  _doTTS(text, onStart, onEnd) {
    wx.request({
      url: CONFIG.proxyBase + '/api/tts',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        text,
        lang: CONFIG._lang,
      },
      success: (res) => {
        const json = res.data;
        if (json.audio) {
          const audioBase64 = json.audio;
          // WAV 格式
          const ext = json.format === 'audio/wav' ? 'wav' : 'mp3';
          const tmpPath = `${wx.env.USER_DATA_PATH}/tts_${Date.now()}.${ext}`;

          const fs = wx.getFileSystemManager();
          fs.writeFile({
            filePath: tmpPath,
            data: audioBase64,
            encoding: 'base64',
            success: () => {
              this._playAudio(tmpPath, onStart, onEnd);
            },
            fail: (e) => {
              console.error('[Voice] 写入音频文件失败:', e);
              if (onEnd) onEnd();
            },
          });
        } else {
          console.warn('[Voice] TTS 返回异常:', json.error);
          if (onEnd) onEnd();
        }
      },
      fail: (err) => {
        console.warn('[Voice] TTS 请求失败:', err);
        if (onEnd) onEnd();
      },
    });
  },

  // ===================== 音频播放 =====================
  _playAudio(src, onStart, onEnd) {
    this.stopSpeak();
    this._audioCtx = wx.createInnerAudioContext();
    this._audioCtx.src = src;
    this._speaking = true;
    if (onStart) this._audioCtx.onPlay(() => onStart());
    this._audioCtx.onEnded(() => {
      this._speaking = false;
      this._audioCtx.destroy();
      this._audioCtx = null;
      if (onEnd) onEnd();
    });
    this._audioCtx.onError((e) => {
      console.warn('[Voice] 音频播放失败:', e);
      this._speaking = false;
      this._audioCtx.destroy();
      this._audioCtx = null;
      if (onEnd) onEnd();
    });
    this._audioCtx.play();
  },

  // ===================== 公开 API =====================

  /** 设置 Vercel 代理地址 */
  setProxyBase(url) {
    CONFIG.proxyBase = url.replace(/\/$/, '');
    console.log('[Voice] proxy 更新为:', CONFIG.proxyBase);
  },

  /**
   * 切换语言
   * @param {'zh-CN'|'zh-HK'} lang
   */
  setLanguage(lang) {
    if (!['zh-CN', 'zh-HK'].includes(lang)) return;
    CONFIG._lang = lang;
    console.log('[Voice] 语言:', lang === 'zh-HK' ? '粤语' : '普通话');
  },

  /** 获取当前语言 */
  getLanguage() {
    return CONFIG._lang;
  },

  /**
   * 开始录音
   * @param {Function} onResult(文本) 识别结果
   * @param {Function} onStart       开始回调
   * @param {Function} onEnd         结束回调
   */
  startRecord(onResult, onStart, onEnd) {
    if (this._recording) return;
    this._onResult = onResult;
    this._onStart = onStart;
    this._onEnd = onEnd;

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this._recorder.start({
          duration: 5000,       // 5秒录音
          sampleRate: CONFIG.sampleRate,
          numberOfChannels: CONFIG.numberOfChannels,
          format: 'PCM',        // PCM帧数据，自建WAV头保证16kHz兼容性
          frameSize: 10,        // 每帧10KB
          encodeBitRate: 48000, // 符合16000Hz的有效码率范围(24000~96000)
          disableVolumeControl: true, // 禁用iOS自动增益，避免识别不准
        });
      },
      fail: () => {
        wx.showToast({ title: '请在设置中允许录音权限', icon: 'none' });
      },
    });
  },

  /** 停止录音 */
  stopRecord() {
    if (this._recorder && this._recording) {
      this._recorder.stop();
    }
  },

  /** 文字合成语音并播放 (讯飞 TTS → Vercel 中继 → base64 音频) */
  speak(text, onStart, onEnd) {
    if (typeof wx.createInnerAudioContext !== 'function') {
      console.warn('[Voice] 当前环境不支持 TTS 播放');
      if (onEnd) onEnd();
      return;
    }
    this._doTTS(text, onStart, onEnd);
  },

  /** 停止当前播放 */
  stopSpeak() {
    if (this._audioCtx) {
      this._speaking = false;
      this._audioCtx.stop();
      this._audioCtx.destroy();
      this._audioCtx = null;
    }
  },

  /** 停止一切 */
  stop() {
    this.stopRecord();
    this.stopSpeak();
  },

  isRecording() { return this._recording; },
  isSpeaking()  { return this._speaking; },
};

module.exports = VoiceManager;
