import { privateHeaders, requireSession } from "@/lib/auth/server";
import { memoryDto } from "@/lib/companion/http";
import { getCompanion } from "@/lib/companion/server";

export const dynamic = "force-dynamic";

/** Approved, unexpired memories: exactly what the model may see. */
export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const memories = await getCompanion({
    supabase: auth.supabase,
    userId: auth.session.actor.userId,
  }).deps.memories.listActive(auth.session.actor.userId, new Date());
  return Response.json({ memories: memories.map(memoryDto) }, { headers: privateHeaders });
}
