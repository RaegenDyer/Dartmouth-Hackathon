import { z } from "zod";
import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { memoryDto, memoryErrorResponse } from "@/lib/companion/http";
import { approveProposal } from "@/lib/companion/memory/proposals";
import { getCompanion } from "@/lib/companion/server";
import { isUuid, readJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

// The in-memory store has no record versions yet, so this omits expectedVersion.
// keep=false applies the default expiry (MP-3); keep=true keeps it until deleted.
const acceptSchema = z.strictObject({
  content: z.string().trim().min(1).max(500),
  keep: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "This item is not available.");
  const body = await readJson(request, acceptSchema);
  if ("response" in body) return body.response;

  try {
    const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
    const memory = await approveProposal(
      companion.deps,
      auth.session.actor.userId,
      id,
      { text: body.data.content, keep: body.data.keep },
      new Date(),
      companion.policy,
    );
    return Response.json({ memory: memoryDto(memory) }, { headers: privateHeaders });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
