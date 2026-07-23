/**
 * LLM 对话 - DeepSeek (OpenAI 兼容 API)
 */
const https = require('https');

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname, path, method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    };
    const req = https.request(opts, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          console.error('[Chat] DeepSeek 返回非 JSON:', res.statusCode, data.slice(0, 500));
          resolve({ statusCode: res.statusCode, data, parseError: e.message });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = async function chatHandler(req, res) {
  console.log('[Chat] 收到请求:', req.method);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Method Not Allowed' })); return; }

  const chunks = [];
  req.on('data', (chunk) => { chunks.push(chunk); });

  req.on('end', async () => {
    try {
      const { text, lang, history } = JSON.parse(Buffer.concat(chunks).toString());
      if (!text) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ reply: '', error: '缺少 text' }));
        return;
      }

      const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
      if (!apiKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ reply: '', error: '未配置 API Key' }));
        return;
      }

      const isCantonese = lang === 'zh-HK';
      const systemPrompt = isCantonese
        ? `你係一個桌面數字人助手，性格活潑可愛，鍾意用表情同用戶互動。你嘅回覆要：
1. 用粵語口語回答，自然生動
2. 回覆簡短精煉，1-3句為佳
3. 開頭加一個表情標籤：[neutral] [happy] [sad] [surprised] [angry] [wink] [love] [cool] [silly] [sleepy]
4. 例如："[happy] 哇，你講嘢好有趣喎！"
5. 如果用戶問你係邊個，介紹自己係一個可愛嘅桌面數字人`
        : `你是一个桌面数字人助手，性格活泼可爱，喜欢用表情和用户互动。你的回复要：
1. 用中文口语回答，自然生动
2. 回复简短精炼，1-3句为宜
3. 开头加一个表情标签：[neutral] [happy] [sad] [surprised] [angry] [wink] [love] [cool] [silly] [sleepy]
4. 例如："[happy] 哇，你说得真有趣！"
5. 如果用户问你是谁，介绍自己是一个可爱的桌面数字人`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-10), // 最多保留10轮历史
        { role: 'user', content: text }
      ];

      console.log('[Chat] 发送到 DeepSeek, 消息数:', messages.length);

      const result = await httpPost(
        'api.deepseek.com',
        '/v1/chat/completions',
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        JSON.stringify({
          model: 'deepseek-chat',
          messages,
          max_tokens: 200,
          temperature: 0.8,
        })
      );

      console.log('[Chat] DeepSeek 响应: status=', result.statusCode);

      if (result.statusCode === 200 && result.data.choices) {
        const rawReply = result.data.choices[0].message.content.trim();
        console.log('[Chat] 原始回复:', rawReply);

        // 解析表情标签 [expr]
        let expr = 'neutral';
        let reply = rawReply;
        const tagMatch = rawReply.match(/^\[(\w+)\]/);
        if (tagMatch) {
          const validExprs = ['neutral','happy','sad','surprised','angry','wink','love','cool','silly','sleepy'];
          if (validExprs.includes(tagMatch[1])) {
            expr = tagMatch[1];
            reply = rawReply.slice(tagMatch[0].length).trim();
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ reply, expr }));
      } else {
        console.error('[Chat] DeepSeek 错误:', JSON.stringify(result.data));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        let errorMsg = 'LLM返回异常';
        if (typeof result.data === 'string') {
          errorMsg = 'LLM返回异常: ' + result.data.slice(0, 100);
        } else if (result.data && result.data.error && result.data.error.message) {
          errorMsg = 'LLM错误: ' + result.data.error.message;
        } else if (result.parseError) {
          errorMsg = 'LLM响应解析失败: ' + result.parseError;
        }
        res.end(JSON.stringify({ reply: '', error: errorMsg }));
      }
    } catch (e) {
      console.error('[Chat] 异常:', e.message);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ reply: '', error: e.message }));
    }
  });
};
