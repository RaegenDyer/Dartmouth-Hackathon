import { privateHeaders, requireMutationSession } from "@/lib/auth/server";
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

  const companion = getCompanion();
  const session = await companion.deps.sessions.create(auth.session.actor.userId, new Date());
  return Response.json({ conversationId: session.id }, { status: 201, headers: privateHeaders });
}
