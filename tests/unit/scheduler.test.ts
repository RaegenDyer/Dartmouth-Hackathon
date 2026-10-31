import { describe, expect, it } from "vitest";
import {
  InMemorySocialActionRepository,
  SOCIAL_ACTIONS,
  claimWeeklySuggestion,
  formatSuggestion,
  isSocialActionDue,
} from "@/lib/companion/scheduler/weekly";
import { WEEK_MS } from "@/lib/companion/limits";

const start = new Date("2026-10-31T12:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);

describe("weekly social action scheduler", () => {
  it("is due with no history or after seven days", () => {
    expect(isSocialActionDue(null, start)).toBe(true);
    expect(isSocialActionDue(start, at(WEEK_MS - 1))).toBe(false);
    expect(isSocialActionDue(start, at(WEEK_MS))).toBe(true);
  });

  it("produces at most one suggestion per seven days per user", async () => {
    const repo = new InMemorySocialActionRepository();
    const hourly = Array.from({ length: 24 * 30 }, (_, hour) => at(hour * 3_600_000));
    for (const time of hourly) await claimWeeklySuggestion(repo, "u1", time, []);
    const history = repo.all("u1");
    expect(history.length).toBe(5);
    for (let index = 1; index < history.length; index += 1) {
      const gap = (history[index]?.suggestedAt.getTime() ?? 0) - (history[index - 1]?.suggestedAt.getTime() ?? 0);
      expect(gap).toBeGreaterThanOrEqual(WEEK_MS);
    }
  });

  it("does not double-record under concurrent calls", async () => {
    const repo = new InMemorySocialActionRepository();
    const results = await Promise.all(Array.from({ length: 5 }, () => claimWeeklySuggestion(repo, "u1", start, [])));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("does not let returned timestamps or suggestions bypass the weekly quota", async () => {
    const repo = new InMemorySocialActionRepository();
    const suggestion = await claimWeeklySuggestion(repo, "u1", start, []);
    suggestion?.suggestedAt.setTime(start.getTime() - WEEK_MS);
    expect(await claimWeeklySuggestion(repo, "u1", start, [])).toBeNull();
    (await repo.lastSuggestedAt("u1"))?.setTime(0);
    const listed = repo.all("u1");
    listed[0]?.suggestedAt.setTime(0);
    expect(await repo.lastSuggestedAt("u1")).toEqual(start);
  });

  it("tracks users independently and prefers the user's stated plan", async () => {
    const repo = new InMemorySocialActionRepository();
    const planned = await claimWeeklySuggestion(repo, "u1", start, ["You want to try the pottery class."]);
    expect(planned?.source).toBe("user_plan");
    const fixed = await claimWeeklySuggestion(repo, "u2", start, []);
    expect(SOCIAL_ACTIONS).toContain(fixed?.action);
  });

  it("does not frame the suggestion as an obligation", () => {
    const text = formatSuggestion(SOCIAL_ACTIONS[0] as string);
    expect(text).not.toMatch(/\b(?:must|should|have to|need to)\b/i);
    expect(text).toMatch(/no pressure/i);
  });
});
