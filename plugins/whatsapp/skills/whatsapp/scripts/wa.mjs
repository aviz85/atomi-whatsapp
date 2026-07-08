#!/usr/bin/env node
// WhatsApp via Green API - send / read / setup. Node 18+ only (built-in fetch). No dependencies.
//   node wa.mjs set --instance <id> --token <tok> --phone <my number>   # save keys + own number
//   node wa.mjs send --to 972501234567 "message"
//   node wa.mjs send --self "message"       # send to yourself (uses saved MY_PHONE)
//   node wa.mjs send --group 12036300000@g.us "message"
//   node wa.mjs read --count 10
// Credentials: GREEN_API_URL / GREEN_API_INSTANCE / GREEN_API_TOKEN (+ optional MY_PHONE)
// (from environment, or from a .env file next to this script).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(HERE, ".env");
const REQUIRED = ["GREEN_API_URL", "GREEN_API_INSTANCE", "GREEN_API_TOKEN"];

// Fresh .env template (Hebrew guidance baked in so beginners see what to do when the file opens).
const ENV_TEMPLATE = `# ================= WhatsApp - Green API =================
# זהו המסמך שבו מדביקים את המפתחות (לא צריך להדביק אותם בצ'אט).
# מדביקים כאן את הערכים מהקונסולה של Green API, שומרים את הקובץ,
# וחוזרים ל-Codex וכותבים "סיימתי".
#   שמירה: מק Cmd+S  |  ווינדוס Ctrl+S
# את הערכים לוקחים ממסך ה-Instance בקונסולה: apiUrl, idInstance, apiTokenInstance.
# =========================================================

GREEN_API_URL=https://XXXX.api.greenapi.com
GREEN_API_INSTANCE=1234567890
GREEN_API_TOKEN=your_token_here

# מספר ה-WhatsApp שלך (עם קידומת המדינה, למשל 972501234567) - כדי שאפשר יהיה לשלוח לעצמך.
# אפשר להשאיר ריק בינתיים.
MY_PHONE=
`;

// A value that is empty or still a placeholder means "not configured yet".
function isPlaceholder(v) {
  if (!v) return true;
  const s = String(v).trim();
  return s === "" || /XXXX/.test(s) || s === "1234567890" || s === "your_token_here";
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

// Create scripts/.env from the template if it does not exist yet. Returns true if it was just created.
function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) return false;
  fs.writeFileSync(ENV_PATH, ENV_TEMPLATE);
  return true;
}

// Write the credentials to scripts/.env (with a friendly header). Token is masked in output.
// phone (the user's own WhatsApp number) is optional and saved as MY_PHONE for "send to myself".
function writeEnv({ url, instance, token, phone }) {
  let body = `# WhatsApp - Green API (נכתב אוטומטית, אפשר לערוך ידנית)
GREEN_API_URL=${url}
GREEN_API_INSTANCE=${instance}
GREEN_API_TOKEN=${token}
`;
  if (phone) body += `MY_PHONE=${phone}\n`;
  fs.writeFileSync(ENV_PATH, body);
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
  console.log("נשמרו המפתחות ב-scripts/.env:");
  console.log("  URL      = " + vals.url);
  console.log("  INSTANCE = " + vals.instance);
  console.log("  TOKEN    = " + mask(vals.token));
  if (vals.phone) console.log("  MY_PHONE = " + vals.phone);
  console.log("מוכן. בקשו ב-Codex לשלוח הודעת בדיקה לעצמכם.");
}

// First-run setup: make sure the .env exists, open it for editing, print guidance.
function runSetup() {
  const created = ensureEnvFile();
  const opened = openInEditor(ENV_PATH);
  console.log(created ? "נוצר מסמך המפתחות. פתחו אותו:" : "מסמך המפתחות כבר קיים. פתחו אותו:");
  console.log("  " + ENV_PATH);
  if (opened) {
    console.log("(פתחתי אותו בשבילכם בעורך.)");
  }
  console.log("בתוך המסמך מדביקים את idInstance ואת apiTokenInstance מהקונסולה של Green API (ואת מספר הטלפון), שומרים (Cmd+S / Ctrl+S),");
  console.log('וחוזרים לכאן וכותבים "סיימתי". אז אמשיך ואבדוק שהחיבור עובד.');
}

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#") && t.includes("=")) {
        const i = t.indexOf("=");
        const k = t.slice(0, i).trim();
        if (!env[k]) env[k] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
      }
    }
  }
  // Not configured yet -> bootstrap the keys file and open it for editing (first-run experience).
  const missing = REQUIRED.filter((k) => isPlaceholder(env[k]));
  if (missing.length) {
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
async function sendFile(env, chatId, filePath, caption, quotedMessageId) {
  const url = `${env.GREEN_API_URL}/waInstance${env.GREEN_API_INSTANCE}/sendFileByUpload/${env.GREEN_API_TOKEN}`;
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append("chatId", chatId);
  if (caption) fd.append("caption", caption);
  if (quotedMessageId) fd.append("quotedMessageId", quotedMessageId);
  fd.append("file", new Blob([buf]), path.basename(filePath));
  const res = await fetch(url, { method: "POST", body: fd });
  return res.json();
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
  const out = arg("--out") || path.join(HERE, "download-" + u.split("/").pop().split("?")[0]);
  try {
    const p = await downloadUrl(u, out);
    console.log("saved:", p);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
  process.exit(0);
}

// Only send/read need credentials. Anything else: show usage without side effects (no .env bootstrap).
if (cmd !== "send" && cmd !== "read") {
  console.error("usage:");
  console.error("  node wa.mjs setup                       # create scripts/.env and open it for editing");
  console.error("  node wa.mjs set --instance <id> --token <token> [--phone <my num>]   # write keys (+own number)");
  console.error("  node wa.mjs send --to <num>|--group <id> \"msg\" [--quote <msgId>]   # send / reply");
  console.error("  node wa.mjs send --self \"msg\"                     # send to yourself (saved number)");
  console.error("  node wa.mjs send --to <num> --file <path> --caption \"...\"   # send image/pdf/audio");
  console.error("  node wa.mjs read --count N [--json]     # read recent incoming (media shows downloadUrl)");
  console.error("  node wa.mjs download --url <u> [--out <path>]   # download a media file locally");
  process.exit(1);
}

const env = loadEnv();

if (cmd === "send") {
  let to = arg("--to"), group = arg("--group");
  const file = arg("--file");
  const caption = arg("--caption");
  // "send to myself": --self, or --to me / --to myself, resolves to the saved MY_PHONE.
  const wantsSelf = process.argv.includes("--self") || to === "me" || to === "myself" || to === "self";
  if (wantsSelf) {
    if (!env.MY_PHONE) {
      console.error("לא שמור מספר טלפון שלך. הגדירו אותו: node wa.mjs set --instance <id> --token <token> --phone <המספר שלך>");
      process.exit(1);
    }
    to = env.MY_PHONE;
  }
  if (!to && !group) { console.error("need --to or --group (or --self)"); process.exit(1); }
  const chatId = group || normalize(to);
  const quote = arg("--quote"); // reply to a specific message (quoted-message style)
  if (file) {
    if (!fs.existsSync(file)) { console.error("file not found:", file); process.exit(1); }
    const r = await sendFile(env, chatId, file, caption, quote);
    console.log("sent file:", r.idMessage || JSON.stringify(r));
  } else {
    const message = process.argv[process.argv.length - 1];
    const payload = { chatId, message };
    if (quote) payload.quotedMessageId = quote;
    const r = await call(env, "sendMessage", payload);
    console.log("sent:", r.idMessage || JSON.stringify(r));
  }
} else if (cmd === "read") {
  const count = parseInt(arg("--count") || "10", 10);
  const r = await call(env, "lastIncomingMessages", undefined);
  const msgs = Array.isArray(r) ? r : [];
  const slice = msgs.slice(0, count);
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
