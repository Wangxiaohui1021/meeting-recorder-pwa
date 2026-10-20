import { config } from "../config.js";
import * as mock from "./mock.js";
import * as iflytek from "./iflytek.js";
import * as dashscope from "./dashscope.js";

function hasCreds(p) {
  if (p === "iflytek") {
    const c = config.iflytek;
    return !!(c.appId && c.apiKey && c.apiSecret);
  }
  if (p === "dashscope") return !!config.dashscope.apiKey;
  return false;
}

// 解析最终生效的 provider：缺凭证时自动回退 mock，保证可用
export function resolveProvider() {
  const requested = (config.provider || "mock").toLowerCase();
  if (requested === "mock") return { name: "mock", mock: true, impl: mock };
  if (hasCreds(requested)) {
    const impl = requested === "iflytek" ? iflytek : dashscope;
    return { name: requested, mock: false, impl };
  }
  console.warn(`[provider] 请求 ${requested} 但缺少凭证，已回退到 mock 模式（请在 .env 配置密钥）`);
  return { name: "mock", mock: true, impl: mock };
}
