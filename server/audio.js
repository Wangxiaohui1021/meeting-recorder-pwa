import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// 将任意录音格式转换为 16k 单声道 wav（讯飞/通义等 ASR 友好）
export async function convertToWav(buffer, inputExt = "webm") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mr-"));
  const inFile = path.join(tmp, `in.${inputExt}`);
  const outFile = path.join(tmp, "out.wav");
  fs.writeFileSync(inFile, buffer);
  try {
    await execFileP("ffmpeg", [
      "-y", "-i", inFile,
      "-ac", "1", "-ar", "16000", "-f", "wav",
      outFile,
    ], { windowsHide: true });
    const out = fs.readFileSync(outFile);
    return out;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        "未检测到 ffmpeg。请在运行环境安装 ffmpeg（如 Debian/Ubuntu: `apt-get install -y ffmpeg`；" +
        "Render 已通过 buildCommand 自动安装；Railway 已通过 nixpacks.toml 自动安装）。"
      );
    }
    // 转码失败：保留原始错误便于排查
    throw err;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
