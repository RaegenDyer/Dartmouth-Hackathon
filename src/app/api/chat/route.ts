import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { ConversationError } from "@/lib/companion/conversation/respond";
import { chatDisabledResponse } from "@/lib/companion/http";
import { consoleLogger } from "@/lib/companion/log";
import { getCompanion, isChatDisabled, respondOnce } from "@/lib/companion/server";
import { sendMessageSchema } from "@/lib/contracts";
import { clientAddress, readJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

// Local-testing version: returns one JSON reply rather than the planned SSE stream.
export async function POST(request: Request) {
  if (isChatDisabled()) return chatDisabledResponse();
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const body = await readJson(request, sendMessageSchema);
  if ("response" in body) return body.response;

  const { userId } = auth.session.actor;
  const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
  const session = await companion.deps.sessions.get(body.data.conversationId);
  if (!session || session.userId !== userId) {
    return apiError(404, "NOT_FOUND", "This conversation is not available.");
  }

  const retryMs = companion.rateLimiter.check(userId, clientAddress(request));
  if (retryMs > 0) {
    const response = apiError(429, "RATE_LIMITED", "You're sending messages quickly. Try again in a moment.");
    response.headers.set("Retry-After", String(Math.ceil(retryMs / 1000)));
    return response;
  }

  // CS-5: Vercel supplies the visitor's country; locally it is unknown.
  const country = request.headers.get("x-vercel-ip-country");
  try {
    const result = await respondOnce(companion, userId, body.data.clientRequestId, () =>
      companion.respond(session.id, body.data.content, { country, requestId: body.data.clientRequestId }),
    );
    return Response.json(
      {
        reply: result.reply_text,
        route: result.route,
        safetyTriggered: result.safety_triggered,
        conversationEnded: result.conversation_ended,
        crisis: result.crisis,
        memoriesUsed: result.memories_used,
        memoryProposals: result.memory_proposals,
        socialAction: result.social_action,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof ConversationError && error.code === "INVALID_MESSAGE") {
      return apiError(400, "INVALID_REQUEST", error.message);
    }
    if (error instanceof ConversationError) return apiError(404, "NOT_FOUND", "This conversation is not available.");
    consoleLogger({
      event: "route_error",
      at: new Date().toISOString(),
      route: "chat",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return apiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
