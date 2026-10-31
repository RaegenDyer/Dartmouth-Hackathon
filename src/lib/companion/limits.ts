// Defined limits enforced on the server. A browser-side limit is a convenience only.
export const LIMITS = {
  /** Matches sendMessageSchema in src/lib/contracts. */
  maxMessageLength: 4000,
  maxMemoryLength: 280,
  maxMemoriesPerUser: 50,
  /** Per-user and per-IP message sends within the rate-limit window. */
  messagesPerWindowPerUser: 20,
  messagesPerWindowPerIp: 60,
  rateLimitWindowMs: 60_000,
  /** Prior turns sent to the model as context. */
  historyTurns: 12,
  llmTimeoutMs: 9_000,
} as const;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
