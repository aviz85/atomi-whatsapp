#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "tts.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tts-env-"));

function run(cwd, args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { ...process.env, TTS_NO_OPEN: "1", WA_NO_OPEN: "1", ...extraEnv },
    encoding: "utf8",
  });
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

fs.mkdirSync(path.join(tmp, ".git"));
const fakeHome = path.join(tmp, "home");
fs.mkdirSync(fakeHome);

const check1 = run(tmp, ["check"], { HOME: fakeHome });
if (check1.status !== 2) fail("check without keys should exit 2, got " + check1.status);
if (!fs.existsSync(path.join(tmp, ".env"))) fail(".env was not created in the project");
if (!fs.readFileSync(path.join(tmp, ".gitignore"), "utf8").includes(".env")) fail("gitignore missing .env");
if (!check1.stderr.includes(".env") && !check1.stdout.includes(".env")) fail("must print relative .env");
if (fs.existsSync(path.join(fakeHome, ".atomi-whatsapp"))) fail("wrote outside the project");

const where = run(tmp, ["where"], { HOME: fakeHome });
if (!where.stdout.includes("ENV=.env")) fail("where must print ENV=.env");

fs.appendFileSync(path.join(tmp, ".env"), "\nELEVENLABS_API_KEY=sk_test_not_real\n");
const check2 = run(tmp, ["check"], { HOME: fakeHome });
if (check2.status !== 0) fail("check with key should be OK, got " + check2.status + " " + check2.stderr);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK elevenlabs local .env");
