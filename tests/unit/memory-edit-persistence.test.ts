import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { editMemory } from "@/lib/companion/memory/proposals";
import { createSupabaseRepositories } from "@/lib/companion/supabase-store";
import { openText, sealText } from "@/lib/crypto/seal";

const now = new Date("2026-11-01T12:00:00Z");

function setup(failWrite = false) {
  const key = randomBytes(32);
  const ownerId = "owner-one";
  let row: Record<string, unknown> = {
    id: "memory-one",
    user_id: ownerId,
    content: sealText("You like climbing.", key, ownerId),
    created_at: now.toISOString(),
    expires_at: "2027-02-01T00:00:00.000Z",
    version: 1,
  };
  const update = vi.fn((changes: Record<string, unknown>) => ({
    eq: vi.fn(() => ({
      select: vi.fn(async () => {
        if (failWrite) return { data: null, error: { code: "57014" } };
        row = { ...row, ...changes, version: Number(row.version) + 1 };
        return { data: [row], error: null };
      }),
    })),
  }));
  const from = vi.fn(() => ({ update }));
  const db = { from } as unknown as SupabaseClient;
  const deps = createSupabaseRepositories(db, ownerId, key);
  return { deps, ownerId, key, update, from, stored: () => row };
}

describe("saved memory edits at the persistence boundary", () => {
  it("seals text and changes expiry in one database update", async () => {
    const { deps, ownerId, key, update, stored } = setup();
    const expiresAt = new Date("2026-12-01T12:00:00Z");
    const memory = await editMemory(deps, ownerId, "memory-one", { text: "You like chess.", expiresAt }, now);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toEqual({ content: expect.any(String), expires_at: expiresAt.toISOString() });
    expect(openText(String(stored().content), key, ownerId)).toBe("You like chess.");
    expect(memory).toMatchObject({ text: "You like chess.", expiresAt, editedByUser: true });
  });

  it("does not send any database update when one field fails validation", async () => {
    const { deps, ownerId, from } = setup();
    await expect(
      editMemory(deps, ownerId, "memory-one", { text: "You like chess.", expiresAt: new Date("2026-10-01") }, now),
    ).rejects.toMatchObject({ code: "INVALID_EXPIRY" });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not make separate writes or report success when the database rejects the edit", async () => {
    const { deps, ownerId, update, stored } = setup(true);
    const before = { ...stored() };
    await expect(
      editMemory(deps, ownerId, "memory-one", { text: "You like chess.", expiresAt: null }, now),
    ).rejects.toThrow("Storage memory update failed (57014).");
    expect(update).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual(before);
  });
});
