#!/usr/bin/env node
// Morning (Green Invoice) via OAuth2 client_credentials. Node 18+, no dependencies.
// Credentials: current project ./.env. Runtime state: current project ./.atomi/morning-state/.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const OAUTH_URL = "https://api.morning.co/idp/v1/oauth/token";
const API_BASE = "https://api.greeninvoice.co.il/api/v1";
const ENV_REL = ".env";
const STATE_REL = path.join(".atomi", "morning-state");
const PREVIEW_TTL_MINUTES = 30;
const REQUIRED = ["MORNING_API_KEY", "MORNING_API_SECRET"];

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
  throw new Error("אין תיקיית פרויקט לכתיבה. הריצו את הפקודה מתוך תיקיית הפרויקט.");
}

function envPath() {
  return path.join(projectRoot(), ENV_REL);
}

function statePath(...parts) {
  return path.join(projectRoot(), STATE_REL, ...parts);
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
  ensureIgnored(root, ".atomi/", "Local Morning state and financial previews - never commit");
}

const MORNING_BLOCK = `# ================= Morning (Green Invoice) =================
# יוצרים מפתח ב-Morning: Settings -> Developer Tools -> API Keys
# לא מדביקים מפתחות בצ'אט. טוקן OAuth זמני לא נשמר בקובץ.
MORNING_API_KEY=your_morning_api_key
MORNING_API_SECRET=your_morning_api_secret
`;

function ensureEnvFile() {
  ensureGitignore();
  const dest = envPath();
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, `# מפתחות מקומיים לפרויקט. הקובץ ברשימת .gitignore.\n\n${MORNING_BLOCK}`);
    return true;
  }
  const current = fs.readFileSync(dest, "utf8");
  const defaults = [
    ["MORNING_API_KEY", "your_morning_api_key"],
    ["MORNING_API_SECRET", "your_morning_api_secret"],
  ];
  const missing = defaults.filter(([key]) => !new RegExp("^\\s*" + key + "\\s*=", "m").test(current));
  if (missing.length) {
    const prefix = current.endsWith("\n") ? "\n" : "\n\n";
    const lines = missing.map(([key, value]) => key + "=" + value).join("\n");
    fs.appendFileSync(dest, prefix + "# ================= Morning (Green Invoice) =================\n" + lines + "\n");
  }
  return false;
}

function openFile(file, asText = false) {
  if (process.env.MORNING_NO_OPEN === "1" || process.env.WA_NO_OPEN === "1") return false;
  try {
    if (process.platform === "darwin") {
      spawn("open", asText ? ["-t", file] : [file], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", asText ? "notepad" : "", file].filter(Boolean), {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else {
      spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
    }
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
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
  if (!merged.MORNING_API_KEY && merged.MORNING_PAYMENTS_API_KEY) {
    merged.MORNING_API_KEY = merged.MORNING_PAYMENTS_API_KEY;
  }
  if (!merged.MORNING_API_SECRET && merged.MORNING_PAYMENTS_API_SECRET) {
    merged.MORNING_API_SECRET = merged.MORNING_PAYMENTS_API_SECRET;
  }
  return merged;
}

function isPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || /^your_/i.test(text) || /x{4,}/i.test(text) || text === "...";
}

function credentialStatus() {
  const env = readEnv();
  const missing = REQUIRED.filter((key) => isPlaceholder(env[key]));
  return { ok: missing.length === 0, missing, env };
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
  const opened = openFile(envPath(), true);
  emit({
    ready: false,
    reason: "missing_credentials",
    credentials_file: ENV_REL,
    opened,
    setup: [
      "Morning -> Settings -> Developer Tools -> API Keys",
      "Fill MORNING_API_KEY and MORNING_API_SECRET in .env",
      "Save the file, return to Codex, and say: סיימתי",
      "Never paste the key or secret into chat",
    ],
  });
}

function requireCredentials() {
  const status = credentialStatus();
  if (!status.ok) {
    runSetup();
    process.exit(2);
  }
  ensureGitignore();
  return { key: status.env.MORNING_API_KEY, secret: status.env.MORNING_API_SECRET };
}

class MorningHttpError extends Error {
  constructor(status, body) {
    super(`Morning API HTTP ${status}: ${String(body).slice(0, 500)}`);
    this.status = status;
  }
}

class MorningClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.token = null;
    this.expiresAt = 0;
  }

  async getToken(force = false) {
    if (!force && this.token && Date.now() < this.expiresAt - 120_000) return this.token;
    const response = await fetch(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.credentials.key,
        client_secret: this.credentials.secret,
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new MorningHttpError(response.status, text);
    const data = text ? JSON.parse(text) : {};
    if (!data.accessToken) throw new Error("Morning OAuth response is missing accessToken");
    this.token = data.accessToken;
    const parsed = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
    this.expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + 55 * 60_000;
    return this.token;
  }

  async request(method, endpoint, body, allowRetry = true) {
    const send = async (token) =>
      fetch(endpoint.startsWith("http") ? endpoint : API_BASE + endpoint, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    let response = await send(await this.getToken());
    if (response.status === 401 && allowRetry) {
      response = await send(await this.getToken(true));
    }
    const text = await response.text();
    if (!response.ok) throw new MorningHttpError(response.status, text);
    return text ? JSON.parse(text) : {};
  }
}

function client() {
  return new MorningClient(requireCredentials());
}

function argsAfter(index = 2) {
  return process.argv.slice(index);
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function requiredFlag(args, name) {
  const value = flag(args, name);
  if (!value) fail(`Missing ${name}`);
  return value;
}

function numberValue(value, label, { min = -Infinity, integer = false } = {}) {
  const parsed = integer ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) fail(`Invalid ${label}: ${value}`);
  return parsed;
}

function safeId(value, label = "id") {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`Invalid ${label}`);
  return value;
}

function ensureStateDirs() {
  ensureGitignore();
  for (const dir of ["pending", "issued", "failed", "previews"]) {
    fs.mkdirSync(statePath(dir), { recursive: true });
  }
}

function utcNow() {
  return new Date().toISOString();
}

function audit(event, fields = {}) {
  ensureStateDirs();
  const parts = [utcNow(), event, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)];
  fs.appendFileSync(statePath("audit.log"), parts.join(" | ") + "\n");
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function payloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(sorted(payload))).digest("hex");
}

function projectFile(value) {
  const root = projectRoot();
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail("The payload file must be inside the current project");
  return resolved;
}

async function runCheck() {
  const status = credentialStatus();
  if (!status.ok) {
    runSetup();
    process.exit(2);
  }
  ensureGitignore();
  if (process.env.MORNING_SKIP_NETWORK === "1") {
    emit({ ready: true, credentials_file: ENV_REL, auth: "local-check-only" });
    return;
  }
  const api = client();
  const me = await api.request("GET", "/businesses/me");
  emit({
    ready: true,
    credentials_file: ENV_REL,
    auth: "oauth2_client_credentials",
    business: me?.name || me?.business?.name || null,
  });
}

async function runClients(args) {
  if (args[0] !== "search") fail("Usage: clients search --query <name>");
  const query = requiredFlag(args, "--query");
  const pageSize = flag(args, "--page-size") ? numberValue(flag(args, "--page-size"), "page size", { min: 1, integer: true }) : 25;
  const result = await client().request("POST", "/clients/search", { page: 1, pageSize: Math.min(pageSize, 100), query });
  const items = result.items || [];
  emit({
    count: items.length,
    clients: items.map((item) => ({
      id: item.id,
      name: item.name,
      taxId: item.taxId,
      emails: item.emails || [],
      phone: item.phone,
    })),
  });
}

async function paginatedReport(endpoint, fromDate, toDate, kind) {
  const api = client();
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const body = { page, pageSize: 25, fromDate, toDate };
    if (kind === "income") body.type = [320, 305, 400];
    const result = await api.request("POST", endpoint, body);
    const items = result.items || [];
    all.push(...items);
    pages = Math.max(1, Number(result.pages || 1));
    if (!items.length) break;
    page += 1;
  } while (page <= pages);

  const groupKey = kind === "income" ? "client" : "supplier";
  const grouped = {};
  let total = 0;
  for (const item of all) {
    const amount = Number(item.amount || 0);
    total += amount;
    const name = item[groupKey]?.name || "Unknown";
    grouped[name] = (grouped[name] || 0) + amount;
  }
  emit({ period: { from: fromDate, to: toDate }, count: all.length, total, grouped, items: all });
}

function summarizeLink(item) {
  return {
    id: item.id,
    description: item.description || item.data?.description || "",
    price: item.price,
    currency: item.currency || "ILS",
    status: item.status,
    status_label: item.status === 10 ? "active" : "inactive",
    url: item.shortUrl || item.url || "",
    created: item.creationDate,
  };
}

async function discoverTerminal(api) {
  const found = await api.request("POST", "/payments/links/search", { page: 1, pageSize: 1, status: 10 });
  const first = (found.items || [])[0];
  if (!first) {
    fail("No active payment link exists. Create one manually in Morning first so the terminal can be discovered.", 2);
  }
  const detail = await api.request("GET", `/payments/links/${encodeURIComponent(safeId(first.id, "link id"))}`);
  const plugins = detail.data?.plugins || [];
  if (!plugins.length) fail("The active payment link contains no terminal configuration.", 3);
  return { plugins, source: first, detail };
}

function paymentLinkBody(price, description, data = {}, source = {}) {
  return {
    type: source.type ?? 0,
    price,
    currency: source.currency || "ILS",
    lang: source.lang || "he",
    description,
    documentType: data.documentType ?? 320,
    documentVatType: data.documentVatType ?? 0,
    maxPayments: data.maxPayments ?? 1,
    maxQuantity: data.maxQuantity ?? 1,
    notify: data.notify ?? true,
    addClient: data.addClient ?? false,
    openAmount: data.openAmount ?? false,
    showSearchEngines: data.showSearchEngines ?? true,
    themeId: data.themeId ?? 1000,
    requireTaxId: data.requireTaxId ?? false,
    plugins: data.plugins || [],
  };
}

async function runLinks(args) {
  const command = args[0];
  const rest = args.slice(1);
  const api = client();

  if (command === "search") {
    const body = { page: 1, pageSize: 50 };
    if (flag(rest, "--status")) body.status = numberValue(flag(rest, "--status"), "status", { integer: true });
    if (flag(rest, "--query")) body.query = flag(rest, "--query");
    if (flag(rest, "--page")) body.page = numberValue(flag(rest, "--page"), "page", { min: 1, integer: true });
    const result = await api.request("POST", "/payments/links/search", body);
    emit({ total: result.total || 0, pages: result.pages || 0, links: (result.items || []).map(summarizeLink) });
    return;
  }

  if (command === "get") {
    const id = safeId(rest[0], "link id");
    emit(await api.request("GET", `/payments/links/${encodeURIComponent(id)}`));
    return;
  }

  if (command === "terminal") {
    const found = await discoverTerminal(api);
    emit({ source_link: found.source.id, source_description: found.source.description, plugins: found.plugins });
    return;
  }

  if (command === "create") {
    if (rest.length < 2) fail("Usage: links create <price> <description> [--max-payments N] [--max-quantity N]");
    const price = numberValue(rest[0], "price", { min: 0.01 });
    const description = rest[1];
    const terminal = await discoverTerminal(api);
    const data = { plugins: terminal.plugins };
    if (flag(rest, "--max-payments")) data.maxPayments = numberValue(flag(rest, "--max-payments"), "max payments", { min: 1, integer: true });
    if (flag(rest, "--max-quantity")) data.maxQuantity = numberValue(flag(rest, "--max-quantity"), "max quantity", { min: 1, integer: true });
    const result = await api.request("POST", "/payments/links", paymentLinkBody(price, description, data));
    emit({ success: true, ...summarizeLink(result) });
    return;
  }

  if (command === "update") {
    const id = safeId(rest[0], "link id");
    const body = {};
    if (flag(rest, "--price")) body.price = numberValue(flag(rest, "--price"), "price", { min: 0.01 });
    if (flag(rest, "--description")) body.description = flag(rest, "--description");
    if (flag(rest, "--status")) body.status = numberValue(flag(rest, "--status"), "status", { integer: true });
    if (flag(rest, "--max-payments")) body.maxPayments = numberValue(flag(rest, "--max-payments"), "max payments", { min: 1, integer: true });
    if (!Object.keys(body).length) fail("Nothing to update");
    emit(await api.request("PUT", `/payments/links/${encodeURIComponent(id)}`, body));
    return;
  }

  if (command === "deactivate") {
    const id = safeId(rest[0], "link id");
    emit(await api.request("PUT", `/payments/links/${encodeURIComponent(id)}`, { status: 20 }));
    return;
  }

  if (command === "duplicate") {
    const id = safeId(rest[0], "link id");
    const source = await api.request("GET", `/payments/links/${encodeURIComponent(id)}`);
    const price = flag(rest, "--price") ? numberValue(flag(rest, "--price"), "price", { min: 0.01 }) : source.price;
    const description = flag(rest, "--description") || source.description || "";
    const result = await api.request("POST", "/payments/links", paymentLinkBody(price, description, source.data || {}, source));
    emit({ success: true, duplicated_from: id, ...summarizeLink(result) });
    return;
  }

  fail("Unknown links command. Use search, get, terminal, create, update, deactivate, or duplicate.");
}

async function invoicePreview(args) {
  ensureStateDirs();
  const payloadFile = projectFile(requiredFlag(args, "--payload"));
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadFile, "utf8"));
  } catch (error) {
    audit("PREVIEW_FAIL", { reason: "bad_payload" });
    fail(`Could not parse payload: ${error.message}`, 2);
  }
  const hash = payloadHash(payload);
  let preview;
  try {
    preview = await client().request("POST", "/documents/preview", payload);
  } catch (error) {
    audit("PREVIEW_FAIL", { reason: "api_failed", hash: hash.slice(0, 12) });
    throw error;
  }
  if (!preview.file) {
    audit("PREVIEW_FAIL", { reason: "no_pdf", hash: hash.slice(0, 12) });
    fail("Morning preview response contained no PDF", 5);
  }

  const token = crypto.randomBytes(16).toString("hex");
  const pdfRel = path.join(STATE_REL, "previews", `invoice-preview-${token}.pdf`);
  const pdf = path.join(projectRoot(), pdfRel);
  fs.writeFileSync(pdf, Buffer.from(preview.file, "base64"));
  const state = {
    token,
    status: "pending",
    payload,
    payload_hash: hash,
    pdf_path: pdfRel,
    created_at: utcNow(),
    ttl_minutes: PREVIEW_TTL_MINUTES,
  };
  fs.writeFileSync(statePath("pending", `${token}.json`), JSON.stringify(state, null, 2));
  const total = (payload.income || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  audit("PREVIEW_OK", { token, hash: hash.slice(0, 12), type: payload.type, amount: total });
  const opened = hasFlag(args, "--no-open") ? false : openFile(pdf);
  emit({
    token,
    pdf_path: pdfRel,
    payload_hash: hash,
    ttl_minutes: PREVIEW_TTL_MINUTES,
    opened,
    next_step: `Inspect the PDF and get explicit approval. Then run: node scripts/morning.mjs invoice issue --token ${token} --approved`,
  });
}

function refuse(token, reason, code) {
  audit("ISSUE_FAIL", { token: token || "<none>", reason });
  fail(`REFUSED: ${reason}`, code);
}

async function invoiceIssue(args) {
  ensureStateDirs();
  const token = safeId(requiredFlag(args, "--token"), "preview token");
  if (!/^[a-f0-9]{32}$/.test(token)) refuse(token, "invalid_token_format", 12);
  if (!hasFlag(args, "--approved")) refuse(token, "explicit_approval_flag_missing", 20);

  const pending = statePath("pending", `${token}.json`);
  const issued = statePath("issued", `${token}.json`);
  const failed = statePath("failed", `${token}.json`);
  if (!fs.existsSync(pending)) {
    if (fs.existsSync(issued)) refuse(token, "token_already_issued", 10);
    if (fs.existsSync(failed)) refuse(token, "token_previously_failed", 11);
    refuse(token, "token_not_found_in_pending", 12);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(pending, "utf8"));
  } catch (error) {
    refuse(token, `state_file_unreadable:${error.message}`, 13);
  }
  if (state.status !== "pending") refuse(token, `unexpected_status:${state.status}`, 14);
  if (state.token !== token) refuse(token, "token_mismatch_in_state_file", 15);
  const created = Date.parse(state.created_at);
  if (!Number.isFinite(created)) refuse(token, "bad_created_at", 16);
  const ageMinutes = (Date.now() - created) / 60_000;
  if (ageMinutes > Number(state.ttl_minutes || PREVIEW_TTL_MINUTES)) {
    refuse(token, `expired_after_${Math.floor(ageMinutes)}min`, 17);
  }
  if (!state.payload || typeof state.payload !== "object" || Array.isArray(state.payload)) {
    refuse(token, "missing_payload_in_state", 18);
  }
  const actualHash = payloadHash(state.payload);
  if (actualHash !== state.payload_hash) refuse(token, "payload_hash_mismatch_state_tampered", 19);

  let document;
  try {
    document = await client().request("POST", "/documents", state.payload);
  } catch (error) {
    state.status = "failed";
    state.failed_at = utcNow();
    state.error = String(error.message || error).slice(0, 500);
    fs.writeFileSync(pending, JSON.stringify(state, null, 2));
    fs.renameSync(pending, failed);
    audit("ISSUE_FAIL", { token, reason: "issue_api_failed", hash: actualHash.slice(0, 12) });
    fail(`REFUSED: issue_api_failed:${String(error.message || error).slice(0, 100)}`, 22);
  }

  const url = typeof document.url === "object" ? document.url.origin : document.url;
  Object.assign(state, {
    status: "issued",
    issued_at: utcNow(),
    doc_id: document.id,
    doc_number: document.number,
    pdf_url: url,
  });
  fs.writeFileSync(pending, JSON.stringify(state, null, 2));
  fs.renameSync(pending, issued);
  audit("ISSUE_OK", {
    token,
    hash: actualHash.slice(0, 12),
    doc_id: state.doc_id,
    number: state.doc_number,
    type: state.payload.type,
  });
  emit({ doc_id: state.doc_id, doc_number: state.doc_number, pdf_url: state.pdf_url, state_path: path.relative(projectRoot(), issued) });
}

async function runInvoice(args) {
  if (args[0] === "preview") return invoicePreview(args.slice(1));
  if (args[0] === "issue") return invoiceIssue(args.slice(1));
  fail("Usage: invoice preview --payload <file> | invoice issue --token <token> --approved");
}

function usage() {
  console.log(`Morning commands:
  check | setup | where | me
  clients search --query <name>
  income --from YYYY-MM-DD --to YYYY-MM-DD
  expenses --from YYYY-MM-DD --to YYYY-MM-DD
  links search|get|terminal|create|update|deactivate|duplicate
  invoice preview --payload <file>
  invoice issue --token <token> --approved`);
}

async function main() {
  const command = process.argv[2];
  const args = argsAfter(3);
  if (!command || command === "help" || command === "--help") return usage();
  if (command === "setup") {
    runSetup();
    return;
  }
  if (command === "where") {
    ensureGitignore();
    console.log(`PROJECT=${projectRoot()}\nENV=${ENV_REL}\nSTATE=${STATE_REL}`);
    return;
  }
  if (command === "check") return runCheck();
  if (command === "me") return emit(await client().request("GET", "/businesses/me"));
  if (command === "clients") return runClients(args);
  if (command === "income" || command === "expenses") {
    const fromDate = requiredFlag(args, "--from");
    const toDate = requiredFlag(args, "--to");
    return paginatedReport(command === "income" ? "/documents/search" : "/expenses/search", fromDate, toDate, command);
  }
  if (command === "links") return runLinks(args);
  if (command === "invoice") return runInvoice(args);
  usage();
  process.exit(1);
}

main().catch((error) => {
  const detail = String(error?.message || error).slice(0, 700);
  fail(detail, error?.status === 401 || error?.status === 403 ? 2 : 1);
});
