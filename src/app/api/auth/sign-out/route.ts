import { isSameOriginRequest } from "@/lib/auth/origin";
import { apiError, authUnavailable, isAuthConfigured, privateHeaders } from "@/lib/auth/server";
import { createRouteSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError(403, "INVALID_REQUEST", "This request was not allowed.");
  }
  if (!isAuthConfigured()) return authUnavailable();
  // Idempotent: signing out without a session still clears any stale cookies.
  // "local" ends this browser's session only, not the user's other devices.
  // No claims lookup is needed to clear this caller's own browser session.
  try {
    const supabase = await createRouteSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) return new Response(null, { status: 204, headers: privateHeaders });
  } catch {
    // Returned and thrown provider failures use the same safe response below.
  }
  return apiError(503, "PROVIDER_UNAVAILABLE", "Sign-out could not be confirmed. Please try again.");
}
