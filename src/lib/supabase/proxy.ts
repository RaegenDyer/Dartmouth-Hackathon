import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnvironmentSchema } from "@/lib/env/public";

// Refreshes the Supabase session cookie before Server Components and Route
// Handlers run. This is not authorization: private routes still verify identity.
export async function refreshSupabaseSession(request: NextRequest) {
  const parsed = publicEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  // The credential-free preparation app runs without Supabase settings.
  if (!parsed.success) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (updates, headers) => {
          for (const { name, value } of updates) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of updates) {
            response.cookies.set(name, value, options);
          }
          // Supabase supplies no-cache headers so refreshed cookies are not shared.
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between client creation and this call; it performs the refresh.
  await supabase.auth.getClaims();
  return response;
}
