#!/usr/bin/env node
// WhatsApp via Green API - send / read / setup. Node 18+ only (built-in fetch). No dependencies.
//   node wa.mjs check                                                   # credentials present? (no network, no side effects on success)
//   node wa.mjs set --instance <id> --token <tok> --phone <my number>   # save keys + own number
//   node wa.mjs send --to 972501234567 "message"
//   node wa.mjs send --self "message"       # send to yourself (uses saved MY_PHONE)
//   node wa.mjs send --group 12036300000@g.us "message"
//   node wa.mjs read --count 10
// Credentials live in the CURRENT PROJECT: ./.env (gitignored). Never write outside the repo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED = ["GREEN_API_URL", "GREEN_API_INSTANCE", "GREEN_API_TOKEN", "MY_PHONE"];
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

  // Prefer the directory the command actually ran in, when it is a project.
  if (!isPluginCache(cwd)) {
    return walkGit(cwd) || cwd;
  }

  // Script was launched from the plugin cache: use workspace hints, still local.
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
  const block = "# WhatsApp keys - never commit\n.env\n";
  if (!fs.existsSync(gi)) {
    fs.writeFileSync(gi, block);
    return;
  }
  const text = fs.readFileSync(gi, "utf8");
  if (/(^|[\r\n])\s*\.env\s*($|[\r\n])/.test(text)) return;
  const suffix = text.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(gi, suffix + "\n" + block);
}

// Fresh .env template (Hebrew guidance baked in so beginners see what to do when the file opens).
const ENV_TEMPLATE = `# ================= WhatsApp - Green API =================
# הקובץ הזה (.env) נמצא בשורש הפרויקט הנוכחי. לא מדביקים מפתחות בצ'אט.
# הוא ברשימת .gitignore - לא עולה ל-GitHub.
# מדביקים כאן את הערכים מהקונסולה של Green API, שומרים,
# וחוזרים ל-Codex וכותבים "סיימתי".
#   שמירה: מק Cmd+S  |  ווינדוס Ctrl+S
# את הערכים לוקחים ממסך ה-Instance בקונסולה: apiUrl, idInstance, apiTokenInstance.
# =========================================================

GREEN_API_URL=https://XXXX.api.greenapi.com
GREEN_API_INSTANCE=1234567890
GREEN_API_TOKEN=your_token_here

# מספר ה-WhatsApp שלך (עם קידומת המדינה) - כדי שאפשר יהיה לשלוח לעצמך.
# תחליפו את ה-x's במספר האמיתי, למשל 972501234567:
MY_PHONE=9725xxxxxxxx

# ================= ElevenLabs (רשות, אותו קובץ) =================
# מפתח מ-https://elevenlabs.io/app/settings/api-keys
ELEVENLABS_API_KEY=your_elevenlabs_key
# רשות. אם ריק - קול ברירת מחדל מהחשבון / Rachel.
ELEVENLABS_VOICE_ID=
`;

// A value that is empty or still a placeholder means "not configured yet".
function isPlaceholder(v) {
  if (!v) return true;
  const s = String(v).trim();
  return s === "" || /x{4,}/i.test(s) || s === "1234567890" || s === "your_token_here" || s === "your_elevenlabs_key";
}

// Open a file in the OS default TEXT editor, cross-platform, without blocking.
// Set WA_NO_OPEN=1 to skip opening (headless / automated environments).
function openInEditor(file) {
  if (process.env.WA_NO_OPEN === "1") return false;
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

// If the project has no .env yet, copy a readable leftover from an older location.
// Read-only: never write outside the project.
function copyLegacyIfPresent(dest) {
  if (fs.existsSync(dest)) return false;
  const leftovers = [
    path.join(HERE, ".env"),
    path.join(os.homedir(), ".atomi-whatsapp", ".env"),
  ];
  for (const src of leftovers) {
    try {
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, dest);
      return true;
    } catch {
      // no write/read permission outside the project is expected - skip
    }
  }
  return false;
}

// Create ./.env in the current project if it does not exist yet.
// Returns true if it was just created fresh.
function ensureEnvFile() {
  const root = projectRoot();
  const dest = envPath();
  ensureGitignore(root);
  if (copyLegacyIfPresent(dest)) return false;
  if (fs.existsSync(dest)) {
    const current = fs.readFileSync(dest, "utf8");
    if (!/^\s*MY_PHONE\s*=/m.test(current)) {
      const suffix = current.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(dest, suffix + "MY_PHONE=9725xxxxxxxx\n");
    }
    return false;
  }
  fs.writeFileSync(dest, ENV_TEMPLATE);
  return true;
}

function upsertEnvKey(key, value) {
  const dest = envPath();
  ensureGitignore(projectRoot());
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
  const line = key + "=" + value;
  if (new RegExp("^\\s*" + key + "\\s*=", "m").test(current)) {
    fs.writeFileSync(dest, current.replace(new RegExp("^\\s*" + key + "\\s*=.*$", "m"), line));
  } else {
    const suffix = !current || current.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(dest, current + suffix + line + "\n");
  }
}

// Write the credentials to ./.env (with a friendly header). Token is masked in output.
function writeEnv({ url, instance, token, phone }) {
  const root = projectRoot();
  ensureGitignore(root);
  let body = `# WhatsApp - Green API (נכתב אוטומטית, אפשר לערוך ידנית)
GREEN_API_URL=${url}
GREEN_API_INSTANCE=${instance}
GREEN_API_TOKEN=${token}
`;
  if (phone) body += `MY_PHONE=${phone}\n`;
  fs.writeFileSync(envPath(), body);
}

// Parse a Green API example-request URL into its three parts.
// Format: https://<host>/waInstance<idInstance>/<method>/<apiTokenInstance>[?...]
function parseGreenUrl(raw) {
  const m = String(raw || "").trim().match(/^(https?:\/\/[^/\s]+)\/waInstance(\d+)\/[^/\s]+\/([^/?\s#]+)/i);
  if (!m) return null;
  return { url: m[1], instance: m[2], token: m[3] };
}

const mask = (t) => (t && t.length > 6 ? t.slice(0, 3) + "***" + t.slice(-3) : "***");

// One-paste setup: derive all three keys from a single Green API example URL, or take them explicitly.
// --phone <the user's own WhatsApp number> is optional and saved for "send to myself".
function runSet() {
  const phoneOnly = arg("--phone");
  if (phoneOnly && !arg("--instance") && !arg("--token") && !arg("--from-url")) {
    const phone = normalize(phoneOnly).replace("@c.us", "");
    upsertEnvKey("MY_PHONE", phone);
    console.log("נשמר MY_PHONE ב-" + envRel());
    return;
  }
  const fromUrl = arg("--from-url");
  let vals;
  if (fromUrl) {
    vals = parseGreenUrl(fromUrl);
    if (!vals) {
      console.error("לא הצלחתי לפרק את הכתובת. הדביקו כתובת בקשה לדוגמה מהקונסולה של Green API,");
      console.error("שנראית כך: https://7103.api.greenapi.com/waInstance7103XXXX/getSettings/TOKEN");
      process.exit(1);
    }
  } else {
    const instance = arg("--instance"), token = arg("--token");
    let url = arg("--url");
    if (!instance || !token) {
      console.error("usage: node wa.mjs set --instance <idInstance> --token <apiToken> [--url <apiUrl>] [--phone <my number>]");
      console.error("(את idInstance ואת apiTokenInstance מעתיקים מהקונסולה של Green API.)");
      process.exit(1);
    }
    // apiUrl is optional: Green API's host is the instance's server number (the leading digits of idInstance).
    if (!url) url = `https://${String(instance).slice(0, 4)}.api.greenapi.com`;
    vals = { url: url.replace(/\/+$/, ""), instance, token };
  }
  // The user's own number (optional): store normalized digits so "send to myself" just works.
  const phoneArg = arg("--phone");
  if (phoneArg) vals.phone = normalize(phoneArg).replace("@c.us", "");
  writeEnv(vals);
  console.log("נשמרו המפתחות ב-" + envRel() + ":");
  console.log("  URL      = " + vals.url);
  console.log("  INSTANCE = " + vals.instance);
  console.log("  TOKEN    = " + mask(vals.token));
  if (vals.phone) console.log("  MY_PHONE = " + vals.phone);
  console.log("מוכן. בקשו ב-Codex לשלוח הודעת בדיקה לעצמכם.");
}

// First-run setup: make sure the .env exists, open it for editing, print guidance.
function runSetup() {
  const created = ensureEnvFile();
  const opened = openInEditor(envPath());
  console.log(created ? "נוצר מסמך המפתחות. פתחו אותו:" : "מסמך המפתחות כבר קיים. פתחו אותו:");
  console.log("  " + envRel());
  if (opened) {
    console.log("(פתחתי אותו בשבילכם בעורך.)");
  }
  console.log("בתוך המסמך מדביקים את idInstance ואת apiTokenInstance מהקונסולה של Green API (ואת מספר הטלפון), שומרים (Cmd+S / Ctrl+S),");
  console.log('וחוזרים לכאן וכותבים "סיימתי". אז אמשיך ואבדוק שהחיבור עובד.');
  console.log('חשוב: כדי שקריאת הודעות נכנסות תעבוד, יש להדליק בקונסולה של Green API, בקטע "וובהוק", את ההתראה על הודעות נכנסות (וגם על הודעות שנשלחו מהפלאפון). בלי זה אין מה לקרוא.');
}

// Read env vars from process.env + the project ./.env (file values only fill gaps).
// Pure read, no side effects - safe to call from `check` without opening/creating anything.
function readEnv() {
  const env = { ...process.env };
  const dest = envPath();
  if (fs.existsSync(dest)) {
    for (const line of fs.readFileSync(dest, "utf8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#") && t.includes("=")) {
        const i = t.indexOf("=");
        const k = t.slice(0, i).trim();
        if (!env[k]) env[k] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
      }
    }
  }
  return env;
}

// The 100%-deterministic gate every agent should call BEFORE attempting send/read:
// no network call, no chat-side judgment — just "are the required keys present?".
// Returns { ok, env, missing }. Never opens or creates anything by itself.
function checkCredentials() {
  const env = readEnv();
  const missing = REQUIRED.filter((k) => isPlaceholder(env[k]));
  return { ok: missing.length === 0, env, missing };
}

function loadEnv() {
  const { ok, env, missing } = checkCredentials();
  // Not configured yet -> bootstrap the keys file and open it for editing (first-run experience).
  if (!ok) {
    console.error("עדיין לא הוגדרו המפתחות של Green API (" + missing.join(", ") + ").");
    runSetup();
    process.exit(1);
  }
  return env;
}

function normalize(phone) {
  let d = (phone || "").replace(/[^0-9]/g, "");
  if (d.startsWith("972")) {} else if (d.startsWith("0")) d = "972" + d.slice(1); else d = "972" + d;
  return d + "@c.us";
}

async function call(env, method, payload) {
  const url = `${env.GREEN_API_URL}/waInstance${env.GREEN_API_INSTANCE}/${method}/${env.GREEN_API_TOKEN}`;
  const res = await fetch(url, payload === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return res.json();
}

function arg(flag) { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : undefined; }

// Send a local file (PDF / image / audio / any document) with optional caption, via Green API
// sendFileByUpload. Images arrive as images, audio as playable audio, PDF/others as documents.
// quotedMessageId (optional) makes it a reply to a specific message.
async function postUpload(env, method, chatId, filePath, caption, quotedMessageId) {
  const url = `${env.GREEN_API_URL}/waInstance${env.GREEN_API_INSTANCE}/${method}/${env.GREEN_API_TOKEN}`;
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append("chatId", chatId);
  if (caption) fd.append("caption", caption);
  if (quotedMessageId) fd.append("quotedMessageId", quotedMessageId);
  fd.append("file", new Blob([buf]), path.basename(filePath));
  const res = await fetch(url, { method: "POST", body: fd });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: "not-json", status: res.status, body: text.slice(0, 200) };
  }
}

async function sendFile(env, chatId, filePath, caption, quotedMessageId, asVoice) {
  if (asVoice) {
    const ptt = await postUpload(env, "sendPTTByUpload", chatId, filePath, caption, quotedMessageId);
    if (ptt && ptt.idMessage) return ptt;
  }
  return postUpload(env, "sendFileByUpload", chatId, filePath, caption, quotedMessageId);
}

// Download a media file (e.g. the downloadUrl surfaced by `read`) to a local path. Returns the path.
async function downloadUrl(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download failed: HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return outPath;
}

const cmd = process.argv[2];

// The deterministic pre-flight gate for agents: no network, no chat-side judgment.
// Prints "OK" and exits 0 if credentials are present. Otherwise it does NOT try to
// guess or explain — it just opens the keys document (creating/migrating it if
// needed) and exits 2, so the caller's job is simply: tell the user to fill it
// in, save, say they're done, then run `check` again before retrying the action.
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
// setup / set run BEFORE loadEnv so they work even when no keys exist yet.
if (cmd === "setup") {
  runSetup();
  process.exit(0);
}
if (cmd === "set") {
  runSet();
  process.exit(0);
}
// download needs no credentials (the URL is already a direct link from `read`).
if (cmd === "download") {
  const u = arg("--url");
  if (!u) { console.error("usage: node wa.mjs download --url <downloadUrl> [--out <path>]"); process.exit(1); }
  const out = arg("--out") || path.join(projectRoot(), "download-" + u.split("/").pop().split("?")[0]);
  try {
    const p = await downloadUrl(u, out);
    console.log("saved:", p);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
  process.exit(0);
}

// Only send/read need credentials. Anything else: show usage without side effects (no .env bootstrap).
if (cmd !== "send" && cmd !== "read") {
  console.error("usage:");
  console.error("  node wa.mjs check                       # credentials present? OK+exit 0, or opens ./.env+exit 2");
  console.error("  node wa.mjs where                       # print project root + relative .env path");
  console.error("  node wa.mjs setup                       # create ./.env in this project and open it");
  console.error("  node wa.mjs set --instance <id> --token <token> [--phone <my num>]   # write keys (+own number)");
  console.error("  node wa.mjs send --to <num>|--group <id> \"msg\" [--quote <msgId>]   # send / reply");
  console.error("  node wa.mjs send --self \"msg\"                     # send to yourself (saved number)");
  console.error("  node wa.mjs send --to <num> --file <path> --caption \"...\"   # send image/pdf/audio");
  console.error("  node wa.mjs send --self --voice ./voice.mp3                 # send as voice note");
  console.error("  node wa.mjs read --count N [--json] [--group id|--chat num] # incoming, or one chat");
  console.error("  node wa.mjs download --url <u> [--out <path>]   # download a media file locally");
  process.exit(1);
}

const env = loadEnv();

if (cmd === "send") {
  let to = arg("--to"), group = arg("--group");
  const file = arg("--file") || arg("--voice");
  const asVoice = Boolean(arg("--voice"));
  const caption = arg("--caption");
  // "send to myself": --self, or --to me / --to myself, resolves to the saved MY_PHONE.
  const wantsSelf = process.argv.includes("--self") || to === "me" || to === "myself" || to === "self";
  if (wantsSelf) {
    if (isPlaceholder(env.MY_PHONE)) {
      console.error("לא שמור MY_PHONE ב-.env. פתחו את .env ומלאו את המספר שלכם, או: node wa.mjs set --phone <המספר>");
      process.exit(1);
    }
    to = env.MY_PHONE;
  }
  if (!to && !group) { console.error("need --to or --group (or --self)"); process.exit(1); }
  const chatId = group || normalize(to);
  const quote = arg("--quote"); // reply to a specific message (quoted-message style)
  if (file) {
    if (!fs.existsSync(file)) { console.error("file not found:", file); process.exit(1); }
    const r = await sendFile(env, chatId, file, caption, quote, asVoice);
    console.log(asVoice ? "sent voice:" : "sent file:", r.idMessage || JSON.stringify(r));
  } else {
    const message = process.argv[process.argv.length - 1];
    const payload = { chatId, message };
    if (quote) payload.quotedMessageId = quote;
    const r = await call(env, "sendMessage", payload);
    console.log("sent:", r.idMessage || JSON.stringify(r));
  }
} else if (cmd === "read") {
  const count = parseInt(arg("--count") || "10", 10);
  const group = arg("--group");
  const chat = arg("--chat");
  let r;
  if (group || chat) {
    const chatId = group || normalize(chat);
    r = await call(env, "getChatHistory", { chatId, count });
  } else {
    r = await call(env, "lastIncomingMessages", undefined);
  }
  const msgs = Array.isArray(r) ? r : [];
  const slice = msgs.slice(0, count);
  // Empty queue is often a disabled incoming webhook in Green API, not "no messages". Nudge the user.
  if (slice.length === 0 && !process.argv.includes("--json")) {
    console.error('אין הודעות נכנסות בתור. אם ציפיתם להודעות: בדקו שבקונסולה של Green API, בקטע "וובהוק", ההתראה על הודעות נכנסות דלוקה (בלעדיה Green API לא צובר הודעות נכנסות).');
  }
  // --json: full structured records (quoted bodies, media urls, everything) for the model to reason over.
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(slice, null, 2));
  } else {
    for (const m of slice) {
      const who = m.senderName || m.chatId || "?";
      // Media (image / pdf / audio / video): surface the downloadUrl so Codex can fetch and view it.
      const fd = m.fileMessageData || m;
      const dl = fd.downloadUrl || m.downloadUrl;
      const cap = fd.caption || m.caption || "";
      const fname = fd.fileName || m.fileName || "";
      let txt = m.textMessage || m.extendedTextMessage?.text;
      if (!txt) {
        if (dl) {
          const kind = (m.typeMessage || "media").replace("Message", "");
          txt = `[${kind}${fname ? " " + fname : ""}${cap ? ` "${cap}"` : ""}] downloadUrl=${dl}`;
        } else {
          txt = "[media]";
        }
      }
      // If this is a quote-reply, show what it replied to + the quoted message id (stanzaId).
      if (m.typeMessage === "quotedMessage" || m.quotedMessage) {
        const stanza = m.extendedTextMessage?.stanzaId || m.quotedMessage?.stanzaId || "?";
        const quoted = m.quotedMessage?.textMessage || m.quotedMessage?.extendedTextMessage?.text || "";
        const q = quoted ? ` ⟶ בתגובה ל: "${quoted.slice(0, 200)}"` : "";
        console.log(`- ${who} [reply id=${m.idMessage} →quoted=${stanza}]: ${txt}${q}`);
      } else {
        console.log(`- ${who} [id=${m.idMessage}]: ${txt}`);
      }
    }
  }
} else {
  console.error("usage: node wa.mjs send --to <num>|--group <id> \"msg\"  |  read --count N");
  process.exit(1);
}
