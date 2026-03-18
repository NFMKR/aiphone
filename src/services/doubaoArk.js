const config = require("../config");

async function arkChatCompletions({ messages, model }) {
  if (!config.doubaoArk.apiKey) {
    throw new Error("缺少环境变量 ARK_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.doubaoArk.timeoutMs);

  try {
    const response = await fetch(`${config.doubaoArk.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.doubaoArk.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || config.doubaoArk.model,
        messages,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${response.status}`;
      throw new Error(`豆包Ark调用失败: ${msg}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  arkChatCompletions,
};

