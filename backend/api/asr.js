/**
 * ASR 语音识别 - Azure Speech Services HTTP REST API
 */
const https = require('https');

// ===================== WAV 头剥离 =====================

function stripWavHeader(audioBuffer) {
  for (let i = 0; i < audioBuffer.length - 8; i++) {
    if (
      audioBuffer[i] === 0x64 &&
      audioBuffer[i + 1] === 0x61 &&
      audioBuffer[i + 2] === 0x74 &&
      audioBuffer[i + 3] === 0x61
    ) {
      const dataSize = audioBuffer.readUInt32LE(i + 4);
      const dataStart = i + 8;
      return audioBuffer.slice(dataStart, dataStart + dataSize);
    }
  }
  return audioBuffer.slice(44);
}

// ===================== HTTP POST 封装 =====================

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers,
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('http timeout')); });
    if (Buffer.isBuffer(body)) {
      req.write(body);
    } else {
      req.write(body);
    }
    req.end();
  });
}

// ===================== 主处理 =====================

module.exports = async function asrHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '只支持 POST' }));
    return;
  }

  // 收集 binary body
  const chunks = [];
  req.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });

  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks).toString();
      const { audio, lang } = JSON.parse(rawBody);
      if (!audio) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: '缺少 audio 参数' }));
        return;
      }

      const isCantonese = lang === 'zh-HK';
      const speechKey = process.env.AZURE_SPEECH_KEY;
      const speechRegion = process.env.AZURE_SPEECH_REGION;
      const language = isCantonese ? 'zh-HK' : 'zh-CN';

      console.log('[ASR] Azure, lang:', language, 'audio_base64_len:', audio.length);

      // 解码 base64 WAV → 剥离 WAV 头 → 发送原始 PCM WAV
      const wavBuffer = Buffer.from(audio, 'base64');
      console.log('[ASR] WAV大小:', wavBuffer.length);

      // Azure STT REST API
      const host = `${speechRegion}.stt.speech.microsoft.com`;
      const path = `/speech/recognition/conversation/cognitiveservices/v1?language=${language}`;

      const result = await httpPost(
        host,
        path,
        {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
        },
        wavBuffer
      );

      console.log('[ASR] Azure 响应:', JSON.stringify(result).substring(0, 400));

      if (result.data && result.data.RecognitionStatus === 'Success') {
        const text = result.data.DisplayText || '';
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ text }));
      } else if (result.data && result.data.RecognitionStatus === 'NoMatch') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ text: '' }));
      } else {
        const err = (result.data && result.data.error) ? result.data.error.message || JSON.stringify(result.data) : '未知错误';
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ text: '', error: 'Azure错误: ' + err }));
      }
    } catch (e) {
      console.error('[ASR] 异常:', e.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ text: '', error: 'Azure错误: ' + e.message }));
    }
  });
};
