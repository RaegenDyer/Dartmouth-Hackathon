import { privateHeaders, requireSession } from "@/lib/auth/server";
import { getCompanion } from "@/lib/companion/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const proposals = await getCompanion().deps.proposals.listPending(auth.session.actor.userId);
  return Response.json(
    { proposals: proposals.map(({ id, text, createdAt }) => ({ id, text, createdAt: createdAt.toISOString() })) },
    { headers: privateHeaders },
  );
}
