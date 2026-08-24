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
if (!fs.readFileSync(path.join(proj, ".gitignore"), "utf8").includes(".env")) fail("gitignore");
if (fs.existsSync(path.join(home, ".atomi-whatsapp"))) fail("wrote to HOME");
if (fs.existsSync(path.join(home, ".atomi"))) fail("a plugin wrote to HOME");

const where = run(WA, ["where"]);
if (!where.stdout.includes("ENV=.env")) fail("relative path missing");

const zoomFake = { ZOOM_ACCOUNT_ID: "fake-account", ZOOM_CLIENT_ID: "fake-client", ZOOM_CLIENT_SECRET: "fake-secret" };
const dryRun = run(ZOOM, ["meetings", "create", "--topic", "Test", "--start", "2026-08-25T10:00:00", "--dry-run"], zoomFake);
if (dryRun.status !== 0 || !dryRun.stdout.includes('"dry_run": true')) fail("zoom create dry-run");
const blockedDelete = run(ZOOM, ["meetings", "delete", "123456"], zoomFake);
if (blockedDelete.status !== 3) fail("zoom delete must require approval");

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
