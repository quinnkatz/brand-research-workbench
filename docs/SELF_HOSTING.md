# Hosting on your own Cloudflare account

The workbench runs on Cloudflare Workers with a D1 database and R2 evidence storage.
Sign-in is Cloudflare Access: people type their email and receive a one-time code.
Access is free for up to 50 users.

## One-time setup (Quinn)

1. **Cloudflare account.** Sign up at dash.cloudflare.com. Add a payment method under Billing
   and enable R2 once (Cloudflare asks for a card even for R2's free tier).
2. **Log this computer in.** In the project folder: `pnpm cf:login` and approve in the browser.
3. **First deploy.** `pnpm cf:deploy`. This creates the database and bucket, applies migrations,
   deploys, and generates the encryption key for saved API keys. It prints the `workers.dev` URL.
   Nobody can sign in yet. That is intentional.
4. **Turn on sign-in.** Dashboard → Workers & Pages → `brand-research-workbench` → Settings →
   Domains & Routes → workers.dev → *Enable Cloudflare Access* → *Manage Cloudflare Access*.
   - Login method: One-time PIN.
   - Policy: Allow → Include → Everyone. Brand access is enforced inside the app: a signed-in
     person sees only brands they own or were invited to.
   - Copy the **Application Audience (AUD) tag** and your **team domain**
     (`<team>.cloudflareaccess.com`, under Zero Trust → Settings).
5. **Public paths.** In Zero Trust → Access → Applications, add a self-hosted application for
   the same hostname with path `r/` and a **Bypass → Everyone** policy, so shared report links
   open without sign-in (they carry their own expiring token). Add `api/dispatch` the same way
   only when scheduled monitoring is switched on.
6. Put the team domain and AUD tag in `deploy/cloudflare.json` and run `pnpm cf:deploy` again.

## Everyday

- `pnpm dev`: local app at http://localhost:5173 with a stand-in user (seedy@sites.test).
  First time only: `pnpm db:local`.
- `pnpm test`: type-free test suite against the last build (run `pnpm build` first).
- `pnpm cf:deploy`: ship the current code.

## How sign-in is enforced

`app/auth.ts` reads `AUTH_MODE`:
- `cloudflare-access` (production): identity comes only from the `Cf-Access-Jwt-Assertion`
  token, verified against the team's public keys, audience and issuer (`lib/access-jwt.ts`).
  ChatGPT-style identity headers are ignored.
- `sites`: trusted `oai-authenticated-user-*` headers. Used by local dev and tests only.
- anything else: nobody is signed in.

Optional secret: `PERPLEXITY_API_KEY` enables the web ranking baseline without a per-owner
connection (`wrangler secret put PERPLEXITY_API_KEY`, or a line in the gitignored `.dev.vars` for
local dev). Create the key at https://console.perplexity.ai. Rotate it there if it is ever exposed.

`scripts/deploy.mjs` refuses to deploy a build that is not in `cloudflare-access` mode.
Saved provider keys are encrypted with `VAULT_MASTER_KEY`, a Worker secret that lives only in
Cloudflare. If it is ever rotated or lost, reconnect provider keys in the app.
