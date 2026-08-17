#!/usr/bin/env node
// Node-only test: .env is created in the current project, gitignored, never outside.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "wa.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-env-"));
const outside = path.join(os.homedir(), ".atomi-whatsapp", ".env");
const outsideBefore = fs.existsSync(outside) ? fs.statSync(outside).mtimeMs : null;

function run(cwd, args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { ...process.env, WA_NO_OPEN: "1", ...extraEnv },
    encoding: "utf8",
  });
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

fs.mkdirSync(path.join(tmp, ".git"));

const check1 = run(tmp, ["check"]);
if (check1.status !== 2) fail("check without keys should exit 2, got " + check1.status);
if (!fs.existsSync(path.join(tmp, ".env"))) fail(".env was not created in the project");
const gi = fs.readFileSync(path.join(tmp, ".gitignore"), "utf8");
if (!/(^|[\r\n])\s*\.env\s*($|[\r\n])/.test(gi)) fail(".gitignore missing .env");
if (!check1.stderr.includes(".env") && !check1.stdout.includes(".env")) fail("setup did not print relative .env");

const where = run(tmp, ["where"]);
if (where.status !== 0) fail("where failed");
if (!where.stdout.includes("ENV=.env")) fail("where must print ENV=.env, got: " + where.stdout);

fs.writeFileSync(
  path.join(tmp, ".env"),
  "GREEN_API_URL=https://7103.api.greenapi.com\nGREEN_API_INSTANCE=7103123456\nGREEN_API_TOKEN=tok_abc\nMY_PHONE=972501234567\n",
);
const check2 = run(tmp, ["check"]);
if (check2.status !== 0 || !check2.stdout.includes("OK")) fail("check with keys should be OK");

const fakeCache = path.join(tmp, "fake-cache", ".codex", "plugins", "whatsapp", "scripts");
fs.mkdirSync(fakeCache, { recursive: true });
const fromCache = run(fakeCache, ["where"], { PWD: tmp, INIT_CWD: tmp });
if (fromCache.status !== 0) fail("where from plugin-cache cwd should still find the project");
if (!fromCache.stdout.includes("ENV=.env")) fail("relative ENV from cache cwd: " + fromCache.stdout);
if (!fromCache.stdout.includes("PROJECT=" + tmp)) fail("project root from cache cwd: " + fromCache.stdout);

const outsideAfter = fs.existsSync(outside) ? fs.statSync(outside).mtimeMs : null;
if (outsideBefore !== outsideAfter) fail("must not write ~/.atomi-whatsapp/.env");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK local .env + gitignore + relative paths + no write outside project");
