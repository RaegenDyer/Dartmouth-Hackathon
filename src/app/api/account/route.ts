import { privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { deleteAccountData } from "@/lib/companion/conversation/respond";
import { getCompanion } from "@/lib/companion/server";

export const dynamic = "force-dynamic";

/**
 * DP-5: removes the user's messages, memories, suggestions, social actions, and
 * emergency contact, then ends the session. The anonymous Supabase auth record
 * itself needs an admin key to delete and is not removed by the app.
 */
export async function DELETE(request: Request) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  await deleteAccountData(getCompanion().deps, auth.session.actor.userId);
  await auth.supabase.auth.signOut({ scope: "local" });
  return new Response(null, { status: 204, headers: privateHeaders });
}
