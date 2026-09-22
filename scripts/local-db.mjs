#!/usr/bin/env node
// Applies drizzle migrations to the local dev database (.wrangler/state), the same
// store `pnpm dev` uses. Run once after cloning and after adding a migration.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = join(mkdtempSync(join(tmpdir(), "workbench-local-db-")), "wrangler.json");
// Must match the local binding in vite.config.ts so dev reads the migrated database.
writeFileSync(config, JSON.stringify({ name: "workbench-local", main: "unused.js", compatibility_date: "2026-05-15",
  d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: resolve(root, "drizzle") }] }));
const result = spawnSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "migrations", "apply", "site-creator-d1", "--local", "--persist-to", join(root, ".wrangler/state"), "-c", config],
  { cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
process.exit(result.status ?? 1);
