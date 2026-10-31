import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { memoryErrorResponse } from "@/lib/companion/http";
import { getCompanion } from "@/lib/companion/server";
import { isUuid } from "@/lib/http/request";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "This item is not available.");
  try {
    await getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId }).deps.memories.delete(
      auth.session.actor.userId,
      id,
    );
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
