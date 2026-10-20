import fs from "node:fs";
import path from "node:path";

// 轻量 .env 解析（避免强依赖，缺失也可运行）
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const txt = fs.readFileSync(envPath, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) {
      const key = m[1];
      const val = m[2].replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnv();

export const config = {
  port: Number(process.env.PORT) || 3000,
  provider: (process.env.PROVIDER || "iflytek").toLowerCase(),
  iflytek: {
    appId: process.env.IFLYTEK_APP_ID || "",
    apiKey: process.env.IFLYTEK_API_KEY || "",
    apiSecret: process.env.IFLYTEK_API_SECRET || "",
  },
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
  },
};
