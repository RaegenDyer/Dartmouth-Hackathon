import type { Actor } from "@/lib/domain/ports";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifiedSession {
  actor: Actor;
  isAnonymous: boolean;
  /** AA-1: the user confirmed they are 18 or older. */
  ageConfirmed: boolean;
  /** Supabase auth session ID, used for the inactivity timeout (AA-3). */
  sessionId: string | null;
}

// Maps claims returned by a verified getClaims() call. Never pass claims decoded
// from an unverified token or the user object from getSession().
export function sessionFromVerifiedClaims(claims: unknown): VerifiedSession | null {
  if (typeof claims !== "object" || claims === null) return null;
  const {
    sub,
    role,
    is_anonymous: isAnonymous,
    session_id: sessionId,
    user_metadata: metadata,
  } = claims as Record<string, unknown>;
  if (typeof sub !== "string" || !uuid.test(sub)) return null;
  if (role !== "authenticated") return null;
  const ageConfirmed =
    typeof metadata === "object" && metadata !== null && (metadata as Record<string, unknown>).age_confirmed === true;
  return {
    actor: { userId: sub.toLowerCase() },
    isAnonymous: isAnonymous === true,
    ageConfirmed,
    sessionId: typeof sessionId === "string" ? sessionId : null,
  };
}
