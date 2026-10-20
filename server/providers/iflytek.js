import crypto from "node:crypto";
import { config } from "../config.js";

const ASR_BASE = "https://raasr.xfyun.cn/v2/api";
const SPARK_HOST = "spark-api.xf-yun.com";
const SPARK_PATH = "/v3.5/chat";

function ts() { return Math.floor(Date.now() / 1000); }

// LFASR 签名：signa = base64( HMAC-SHA1( appId + ts, apiSecret ) )
function signa(appId, secret, t) {
  const base = appId + t;
  return crypto.createHmac("sha1", secret).update(base).digest("base64");
}
function qs(params) {
  return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

async function asrRequest(action, params, body) {
  const url = `${ASR_BASE}/${action}?${qs(params)}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/octet-stream" } : undefined,
    body,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`讯飞ASR[${action}]错误 ${data.code}: ${data.desc || ""}`);
  return data.content;
}

// 录音文件转写（LFASR）：上传 → 轮询 → 取结果
export async function transcribe(wavBuffer) {
  const { appId, apiSecret } = config.iflytek;
  const t = ts();
  const s = signa(appId, apiSecret, t);
  const common = { appId, ts: t, signa: s };

  const up = await asrRequest("getUpload", common);
  const uploadUrl = up.uploadUrl;
  const content = await asrRequest("upload", {
    ...common, fileName: "rec.wav", fileSize: wavBuffer.length, language: "zh",
  }, wavBuffer);

  const taskId = content.taskId;
  // 轮询进度
  let status = 0, tries = 0;
  while (tries++ < 120) {
    await new Promise((r) => setTimeout(r, 2000));
    const prog = await asrRequest("getProgress", { ...common, taskId });
    status = prog.status ?? prog.taskStatus ?? 0;
    if (status === 2 || status === 4) break;       // 完成
    if (status === 3 || status === 9) throw new Error("讯飞ASR转写失败");
  }
  const result = await asrRequest("getResult", { ...common, taskId });
  const parsed = typeof result.result === "string" ? JSON.parse(result.result) : result.result;
  const transcript = parsed.orderResult || parsed.result || "";
  const segments = Array.isArray(parsed.lattice)
    ? parsed.lattice.map((l, i) => ({ start: i, end: i, speaker: "", text: l.onebest || "" })).filter((s) => s.text)
    : [];
  return { transcript, segments };
}

// 星火大模型：通过 WebSocket 生成结构化纪要
function sparkAuth(apiKey, apiSecret) {
  const date = new Date().toUTCString();
  const sigOrigin = `host: ${SPARK_HOST}\ndate: ${date}\nGET ${SPARK_PATH} HTTP/1.1`;
  const sigSha = crypto.createHmac("sha256", apiSecret).update(sigOrigin).digest("base64");
  const authOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${sigSha}"`;
  const authorization = Buffer.from(authOrigin).toString("base64");
  return { authorization, date };
}

function buildPrompt(transcript) {
  return `你是一名专业的会议纪要助手。请根据下面的会议文字实录，整理成结构化会议纪要。
要求：
1. 必须且只输出一个 JSON 对象，不要包含任何额外说明或 markdown 代码块。
2. JSON 字段严格为：
{
  "title": "会议主题（字符串）",
  "participants": ["参会人1","参会人2"],
  "summary": ["要点/决议1","要点/决议2"],
  "action_items": [{"task":"待办事项","owner":"负责人","due":"完成期限"}],
  "suggestions": ["下步工作建议1","下步工作建议2"]
}
3. action_items 的 owner 与 due 尽量从实录推断，推断不出填"未指定"/"未设定"。
4. suggestions 给出 3-5 条可落地的下步工作建议。

会议实录如下：
"""
${transcript}
"""`;
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  throw new Error("星火未返回合法 JSON");
}

export async function summarize(transcript) {
  const { appId, apiKey, apiSecret } = config.iflytek;
  const { authorization, date } = sparkAuth(apiKey, apiSecret);
  const url = `wss://${SPARK_HOST}${SPARK_PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(SPARK_HOST)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let text = "";
    let done = false;
    const timer = setTimeout(() => { if (!done) { ws.close(); reject(new Error("星火响应超时")); } }, 60000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        header: { app_id: appId, uid: "meeting_recorder", status: 0 },
        parameter: { chat: { domain: "generalv3.5", temperature: 0.3, max_tokens: 2048, top_k: 1 } },
        payload: { message: { text: [{ role: "user", content: buildPrompt(transcript) }] } },
      }));
    };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.header.code !== 0) {
        clearTimeout(timer); ws.close();
        return reject(new Error(`星火错误 ${data.header.code}: ${data.header.message}`));
      }
      const part = data.payload?.choices?.text?.[0]?.content || "";
      text += part;
      if (data.header.status === 2) {
        done = true; clearTimeout(timer); ws.close();
        try { resolve({ minutes: extractJSON(text) }); }
        catch (e) { reject(e); }
      }
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error("星火WebSocket错误")); };
    ws.onclose = () => { clearTimeout(timer); if (!done) reject(new Error("星火连接关闭")); };
  });
}
