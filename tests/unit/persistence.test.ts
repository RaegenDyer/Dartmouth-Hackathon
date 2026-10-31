import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInMemoryCompanion } from "@/lib/companion/in-memory";
import type { LlmAdapter } from "@/lib/companion/llm/adapter";
import { acceptableModelSuggestion } from "@/lib/companion/memory/capture";
import { openText, sealText } from "@/lib/crypto/seal";

describe("DP-1: app-level encryption", () => {
  const key = randomBytes(32);

  it("round-trips text and binds it to its owner", () => {
    const sealed = sealText("I like chess.", key, "user-a");
    expect(sealed).not.toContain("chess");
    expect(openText(sealed, key, "user-a")).toBe("I like chess.");
    expect(() => openText(sealed, key, "user-b")).toThrow();
    expect(() => openText(sealed, randomBytes(32), "user-a")).toThrow();
  });

  it("detects tampering", () => {
    const [version, iv, tag, body] = sealText("hello", key, "user-a").split(".");
    const flipped = Buffer.from(body ?? "", "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => openText([version, iv, tag, flipped.toString("base64")].join("."), key, "user-a")).toThrow();
  });
});

describe("model memory suggestions", () => {
  it("keeps only grounded, allowed, second-person facts", () => {
    const said = "I really enjoy hiking on weekends and I've been trying to find a running group";
    expect(acceptableModelSuggestion("You enjoy hiking on weekends.", said)).toBe(true);
    expect(acceptableModelSuggestion("You're looking for a running group.", said)).toBe(true);
    expect(acceptableModelSuggestion("You seem lonely.", said)).toBe(false);
    expect(acceptableModelSuggestion("You like painting.", said)).toBe(false);
    expect(acceptableModelSuggestion("User enjoys hiking.", said)).toBe(false);
    expect(acceptableModelSuggestion("You have asthma when hiking.", "I have asthma when hiking")).toBe(false);
    expect(acceptableModelSuggestion("You want to end it.", "I want to end it all")).toBe(false);
  });

  it("turns them into suggestions only, never saved memories", async () => {
    const llm: LlmAdapter = {
      generate: async () => ({
        text: "Hiking sounds great.",
        memoriesUsed: [],
        memorySuggestions: ["You enjoy hiking on weekends.", "You seem stressed."],
      }),
    };
    const app = createInMemoryCompanion({ llm });
    const session = await app.deps.sessions.create("u1", new Date());
    const result = await app.respond(session.id, "I really enjoy hiking on weekends");
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual(["You enjoy hiking on weekends."]);
    expect(await app.deps.memories.list("u1")).toEqual([]);
    expect((await app.deps.sessions.get(session.id))?.title).toBe("I really enjoy hiking on weekends");
  });

  it("does not propose a suggestion that repeats another", async () => {
    const llm: LlmAdapter = {
      generate: async () => ({
        text: "Nice.",
        memoriesUsed: [],
        memorySuggestions: ["You just moved to Hanover for grad school."],
      }),
    };
    const app = createInMemoryCompanion({ llm });
    const session = await app.deps.sessions.create("u1", new Date());
    const result = await app.respond(session.id, "I just moved to Hanover for grad school.");
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual([
      "You just moved to Hanover for grad school.",
    ]);
  });

  it("IS-5: counts a memory the reply references even when the model does not list it", async () => {
    const llm: LlmAdapter = {
      generate: async () => ({
        text: "You mentioned you enjoy hiking on weekends. Try the river trail.",
        memoriesUsed: [],
      }),
    };
    const app = createInMemoryCompanion({ llm });
    const session = await app.deps.sessions.create("u1", new Date());
    const memory = await app.deps.memories.create("u1", "You enjoy hiking on weekends.", new Date());
    expect((await app.respond(session.id, "Any hiking ideas?")).memories_used).toEqual([memory.id]);
    expect((await app.deps.sessions.get(session.id))?.memoriesReferenced).toEqual([memory.id]);
  });

  it("offers up to three suggestions per message and skips passing states", async () => {
    const llm: LlmAdapter = {
      generate: async () => ({
        text: "Sounds like a full week.",
        memoriesUsed: [],
        memorySuggestions: ["You work at the hospital.", "You love bouldering.", "You're learning Spanish."],
      }),
    };
    const app = createInMemoryCompanion({ llm });
    const session = await app.deps.sessions.create("u1", new Date());
    const result = await app.respond(
      session.id,
      "Quick update: I work at the hospital here, I love bouldering, and I'm learning Spanish.",
    );
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual([
      "You work at the hospital.",
      "You love bouldering.",
      "You're learning Spanish.",
    ]);
    expect(
      acceptableModelSuggestion(
        "Your apartment still has boxes everywhere.",
        "My apartment still has boxes everywhere",
      ),
    ).toBe(false);
    expect(acceptableModelSuggestion("You're tired today.", "I'm tired today")).toBe(false);
  });
});
