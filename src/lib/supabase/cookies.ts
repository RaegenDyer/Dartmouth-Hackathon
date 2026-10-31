import type { CookieOptions } from "@supabase/ssr";

// AA-5: session cookies are httpOnly, sameSite=lax, and secure in production.
// The app reads sessions only on the server, so browser scripts never need them.
export function hardenCookieOptions(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}
