// Defined limits enforced on the server. A browser-side limit is a convenience only.
export const LIMITS = {
  /** MB-6. Matches sendMessageSchema in src/lib/contracts. */
  maxMessageLength: 1000,
  maxMemoryLength: 280,
  /** MP-5. */
  maxMemoriesPerUser: 200,
  /** Per-user and per-IP message sends within the rate-limit window. */
  messagesPerWindowPerUser: 20,
  messagesPerWindowPerIp: 60,
  rateLimitWindowMs: 60_000,
  /** Prior turns sent to the model as context. */
  historyTurns: 12,
  llmTimeoutMs: 20_000,
  /** CS-2: a safety check slower than this fails closed. */
  safetyCheckTimeoutMs: 2_000,
} as const;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

/**
 * Guardrail values the team has not decided yet (GUARDRAILS.md "Open decisions").
 * Defaults are the examples from that document; each can be overridden by an
 * environment variable without a code change.
 */
export interface GuardrailPolicy {
  /** DB-3: session length cap. */
  sessionCapMs: number;
  /** MP-3: memories expire unless the user keeps them. */
  memoryExpiryMs: number;
  /** DP-4: message retention unless the user keeps the thread. */
  messageRetentionMs: number;
  /** AA-3: sign out after this much inactivity. */
  inactivityMs: number;
}

export const DEFAULT_POLICY: GuardrailPolicy = {
  sessionCapMs: 45 * MINUTE_MS,
  memoryExpiryMs: 90 * DAY_MS,
  // DP-4 decision (Neeraj Kumar, 2026-10-31): conversations are saved until the
  // user deletes them. Set MESSAGE_RETENTION_DAYS to add automatic deletion.
  messageRetentionMs: Number.POSITIVE_INFINITY,
  inactivityMs: 30 * MINUTE_MS,
};

function positiveNumber(value: string | undefined, fallback: number, unitMs: number): number {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed * unitMs : fallback;
}

export function policyFromEnvironment(env: Record<string, string | undefined> = process.env): GuardrailPolicy {
  return {
    sessionCapMs: positiveNumber(env.SESSION_LENGTH_CAP_MINUTES, DEFAULT_POLICY.sessionCapMs, MINUTE_MS),
    memoryExpiryMs: positiveNumber(env.MEMORY_EXPIRY_DAYS, DEFAULT_POLICY.memoryExpiryMs, DAY_MS),
    messageRetentionMs: positiveNumber(env.MESSAGE_RETENTION_DAYS, DEFAULT_POLICY.messageRetentionMs, DAY_MS),
    inactivityMs: positiveNumber(env.SESSION_INACTIVITY_MINUTES, DEFAULT_POLICY.inactivityMs, MINUTE_MS),
  };
}

/** Lowercase, straighten quotes, and collapse whitespace for pattern matching. */
export function normalizeForMatching(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
