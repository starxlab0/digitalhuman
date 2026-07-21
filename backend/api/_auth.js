/**
 * 讯飞 WebSocket API 鉴权 - HMAC-SHA256 签名
 *
 * 适用于：
 *   ASR: wss://iat-api.xfyun.cn/v2/iat
 *   TTS: wss://tts-api.xfyun.cn/v2/tts
 */
const crypto = require('crypto');

/**
 * @param {string} host      - 主机名，如 "iat-api.xfyun.cn"
 * @param {string} path      - 路径，如 "/v2/iat"
 * @param {string} apiKey    - 控制台 APIKey
 * @param {string} apiSecret - 控制台 APISecret
 */
function generateWsAuth(host, path, apiKey, apiSecret) {
  const date = new Date().toUTCString(); // RFC1123
  const requestLine = `GET ${path} HTTP/1.1`;

  // 1. 签名原始字符串
  const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;

  // 2. HMAC-SHA256 → Base64
  const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest();
  const signature = Buffer.from(signatureSha).toString('base64');

  // 3. authorization 原始字符串
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;

  // 4. Base64 编码 authorization
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  return { host, date, authorization };
}

module.exports = { generateWsAuth };
