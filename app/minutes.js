// 纪要渲染与导出（Markdown / PDF）
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function asList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(/\n+/).map((s) => s.replace(/^[-*]\s*/, "")).filter(Boolean);
  return [];
}

export function renderSummary(el, m) {
  const lines = asList(m.summary);
  const parts = [];
  if (m.participants && m.participants.length) {
    parts.push(`<p class="meta">参会：${esc(m.participants.join("、"))}</p>`);
  }
  if (lines.length) {
    parts.push("<ul>" + lines.map((l) => `<li>${esc(l)}</li>`).join("") + "</ul>");
  } else if (typeof m.summary === "string") {
    parts.push(`<p>${esc(m.summary)}</p>`);
  } else {
    parts.push("<p class='mut'>（无）</p>");
  }
  el.innerHTML = parts.join("");
}

export function renderActions(el, m) {
  const items = Array.isArray(m.action_items) ? m.action_items : [];
  if (!items.length) { el.innerHTML = "<p class='mut'>（无）</p>"; return; }
  const rows = items.map((it) => {
    const task = esc(it.task || it.title || it.content || "");
    const owner = esc(it.owner || it.responsible || "未指定");
    const due = esc(it.due || it.deadline || it.due_date || "未设定");
    return `<div class="ai-row"><div class="ai-task">${task}</div>
      <div class="ai-meta"><span>负责人：${owner}</span><span>期限：${due}</span></div></div>`;
  }).join("");
  el.innerHTML = rows;
}

export function renderSuggestions(el, m) {
  const lines = asList(m.suggestions);
  if (!lines.length) { el.innerHTML = "<p class='mut'>（无）</p>"; return; }
  el.innerHTML = "<ul>" + lines.map((l) => `<li>${esc(l)}</li>`).join("") + "</ul>";
}

export function toMarkdown(m, meta = {}) {
  const lines = [];
  lines.push(`# ${meta.title || m.title || "会议纪要"}`);
  if (meta.time) lines.push(`> 时间：${meta.time}`);
  if (m.participants && m.participants.length) lines.push(`> 参会：${m.participants.join("、")}`);
  lines.push("", "## 要点与决议", "");
  asList(m.summary).forEach((l) => lines.push(`- ${l}`));
  lines.push("", "## 待办事项", "");
  const items = Array.isArray(m.action_items) ? m.action_items : [];
  if (items.length) {
    lines.push("| 事项 | 负责人 | 期限 |");
    lines.push("| --- | --- | --- |");
    items.forEach((it) => {
      lines.push(`| ${it.task || it.title || ""} | ${it.owner || it.responsible || "未指定"} | ${it.due || it.deadline || "未设定"} |`);
    });
  } else lines.push("（无）");
  lines.push("", "## 下步工作建议", "");
  asList(m.suggestions).forEach((l) => lines.push(`- ${l}`));
  if (meta.transcript) {
    lines.push("", "## 文字实录", "", meta.transcript);
  }
  return lines.join("\n");
}

export function exportPdf(m, meta = {}) {
  const md = toMarkdown(m, meta);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <title>${esc(meta.title || m.title || "会议纪要")}</title>
  <style>
    body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:780px;margin:32px auto;padding:0 24px;color:#1a1a1a;line-height:1.7}
    h1{font-size:24px} h2{font-size:18px;margin-top:28px;border-left:4px solid #5B5BF5;padding-left:10px}
    blockquote{color:#666;border-left:3px solid #ccc;margin:8px 0;padding-left:10px}
    table{border-collapse:collapse;width:100%;margin-top:8px} td,th{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:14px}
    pre{white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px;font-size:13px}
  </style></head><body>
  <h1>${esc(meta.title || m.title || "会议纪要")}</h1>
  ${meta.time ? `<blockquote>时间：${esc(meta.time)}</blockquote>` : ""}
  ${m.participants && m.participants.length ? `<blockquote>参会：${esc(m.participants.join("、"))}</blockquote>` : ""}
  <h2>要点与决议</h2><ul>${asList(m.summary).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  <h2>待办事项</h2>
  <table><tr><th>事项</th><th>负责人</th><th>期限</th></tr>
  ${(Array.isArray(m.action_items) ? m.action_items : []).map((it) => `<tr><td>${esc(it.task || it.title || "")}</td><td>${esc(it.owner || it.responsible || "未指定")}</td><td>${esc(it.due || it.deadline || "未设定")}</td></tr>`).join("")}
  </table>
  <h2>下步工作建议</h2><ul>${asList(m.suggestions).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  ${meta.transcript ? `<h2>文字实录</h2><pre>${esc(meta.transcript)}</pre>` : ""}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("请允许弹出窗口以导出 PDF"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
