# 会议记录 · 录音纪要 PWA

一款运行在手机浏览器、可「添加到主屏幕」的会议录音与纪要整理小程序：

- 🎙️ 启动即录音（应用内调用麦克风，`getUserMedia` + `MediaRecorder`）
- 📝 录音结束自动生成**文字实录** + **结构化会议纪要**
- ✅ 纪要包含**要点/决议、下步工作建议、待办事项（负责人 / 期限）**
- 🔘 每次录音可**手动选择是否保留音频文件**（默认取全局设置，可当次覆盖）
- 📦 可安装到主屏幕、离线打开首屏（PWA + Service Worker）

> 说明：PWA 形态下「调用手机录音机」实际是**应用内调用麦克风录音**（点开即录），无法拉起系统录音 App。若要真正拉起系统录音机，需改用 Android/iOS 原生方案。

---

## 架构

```
手机 PWA 浏览器 ──HTTPS──> Node 后端代理 ──HTTPS──> 讯飞 / 通义 云
   (录音/UI/IndexedDB)      (持有密钥/转写/纪要)
```

- **前端**：原生 HTML/CSS/JS（ES Modules，零构建），`app/` 目录。
- **后端**：`server/`（Node + Express），保管密钥、调用云厂商、音频格式归一化。
- **存储**：前端 `IndexedDB` 保存记录（含可选音频 blob、实录、纪要）；后端无状态。

## 目录

```
index.html             PWA 入口
manifest.webmanifest   安装配置（名称/图标/standalone）
sw.js                 Service Worker（缓存壳）
app/                  前端模块（recorder/store/transcribe/minutes/ui/main）
server/               后端（config/routes/providers/audio）
```

## 快速开始（本地，mock 演示）

```bash
npm install
npm start
# 打开 http://localhost:3000  （localhost 是安全上下文，可用麦克风）
```

默认 `PROVIDER=iflytek` 但**未配置密钥时会自动回退 mock 模式**，因此无 Key 也能完整演示：
录音 → 转写（仿真中文实录）→ 纪要（含建议与待办）。

## 接入真实云端（国内服务）

1. `cp .env.example .env` 并填写密钥。
2. 设置 `PROVIDER=iflytek`（推荐，转写+星火一体）或 `dashscope`。
3. 重启服务。后端 `GET /api/health` 会显示当前 `provider` 与 `mock` 状态。

- **讯飞**：开通「语音转写（LFASR）」+「星火认知大模型」，填入 `IFLYTEK_APP_ID/API_KEY/API_SECRET`。
- **通义**：填 `DASHSCOPE_API_KEY`；注意其语音转写需音频为可公网访问 URL/OSS，故转写建议用讯飞，纪要可用通义。

> 真实云调用需你自有的 API Key；适配器在调用失败时会自动回退 mock 并在后端日志告警，便于排查。

## 在手机上部署（HTTPS 必备）

> 手机浏览器 `getUserMedia`（麦克风）和「添加到主屏幕」**都要求 HTTPS 安全上下文**。
> 本应用是 **PWA 网页应用**：部署到任意 HTTPS 地址后，手机浏览器打开该地址 →「添加到主屏幕」，就得到一个可点击、standalone 打开的“小程序”图标——无需应用商店审核。
>
> 已内置云端一键部署配置：`render.yaml`、`railway.json` + `nixpacks.toml`、`Procfile`。

### 方式 A：云端一键部署（推荐，手机随时随地可用）

平台会自动构建、分配 **HTTPS 域名**、并装好 ffmpeg，全程无需你配证书。

1. **把本仓库推到你自己的 GitHub**
   项目已 `git init` 并完成首次提交（不含 `.env`/`node_modules`）。你只需：
   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
   （还没 GitHub 仓库？网页端新建一个**空**仓库即可。）

2. **点一键部署按钮**，连接该 GitHub 仓库（平台会自动读取 `render.yaml` / `railway.json`）：
   - **Render**：打开 `https://render.com/deploy?repo=https://github.com/<你>/<仓库>`，或导入仓库后选 Blueprint。
   - **Railway**：打开 `https://railway.app/new?template=https://github.com/<你>/<仓库>`。

3. 构建完成后得到形如 `https://meeting-recorder-pwa.onrender.com` 的地址 → 手机浏览器打开 →「添加到主屏幕」。

> 不填任何密钥也能跑（自动 **mock** 演示全流程）。要真实转写，在平台「环境变量」里填 `PROVIDER=iflytek` 与 `IFLYTEK_APP_ID/API_KEY/API_SECRET`（已设为 `sync:false`，不会进代码库）。

### 一键部署按钮（把 `<user>/<repo>` 换成你自己的仓库）

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Wangxiaohui1021/meeting-recorder-pwa)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new?template=https://github.com/Wangxiaohui1021/meeting-recorder-pwa)

### 方式 B：本地 / 局域网（无需任何账号）

1. 电脑运行 `npm start`，手机与电脑连同一 WiFi。
2. 局域网地址必须是 **HTTPS** 才能用麦克风：可用 `mkcert` 自签证书并在 `server/index.js` 启用 https，或用内网穿透（`cloudflared` / `ngrok`）拿到现成的 HTTPS 地址。
3. 手机打开 HTTPS 地址 →「添加到主屏幕」。

> 纯 `http://内网IP` 下麦克风不可用，必须 HTTPS。

### 常见问题

- **Q：能直接“打包成 apk/安装包”装进手机系统吗？**
  A：PWA 形态下不行（需 Android/iOS 原生方案）。但 PWA 添加到主屏幕后体验接近原生 App：全屏、有图标、可离线开首屏。
- **Q：云端免费额度够用吗？**
  A：Render / Railway 的免费实例对演示和个人使用足够；空闲后会休眠，首次访问有几秒冷启动。
- **Q：录音数据去哪了？**
  A：仅在你点「保留」后才上传到你部署的后端；密钥只在后端，绝不进前端。

## 隐私

- 密钥**只在后端**，不会出现在前端。
- 录音仅在点击「保留」后上传至你配置的后端，并由后端调用云厂商转写/生成纪要。
- 选择「不保留」时，转写与纪要生成完成后本地将删除音频，仅留文字。

## 验收对照

- [x] 手机「添加到主屏幕」出现可点击图标，standalone 打开
- [x] 启动可一键录音，停止后自动产出实录
- [x] 纪要含「下步工作建议」与「待办事项（负责人/期限）」
- [x] 每次录音可手动选择是否保留音频文件（不保留则本地无音频）
- [x] 无 Key 时 mock 模式完整演示
