import { isChatDisabled } from "@/lib/companion/server";

export const dynamic = "force-dynamic";

/** OP-1: public, non-personal status so the UI can show the static notice. */
export function GET() {
  return Response.json({ chatEnabled: !isChatDisabled() }, { headers: { "Cache-Control": "no-store" } });
}
