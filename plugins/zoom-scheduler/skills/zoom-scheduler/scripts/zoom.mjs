#!/usr/bin/env node
// Zoom REST API via Server-to-Server OAuth. Node 18+, no dependencies.
// Credentials: current project ./.env. Access tokens are memory-only.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";
const ENV_REL = ".env";
const REQUIRED = ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"];

function isPluginCache(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.includes("/.codex/plugins") || normalized.includes("/.codex/tmp");
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

function projectRoot() {
  const cwd = path.resolve(process.cwd());
  if (!isPluginCache(cwd)) return walkGit(cwd) || cwd;
  for (const hint of [process.env.CODEX_WORKSPACE, process.env.INIT_CWD, process.env.PWD]) {
    if (!hint || isPluginCache(hint)) continue;
    return walkGit(hint) || path.resolve(hint);
  }
  throw new Error("אין תיקיית פרויקט לכתיבה. הריצו מתוך תיקיית הפרויקט.");
}

function envPath() {
  return path.join(projectRoot(), ENV_REL);
}

function ensureIgnored(root, entry, comment) {
  const file = path.join(root, ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp("(^|[\\r\\n])\\s*" + escaped + "\\s*($|[\\r\\n])").test(current)) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  const spacer = current ? "\n" : "";
  fs.appendFileSync(file, prefix + spacer + "# " + comment + "\n" + entry + "\n");
}

function ensureGitignore() {
  const root = projectRoot();
  ensureIgnored(root, ".env", "API keys - never commit");
  ensureIgnored(root, ".atomi/", "Local plugin state and generated files - never commit");
}

const ZOOM_BLOCK = `# ================= Zoom Scheduler =================
# Zoom Marketplace -> Developer -> Created apps -> Server-to-Server OAuth
# לא מדביקים מפתחות בצ'אט. access token זמני נשמר בזיכרון בלבד.
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
ZOOM_USER_ID=me
ZOOM_TIMEZONE=Asia/Jerusalem
`;

function ensureEnvFile() {
  ensureGitignore();
  const dest = envPath();
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, `# מפתחות מקומיים לפרויקט. הקובץ ברשימת .gitignore.\n\n${ZOOM_BLOCK}`);
    return true;
  }
  const current = fs.readFileSync(dest, "utf8");
  const defaults = [
    ["ZOOM_ACCOUNT_ID", "your_zoom_account_id"],
    ["ZOOM_CLIENT_ID", "your_zoom_client_id"],
    ["ZOOM_CLIENT_SECRET", "your_zoom_client_secret"],
    ["ZOOM_USER_ID", "me"],
    ["ZOOM_TIMEZONE", "Asia/Jerusalem"],
  ];
  const missing = defaults.filter(([key]) => !new RegExp("^\\s*" + key + "\\s*=", "m").test(current));
  if (missing.length) {
    const prefix = current.endsWith("\n") ? "\n" : "\n\n";
    fs.appendFileSync(dest, prefix + "# ================= Zoom Scheduler =================\n" + missing.map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  }
}

function openFile(file) {
  if (process.env.ZOOM_NO_OPEN === "1" || process.env.WA_NO_OPEN === "1") return false;
  try {
    if (process.platform === "darwin") spawn("open", ["-t", file], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", "notepad", file], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function readEnv() {
  const merged = { ...process.env };
  if (fs.existsSync(envPath())) {
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(envPath(), "utf8")))) {
      if (!merged[key]) merged[key] = value;
    }
  }
  return merged;
}

function isPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || /^your_/i.test(text) || /x{4,}/i.test(text) || text === "...";
}

function emit(value) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(message, code = 1, extra = {}) {
  console.error(JSON.stringify({ error: message, ...extra }, null, 2));
  process.exit(code);
}

function runSetup() {
  ensureEnvFile();
  emit({
    ready: false,
    reason: "missing_credentials",
    credentials_file: ENV_REL,
    opened: openFile(envPath()),
    setup: [
      "Zoom Marketplace -> Developer -> Created apps -> Server-to-Server OAuth",
      "Fill Account ID, Client ID and Client Secret in .env",
      "Save the file, return to Codex, and say: סיימתי",
      "Never paste credentials into chat",
    ],
  });
}

function config() {
  const env = readEnv();
  const missing = REQUIRED.filter((key) => isPlaceholder(env[key]));
  if (missing.length) {
    runSetup();
    process.exit(2);
  }
  ensureGitignore();
  return {
    accountId: env.ZOOM_ACCOUNT_ID,
    clientId: env.ZOOM_CLIENT_ID,
    clientSecret: env.ZOOM_CLIENT_SECRET,
    userId: env.ZOOM_USER_ID || "me",
    timezone: env.ZOOM_TIMEZONE || "Asia/Jerusalem",
  };
}

class ZoomHttpError extends Error {
  constructor(status, body) {
    const safe = String(body).replace(/access_token\"?\s*:\s*\"[^\"]+/gi, "access_token:[redacted]").slice(0, 800);
    super(`Zoom API HTTP ${status}: ${safe}`);
    this.status = status;
  }
}

class ZoomClient {
  constructor(values) {
    this.values = values;
    this.token = null;
    this.expiresAt = 0;
  }

  async getToken(force = false) {
    if (!force && this.token && Date.now() < this.expiresAt - 120_000) return this.token;
    const url = new URL(TOKEN_URL);
    url.searchParams.set("grant_type", "account_credentials");
    url.searchParams.set("account_id", this.values.accountId);
    const basic = Buffer.from(`${this.values.clientId}:${this.values.clientSecret}`).toString("base64");
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${basic}` } });
    const text = await response.text();
    if (!response.ok) throw new ZoomHttpError(response.status, text);
    const data = text ? JSON.parse(text) : {};
    if (!data.access_token) throw new Error("Zoom OAuth response is missing access_token");
    this.token = data.access_token;
    this.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    return this.token;
  }

  async request(method, endpoint, body, retry = true) {
    const send = async (token) => fetch(endpoint.startsWith("http") ? endpoint : API_BASE + endpoint, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let response = await send(await this.getToken());
    if (response.status === 401 && retry) response = await send(await this.getToken(true));
    const text = await response.text();
    if (!response.ok) throw new ZoomHttpError(response.status, text);
    return text ? JSON.parse(text) : null;
  }
}

function argv() {
  return process.argv.slice(2);
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function flags(args, name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  return values;
}

function has(args, name) {
  return args.includes(name);
}

function requiredFlag(args, name) {
  const value = flag(args, name);
  if (!value) fail(`Missing ${name}`);
  return value;
}

function numberValue(value, label, { min = 0, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(`Invalid ${label}: ${value}`);
  return parsed;
}

function booleanFlag(args, name, fallback) {
  const value = flag(args, name);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`${name} must be true or false`);
}

function meetingPart(value) {
  if (!value) fail("Missing meeting id or UUID");
  const encoded = encodeURIComponent(String(value));
  return String(value).startsWith("/") || String(value).includes("//") ? encodeURIComponent(encoded) : encoded;
}

function userPart(value) {
  if (!value || /[/?#]/.test(value)) fail("Invalid Zoom user id/email");
  return encodeURIComponent(value);
}

function sanitizeMeeting(data) {
  if (!data || typeof data !== "object") return data;
  const result = { ...data };
  delete result.start_url;
  return result;
}

function validateStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    fail("--start must be an explicit ISO date-time, for example 2026-08-25T10:00:00");
  }
  return value;
}

function projectFile(value) {
  const root = projectRoot();
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail("File must stay inside the current project");
  return resolved;
}

function payloadFromFile(value) {
  const file = projectFile(value);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") fail("Payload must be a JSON object");
    return parsed;
  } catch (error) {
    fail(`Cannot read JSON payload: ${error.message}`);
  }
}

function commonPayload(args, defaults = {}) {
  const payload = { ...defaults };
  if (flag(args, "--payload")) Object.assign(payload, payloadFromFile(flag(args, "--payload")));
  if (flag(args, "--topic")) payload.topic = flag(args, "--topic");
  if (flag(args, "--agenda")) payload.agenda = flag(args, "--agenda");
  if (flag(args, "--start")) payload.start_time = validateStart(flag(args, "--start"));
  if (flag(args, "--duration")) payload.duration = numberValue(flag(args, "--duration"), "duration", { min: 1, max: 1440 });
  if (flag(args, "--timezone")) payload.timezone = flag(args, "--timezone");
  if (flag(args, "--passcode")) payload.password = flag(args, "--passcode");

  const settings = { ...(payload.settings || {}) };
  const invitees = flags(args, "--invitee");
  if (invitees.length) {
    for (const email of invitees) if (!/^\S+@\S+\.\S+$/.test(email)) fail(`Invalid invitee email: ${email}`);
    settings.meeting_invitees = invitees.map((email) => ({ email }));
  }
  if (flag(args, "--waiting-room") !== undefined) settings.waiting_room = booleanFlag(args, "--waiting-room", true);
  if (flag(args, "--host-video") !== undefined) settings.host_video = booleanFlag(args, "--host-video", false);
  if (flag(args, "--participant-video") !== undefined) settings.participant_video = booleanFlag(args, "--participant-video", false);
  if (flag(args, "--auto-recording")) {
    const value = flag(args, "--auto-recording");
    if (!["none", "local", "cloud"].includes(value)) fail("--auto-recording must be none, local or cloud");
    settings.auto_recording = value;
  }
  if (Object.keys(settings).length) payload.settings = settings;
  return payload;
}

function requireApproval(args, action) {
  if (!has(args, "--approved")) fail(`${action} requires explicit approval in the conversation and the --approved flag`, 3);
}

async function runCheck() {
  const values = config();
  if (process.env.ZOOM_SKIP_NETWORK === "1") {
    emit({ ready: true, credentials_file: ENV_REL, auth: "local-check-only", user_id: values.userId, timezone: values.timezone });
    return;
  }
  const api = new ZoomClient(values);
  const data = await api.request("GET", `/users/${userPart(values.userId)}/meetings?type=scheduled&page_size=1`);
  emit({ ready: true, credentials_file: ENV_REL, auth: "server_to_server_oauth", user_id: values.userId, timezone: values.timezone, meeting_count: data?.total_records ?? null });
}

async function runMe() {
  const values = config();
  const data = await new ZoomClient(values).request("GET", `/users/${userPart(values.userId)}`);
  emit({ id: data.id, email: data.email, first_name: data.first_name, last_name: data.last_name, type: data.type, timezone: data.timezone, status: data.status });
}

async function runMeetings(args) {
  const action = args[0];
  const values = config();
  const api = new ZoomClient(values);
  const host = flag(args, "--user") || values.userId;

  if (action === "list") {
    const type = flag(args, "--type") || "upcoming";
    if (!["scheduled", "live", "upcoming"].includes(type)) fail("--type must be scheduled, live or upcoming");
    const pageSize = flag(args, "--page-size") ? numberValue(flag(args, "--page-size"), "page size", { min: 1, max: 300 }) : 30;
    const data = await api.request("GET", `/users/${userPart(host)}/meetings?type=${encodeURIComponent(type)}&page_size=${pageSize}`);
    emit({ total_records: data.total_records, meetings: (data.meetings || []).map(sanitizeMeeting), next_page_token: data.next_page_token || null });
    return;
  }

  if (action === "get") {
    emit(sanitizeMeeting(await api.request("GET", `/meetings/${meetingPart(args[1])}`)));
    return;
  }

  if (action === "create") {
    const payload = commonPayload(args, { type: 2, timezone: values.timezone, duration: 60, settings: { waiting_room: true, join_before_host: false } });
    if (!payload.topic) fail("Missing --topic");
    if (!payload.start_time) fail("Missing --start");
    if (has(args, "--dry-run")) {
      emit({ dry_run: true, action: "create_meeting", user_id: host, payload });
      return;
    }
    requireApproval(args, "Creating a Zoom meeting");
    emit(sanitizeMeeting(await api.request("POST", `/users/${userPart(host)}/meetings`, payload)));
    return;
  }

  if (action === "update") {
    const meetingId = args[1];
    const payload = commonPayload(args);
    if (!Object.keys(payload).length) fail("No update fields provided");
    if (has(args, "--dry-run")) {
      emit({ dry_run: true, action: "update_meeting", meeting_id: meetingId, payload });
      return;
    }
    requireApproval(args, "Updating a Zoom meeting");
    await api.request("PATCH", `/meetings/${meetingPart(meetingId)}`, payload);
    emit({ updated: true, meeting_id: meetingId });
    return;
  }

  if (action === "delete") {
    const meetingId = args[1];
    requireApproval(args, "Deleting a Zoom meeting");
    await api.request("DELETE", `/meetings/${meetingPart(meetingId)}`);
    emit({ deleted: true, meeting_id: meetingId });
    return;
  }

  fail("Usage: meetings list|get|create|update|delete");
}

function normalizeLocal(value) {
  return validateStart(value).replace(/[-:]/g, "").replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "");
}

function icsEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldIcs(line) {
  const chunks = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 73) {
    let index = 1;
    while (index < rest.length && Buffer.byteLength(rest.slice(0, index + 1), "utf8") <= 73) index += 1;
    chunks.push(rest.slice(0, index));
    rest = " " + rest.slice(index);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function runIcs(args) {
  const topic = requiredFlag(args, "--topic");
  const start = normalizeLocal(requiredFlag(args, "--start"));
  const duration = numberValue(flag(args, "--duration") || "60", "duration", { min: 1, max: 1440 });
  const timezone = flag(args, "--timezone") || readEnv().ZOOM_TIMEZONE || "Asia/Jerusalem";
  const url = requiredFlag(args, "--url");
  const out = projectFile(requiredFlag(args, "--out"));
  const attendees = flags(args, "--attendee");
  for (const email of attendees) if (!/^\S+@\S+\.\S+$/.test(email)) fail(`Invalid attendee email: ${email}`);
  ensureGitignore();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atomic Business//Zoom Scheduler//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@atomi.biz`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART;TZID=${icsEscape(timezone)}:${start}`,
    `DURATION:PT${duration}M`,
    `SUMMARY:${icsEscape(topic)}`,
    `LOCATION:${icsEscape(url)}`,
    `DESCRIPTION:${icsEscape(`Zoom: ${url}`)}`,
    `URL:${icsEscape(url)}`,
    ...attendees.map((email) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${email}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  fs.writeFileSync(out, lines.map(foldIcs).join("\r\n") + "\r\n");
  emit({ created: true, file: path.relative(projectRoot(), out), note: "ICS created locally; it has not been emailed." });
}

async function runReadEndpoint(kind, meetingId) {
  const values = config();
  const api = new ZoomClient(values);
  const id = meetingPart(meetingId);
  if (kind === "participants") {
    emit(await api.request("GET", `/past_meetings/${id}/participants?page_size=300`));
    return;
  }
  if (kind === "report-participants") {
    emit(await api.request("GET", `/report/meetings/${id}/participants?page_size=300`));
    return;
  }
  if (kind === "recordings") {
    const data = await api.request("GET", `/meetings/${id}/recordings`);
    if (data && typeof data === "object") delete data.start_url;
    emit(data);
    return;
  }
  if (kind === "invitation") {
    emit(await api.request("GET", `/meetings/${id}/invitation`));
    return;
  }
  fail("Unknown read operation");
}

function usage() {
  emit({
    usage: [
      "check",
      "me",
      "meetings list [--type upcoming]",
      "meetings get <id>",
      "meetings create --topic <title> --start <ISO-local> [--duration 60] [--timezone Area/City] [--invitee email] --dry-run|--approved",
      "meetings update <id> [fields] --dry-run|--approved",
      "meetings delete <id> --approved",
      "participants <id>",
      "report-participants <id>",
      "recordings <id-or-uuid>",
      "invitation <id>",
      "ics --topic <title> --start <ISO-local> --url <join-url> --out <project-file> [--attendee email]",
    ],
  });
}

async function main() {
  const args = argv();
  const command = args[0];
  if (!command || command === "help" || command === "--help") return usage();
  if (command === "check") return runCheck();
  if (command === "setup") {
    runSetup();
    return;
  }
  if (command === "where") {
    emit({ ENV: ENV_REL, root: projectRoot() });
    return;
  }
  if (command === "me") return runMe();
  if (command === "meetings") return runMeetings(args.slice(1));
  if (["participants", "report-participants", "recordings", "invitation"].includes(command)) return runReadEndpoint(command, args[1]);
  if (command === "ics") return runIcs(args.slice(1));
  usage();
  process.exitCode = 1;
}

main().catch((error) => fail(error.message || String(error)));
