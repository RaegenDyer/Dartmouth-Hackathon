import { describe, expect, it } from "vitest";
import { createInMemoryCompanion } from "@/lib/companion/in-memory";
import type { LlmAdapter } from "@/lib/companion/llm/adapter";
import { acceptableModelSuggestion, extractMemoryCandidates } from "@/lib/companion/memory/capture";
import { MAX_PENDING_PROPOSALS } from "@/lib/companion/memory/proposals";

const now = new Date("2026-10-31T12:00:00Z");

async function setup(suggestions: string[] = []) {
  const llm: LlmAdapter = {
    generate: async () => ({ text: "Thanks for sharing that.", memoriesUsed: [], memorySuggestions: suggestions }),
  };
  const app = createInMemoryCompanion({ llm, now: () => now });
  const session = await app.deps.sessions.create("u1", now);
  return { app, session };
}

describe("memory suggestions from natural chat", () => {
  it("recovers volunteered facts when the model omits them", async () => {
    const { app, session } = await setup();
    const result = await app.respond(session.id, "Honestly, I really enjoy bouldering on weekends.");
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual([
      "You really enjoy bouldering on weekends.",
    ]);
    expect(await app.deps.memories.list("u1")).toEqual([]);
  });

  it("separates explicit everyday facts from an independent feelings clause", () => {
    expect(extractMemoryCandidates("I feel overwhelmed, and I work at Dartmouth.")).toEqual(["You work at Dartmouth."]);
    expect(extractMemoryCandidates("I enjoy hiking and I'm feeling lonely.")).toEqual(["You enjoy hiking."]);
    expect(extractMemoryCandidates("I have asthma and I play guitar.")).toEqual(["You play guitar."]);
  });

  it("recognizes current activities and recent facts in ordinary phrasing", () => {
    expect(extractMemoryCandidates("Well, honestly, I'm currently studying computer science.")).toEqual([
      "You're currently studying computer science.",
    ]);
    expect(extractMemoryCandidates("I've recently moved to Hanover.")).toEqual(["You've recently moved to Hanover."]);
  });

  it.each([
    ["Please remember that I like hiking.", "You like hiking."],
    ["Can you remember that I work at Dartmouth?", "You work at Dartmouth."],
    ["Could you please save that I'm studying computer science?", "You're studying computer science."],
    ["Remember I play guitar.", "You play guitar."],
    ["Please save that my favorite food is pho.", "Your favorite food is pho."],
  ])("offers an asserted fact from an explicit save request: %s", async (said, expected) => {
    expect(extractMemoryCandidates(said)).toEqual([expected]);
    expect(acceptableModelSuggestion(expected, said)).toBe(true);
    const { app, session } = await setup([expected]);
    expect((await app.respond(session.id, said)).memory_proposals.map((proposal) => proposal.text)).toEqual([expected]);
    expect(await app.deps.memories.list("u1")).toEqual([]);
  });

  it.each([
    "Do I like hiking?",
    "Can you remember if I like hiking?",
    "Please remember that if I like hiking, I might join a club.",
    'Please remember that "I like hiking."',
    '"Please remember that I like hiking."',
    "My friend said please remember that I like hiking.",
    "Please remember that I like hiking. Please don't save this.",
  ])("does not turn an ordinary, quoted, hypothetical, or declined question into a fact: %s", (said) => {
    expect(extractMemoryCandidates(said)).toEqual([]);
    expect(acceptableModelSuggestion("You like hiking.", said)).toBe(false);
  });

  it.each([
    'My friend said "I enjoy hiking and I play guitar."',
    '"I like hiking and I play guitar."',
    'My friend said "I enjoy hiking. I play guitar."',
    "My friend said 'I enjoy hiking. I play guitar.'",
    "If I moved to Hanover and I joined the running club, would I fit in?",
    "I have never said I enjoy hiking and I play guitar.",
  ])("does not lift assertions out of quoted, reported, or hypothetical speech: %s", (message) => {
    expect(extractMemoryCandidates(message)).toEqual([]);
  });

  it("still recognizes the user's own unquoted fact after quoted speech", () => {
    expect(extractMemoryCandidates('My friend said "I enjoy hiking. I play guitar." I live in Hanover.')).toEqual([
      "You live in Hanover.",
    ]);
  });

  it("respects an explicit request not to prompt to save the message", async () => {
    const said = "I enjoy hiking. Please don't remember this.";
    expect(extractMemoryCandidates(said)).toEqual([]);
    expect(acceptableModelSuggestion("You enjoy hiking.", said)).toBe(false);
    const { app, session } = await setup(["You enjoy hiking."]);
    expect((await app.respond(session.id, said)).memory_proposals).toEqual([]);
  });

  it.each([
    ["You like hiking.", 'My friend said "I enjoy hiking. I play guitar."'],
    ["You live in Hanover.", "If I live in Hanover and I join a club, would that help?"],
    ["You like hiking.", "My friend likes hiking."],
    ["You like hiking.", "I don't like hiking."],
    ["You like hiking.", "I hate hiking."],
    ["You work at Dartmouth.", "I used to work at Dartmouth."],
    ["You like hiking.", "I like painting and I don't like hiking."],
    ["You have a dog.", "I have a cat."],
    ["You live in 上海.", "I live in 北京."],
    ["You enjoy swimming and running.", "I enjoy hiking and running."],
  ])("refuses ungrounded or contradicted model suggestions: %s / %s", (suggestion, said) => {
    expect(acceptableModelSuggestion(suggestion, said)).toBe(false);
  });

  it("keeps grounded paraphrases and uses the matching assertion's negation", () => {
    const said = "I really enjoy hiking on weekends and I've been trying to find a running group.";
    expect(acceptableModelSuggestion("You enjoy hiking on weekends.", said)).toBe(true);
    expect(acceptableModelSuggestion("You're looking for a running group.", said)).toBe(true);
    expect(acceptableModelSuggestion("You like painting.", "I like painting and I don't like hiking.")).toBe(true);
    expect(acceptableModelSuggestion("You don't like hiking.", "I like painting and I don't like hiking.")).toBe(true);
  });

  it("keeps the two-suggestion cap when a message contains several explicit facts", async () => {
    const { app, session } = await setup();
    const result = await app.respond(session.id, "I live in Hanover and I play guitar and I enjoy bouldering.");
    expect(result.memory_proposals).toHaveLength(2);
    expect(await app.deps.memories.list("u1")).toEqual([]);
  });
});

describe("proposal duplicate detection", () => {
  it("does not confuse different hobbies that share a schedule", async () => {
    const { app, session } = await setup();
    await app.deps.memories.create("u1", "You enjoy hiking on weekends.", now);
    const result = await app.respond(session.id, "I enjoy painting on weekends.");
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual(["You enjoy painting on weekends."]);
  });

  it.each(["Your roommate likes hiking.", "Your roommates enjoy hiking."])(
    "does not treat someone else's interest as the user's saved fact: %s",
    async (previous) => {
      const { app, session } = await setup();
      await app.deps.memories.create("u1", previous, now);
      expect(
        (await app.respond(session.id, "I enjoy hiking.")).memory_proposals.map((proposal) => proposal.text),
      ).toEqual(["You enjoy hiking."]);
    },
  );

  it("allows new details alongside a pending fact while suppressing an unchanged restatement", async () => {
    const { app, session } = await setup();
    await app.respond(session.id, "I work at Dartmouth.");
    const result = await app.respond(session.id, "I work at Dartmouth library.");
    expect(result.memory_proposals.map((proposal) => proposal.text)).toEqual(["You work at Dartmouth library."]);
    expect((await app.respond(session.id, "I work at Dartmouth.")).memory_proposals).toEqual([]);
  });

  it("still deduplicates commonplace preference paraphrases", async () => {
    const { app, session } = await setup();
    await app.deps.memories.create("u1", "You love hiking on weekends.", now);
    expect((await app.respond(session.id, "I enjoy hiking on weekends.")).memory_proposals).toEqual([]);
  });

  it.each(["You don't like hiking.", "You used to like hiking.", "You want to like hiking."])(
    "does not mistake a changed fact for an existing one: %s",
    async (previous) => {
      const { app, session } = await setup();
      await app.deps.memories.create("u1", previous, now);
      expect(
        (await app.respond(session.id, "I like hiking.")).memory_proposals.map((proposal) => proposal.text),
      ).toEqual(["You like hiking."]);
    },
  );

  it("keeps different Unicode place names distinct", async () => {
    const { app, session } = await setup();
    await app.deps.memories.create("u1", "You live in 北京.", now);
    expect(
      (await app.respond(session.id, "I live in 上海.")).memory_proposals.map((proposal) => proposal.text),
    ).toEqual(["You live in 上海."]);
  });

  it("does not let an expired memory suppress a newly volunteered fact", async () => {
    const { app, session } = await setup();
    await app.deps.memories.create(
      "u1",
      "You enjoy hiking.",
      new Date(now.getTime() - 2000),
      new Date(now.getTime() - 1000),
    );
    expect(
      (await app.respond(session.id, "I enjoy hiking.")).memory_proposals.map((proposal) => proposal.text),
    ).toEqual(["You enjoy hiking."]);
  });

  it("preserves the pending-review cap instead of raising it to show more prompts", async () => {
    const { app, session } = await setup();
    for (let index = 0; index < MAX_PENDING_PROPOSALS; index += 1) {
      await app.deps.proposals.create("u1", `Your daily fact ${index}.`, now, session.id);
    }
    expect((await app.respond(session.id, "I play guitar.")).memory_proposals).toEqual([]);
    expect(await app.deps.proposals.listPending("u1")).toHaveLength(MAX_PENDING_PROPOSALS);
  });
});
