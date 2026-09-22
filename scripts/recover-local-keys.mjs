#!/usr/bin/env node
// Recovers provider API keys saved in the LOCAL dev database so they can be
// re-entered in the deployed app. Run it yourself; it writes RECOVERED-KEYS.txt
// (gitignored, owner-readable) in the project root. Delete that file afterwards.
import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const master = readFileSync(`${root}/.dev.vars`, "utf8").match(/^VAULT_MASTER_KEY=(.+)$/m)?.[1]?.trim();
if (!master) throw new Error("No VAULT_MASTER_KEY in .dev.vars — the local keys cannot be decrypted.");

const db = execFileSync("bash", ["-lc", `ls -t ${root}/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | head -1`]).toString().trim();
const rows = JSON.parse(execFileSync("sqlite3", ["-json", db, "select id, owner_id, provider, model, ciphertext, iv from connections;"]).toString() || "[]");

const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const key = await crypto.subtle.importKey("raw", bytes(master), "AES-GCM", false, ["decrypt"]);
const lines = [];
for (const row of rows) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(row.iv), additionalData: new TextEncoder().encode(`${row.owner_id}:${row.id}:${row.provider}`) },
    key, bytes(row.ciphertext));
  lines.push(`${row.provider}\t${row.model || "(no model)"}\t${new TextDecoder().decode(plain)}`);
}

const file = `${root}/RECOVERED-KEYS.txt`;
writeFileSync(file, `provider\tmodel\tkey\n${lines.join("\n")}\n`);
chmodSync(file, 0o600);
console.log(`Wrote ${lines.length} keys to ${file}`);
console.log("Copy them into the deployed app, then delete this file: rm RECOVERED-KEYS.txt");
