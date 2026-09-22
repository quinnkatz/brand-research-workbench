import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessJwt } from "@/lib/access-jwt";

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

// AUTH_MODE decides where identity comes from. Anything else means nobody is signed in.
//   cloudflare-access  production: a verified Cloudflare Access token (email one-time code login)
//   sites              ChatGPT Sites edge headers; also the local dev mock and the test harness
type AuthMode = "cloudflare-access" | "sites";
const mode = (): AuthMode | null => {
  const value = (env as any).AUTH_MODE;
  return value === "cloudflare-access" || value === "sites" ? value : null;
};

const SITES_SIGN_IN = "/signin-with-chatgpt";
const SITES_SIGN_OUT = "/signout-with-chatgpt";
const ACCESS_SIGN_OUT = "/cdn-cgi/access/logout";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

export async function getUser(): Promise<AppUser | null> {
  const h = await headers();
  switch (mode()) {
    case "cloudflare-access": {
      const identity = await verifyAccessJwt(h.get("cf-access-jwt-assertion"), {
        teamDomain: String((env as any).ACCESS_TEAM_DOMAIN ?? ""),
        audience: String((env as any).ACCESS_AUD ?? ""),
      });
      return identity && { userId: identity.sub, email: identity.email, displayName: identity.email, fullName: null };
    }
    case "sites": {
      const userId = h.get("oai-authenticated-user-id"), email = h.get("oai-authenticated-user-email");
      if (!userId || !email) return null;
      const encoded = h.get("oai-authenticated-user-full-name");
      const fullName = encoded && h.get("oai-authenticated-user-full-name-encoding") === PERCENT_ENCODED_UTF8 ? safeDecode(encoded) : null;
      return { userId, email, fullName, displayName: fullName ?? email };
    }
    default:
      return null;
  }
}

export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await getUser();
  if (user) return user;
  redirect(signInPath(returnTo));
}

/** Behind Cloudflare Access every page already requires sign-in, so the page itself is the sign-in link. */
export function signInPath(returnTo: string): string {
  const safe = safeRelativeReturnPath(returnTo);
  return mode() === "cloudflare-access" ? safe : `${SITES_SIGN_IN}?return_to=${encodeURIComponent(safe)}`;
}

export function signOutPath(returnTo = "/"): string {
  return mode() === "cloudflare-access" ? ACCESS_SIGN_OUT : `${SITES_SIGN_OUT}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  let url: URL;
  try { url = new URL(value, "https://app.local"); } catch { return "/"; }
  if (url.origin !== "https://app.local") return "/";
  if ([SITES_SIGN_IN, SITES_SIGN_OUT, "/callback", ACCESS_SIGN_OUT].includes(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

function safeDecode(value: string): string | null {
  try { return decodeURIComponent(value); } catch { return null; }
}
