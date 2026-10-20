// 录音模块：getUserMedia + MediaRecorder，含计时与音量电平
function pickMime() {
  const candidates = [
    "audio/mp4",                 // iOS Safari
    "audio/webm;codecs=opus",    // Android Chrome
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export class Recorder {
  constructor({ onTick, onLevel, onState } = {}) {
    this.onTick = onTick || (() => {});
    this.onLevel = onLevel || (() => {});
    this.onState = onState || (() => {});
    this.stream = null;
    this.media = null;
    this.chunks = [];
    this.startTime = 0;
    this.accumulated = 0;
    this.paused = false;
    this.running = false;
    this.audioCtx = null;
    this.analyser = null;
    this._raf = null;
    this._timer = null;
  }

  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = pickMime();
    this.media = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.media.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.media.start(200);
    this.running = true;
    this.paused = false;
    this.startTime = Date.now();
    this.accumulated = 0;
    this._setupMeter();
    this._tick();
    this.onState("recording");
  }

  _setupMeter() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const loop = () => {
        if (!this.running) return;
        this.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        this.onLevel(Math.min(1, rms * 3));
        this._raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (_) { /* 电平仅可视反馈，失败不影响录音 */ }
  }

  _tick() {
    const upd = () => {
      if (!this.running) return;
      const elapsed = this.accumulated + (this.paused ? 0 : Date.now() - this.startTime);
      this.onTick(elapsed);
      this._timer = setTimeout(upd, 250);
    };
    upd();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.media.pause();
    this.paused = true;
    this.accumulated += Date.now() - this.startTime;
    this.onState("paused");
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.media.resume();
    this.paused = false;
    this.startTime = Date.now();
    this.onState("recording");
  }

  async stop() {
    if (!this.running) return null;
    this.running = false;
    clearTimeout(this._timer);
    cancelAnimationFrame(this._raf);
    if (!this.paused) this.accumulated += Date.now() - this.startTime;
    const durationSec = Math.round(this.accumulated / 1000);
    const stopped = new Promise((resolve) => { this.media.onstop = resolve; });
    try { this.media.stop(); } catch (_) {}
    await stopped;
    const blob = new Blob(this.chunks, { type: this.media.mimeType || "audio/webm" });
    this._cleanup();
    return { blob, type: blob.type, durationSec };
  }

  _cleanup() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) this.audioCtx.close().catch(() => {});
    this.stream = null; this.media = null; this.analyser = null; this.audioCtx = null;
  }

  cancel() {
    this.running = false;
    clearTimeout(this._timer);
    cancelAnimationFrame(this._raf);
    try { this.media.stop(); } catch (_) {}
    this._cleanup();
  }
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
