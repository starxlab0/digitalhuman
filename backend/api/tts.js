/**
 * TTS 语音合成 - Azure Speech Services HTTP REST API
 */
const https = require('https');

// ===================== HTTP POST 封装 =====================

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers,
      timeout: 20000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('audio')) {
          resolve({ statusCode: res.statusCode, audio: raw.toString('base64'), isAudio: true });
        } else {
          resolve({ statusCode: res.statusCode, error: raw.toString() });
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('http timeout')); });
    req.write(body);
    req.end();
  });
}

// ===================== 主处理 =====================

module.exports = async function ttsHandler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '只支持 POST' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });

  req.on('end', async () => {
    try {
      const { text, lang } = JSON.parse(body);
      if (!text) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: '缺少 text 参数' }));
        return;
      }

      const isCantonese = lang === 'zh-HK';
      const speechKey = process.env.AZURE_SPEECH_KEY;
      const speechRegion = process.env.AZURE_SPEECH_REGION;
      const voiceName = isCantonese ? 'zh-HK-HiuGaaiNeural' : 'zh-CN-XiaoyiNeural';

      console.log('[TTS] Azure, voice:', voiceName, 'text:', text.substring(0, 50));

      // SSML 格式
      const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voiceName}">
    ${text}
  </voice>
</speak>`.trim();

      const host = `${speechRegion}.tts.speech.microsoft.com`;
      const path = '/cognitiveservices/v1';

      const result = await httpPost(
        host,
        path,
        {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          'User-Agent': 'digitalperson-miniprogram',
        },
        ssml
      );

      console.log('[TTS] Azure 响应: status=', result.statusCode, 'isAudio=', result.isAudio);

      if (result.isAudio && result.audio) {
        // 返回 MP3 base64，小程序 innerAudioContext 可直接播放
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ audio: result.audio, format: 'audio/mpeg' }));
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ audio: '', error: 'Azure错误: ' + (result.error || '无音频返回') }));
      }
    } catch (e) {
      console.error('[TTS] 异常:', e.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ audio: '', error: 'Azure错误: ' + e.message }));
    }
  });
};
