// 与后端代理通信：转写音频、生成纪要
const LS_KEY = "mr_api_base";

export function getApiBase() {
  const v = localStorage.getItem(LS_KEY);
  if (v && v.trim()) return v.trim().replace(/\/$/, "");
  return (location.origin || "") + "/api";
}

export function setApiBase(v) {
  if (v && v.trim()) localStorage.setItem(LS_KEY, v.trim().replace(/\/$/, ""));
  else localStorage.removeItem(LS_KEY);
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `请求失败(${res.status})`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// 上传音频，返回 { transcript, segments }
export async function transcribeAudio(blob, onStatus) {
  onStatus && onStatus("正在上传音频…");
  const form = new FormData();
  const ext = (blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : "wav");
  form.append("audio", blob, `rec.${ext}`);
  const res = await fetch(`${getApiBase()}/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    let msg = `转写失败(${res.status})`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// 根据实录生成结构化纪要，返回 minutes 对象
export async function summarize(transcript, onStatus) {
  onStatus && onStatus("正在生成会议纪要…");
  const data = await postJSON(`${getApiBase()}/summary`, { transcript });
  if (!data.minutes) throw new Error("纪要生成结果异常");
  return data.minutes;
}

export async function checkHealth() {
  try {
    const res = await fetch(`${getApiBase()}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}
