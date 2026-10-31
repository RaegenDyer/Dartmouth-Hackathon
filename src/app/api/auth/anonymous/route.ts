import { z } from "zod";
import { sessionFromVerifiedClaims } from "@/lib/auth/actor";
import { isSameOriginRequest } from "@/lib/auth/origin";
import { apiError, authUnavailable, getVerifiedSession, privateHeaders } from "@/lib/auth/server";
import { FixedWindowRateLimiter } from "@/lib/companion/rate-limit";
import { clientAddress, readJson } from "@/lib/http/request";

export const dynamic = "force-dynamic";

// AA-1: the client must send the user's own confirmation that they are 18 or
// older. Users who say they are under 18 never reach this call.
const startSchema = z.strictObject({ ageConfirmed: z.literal(true) });

// AA-2: per-IP limit on new sessions (Supabase applies its own limit as well).
const limiterStore = globalThis as typeof globalThis & { __anonLimiter?: FixedWindowRateLimiter };
const limiter = (limiterStore.__anonLimiter ??= new FixedWindowRateLimiter(10, 10 * 60_000));

// Starts an anonymous Supabase session (the chosen local-testing sign-in). It
// does not survive sign-out, cleared cookies, or another device.
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError(403, "INVALID_REQUEST", "This request was not allowed.");
  }
  const body = await readJson(request, startSchema);
  if ("response" in body) return body.response;
  const result = await getVerifiedSession();
  if (!result) return authUnavailable();
  const { supabase } = result;

  let session = result.session;
  if (!session) {
    const retryMs = limiter.hit(`ip:${clientAddress(request)}`, Date.now());
    if (retryMs > 0) {
      const response = apiError(429, "RATE_LIMITED", "Too many new sessions. Try again later.");
      response.headers.set("Retry-After", String(Math.ceil(retryMs / 1000)));
      return response;
    }
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { age_confirmed: true } } });
    if (error) {
      // Typically "Anonymous sign-ins are disabled" in the Supabase dashboard.
      return apiError(503, "PROVIDER_UNAVAILABLE", "Could not start a session. Anonymous sign-in may be turned off.");
    }
  } else if (!session.ageConfirmed) {
    // An existing session from before the age gate: record the confirmation and
    // refresh so the new claim is in the token.
    const { error } = await supabase.auth.updateUser({ data: { age_confirmed: true } });
    if (error || (await supabase.auth.refreshSession()).error) return authUnavailable();
  }

  const { data } = await supabase.auth.getClaims();
  session = sessionFromVerifiedClaims(data?.claims);
  if (!session?.ageConfirmed) return authUnavailable();
  return Response.json(
    { authenticated: true, userId: session.actor.userId, isAnonymous: session.isAnonymous, ageConfirmed: true },
    { headers: privateHeaders },
  );
}
