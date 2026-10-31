import "server-only";
import type { ApiErrorCode } from "@/lib/contracts";
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

export function apiError(status: number, code: ApiErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: privateHeaders });
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

// For private Route Handlers: returns the verified actor, or a 401/503 response.
export async function requireSession(): Promise<
  { session: VerifiedSession; supabase: SupabaseClient } | { response: Response }
> {
  const result = await getVerifiedSession();
  if (!result) return { response: authUnavailable() };
  if (!result.session) {
    return { response: apiError(401, "UNAUTHENTICATED", "Please sign in to continue.") };
  }
  return { session: result.session, supabase: result.supabase };
}

// For cookie-authenticated mutations: same-origin check, then requireSession().
export async function requireMutationSession(request: Request) {
  if (!isSameOriginRequest(request)) {
    return { response: apiError(403, "INVALID_REQUEST", "This request was not allowed.") };
  }
  return requireSession();
}
