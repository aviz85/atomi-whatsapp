#!/usr/bin/env node
// ElevenLabs TTS - speak / check / setup. Node 18+ only (built-in fetch). No dependencies.
// Credentials live in the CURRENT PROJECT: ./.env (gitignored). Never write outside the repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const REQUIRED = ["ELEVENLABS_API_KEY"];
const ENV_REL = ".env";

function isPluginCache(p) {
  const n = String(p || "").replace(/\\/g, "/");
  return n.includes("/.codex/plugins") || n.includes("/.codex/tmp");
}

function walkGit(start) {
  let dir = path.resolve(start);
  while (true) {
    if (isPluginCache(dir)) return null;
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findProjectRoot() {
  const cwd = path.resolve(process.cwd());
  if (!isPluginCache(cwd)) return walkGit(cwd) || cwd;
  for (const start of [process.env.CODEX_WORKSPACE, process.env.INIT_CWD, process.env.PWD]) {
    if (!start || isPluginCache(start)) continue;
    const git = walkGit(start);
    if (git) return git;
    return path.resolve(start);
  }
  throw new Error("אין תיקיית פרויקט לכתיבה. הריצו את הפקודה מתוך תיקיית הפרויקט.");
}

function projectRoot() {
  return findProjectRoot();
}

function envPath() {
  return path.join(projectRoot(), ENV_REL);
}

function envRel() {
  return ENV_REL;
}

function ensureGitignore(root) {
  const gi = path.join(root, ".gitignore");
  const block = "# API keys - never commit\n.env\n";
  if (!fs.existsSync(gi)) {
    fs.writeFileSync(gi, block);
    return;
  }
  const text = fs.readFileSync(gi, "utf8");
  if (/(^|[\r\n])\s*\.env\s*($|[\r\n])/.test(text)) return;
  const suffix = text.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(gi, suffix + "\n" + block);
}

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs premade "Rachel"

const ELEVEN_BLOCK = `# ================= ElevenLabs =================
# מפתח מ-https://elevenlabs.io/app/developers/api-keys
ELEVENLABS_API_KEY=your_elevenlabs_key
# רשות. ריק = קול קיים מהספרייה.
# https://elevenlabs.io/app/voices
ELEVENLABS_VOICE_ID=
`;

const ENV_TEMPLATE = `# הקובץ הזה (.env) נמצא בשורש הפרויקט הנוכחי. לא מדביקים מפתחות בצ'אט.
# הוא ברשימת .gitignore - לא עולה ל-GitHub.
# שמירה: מק Cmd+S  |  ווינדוס Ctrl+S

${ELEVEN_BLOCK}`;

function isPlaceholder(v) {
  if (!v) return true;
  const s = String(v).trim();
  return (
    s === "" ||
    /x{4,}/i.test(s) ||
    s === "your_elevenlabs_key" ||
    s === "your_token_here" ||
    s === "1234567890"
  );
}

function openInEditor(file) {
  if (process.env.WA_NO_OPEN === "1" || process.env.TTS_NO_OPEN === "1") return false;
  try {
    if (process.platform === "darwin") {
      spawn("open", ["-t", file], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", "notepad", file], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

function ensureEnvFile() {
  const root = projectRoot();
  const dest = envPath();
  ensureGitignore(root);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, ENV_TEMPLATE);
    return true;
  }
  const current = fs.readFileSync(dest, "utf8");
  if (!/^\s*ELEVENLABS_API_KEY\s*=/m.test(current)) {
    const suffix = current.endsWith("\n") ? "" : "\n";
    fs.appendFileSync(dest, suffix + "\n" + ELEVEN_BLOCK);
  } else if (!/^\s*ELEVENLABS_VOICE_ID\s*=/m.test(current)) {
    const suffix = current.endsWith("\n") ? "" : "\n";
    fs.appendFileSync(dest, suffix + "ELEVENLABS_VOICE_ID=\n");
  }
  return false;
}

function parseEnvFile(text) {
  const env = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && t.includes("=")) {
      const i = t.indexOf("=");
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  return env;
}

function readEnv() {
  const env = { ...process.env };
  const dest = envPath();
  if (fs.existsSync(dest)) {
    const file = parseEnvFile(fs.readFileSync(dest, "utf8"));
    for (const [k, v] of Object.entries(file)) {
      if (!env[k]) env[k] = v;
    }
  }
  return env;
}

function checkCredentials() {
  const env = readEnv();
  const missing = REQUIRED.filter((k) => isPlaceholder(env[k]));
  return { ok: missing.length === 0, env, missing };
}

function runSetup() {
  ensureEnvFile();
  const opened = openInEditor(envPath());
  console.log("מסמך המפתחות נפתח בפרויקט:");
  console.log("  " + envRel());
  if (opened) console.log("(פתחתי אותו בשבילכם בעורך.)");
  console.log("מדביקים ELEVENLABS_API_KEY. ELEVENLABS_VOICE_ID אפשר להשאיר ריק (קול קיים). שומרים, וכותבים \"סיימתי\".");
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function resolveOut(p) {
  if (!p) return path.join(projectRoot(), "voice.mp3");
  return path.isAbsolute(p) ? p : path.join(projectRoot(), p);
}

async function listVoices(env) {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  });
  if (!res.ok) {
    console.error("voices failed: HTTP " + res.status);
    process.exit(1);
  }
  const data = await res.json();
  for (const v of data.voices || []) {
    console.log((v.voice_id || "") + "  " + (v.name || ""));
  }
}

async function resolveVoice(env, override) {
  if (!isPlaceholder(override)) return { id: override, source: "flag" };
  if (!isPlaceholder(env.ELEVENLABS_VOICE_ID)) {
    return { id: env.ELEVENLABS_VOICE_ID, source: ".env" };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    });
    if (res.ok) {
      const data = await res.json();
      const voices = data.voices || [];
      const preferred =
        voices.find((v) => /rachel/i.test(v.name || "")) ||
        voices.find((v) => v.category === "premade") ||
        voices[0];
      if (preferred?.voice_id) {
        return { id: preferred.voice_id, name: preferred.name, source: "account-default" };
      }
    }
  } catch {
    // fall through to public default
  }
  return { id: DEFAULT_VOICE_ID, name: "Rachel", source: "built-in-default" };
}

const MODELS = ["eleven_v3", "eleven_multilingual_v2"];

function shouldTryNextModel(status, body) {
  const s = String(body).toLowerCase();
  if (status === 402) return true;
  return /model|paid|payment|subscri|plan|upgrade|not_allowed|permission|forbidden|unavailable/.test(s);
}

async function speak(env, text, outPath, voiceId) {
  const voice = await resolveVoice(env, voiceId);
  console.log(
    "voice=" +
      (voice.name ? voice.name + " " : "") +
      voice.id +
      " source=" +
      voice.source
  );
  const url =
    "https://api.elevenlabs.io/v1/text-to-speech/" +
    encodeURIComponent(voice.id) +
    "?output_format=mp3_44100_128";
  let last = "";
  for (const model of MODELS) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
      }),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);
      const rel = path.relative(projectRoot(), outPath) || path.basename(outPath);
      console.log("model=" + model);
      console.log("saved: " + (rel.startsWith("..") ? outPath : "./" + rel.replace(/\\/g, "/")));
      return;
    }
    last = await res.text();
    if (!shouldTryNextModel(res.status, last) || model === MODELS[MODELS.length - 1]) {
      console.error("speak failed: HTTP " + res.status + " " + last.slice(0, 300));
      process.exit(1);
    }
    console.log("model=" + model + " skipped, trying next");
  }
  console.error("speak failed: " + last.slice(0, 300));
  process.exit(1);
}

const cmd = process.argv[2];

if (cmd === "where") {
  console.log("PROJECT=" + projectRoot());
  console.log("ENV=" + envRel());
  process.exit(0);
}

if (cmd === "check") {
  const { ok, missing } = checkCredentials();
  if (ok) {
    console.log("OK");
    process.exit(0);
  }
  console.error("חסרים מפתחות: " + missing.join(", "));
  runSetup();
  process.exit(2);
}

if (cmd === "setup") {
  runSetup();
  process.exit(0);
}

if (cmd === "voices") {
  const { ok, env, missing } = checkCredentials();
  if (!ok) {
    console.error("חסרים מפתחות: " + missing.join(", "));
    runSetup();
    process.exit(2);
  }
  await listVoices(env);
  process.exit(0);
}

if (cmd === "speak") {
  const { ok, env, missing } = checkCredentials();
  if (!ok) {
    console.error("חסרים מפתחות: " + missing.join(", "));
    runSetup();
    process.exit(2);
  }
  const fromFile = arg("--file");
  let text = arg("--text");
  if (fromFile) {
    const fp = path.isAbsolute(fromFile) ? fromFile : path.join(projectRoot(), fromFile);
    text = fs.readFileSync(fp, "utf8").trim();
  }
  if (!text) {
    const last = process.argv[process.argv.length - 1];
    if (last && last !== "speak" && !String(last).startsWith("-")) text = last;
  }
  if (!text) {
    console.error("usage: node tts.mjs speak --text \"...\" [--out ./voice.mp3] [--voice <id>]");
    process.exit(1);
  }
  await speak(env, text, resolveOut(arg("--out")), arg("--voice"));
  process.exit(0);
}

console.error("usage:");
console.error("  node tts.mjs check");
console.error("  node tts.mjs where");
console.error("  node tts.mjs setup");
console.error("  node tts.mjs voices");
console.error("  node tts.mjs speak --text \"...\" [--out ./voice.mp3] [--voice <id>]");
process.exit(1);
