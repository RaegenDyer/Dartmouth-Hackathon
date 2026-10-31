import { apiError, privateHeaders, requireMutationSession, requireSession } from "@/lib/auth/server";
import { getCompanion } from "@/lib/companion/server";
import { isUuid } from "@/lib/http/request";

export const dynamic = "force-dynamic";

const notFound = () => apiError(404, "NOT_FOUND", "This conversation is not available.");

/** One saved conversation and its messages, for reopening it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
  const session = await companion.deps.sessions.get(id);
  if (!session || session.userId !== auth.session.actor.userId) return notFound();
  const messages = await companion.deps.messages.listForSession(id);
  return Response.json(
    {
      conversation: {
        id: session.id,
        title: session.title,
        startedAt: session.startedAt.toISOString(),
        ended: session.endedBySafety || session.endedBySessionCap,
      },
      messages: messages.map((message) => ({ id: message.id, role: message.role, text: message.text })),
    },
    { headers: privateHeaders },
  );
}

/** Deletes one conversation, its messages, and its pending suggestions. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
  if (!(await companion.deps.sessions.delete(auth.session.actor.userId, id))) return notFound();
  return new Response(null, { status: 204, headers: privateHeaders });
}
