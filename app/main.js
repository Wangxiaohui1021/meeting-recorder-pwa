// 应用主控制器：串联录音 → 处理 → 结果 → 历史 → 设置
import { Recorder, formatTime } from "./recorder.js";
import { putRecord, getRecord, getAllRecords, deleteRecord } from "./store.js";
import { transcribeAudio, summarize, checkHealth, getApiBase, setApiBase } from "./transcribe.js";
import { renderSummary, renderActions, renderSuggestions, toMarkdown, exportPdf } from "./minutes.js";
import { showView, toast, initLevel, drawLevel, fmtDateTime } from "./ui.js";

const $ = (id) => document.getElementById(id);
const LS = { autoRec: "mr_auto_rec", defaultKeep: "mr_default_keep" };

let recorder = null;
let currentRec = null;   // 当前结果对应的记录
let currentBlob = null;  // 内存中保留的音频（用于「保留/不保留」决策前播放）

// ---------- 设置 ----------
function loadSettings() {
  $("setAutoRec").checked = localStorage.getItem(LS.autoRec) === "1";
  $("setDefaultKeep").checked = localStorage.getItem(LS.defaultKeep) !== "0"; // 默认保留
}
function saveSettings() {
  localStorage.setItem(LS.autoRec, $("setAutoRec").checked ? "1" : "0");
  localStorage.setItem(LS.defaultKeep, $("setDefaultKeep").checked ? "1" : "0");
}
async function refreshBackendInfo() {
  const h = await checkHealth();
  const el = $("backendInfo");
  if (!h) { el.textContent = "⚠ 无法连接后端，请检查「后端服务地址」或确保服务已启动（mock 模式仅在后端开启时可用）。"; return; }
  el.textContent = `已连接后端 · 服务商：${h.provider || "未知"} · 模式：${h.mock ? "演示(mock)" : "云端"}`;
}

// ---------- 录音 ----------
function resetRecorderUI() {
  $("recState").textContent = "准备就绪";
  $("timer").textContent = "00:00";
  $("recHint").textContent = "点击麦克风开始录音";
  $("btnRec").hidden = false;
  $("btnStop").hidden = true;
  $("btnPause").hidden = true;
  $("btnPause").innerHTML = '<span class="ico-pause"></span>';
  initLevel($("levelMeter"));
}

function wireRecorder() {
  $("btnRec").addEventListener("click", startRecording);
  $("btnStop").addEventListener("click", stopRecording);
  $("btnPause").addEventListener("click", () => {
    if (!recorder) return;
    if (recorder.paused) { recorder.resume(); $("recState").textContent = "录音中"; }
    else { recorder.pause(); $("recState").textContent = "已暂停"; }
  });
}

async function startRecording() {
  try {
    recorder = new Recorder({
      onTick: (ms) => { $("timer").textContent = formatTime(ms); },
      onLevel: (lv) => drawLevel($("levelMeter"), lv),
      onState: (s) => { $("recState").textContent = s === "paused" ? "已暂停" : "录音中"; },
    });
    await recorder.start();
    $("btnRec").hidden = true;
    $("btnStop").hidden = false;
    $("btnPause").hidden = false;
    $("recHint").textContent = "录音中…点击停止生成纪要";
  } catch (e) {
    toast("无法访问麦克风：" + e.message);
    resetRecorderUI();
  }
}

async function stopRecording() {
  if (!recorder) return;
  const r = recorder;
  recorder = null;
  $("btnStop").disabled = true;
  try {
    const { blob, type, durationSec } = await r.stop();
    await processRecording(blob, type, durationSec);
  } catch (e) {
    toast("录音处理失败：" + e.message);
    resetRecorderUI();
    $("btnStop").disabled = false;
  }
}

// ---------- 处理（转写 + 纪要） ----------
function setProc(main, sub) {
  if (main) $("procStatus").textContent = main;
  if (sub !== undefined) $("procSub").textContent = sub || "";
}

async function processRecording(blob, type, durationSec) {
  const id = String(Date.now());
  const now = Date.now();
  const defaultKeep = $("setDefaultKeep").checked;
  const rec = {
    id, title: `会议记录 ${fmtDateTime(now)}`, createdAt: now, durationSec,
    keepAudio: defaultKeep, status: "processing",
    transcript: "", segments: [], minutes: null, audioBlob: null, audioType: type,
  };
  await putRecord(rec);
  currentBlob = blob;
  showView("processing");
  setProc("正在转写音频…", "上传并识别中");

  try {
    const tr = await transcribeAudio(blob, (s) => setProc(s, "语音识别中"));
    rec.transcript = tr.transcript || "";
    rec.segments = tr.segments || [];

    setProc("正在生成会议纪要…", "大模型整理中");
    const minutes = await summarize(rec.transcript, () => setProc("正在生成会议纪要…", "大模型整理中"));
    rec.minutes = minutes;
    rec.status = "done";

    if (defaultKeep) { rec.audioBlob = blob; rec.audioType = type; }
    await putRecord(rec);
    showResult(rec);
  } catch (e) {
    rec.status = "error";
    rec.error = e.message;
    await putRecord(rec);
    toast("处理失败：" + e.message);
    showView("recorder");
    resetRecorderUI();
    $("btnStop").disabled = false;
  }
}

// ---------- 结果 ----------
function showResult(rec) {
  currentRec = rec;
  showView("result");
  $("resultTitle").textContent = rec.title;
  if (rec.minutes) {
    renderSummary($("minutesSummary"), rec.minutes);
    renderActions($("minutesActions"), rec.minutes);
    renderSuggestions($("minutesSuggestions"), rec.minutes);
  } else {
    $("minutesSummary").textContent = "（纪要生成失败）";
    $("minutesActions").textContent = ""; $("minutesSuggestions").textContent = "";
  }
  $("transcript").textContent = rec.transcript || "（无实录）";
  renderAudio(rec);
  $("keepAudio").checked = rec.keepAudio;
  $("btnStop").disabled = false;
  resetRecorderUI();
}

function renderAudio(rec) {
  const wrap = $("audioWrap");
  wrap.innerHTML = "";
  const blob = rec.audioBlob || currentBlob;
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("audio");
    a.controls = true; a.src = url;
    wrap.appendChild(a);
  } else {
    wrap.innerHTML = '<p class="mut">本次未保留录音文件</p>';
  }
}

function wireResult() {
  $("keepAudio").addEventListener("change", async (e) => {
    if (!currentRec) return;
    currentRec.keepAudio = e.target.checked;
    if (e.target.checked && currentBlob) {
      currentRec.audioBlob = currentBlob; currentRec.audioType = currentBlob.type;
    } else {
      currentRec.audioBlob = null;
    }
    await putRecord(currentRec);
    renderAudio(currentRec);
    toast(e.target.checked ? "已保留录音文件" : "已设为不保留（仅留文字）");
  });

  $("btnCopyMd").addEventListener("click", () => {
    if (!currentRec || !currentRec.minutes) return;
    const md = toMarkdown(currentRec.minutes, {
      title: currentRec.title, time: fmtDateTime(currentRec.createdAt), transcript: currentRec.transcript,
    });
    navigator.clipboard?.writeText(md).then(() => toast("已复制 Markdown"), () => toast("复制失败"));
  });

  $("btnExportPdf").addEventListener("click", () => {
    if (!currentRec || !currentRec.minutes) return;
    exportPdf(currentRec.minutes, {
      title: currentRec.title, time: fmtDateTime(currentRec.createdAt), transcript: currentRec.transcript,
    });
  });

  $("btnBackHome").addEventListener("click", async () => {
    if (currentRec) { await putRecord(currentRec); }
    currentRec = null; currentBlob = null;
    showView("recorder");
    resetRecorderUI();
  });
}

// ---------- 历史 ----------
async function renderHistory() {
  const list = await getAllRecords();
  const box = $("historyList");
  box.innerHTML = "";
  $("historyEmpty").hidden = list.length > 0;
  list.forEach((rec) => {
    const item = document.createElement("div");
    item.className = "hist-item";
    const hasAudio = !!(rec.audioBlob && rec.keepAudio);
    const audioBadge = hasAudio
      ? '<span class="badge kept">有录音</span>'
      : '<span class="badge none">无录音</span>';
    const statusBadge = rec.status === "error"
      ? '<span class="badge none">失败</span>'
      : rec.status === "done" ? '<span class="badge">已完成</span>' : '<span class="badge">处理中</span>';
    const aiCount = (rec.minutes && Array.isArray(rec.minutes.action_items)) ? rec.minutes.action_items.length : 0;
    item.innerHTML = `
      <div class="h-top"><span class="h-title">${rec.title}</span><span class="h-time">${fmtDateTime(rec.createdAt)}</span></div>
      <div class="h-meta">
        <span>时长 ${formatTime(rec.durationSec * 1000)}</span>
        ${audioBadge} ${statusBadge}
        <span>待办 ${aiCount}</span>
      </div>`;
    item.addEventListener("click", () => openRecord(rec.id));
    box.appendChild(item);
  });
}

async function openRecord(id) {
  const rec = await getRecord(id);
  if (!rec) { toast("记录不存在"); return; }
  if (rec.status !== "done") { toast("该记录尚未完成处理"); return; }
  showResult(rec);
}

// ---------- 导航 ----------
function wireNav() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const v = t.dataset.view;
      if (v === "history") renderHistory();
      if (v === "settings") { loadSettings(); refreshBackendInfo(); }
      if (v === "recorder") resetRecorderUI();
      showView(v);
      if (v === "recorder" && $("setAutoRec").checked && !recorder) startRecording();
    });
  });
}

function wireSettings() {
  $("setAutoRec").addEventListener("change", saveSettings);
  $("setDefaultKeep").addEventListener("change", saveSettings);
  $("setApiBase").addEventListener("change", (e) => { setApiBase(e.target.value); refreshBackendInfo(); });
}

// ---------- 启动 ----------
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function init() {
  registerSW();
  wireRecorder();
  wireResult();
  wireNav();
  wireSettings();
  loadSettings();
  $("setApiBase").value = (localStorage.getItem("mr_api_base") || "");
  resetRecorderUI();
  showView("recorder");
}

init();
