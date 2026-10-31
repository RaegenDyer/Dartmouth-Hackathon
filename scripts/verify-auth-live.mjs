// Manual live check of the auth plumbing against a running local app and the
// real Supabase project. Not part of CI. Never prints tokens or passwords.
//
//   1. .env.local: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   2. .env.test.local: TEST_USER_EMAIL and TEST_USER_PASSWORD (a test user)
//   3. npm run dev   (in another terminal)
//   4. npm run verify:auth            (BASE_URL defaults to http://localhost:3000)
import { createServerClient } from "@supabase/ssr";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env.test.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
const base = process.env.BASE_URL ?? "http://localhost:3000";
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "TEST_USER_EMAIL",
  "TEST_USER_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing settings: ${missing.join(", ")}`);
  process.exit(2);
}

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}
const info = (label) => console.log(`INFO ${label}`);

// Cookie helpers. @supabase/ssr stores "base64-<base64url JSON>", possibly split
// into name.0, name.1, ... chunks.
const toHeader = (jar) => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
function authCookieName(jar) {
  return [...jar.keys()].find((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n))?.replace(/\.\d+$/, "");
}
function readSession(jar) {
  const name = authCookieName(jar);
  const raw = jar.has(name)
    ? jar.get(name)
    : [...jar.keys()]
        .filter((n) => n.startsWith(`${name}.`))
        .sort((a, b) => Number(a.split(".").pop()) - Number(b.split(".").pop()))
        .map((n) => jar.get(n))
        .join("");
  return { name, session: JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString()) };
}
const writeSession = (name, session) =>
  new Map([[name, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`]]);
function absorbSetCookies(jar, response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = decodeURIComponent(pair.slice(index + 1));
    if (!value || /max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}
const getSession = (cookie) =>
  fetch(`${base}/api/auth/session`, { headers: cookie ? { cookie } : {} });

// 0. Server reachable.
try {
  const health = await fetch(`${base}/api/health`);
  check("app is running", health.ok, base);
} catch {
  check("app is running", false, `nothing answered at ${base}; start npm run dev`);
  process.exit(1);
}

// 1. Signed out.
{
  const response = await getSession();
  const body = await response.json();
  check("signed-out session reports authenticated:false", response.status === 200 && body.authenticated === false,
    `status ${response.status}`);
  check("session response is not cacheable", response.headers.get("cache-control") === "no-store");
}

// 2. Sign in as the test user (outside the app; the app has no sign-in route yet).
const jar = new Map();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (updates) => {
        for (const { name, value } of updates) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  },
);
const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
  email: process.env.TEST_USER_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
});
check("test user signs in with Supabase", !signInError && Boolean(signIn?.user),
  signInError ? `${signInError.status ?? ""} ${signInError.code ?? signInError.message}` : "");
if (signInError) process.exit(1);
const expectedUserId = signIn.user.id;

// 3. Signed in.
{
  const response = await getSession(toHeader(jar));
  const body = await response.json();
  check("app verifies the session cookie", body.authenticated === true && body.userId === expectedUserId,
    `status ${response.status}`);
  check("isAnonymous is false for a password user", body.isAnonymous === false);
}

// 4. Forged token: corrupt the JWT signature and keep everything else.
{
  const { name, session } = readSession(jar);
  const parts = session.access_token.split(".");
  const signature = parts[2];
  parts[2] = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  const forged = writeSession(name, { ...session, access_token: parts.join("."), refresh_token: "invalid" });
  const body = await (await getSession(toHeader(forged))).json();
  check("forged token is rejected", body.authenticated === false);
}

// 5. Proxy refresh: mark the access token expired, request a page, expect new cookies.
let refreshed;
{
  const { name, session } = readSession(jar);
  const expired = writeSession(name, { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 });
  const response = await fetch(`${base}/`, { headers: { cookie: toHeader(expired) }, redirect: "manual" });
  refreshed = new Map(expired);
  absorbSetCookies(refreshed, response);
  const renewed = response.headers.getSetCookie().some((line) => line.startsWith(name));
  check("proxy refreshes an expired session and sets new cookies", renewed, `status ${response.status}`);
  if (renewed) {
    const body = await (await getSession(toHeader(refreshed))).json();
    check("refreshed cookie is accepted", body.authenticated === true && body.userId === expectedUserId);
  }
}
const active = authCookieName(refreshed) ? refreshed : jar;

// 6. Sign-out.
{
  const crossSite = await fetch(`${base}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie: toHeader(active), "sec-fetch-site": "cross-site" },
  });
  check("cross-site sign-out is refused", crossSite.status === 403, `status ${crossSite.status}`);

  const response = await fetch(`${base}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie: toHeader(active), origin: new URL(base).origin },
  });
  const cleared = response.headers.getSetCookie().some((line) => /auth-token/.test(line) && /max-age=0|expires=thu, 01 jan 1970/i.test(line));
  check("same-origin sign-out returns 204", response.status === 204, `status ${response.status}`);
  check("sign-out clears the auth cookie", cleared);

  const after = new Map(active);
  absorbSetCookies(after, response);
  const body = await (await getSession(toHeader(after))).json();
  check("browser is signed out afterwards", body.authenticated === false);

  // The old access token may still verify locally until it expires when the
  // project uses asymmetric signing keys; the refresh token is revoked.
  const { session } = readSession(active);
  const { error: refreshError } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
  check("old refresh token no longer works", Boolean(refreshError));
  info("an already-issued access token stays valid until it expires (Supabase JWT behavior)");
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll live auth checks passed.");
process.exit(failures ? 1 : 0);
