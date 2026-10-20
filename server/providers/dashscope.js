import { config } from "../config.js";

const ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export function available() {
  return !!config.dashscope.apiKey;
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
3. action_items 的 owner 与 due 尽量从实录中推断，推断不出时填"未指定"/"未设定"。
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
  throw new Error("大模型未返回合法 JSON");
}

export async function summarize(transcript) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.dashscope.apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_MODEL || "qwen-plus",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildPrompt(transcript) }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`通义大模型请求失败(${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const minutes = extractJSON(content);
  return { minutes };
}

// 通义 Paraformer 文件转写需要音频为「可公网访问的 URL」或 OSS，
// 纯后端接收 blob 的场景不直接支持，故此处给出明确指引。
export async function transcribe() {
  throw new Error(
    "DashScope 语音转写需音频可公网访问（URL/OSS）。请改用 iflytek 适配（推荐），或在 transcribe 前先将音频上传到 OSS 并传入 URL。"
  );
}
