import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import api from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const app = express();
app.use(express.json({ limit: "2mb" }));

// PWA 静态资源
app.use(express.static(ROOT));
// API
app.use("/api", api);

// 未知非 API 路由回退到首页（单页）
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(config.port, () => {
  console.log(`会议记录 PWA 服务已启动： http://localhost:${config.port}`);
  console.log(`当前 provider：${config.provider}（缺凭证将自动回退 mock）`);
});
