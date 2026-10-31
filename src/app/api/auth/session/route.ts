import { authUnavailable, getVerifiedSession, privateHeaders } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Reports the caller's own verified session. Signed-out callers get 200 with
// authenticated: false so the UI can choose what to show.
export async function GET() {
  const result = await getVerifiedSession();
  if (!result) return authUnavailable();
  const body = result.session
    ? {
        authenticated: true,
        userId: result.session.actor.userId,
        isAnonymous: result.session.isAnonymous,
      }
    : { authenticated: false };
  return Response.json(body, { headers: privateHeaders });
}
