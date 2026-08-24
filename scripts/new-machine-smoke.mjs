#!/usr/bin/env node
// Simulates a new computer: only Node, empty git repo, no write to HOME.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WA = path.join(ROOT, "plugins/whatsapp/skills/whatsapp/scripts/wa.mjs");
const TTS = path.join(ROOT, "plugins/elevenlabs/skills/elevenlabs/scripts/tts.mjs");
const MORNING = path.join(ROOT, "plugins/morning/skills/morning/scripts/morning.mjs");
const ZOOM = path.join(ROOT, "plugins/zoom-scheduler/skills/zoom-scheduler/scripts/zoom.mjs");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const py = spawnSync("rg", ["-n", "python|ts-node|pip ", path.join(ROOT, "plugins")], { encoding: "utf8" });
if (py.stdout && py.stdout.trim()) fail("python/ts-node found:\n" + py.stdout);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atomi-new-machine-"));
const home = path.join(tmp, "home");
const proj = path.join(tmp, "project");
fs.mkdirSync(home);
fs.mkdirSync(proj);
fs.mkdirSync(path.join(proj, ".git"));

function run(script, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: proj,
    env: { ...process.env, HOME: home, WA_NO_OPEN: "1", TTS_NO_OPEN: "1", ZOOM_NO_OPEN: "1", ...extraEnv },
    encoding: "utf8",
  });
}

const wa = run(WA, ["check"]);
if (wa.status !== 2) fail("wa check should exit 2 on a new machine");
const tts = run(TTS, ["check"]);
if (tts.status !== 2) fail("tts check should exit 2 on a new machine");
const morning = run(MORNING, ["check"]);
if (morning.status !== 2) fail("morning check should exit 2 on a new machine");
const zoom = run(ZOOM, ["check"]);
if (zoom.status !== 2) fail("zoom check should exit 2 on a new machine");

const envText = fs.readFileSync(path.join(proj, ".env"), "utf8");
if (!envText.includes("GREEN_API_") || !envText.includes("ELEVENLABS_API_KEY") || !envText.includes("MORNING_API_KEY") || !envText.includes("ZOOM_ACCOUNT_ID")) {
  fail(".env must hold WhatsApp, ElevenLabs, Morning and Zoom fields after all checks");
}
if (envText.includes("ZOOM_USER_ID=me")) fail("Server-to-Server OAuth must not default ZOOM_USER_ID to me");
if (!fs.readFileSync(path.join(proj, ".gitignore"), "utf8").includes(".env")) fail("gitignore");
if (fs.existsSync(path.join(home, ".atomi-whatsapp"))) fail("wrote to HOME");
if (fs.existsSync(path.join(home, ".atomi"))) fail("a plugin wrote to HOME");

const where = run(WA, ["where"]);
if (!where.stdout.includes("ENV=.env")) fail("relative path missing");

const zoomFake = { ZOOM_ACCOUNT_ID: "fake-account", ZOOM_CLIENT_ID: "fake-client", ZOOM_CLIENT_SECRET: "fake-secret", ZOOM_USER_ID: "host@example.com" };
const connectedEnv = fs.readFileSync(path.join(proj, ".env"), "utf8")
  .replace("your_morning_api_key", "fake-morning-key")
  .replace("your_morning_api_secret", "fake-morning-secret")
  .replace("your_zoom_account_id", zoomFake.ZOOM_ACCOUNT_ID)
  .replace("your_zoom_client_id", zoomFake.ZOOM_CLIENT_ID)
  .replace("your_zoom_client_secret", zoomFake.ZOOM_CLIENT_SECRET)
  .replace("your_zoom_host_email_or_user_id", zoomFake.ZOOM_USER_ID);
fs.writeFileSync(path.join(proj, ".env"), connectedEnv);
const morningReady = run(MORNING, ["check"], { MORNING_SKIP_NETWORK: "1" });
if (morningReady.status !== 0 || !morningReady.stdout.includes('"configuration_updated": true')) fail("Morning successful check must update connection state");
const zoomReady = run(ZOOM, ["check"], { ZOOM_SKIP_NETWORK: "1" });
if (zoomReady.status !== 0 || !zoomReady.stdout.includes('"configuration_updated": true')) fail("Zoom successful check must update connection state");
for (const service of ["morning", "zoom-scheduler"]) {
  const connectionFile = path.join(proj, ".atomi", "connections", `${service}.json`);
  if (!fs.existsSync(connectionFile)) fail(`${service} connection state file missing after successful check`);
  const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
  if (connection.ready !== true || connection.credentials_file !== ".env") fail(`${service} connection state was not marked ready`);
}
fs.appendFileSync(path.join(proj, ".env"), "\n# connection state invalidation check\n");
for (const [service, script] of [["morning", MORNING], ["zoom-scheduler", ZOOM]]) {
  const status = run(script, ["status"]);
  if (status.status !== 0 || !status.stdout.includes('"ready": false') || !status.stdout.includes('"env_changed_since_check": true')) {
    fail(`${service} status must become unready after .env changes`);
  }
}
if (run(MORNING, ["check"], { MORNING_SKIP_NETWORK: "1" }).status !== 0) fail("Morning recheck after .env update");
if (run(ZOOM, ["check"], { ZOOM_SKIP_NETWORK: "1" }).status !== 0) fail("Zoom recheck after .env update");
const dryRun = run(ZOOM, ["meetings", "create", "--topic", "Test", "--start", "2026-08-25T10:00:00", "--dry-run"], zoomFake);
if (dryRun.status !== 0 || !dryRun.stdout.includes('"dry_run": true')) fail("zoom create dry-run");
const blockedDelete = run(ZOOM, ["meetings", "delete", "123456"], zoomFake);
if (blockedDelete.status !== 3) fail("zoom delete must require approval");

const legacyMeProject = path.join(tmp, "legacy-zoom-me-project");
fs.mkdirSync(path.join(legacyMeProject, ".git"), { recursive: true });
fs.writeFileSync(path.join(legacyMeProject, ".env"), "ZOOM_ACCOUNT_ID=fake-account\nZOOM_CLIENT_ID=fake-client\nZOOM_CLIENT_SECRET=fake-secret\nZOOM_USER_ID=me\n");
const legacyMe = spawnSync(process.execPath, [ZOOM, "check"], {
  cwd: legacyMeProject,
  env: { ...process.env, HOME: home, ZOOM_NO_OPEN: "1", ZOOM_SKIP_NETWORK: "1" },
  encoding: "utf8",
});
if (legacyMe.status !== 2 || !legacyMe.stdout.includes('"ready": false')) fail("legacy ZOOM_USER_ID=me must require correction");

const legacyProject = path.join(tmp, "legacy-whatsapp-project");
fs.mkdirSync(path.join(legacyProject, ".git"), { recursive: true });
const legacyEnv = "GREEN_API_INSTANCE_ID=legacy-instance\nGREEN_API_TOKEN=legacy-token\nMY_PHONE=972500000000\n";
fs.writeFileSync(path.join(legacyProject, ".env"), legacyEnv);
function runLegacy(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: legacyProject,
    env: { ...process.env, HOME: home, WA_NO_OPEN: "1", TTS_NO_OPEN: "1", ZOOM_NO_OPEN: "1", MORNING_NO_OPEN: "1" },
    encoding: "utf8",
  });
}
if (runLegacy(MORNING, ["check"]).status !== 2) fail("Morning should extend a legacy WhatsApp .env");
if (runLegacy(ZOOM, ["check"]).status !== 2) fail("Zoom should extend a legacy WhatsApp .env");
const upgradedLegacyEnv = fs.readFileSync(path.join(legacyProject, ".env"), "utf8");
if (!upgradedLegacyEnv.includes(legacyEnv.trim())) fail("legacy WhatsApp credentials changed during upgrade");
if (!upgradedLegacyEnv.includes("MORNING_API_KEY") || !upgradedLegacyEnv.includes("ZOOM_ACCOUNT_ID")) fail("legacy .env was not extended with new plugin fields");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK smoke: Node only, shared/legacy .env preserved, all plugins, Zoom approval gates, no HOME write");
