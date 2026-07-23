/**
 * TTS 语音合成 API
 * 使用 Azure Speech SDK 合成音频 + 收集 Viseme 事件实现精准口型同步
 *
 * POST /api/tts
 * Body: { text, lang }
 * Response: { audio: base64, contentType, visemes: [{timeMs, visemeId}], durationMs }
 */

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  // Vercel Serverless 无 body parser，用 chat.js 验证过的流式解析方式
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { text, lang } = body || {};
  if (!text || text.length === 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing text' }));
    return;
  }

  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;

  if (!region || !key) {
    console.error('[TTS] 缺少 Azure 配置');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Azure未配置' }));
    return;
  }

  // 选择语音
  const voiceMap = {
    cantonese: 'zh-HK-HiuMaanNeural',
    'zh-hk': 'zh-HK-HiuMaanNeural',
    mandarin: 'zh-CN-XiaoxiaoNeural',
    zh: 'zh-CN-XiaoxiaoNeural',
    'zh-cn': 'zh-CN-XiaoxiaoNeural',
  };
  const voiceName = voiceMap[(lang || '').toLowerCase()] || 'zh-CN-XiaoxiaoNeural';
  const ssmlLang = voiceName.startsWith('zh-HK') ? 'zh-HK' : 'zh-CN';

  // 构建 SSML（启用 viseme 事件）
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
    xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${ssmlLang}">
  <voice name="${voiceName}">
    <mstts:viseme type="FacialExpression"/>
    ${text}
  </voice>
</speak>`;

  try {
    const sdk = require('microsoft-cognitiveservices-speech-sdk');

    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechSynthesisVoiceName = voiceName;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio48Khz128KBitRateMonoMp3;

    // 不绑定音频输出设备 → 音频写入 result.audioData
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    // 收集 viseme 事件
    const visemes = [];
    synthesizer.visemeReceived = (sender, event) => {
      visemes.push({
        timeMs: Math.round(event.audioOffset / 10000),  // 100ns → ms
        visemeId: event.visemeId,
      });
    };

    // 执行合成
    const result = await new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (r) => {
          synthesizer.close();
          resolve(r);
        },
        (err) => {
          synthesizer.close();
          reject(err);
        }
      );
    });

    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      const detail = sdk.ResultReason[result.reason] || result.reason;
      console.error(`[TTS] 合成失败: ${detail}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `TTS合成失败: ${detail}` }));
      return;
    }

    const audioBase64 = Buffer.from(result.audioData).toString('base64');
    const durationMs = Math.round(result.audioDuration / 10000);

    console.log(`[TTS] 合成成功: ${text.length}字, ${durationMs}ms, ${visemes.length}个viseme`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      audio: audioBase64,
      contentType: 'audio/mpeg',
      visemes,
      durationMs,
    }));
  } catch (err) {
    console.error('[TTS] Error:', err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
};
