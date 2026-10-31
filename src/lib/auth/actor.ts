import type { Actor } from "@/lib/domain/ports";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifiedSession {
  actor: Actor;
  isAnonymous: boolean;
}

// Maps claims returned by a verified getClaims() call. Never pass claims decoded
// from an unverified token or the user object from getSession().
export function sessionFromVerifiedClaims(claims: unknown): VerifiedSession | null {
  if (typeof claims !== "object" || claims === null) return null;
  const { sub, role, is_anonymous: isAnonymous } = claims as Record<string, unknown>;
  if (typeof sub !== "string" || !uuid.test(sub)) return null;
  if (role !== "authenticated") return null;
  return { actor: { userId: sub.toLowerCase() }, isAnonymous: isAnonymous === true };
}
