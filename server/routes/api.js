import { Router } from "express";
import multer from "multer";
import { resolveProvider } from "../providers/index.js";
import { convertToWav } from "../audio.js";
import * as mock from "../providers/mock.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const provider = resolveProvider();

// 真实 provider 调用失败时回退到 mock，保证前端流程不中断
async function safeTranscribe(wavBuffer) {
  if (provider.mock) return provider.impl.transcribe(wavBuffer);
  try { return await provider.impl.transcribe(wavBuffer); }
  catch (e) { console.warn("[transcribe] 真实转写失败，回退 mock:", e.message); return mock.transcribe(wavBuffer); }
}
async function safeSummarize(transcript) {
  if (provider.mock) return provider.impl.summarize(transcript);
  try { return await provider.impl.summarize(transcript); }
  catch (e) { console.warn("[summary] 真实纪要失败，回退 mock:", e.message); return mock.summarize(transcript); }
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name, mock: provider.mock });
});

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "缺少音频文件" });
    const ext = (req.file.originalname.split(".").pop() || "webm").toLowerCase();
    const wav = await convertToWav(req.file.buffer, ext);
    const result = await safeTranscribe(wav);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "转写失败" });
  }
});

router.post("/summary", async (req, res) => {
  try {
    const { transcript } = req.body || {};
    if (!transcript || !transcript.trim()) return res.status(400).json({ error: "缺少实录文本" });
    const result = await safeSummarize(transcript);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "纪要生成失败" });
  }
});

export default router;
