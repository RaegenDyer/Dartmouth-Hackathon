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

  it("enforces the memory cap across concurrent creates", async () => {
    const store = new InMemoryMemoryRepository();
    const attempts = await Promise.allSettled(
      Array.from({ length: LIMITS.maxMemoriesPerUser + 5 }, (_, index) => store.create("u1", `Fact ${index}`, now)),
    );
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(LIMITS.maxMemoriesPerUser);
    expect(await store.list("u1")).toHaveLength(LIMITS.maxMemoriesPerUser);
  });

  it("refuses invalid expiry dates without changing the memory", async () => {
    const store = new InMemoryMemoryRepository();
    const memory = await store.create("u1", "You have a dog.", now);
    await expect(store.setExpiry("u1", memory.id, new Date("invalid"), now)).rejects.toMatchObject({
      code: "INVALID_EXPIRY",
    });
    expect((await store.list("u1"))[0]?.expiresAt).toBeNull();
  });

  it.each(["\uD800", "\uDC00"])("refuses malformed Unicode but preserves valid emoji", async (invalid) => {
    const store = new InMemoryMemoryRepository();
    await expect(store.create("u1", `Your name ${invalid}`, now)).rejects.toMatchObject({ code: "INVALID_TEXT" });
    expect((await store.create("u1", "You like cats 🐱.", now)).text).toBe("You like cats 🐱.");
  });

  it("does not expose the mutable context-invalidation timestamp", async () => {
    const clock = new Date(now);
    const store = new InMemoryMemoryRepository(() => clock);
    const memory = await store.create("u1", "You have a dog.", now);
    await store.updateText("u1", memory.id, "You have a cat.");
    clock.setTime(0);
    expect(await store.lastUserChangeAt("u1")).toEqual(now);
    (await store.lastUserChangeAt("u1"))?.setTime(0);
    expect(await store.lastUserChangeAt("u1")).toEqual(now);
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
