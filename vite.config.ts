import { existsSync, readFileSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// `DEPLOY=production pnpm build` targets the owner's own Cloudflare account using
// deploy/cloudflare.json. Any other build is local: ChatGPT-style mock sign-in and
// a throwaway local database. scripts/deploy.mjs refuses to ship a local build.
const production = process.env.DEPLOY === "production";
const deployConfig = production
  ? JSON.parse(readFileSync(new URL("./deploy/cloudflare.json", import.meta.url), "utf8"))
  : null;

function localVars(): Record<string, string> {
  const vars: Record<string, string> = { AUTH_MODE: "sites" };
  // Optional gitignored .dev.vars (KEY=value lines), e.g. a local VAULT_MASTER_KEY.
  if (existsSync(".dev.vars")) {
    for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (match) vars[match[1]] = match[2];
    }
  }
  return vars;
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  ...(deployConfig ? { name: deployConfig.workerName } : {}),
  vars: deployConfig
    ? {
        AUTH_MODE: "cloudflare-access",
        ACCESS_TEAM_DOMAIN: deployConfig.accessTeamDomain,
        ACCESS_AUD: deployConfig.accessAud,
      }
    : localVars(),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: deployConfig?.d1DatabaseName ?? "site-creator-d1",
          database_id: deployConfig?.d1DatabaseId ?? SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: deployConfig?.r2BucketName ?? "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux && !production }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
