import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  // The static public landing page needs no session refresh. Keep refresh on
  // app pages and API routes; each private handler still verifies identity.
  matcher: ["/app/:path*", "/api/((?!health$).*)"],
};
