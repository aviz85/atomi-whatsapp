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

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: proj,
    env: { ...process.env, HOME: home, WA_NO_OPEN: "1", TTS_NO_OPEN: "1" },
    encoding: "utf8",
  });
}

const wa = run(WA, ["check"]);
if (wa.status !== 2) fail("wa check should exit 2 on a new machine");
const tts = run(TTS, ["check"]);
if (tts.status !== 2) fail("tts check should exit 2 on a new machine");

const envText = fs.readFileSync(path.join(proj, ".env"), "utf8");
if (!envText.includes("GREEN_API_") || !envText.includes("ELEVENLABS_API_KEY")) {
  fail(".env must hold both WhatsApp and ElevenLabs fields after both checks");
}
if (!fs.readFileSync(path.join(proj, ".gitignore"), "utf8").includes(".env")) fail("gitignore");
if (fs.existsSync(path.join(home, ".atomi-whatsapp"))) fail("wrote to HOME");

const where = run(WA, ["where"]);
if (!where.stdout.includes("ENV=.env")) fail("relative path missing");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK new-machine smoke: Node only, local .env, both plugins, no HOME write");
