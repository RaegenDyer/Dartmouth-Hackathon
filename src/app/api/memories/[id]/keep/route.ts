import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { memoryDto, memoryErrorResponse } from "@/lib/companion/http";
import { getCompanion } from "@/lib/companion/server";
import { isUuid } from "@/lib/http/request";

export const dynamic = "force-dynamic";

/** MP-3: the user keeps a memory, removing its automatic expiry. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "This item is not available.");
  try {
    const memory = await getCompanion().deps.memories.setExpiry(auth.session.actor.userId, id, null, new Date());
    return Response.json({ memory: memoryDto(memory) }, { headers: privateHeaders });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
