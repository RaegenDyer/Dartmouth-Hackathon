import { isSameOriginRequest } from "@/lib/auth/origin";
import { apiError, authUnavailable, getVerifiedSession, privateHeaders } from "@/lib/auth/server";
import { sessionFromVerifiedClaims } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

// Starts an anonymous Supabase session (the chosen local-testing sign-in). It
// does not survive sign-out, cleared cookies, or another device.
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError(403, "INVALID_REQUEST", "This request was not allowed.");
  }
  const result = await getVerifiedSession();
  if (!result) return authUnavailable();

  let session = result.session;
  if (!session) {
    const { error } = await result.supabase.auth.signInAnonymously();
    if (error) {
      // Typically "Anonymous sign-ins are disabled" in the Supabase dashboard.
      return apiError(503, "PROVIDER_UNAVAILABLE", "Could not start a session. Anonymous sign-in may be turned off.");
    }
    const { data } = await result.supabase.auth.getClaims();
    session = sessionFromVerifiedClaims(data?.claims);
    if (!session) return authUnavailable();
  }
  return Response.json(
    { authenticated: true, userId: session.actor.userId, isAnonymous: session.isAnonymous },
    { headers: privateHeaders },
  );
}
