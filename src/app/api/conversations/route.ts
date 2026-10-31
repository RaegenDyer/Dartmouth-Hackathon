import { privateHeaders, requireMutationSession, requireSession } from "@/lib/auth/server";
import { chatDisabledResponse } from "@/lib/companion/http";
import { getCompanion, isChatDisabled } from "@/lib/companion/server";
import { createConversationSchema } from "@/lib/contracts";
import { readJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isChatDisabled()) return chatDisabledResponse();
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const body = await readJson(request, createConversationSchema);
  if ("response" in body) return body.response;

  const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
  const session = await companion.startConversation(auth.session.actor.userId);
  return Response.json({ conversationId: session.id }, { status: 201, headers: privateHeaders });
}

/** The caller's saved conversations, newest first. */
export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
  const sessions = await companion.deps.sessions.listForUser(auth.session.actor.userId);
  return Response.json(
    {
      conversations: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startedAt: session.startedAt.toISOString(),
        ended: session.endedBySafety || session.endedBySessionCap,
      })),
    },
    { headers: privateHeaders },
  );
}
