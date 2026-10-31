import { describe, expect, it } from "vitest";
import { enforceMemoryDisclosure, mentionFor, replyReferencesMemory } from "@/lib/companion/disclosure/enforce";
import type { Memory } from "@/lib/companion/memory/store";

const memory = (id: string, text: string): Memory => ({
  id,
  userId: "u1",
  text,
  createdAt: new Date(),
  expiresAt: null,
  editedByUser: false,
});

describe("memory disclosure enforcement", () => {
  const roommate = memory("m1", "Your roommate is hard to live with.");

  it("names a used memory the model did not mention", () => {
    const result = enforceMemoryDisclosure("Maybe set up a chat about chores?", ["m1"], [roommate]);
    expect(result.replyText.startsWith("You mentioned your roommate is hard to live with.")).toBe(true);
    expect(result.memoriesUsed).toEqual(["m1"]);
    expect(replyReferencesMemory(result.replyText, roommate.text)).toBe(true);
  });

  it("leaves replies that already name the memory unchanged", () => {
    const reply = "You mentioned your roommate is hard to live with. Want to talk it through?";
    expect(enforceMemoryDisclosure(reply, ["m1"], [roommate]).replyText).toBe(reply);
  });

  it("drops IDs that are not active for this user (deleted, expired, or invented)", () => {
    const result = enforceMemoryDisclosure("Hello!", ["deleted-id", "m1", "m1"], [roommate]);
    expect(result.memoriesUsed).toEqual(["m1"]);
    expect(enforceMemoryDisclosure("Hello!", ["deleted-id"], []).memoriesUsed).toEqual([]);
  });

  it("formats mentions in plain language", () => {
    expect(mentionFor("You like bouldering.")).toBe("You mentioned you like bouldering.");
  });
});
