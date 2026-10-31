import { z } from "zod";
import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { memoryDto, memoryErrorResponse } from "@/lib/companion/http";
import { approveProposal } from "@/lib/companion/memory/proposals";
import { getCompanion } from "@/lib/companion/server";
import { isUuid, readJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

// The in-memory store has no record versions yet, so this omits expectedVersion.
const acceptSchema = z.strictObject({
  content: z.string().trim().min(1).max(500),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "This item is not available.");
  const body = await readJson(request, acceptSchema);
  if ("response" in body) return body.response;

  try {
    const memory = await approveProposal(
      getCompanion().deps,
      auth.session.actor.userId,
      id,
      { text: body.data.content, expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null },
      new Date(),
    );
    return Response.json({ memory: memoryDto(memory) }, { headers: privateHeaders });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
