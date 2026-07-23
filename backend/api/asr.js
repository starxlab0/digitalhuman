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
  console.log('[ASR] 收到请求:', req.method, 'URL:', req.url);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '只支持 POST' }));
    return;
  }

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

      const wavBuffer = Buffer.from(audio, 'base64');
      console.log('[ASR] lang:', language, 'WAV大小:', wavBuffer.length, '字节');

      // 解析 WAV 头，输出诊断信息
      try {
        const riff = wavBuffer.toString('ascii', 0, 4);
        const fmt = wavBuffer.toString('ascii', 8, 12);
        const dataOffset = wavBuffer.indexOf('data', 36);
        const channels = wavBuffer.readUInt16LE(22);
        const sampleRate = wavBuffer.readUInt32LE(24);
        const bitsPerSample = wavBuffer.readUInt16LE(34);
        const dataSize = dataOffset > 0 ? wavBuffer.readUInt32LE(dataOffset + 4) : -1;
        console.log('[ASR] WAV头: channels=' + channels + ' rate=' + sampleRate + ' bits=' + bitsPerSample + ' dataSize=' + dataSize + ' dataOffset=' + dataOffset);
      } catch (e) { console.log('[ASR] WAV头解析失败:', e.message); }

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

      const azureResp = result.data || {};
      console.log('[ASR] Azure:', JSON.stringify(azureResp));

      // 始终返回完整诊断
      const response = {
        text: (azureResp.RecognitionStatus === 'Success') ? (azureResp.DisplayText || '') : '',
        azureStatus: azureResp.RecognitionStatus || 'unknown',
        azureNBest: azureResp.NBest || null,
      };

      if (azureResp.RecognitionStatus === 'NoMatch') {
        response.detail = { status: 'NoMatch', messages: azureResp.NBest || [] };
      } else if (azureResp.RecognitionStatus === 'Success' && !azureResp.DisplayText) {
        response.detail = { status: 'Silent', hint: '音量可能太低，请大声一点或靠近麦克风' };
      } else if (azureResp.error) {
        response.error = 'Azure错误: ' + (azureResp.error.message || JSON.stringify(azureResp.error));
      } else if (!response.text && azureResp.RecognitionStatus !== 'Success') {
        response.error = 'Azure状态: ' + JSON.stringify(azureResp);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(response));
    } catch (e) {
      console.error('[ASR] 异常:', e.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ text: '', error: 'Azure错误: ' + e.message }));
    }
  });
};
