import { isSameOriginRequest } from "@/lib/auth/origin";
import { apiError, authUnavailable, getVerifiedSession, privateHeaders } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError(403, "INVALID_REQUEST", "This request was not allowed.");
  }
  const result = await getVerifiedSession();
  if (!result) return authUnavailable();
  // Idempotent: signing out without a session still clears any stale cookies.
  // "local" ends this browser's session only, not the user's other devices.
  await result.supabase.auth.signOut({ scope: "local" });
  return new Response(null, { status: 204, headers: privateHeaders });
}
