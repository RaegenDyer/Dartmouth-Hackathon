import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnvironment } from "@/lib/env/public";

// Use in Route Handlers and Server Actions, where session cookies can be written.
// Session-refresh Proxy and login screens are implementation tasks, not scaffolded auth.
export async function createRouteSupabaseClient() {
  const environment = getPublicEnvironment();
  const cookieStore = await cookies();
  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (updates) => {
          for (const { name, value, options } of updates) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}
