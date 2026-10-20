// UI 辅助：视图切换、Toast、电平绘制
export function showView(name) {
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === name);
  });
  const titles = { recorder: "会议记录", processing: "处理中", result: "会议纪要", history: "历史记录", settings: "设置" };
  const t = document.getElementById("appbarTitle");
  if (t && titles[name]) t.textContent = titles[name];
  if (name !== "recorder") stopLevel();
}

let _toastTimer = null;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// 电平可视化
let _levelCtx = null;
export function initLevel(canvas) {
  _levelCtx = canvas.getContext("2d");
  _levelCtx.clearRect(0, 0, canvas.width, canvas.height);
}
export function drawLevel(canvas, level) {
  if (!_levelCtx) _levelCtx = canvas.getContext("2d");
  const ctx = _levelCtx;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bars = 28;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
    const amp = Math.max(0.05, level * (0.4 + 0.6 * center) + Math.random() * 0.04);
    const bh = amp * h * 0.9;
    ctx.fillStyle = `rgba(123,123,255,${0.5 + 0.5 * center})`;
    ctx.fillRect(i * bw + 1, (h - bh) / 2, bw - 2, bh);
  }
}
export function stopLevel() {
  // 视图切换时清空电平
  const c = document.getElementById("levelMeter");
  if (c && _levelCtx) _levelCtx.clearRect(0, 0, c.width, c.height);
}

export function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
