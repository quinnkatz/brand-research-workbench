#!/usr/bin/env node
// Deploys the workbench to the owner's own Cloudflare account.
//   pnpm cf:login     once: approve wrangler in the browser
//   pnpm cf:deploy    create missing resources, build, migrate, deploy
// Safe to re-run. Resource ids are written back to deploy/cloudflare.json.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = join(root, "deploy/cloudflare.json");
const wranglerBin = join(root, "node_modules/wrangler/bin/wrangler.js");
const PLACEHOLDER_DB = "00000000-0000-4000-8000-000000000000";
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };

const config = JSON.parse(readFileSync(configPath, "utf8"));
const save = () => writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
const step = message => console.log(`\n→ ${message}`);
const fail = message => { console.error(`\n✗ ${message}`); process.exit(1); };

function wrangler(args, { input, quiet = false, allowFail = false } = {}) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], { cwd: root, env, input, encoding: "utf8", stdio: [input ? "pipe" : "inherit", "pipe", "pipe"] });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!quiet) process.stdout.write(output);
  if (result.status !== 0 && !allowFail) fail(`wrangler ${args.join(" ")} failed.`);
  return { ok: result.status === 0, output };
}

step("Checking Cloudflare login");
const who = wrangler(["whoami"], { quiet: true, allowFail: true });
if (!who.ok || /not authenticated|You are not logged in/i.test(who.output)) fail("Not logged in to Cloudflare. Run: pnpm cf:login");

if (!config.d1DatabaseId) {
  step(`Creating database ${config.d1DatabaseName}`);
  const { output } = wrangler(["d1", "create", config.d1DatabaseName]);
  const id = output.match(/"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/)?.[1];
  if (!id) fail("Could not read the new database id from wrangler's output.");
  config.d1DatabaseId = id; save();
}

step(`Ensuring evidence storage bucket ${config.r2BucketName}`);
const bucket = wrangler(["r2", "bucket", "create", config.r2BucketName], { quiet: true, allowFail: true });
if (!bucket.ok && !/already exists|already own/i.test(bucket.output)) {
  process.stdout.write(bucket.output);
  fail("Could not create the R2 bucket. R2 must be enabled once in the Cloudflare dashboard (it asks for a payment method even on the free tier).");
}

step("Building for production");
const build = spawnSync("pnpm", ["build"], { cwd: root, env: { ...env, DEPLOY: "production" }, stdio: "inherit" });
if (build.status !== 0) fail("Production build failed.");
const built = JSON.parse(readFileSync(join(root, "dist/server/wrangler.json"), "utf8"));
if (built.vars?.AUTH_MODE !== "cloudflare-access") fail("Refusing to deploy: this build does not use Cloudflare Access sign-in.");
if (built.d1_databases?.[0]?.database_id !== config.d1DatabaseId || config.d1DatabaseId === PLACEHOLDER_DB) fail("Refusing to deploy: the build is not bound to this account's database.");
if (built.name !== config.workerName) fail(`Refusing to deploy: built worker is named ${built.name}, expected ${config.workerName}.`);

step("Applying database migrations");
const temp = mkdtempSync(join(tmpdir(), "workbench-deploy-"));
const migrateConfig = join(temp, "wrangler.json");
writeFileSync(migrateConfig, JSON.stringify({ name: config.workerName, main: "unused.js", compatibility_date: built.compatibility_date,
  d1_databases: [{ binding: "DB", database_name: config.d1DatabaseName, database_id: config.d1DatabaseId, migrations_dir: resolve(root, "drizzle") }] }));
wrangler(["d1", "migrations", "apply", config.d1DatabaseName, "--remote", "-c", migrateConfig], { input: "y\n" });

step("Deploying");
const deployed = wrangler(["deploy", "-c", "dist/server/wrangler.json"]);
const url = deployed.output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];

step("Checking the encryption key for saved API keys");
const secrets = wrangler(["secret", "list", "--name", config.workerName], { quiet: true, allowFail: true });
if (!secrets.output.includes("VAULT_MASTER_KEY")) {
  // Generated here, sent only to Cloudflare. If it is ever lost, reconnect provider keys in the app.
  wrangler(["secret", "put", "VAULT_MASTER_KEY", "--name", config.workerName], { input: randomBytes(32).toString("base64") });
}

console.log(`\n✓ Deployed${url ? `: ${url}` : ""}`);
if (!config.accessTeamDomain || !config.accessAud) {
  console.log("\n! Nobody can sign in yet. Turn on Cloudflare Access for this Worker, put its team domain and");
  console.log("  audience tag into deploy/cloudflare.json, then run pnpm cf:deploy again. See docs/SELF_HOSTING.md.");
}
