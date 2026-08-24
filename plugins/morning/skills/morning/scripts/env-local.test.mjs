#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "morning.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "morning-env-"));
const project = path.join(tmp, "project");
const fakeHome = path.join(tmp, "home");
fs.mkdirSync(project);
fs.mkdirSync(fakeHome);
fs.mkdirSync(path.join(project, ".git"));

function fail(message) {
  console.error("FAIL:", message);
  process.exit(1);
}

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: project,
    env: { ...process.env, HOME: fakeHome, MORNING_NO_OPEN: "1", ...extraEnv },
    encoding: "utf8",
  });
}

const first = run(["check"]);
if (first.status !== 2) fail("missing keys should exit 2");
if (!fs.existsSync(path.join(project, ".env"))) fail(".env was not created in the project");
const gitignore = fs.readFileSync(path.join(project, ".gitignore"), "utf8");
if (!gitignore.includes(".env")) fail(".env is not ignored");
if (!gitignore.includes(".atomi/")) fail("Morning state is not ignored");
if (fs.existsSync(path.join(fakeHome, ".atomi"))) fail("plugin wrote to HOME");

fs.writeFileSync(
  path.join(project, ".env"),
  "MORNING_API_KEY=test_key\nMORNING_API_SECRET=test_secret\n",
);
const local = run(["check"], { MORNING_SKIP_NETWORK: "1" });
if (local.status !== 0 || !local.stdout.includes('"ready": true')) fail("local credential check failed");

const where = run(["where"]);
if (where.status !== 0 || !where.stdout.includes("ENV=.env")) fail("where must show the relative .env path");
if (!where.stdout.includes("STATE=.atomi/morning-state")) fail("where must show project-local state");

// Financial safety regression: without explicit approval the script must refuse
// before authentication or any Morning API call. Fake credentials are deliberate.
const refused = run(["invoice", "issue", "--token", "0123456789abcdef0123456789abcdef"]);
if (refused.status !== 20) fail("issue without --approved must exit 20, got " + refused.status);
if (!refused.stderr.includes("explicit_approval_flag_missing")) fail("missing approval refusal reason");
if (fs.existsSync(path.join(fakeHome, ".atomi"))) fail("invoice gate wrote to HOME");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK Morning local .env + project state + hard approval gate + no HOME write");
