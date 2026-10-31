import { z } from "zod";

function isBrowserSafeSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;

  // Legacy anon keys are JWTs. This is only a configuration-type check:
  // Supabase still verifies the signature and authorizes each request.
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return false;
  }
  try {
    const payload: unknown = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon";
  } catch {
    return false;
  }
}

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ })),
  // Privileged secret/service_role keys must not be used by public clients.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().refine(isBrowserSafeSupabaseKey),
});

export function getPublicEnvironment() {
  // Next.js requires literal accesses to inline browser-safe settings.
  const parsed = publicEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new Error(`Missing or invalid application settings: ${fields.join(", ")}`);
  }
  return parsed.data;
}
