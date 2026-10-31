import { z } from "zod";
import { apiError, privateHeaders, requireMutationSession } from "@/lib/auth/server";
import { memoryDto, memoryErrorResponse } from "@/lib/companion/http";
import { editMemory } from "@/lib/companion/memory/proposals";
import { LIMITS } from "@/lib/companion/limits";
import { getCompanion } from "@/lib/companion/server";
import { isUuid, readJson } from "@/lib/http/request";

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

// The in-memory store has no record versions yet, so this omits expectedVersion.
const editSchema = z
  .strictObject({
    content: z.string().trim().min(1).max(LIMITS.maxMemoryLength).optional(),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((body) => body.content !== undefined || body.expiresAt !== undefined);

/** Edit a saved memory's text and/or expiry (MP-3: the user sets expiry). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMutationSession(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return apiError(404, "NOT_FOUND", "This item is not available.");
  const body = await readJson(request, editSchema);
  if ("response" in body) return body.response;
  try {
    const companion = getCompanion({ supabase: auth.supabase, userId: auth.session.actor.userId });
    const memory = await editMemory(
      companion.deps,
      auth.session.actor.userId,
      id,
      {
        text: body.data.content,
        expiresAt:
          body.data.expiresAt === undefined
            ? undefined
            : body.data.expiresAt === null
              ? null
              : new Date(body.data.expiresAt),
      },
      new Date(),
    );
    return Response.json({ memory: memoryDto(memory) }, { headers: privateHeaders });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
