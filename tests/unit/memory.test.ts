import { describe, expect, it } from "vitest";
import { InMemoryMemoryRepository, MemoryError } from "@/lib/companion/memory/store";
import { extractMemoryCandidates } from "@/lib/companion/memory/capture";
import { LIMITS } from "@/lib/companion/limits";
import capture from "../../evals/data/memory-capture.json";

const now = new Date("2026-10-31T12:00:00Z");

describe("memory store", () => {
  it("lists, edits, expires, and deletes memories for the owner only", async () => {
    const store = new InMemoryMemoryRepository(() => now);
    const memory = await store.create("u1", "You like bouldering.", now);
    expect(memory).toMatchObject({ userId: "u1", expiresAt: null, editedByUser: false });

    const edited = await store.updateText("u1", memory.id, "You like climbing.");
    expect(edited).toMatchObject({ text: "You like climbing.", editedByUser: true });

    const expiry = new Date("2026-11-30T00:00:00Z");
    expect((await store.setExpiry("u1", memory.id, expiry, now)).expiresAt).toEqual(expiry);
    await expect(store.setExpiry("u1", memory.id, new Date("2020-01-01"), now)).rejects.toThrow(MemoryError);

    await expect(store.updateText("u2", memory.id, "stolen")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await store.list("u2")).toEqual([]);

    await store.delete("u1", memory.id);
    expect(await store.list("u1")).toEqual([]);
    expect(await store.lastUserChangeAt("u1")).toEqual(now);
  });

  it("excludes expired memories from active context", async () => {
    const store = new InMemoryMemoryRepository();
    const memory = await store.create("u1", "You have a dog.", now);
    await store.setExpiry("u1", memory.id, new Date(now.getTime() + 1000), now);
    expect(await store.listActive("u1", now)).toHaveLength(1);
    expect(await store.listActive("u1", new Date(now.getTime() + 1000))).toHaveLength(0);
    expect(await store.list("u1")).toHaveLength(1);
  });

  it("enforces text and count limits", async () => {
    const store = new InMemoryMemoryRepository();
    await expect(store.create("u1", "x".repeat(LIMITS.maxMemoryLength + 1), now)).rejects.toThrow(MemoryError);
    for (let index = 0; index < LIMITS.maxMemoriesPerUser; index += 1) await store.create("u1", `Fact ${index}`, now);
    await expect(store.create("u1", "One more", now)).rejects.toMatchObject({ code: "LIMIT_REACHED" });
  });
});

describe("memory capture", () => {
  it.each(capture.map((item) => [item.text, item.shouldCapture] as const))("%s -> %s", (text, shouldCapture) => {
    expect(extractMemoryCandidates(text).length > 0).toBe(shouldCapture);
  });

  it("restates facts in the second person, preserving names", () => {
    expect(extractMemoryCandidates("I just moved to Boston from Ohio.")).toEqual([
      "You just moved to Boston from Ohio.",
    ]);
    expect(extractMemoryCandidates("My roommate is hard to live with")).toEqual([
      "Your roommate is hard to live with.",
    ]);
  });

  it("never captures from crisis content", () => {
    expect(extractMemoryCandidates("I live in Hanover. I want to end my life.")).toEqual([]);
  });
});
