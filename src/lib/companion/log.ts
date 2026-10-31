// DP-3 / CS-7 / DB-5: every application log entry passes through this scrubber.
// Only allowlisted keys survive, and values that look like personal content
// (long text, emails, phone numbers, tokens) are redacted. Message text,
// memories, passwords, tokens, and contact details must never be logged.

export type LogEvent =
  | { event: "safety_triggered"; at: string; sessionId: string }
  | { event: "boundary_redirect"; at: string; userId: string; route: string; countForUser: number }
  | { event: "session_cap_reached"; at: string; sessionId: string }
  | { event: "safety_check_failed"; at: string; sessionId: string }
  | { event: "route_error"; at: string; route: string; errorName: string };

export type Logger = (event: LogEvent) => void;

const ALLOWED_KEYS = new Set(["event", "at", "sessionId", "userId", "route", "countForUser", "errorName"]);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{6,}\d/;
const TOKEN = /\b(?:sk-|sb_|sbp_|ghp_|github_pat_|eyJ)[A-Za-z0-9._-]{8,}/;
const SAFE_SHORT_VALUE = /^[A-Za-z0-9:._-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function scrubLogEvent(event: Record<string, unknown>): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === "string") {
      if (UUID.test(value) || ISO_TIME.test(value)) {
        clean[key] = value;
        continue;
      }
      const unsafe = EMAIL.test(value) || TOKEN.test(value) || PHONE.test(value);
      clean[key] = !unsafe && SAFE_SHORT_VALUE.test(value) ? value : "[redacted]";
    }
  }
  return clean;
}

export const consoleLogger: Logger = (event) => {
  console.warn(JSON.stringify(scrubLogEvent(event)));
};
