import "server-only";
import type { ApiErrorCode } from "@/lib/contracts";
import { policyFromEnvironment } from "@/lib/companion/limits";
import { publicEnvironmentSchema } from "@/lib/env/public";
import { createRouteSupabaseClient } from "@/lib/supabase/server";
import { sessionFromVerifiedClaims, type VerifiedSession } from "./actor";
import { isSameOriginRequest } from "./origin";

export const privateHeaders = { "Cache-Control": "no-store" } as const;

export function isAuthConfigured(): boolean {
  return publicEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }).success;
}

export function apiError(status: number, code: ApiErrorCode, message: string, extra: object = {}): Response {
  return Response.json({ error: { code, message }, ...extra }, { status, headers: privateHeaders });
}

export function authUnavailable(): Response {
  return apiError(503, "PROVIDER_UNAVAILABLE", "Sign-in is not available right now.");
}

type SupabaseClient = Awaited<ReturnType<typeof createRouteSupabaseClient>>;

// Verifies the session's JWT (getClaims) and returns the actor plus the same
// user-scoped client, so subsequent queries run under that user's RLS.
export async function getVerifiedSession(): Promise<
  { session: VerifiedSession | null; supabase: SupabaseClient } | null
> {
  if (!isAuthConfigured()) return null;
  const supabase = await createRouteSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = error || !data ? null : sessionFromVerifiedClaims(data.claims);
  return { session, supabase };
}

// AA-3: last activity per auth session. Process memory, like the rest of the
// local test server; a deployment needs a shared store.
const activityStore = globalThis as typeof globalThis & { __authActivity?: Map<string, number> };
const activity = (activityStore.__authActivity ??= new Map<string, number>());

/** Returns true when the session has been idle past the limit. Records activity otherwise. */
export function touchSession(key: string, nowMs: number, inactivityMs: number): boolean {
  const last = activity.get(key);
  if (last !== undefined && nowMs - last > inactivityMs) {
    activity.delete(key);
    return true;
  }
  activity.set(key, nowMs);
  if (activity.size > 10_000) {
    for (const [entry, seen] of activity) if (nowMs - seen > inactivityMs) activity.delete(entry);
  }
  return false;
}

// For private Route Handlers: returns the verified, age-confirmed actor, or a
// 401/403/503 response. Fails closed on every check.
export async function requireSession(): Promise<
  { session: VerifiedSession; supabase: SupabaseClient } | { response: Response }
> {
  const result = await getVerifiedSession();
  if (!result) return { response: authUnavailable() };
  const { session, supabase } = result;
  if (!session) {
    return { response: apiError(401, "UNAUTHENTICATED", "Please sign in to continue.") };
  }
  const key = session.sessionId ?? session.actor.userId;
  if (touchSession(key, Date.now(), policyFromEnvironment().inactivityMs)) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      response: apiError(401, "UNAUTHENTICATED", "Your session ended after a period of inactivity.", {
        sessionExpired: true,
      }),
    };
  }
  if (!session.ageConfirmed) {
    return {
      response: apiError(403, "UNAUTHENTICATED", "Please confirm your age to continue.", { ageRequired: true }),
    };
  }
  return { session, supabase };
}

// For cookie-authenticated mutations: same-origin check, then requireSession().
export async function requireMutationSession(request: Request) {
  if (!isSameOriginRequest(request)) {
    return { response: apiError(403, "INVALID_REQUEST", "This request was not allowed.") };
  }
  return requireSession();
}
