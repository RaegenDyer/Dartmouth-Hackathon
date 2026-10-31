import { WEEK_MS, normalizeForMatching } from "../limits";

// One optional social action per user per seven days, from a fixed list or a
// plan the user stated. Never framed as an obligation.
export const SOCIAL_ACTIONS: readonly string[] = [
  "text a classmate or coworker to grab a coffee",
  "go to one club or group meeting that looks interesting",
  "reply to a group chat invite you've been sitting on",
  "ask a neighbor or someone from your program for a local recommendation",
  "join a drop-in class or pickup game",
  "invite someone along to something you were already planning to do",
];

export interface SocialActionSuggestion {
  userId: string;
  action: string;
  source: "fixed_list" | "user_plan";
  suggestedAt: Date;
}

export interface SocialActionRepository {
  lastSuggestedAt(userId: string): Promise<Date | null>;
  /** Records only if no suggestion exists within the window; returns whether it was recorded. */
  recordIfDue(suggestion: SocialActionSuggestion): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}

export function isSocialActionDue(lastSuggestedAt: Date | null, now: Date): boolean {
  return lastSuggestedAt === null || now.getTime() - lastSuggestedAt.getTime() >= WEEK_MS;
}

const cloneSuggestion = (suggestion: SocialActionSuggestion): SocialActionSuggestion => ({
  ...suggestion,
  suggestedAt: new Date(suggestion.suggestedAt),
});

export class InMemorySocialActionRepository implements SocialActionRepository {
  private readonly history = new Map<string, SocialActionSuggestion[]>();

  async lastSuggestedAt(userId: string) {
    const items = this.history.get(userId) ?? [];
    const last = items.at(-1)?.suggestedAt;
    return last ? new Date(last) : null;
  }

  async recordIfDue(suggestion: SocialActionSuggestion) {
    // Check-and-insert happens synchronously, so concurrent callers cannot both record.
    const items = this.history.get(suggestion.userId) ?? [];
    if (!isSocialActionDue(items.at(-1)?.suggestedAt ?? null, suggestion.suggestedAt)) return false;
    items.push(cloneSuggestion(suggestion));
    this.history.set(suggestion.userId, items);
    return true;
  }

  async deleteAllForUser(userId: string) {
    this.history.delete(userId);
  }

  all(userId: string) {
    return (this.history.get(userId) ?? []).map(cloneSuggestion);
  }
}

const PLAN_PATTERN =
  /^you (?:plan|want|hope) to |^you(?:'re| are) (?:planning to|going to|thinking about joining|trying to) /;

/** Turns a remembered plan ("You want to try the climbing gym.") into an action. */
export function planFromMemory(memoryText: string): string | null {
  const normalized = normalizeForMatching(memoryText).replace(/[.!]+$/, "");
  return PLAN_PATTERN.test(normalized) ? `take one step on the plan you mentioned (${normalized})` : null;
}

export function chooseSocialAction(userId: string, now: Date, memoryTexts: readonly string[]) {
  const plan = memoryTexts.map(planFromMemory).find((value): value is string => value !== null);
  if (plan) return { action: plan, source: "user_plan" as const };
  const week = Math.floor(now.getTime() / WEEK_MS);
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { action: SOCIAL_ACTIONS[(week + hash) % SOCIAL_ACTIONS.length] as string, source: "fixed_list" as const };
}

export function formatSuggestion(action: string): string {
  return `One small idea for this week, only if it sounds good: ${action}. No pressure either way.`;
}

/** Returns a suggestion when one is due and records it; otherwise null. */
export async function claimWeeklySuggestion(
  repository: SocialActionRepository,
  userId: string,
  now: Date,
  memoryTexts: readonly string[],
): Promise<SocialActionSuggestion | null> {
  if (!isSocialActionDue(await repository.lastSuggestedAt(userId), now)) return null;
  const choice = chooseSocialAction(userId, now, memoryTexts);
  const suggestion: SocialActionSuggestion = { userId, ...choice, suggestedAt: new Date(now) };
  return (await repository.recordIfDue(suggestion)) ? suggestion : null;
}
