import { describe, expect, it } from "vitest";
import { AI_DISCLOSURE, OPENING_MESSAGE } from "@/lib/companion/boundary/rules";
import { countQuestions } from "@/lib/companion/boundary/style";
import { createInMemoryCompanion } from "@/lib/companion/in-memory";
import type { LlmAdapter, LlmRequest } from "@/lib/companion/llm/adapter";
import { greeting } from "@/lib/ui/greeting";

describe("local-time greeting", () => {
  it("follows the visitor's hour, with late night as evening", () => {
    const at = (hours: number[]) => hours.map(greeting);
    expect(at([5, 8, 11])).toEqual(["good morning.", "good morning.", "good morning."]);
    expect(at([12, 14, 16])).toEqual(["good afternoon.", "good afternoon.", "good afternoon."]);
    expect(at([17, 21, 23, 0, 1, 4])).toEqual(Array(6).fill("good evening."));
  });
});

describe("Candid speaks first", () => {
  it("the opening message discloses AI status, asks one question, and names no memory", () => {
    expect(OPENING_MESSAGE).toMatch(/AI companion, not a person/);
    expect(countQuestions(OPENING_MESSAGE)).toBe(1);
  });

  it("saves the opener, does not repeat the disclosure, and keeps it out of model context", async () => {
    const requests: LlmRequest[] = [];
    const llm: LlmAdapter = {
      generate: async (request) => (requests.push(request), { text: "Nice, a quiet day.", memoriesUsed: [] }),
    };
    const app = createInMemoryCompanion({ llm });
    await app.deps.memories.create("u1", "You like chess.", new Date());
    const session = await app.startConversation("u1");

    const stored = await app.deps.messages.listForSession(session.id);
    expect(stored.map((message) => [message.role, message.text])).toEqual([["assistant", OPENING_MESSAGE]]);
    expect(OPENING_MESSAGE).not.toMatch(/chess/i);

    const result = await app.respond(session.id, "Pretty quiet, mostly reading.");
    expect(result.reply_text).not.toContain(AI_DISCLOSURE);
    expect(requests[0]?.history).toEqual([]);

    await app.respond(session.id, "Then I cooked dinner.");
    expect(requests[1]?.history[0]?.role).toBe("user");
  });
});
