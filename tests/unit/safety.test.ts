import { describe, expect, it } from "vitest";
import { checkReply, checkUserMessage } from "@/lib/companion/safety/classifier";
import { CRISIS_REPLY_TEXT, buildCrisisView } from "@/lib/companion/safety/crisis";
import { decryptContact, encryptContact, normalizeContact, parseContactKey } from "@/lib/companion/safety/contact";
import { randomBytes } from "node:crypto";
import triggers from "../../evals/data/safety-triggers.json";
import benign from "../../evals/data/safety-benign.json";

describe("safety classifier", () => {
  it.each(triggers.map((item) => item.text))("routes trigger: %s", (text) => {
    expect(checkUserMessage(text).triggered).toBe(true);
  });

  it("keeps the benign false-positive rate at or below 10%", () => {
    const hits = benign.filter((item) => checkUserMessage(item.text).triggered).length;
    expect(hits / benign.length).toBeLessThanOrEqual(0.1);
  });

  it.each(["This commute is killing me", "I died laughing", "My phone died", "I want to die of embarrassment"])(
    "does not trigger on idiom: %s",
    (text) => expect(checkUserMessage(text).triggered).toBe(false),
  );

  it("flags harmful model output", () => {
    expect(checkReply("A lethal dose would be...").triggered).toBe(true);
    expect(checkReply("Sounds like a fun weekend!").triggered).toBe(false);
  });
});

describe("crisis view", () => {
  it("shows 988, says the conversation is ending, and asks no questions", () => {
    expect(CRISIS_REPLY_TEXT).toContain("988");
    expect(CRISIS_REPLY_TEXT).toMatch(/ending our normal conversation/);
    expect(CRISIS_REPLY_TEXT).not.toContain("?");
    expect(CRISIS_REPLY_TEXT).not.toMatch(/confidential/i);
  });

  it("displays a saved contact without claiming to contact them", () => {
    const view = buildCrisisView({ name: "Ana", relationship: "sister", phoneOrEmail: "ana@example.com" });
    expect(view.emergencyContact?.name).toBe("Ana");
    expect(view.contactNote).toMatch(/will not contact them/);
    expect(buildCrisisView(null).emergencyContact).toBeNull();
  });
});

describe("emergency contact encryption", () => {
  it("round-trips and does not store plaintext", () => {
    const key = randomBytes(32);
    const sealed = encryptContact({ name: "Ana", relationship: null, phoneOrEmail: "555-0100" }, key);
    expect(sealed).not.toContain("Ana");
    expect(decryptContact(sealed, key).phoneOrEmail).toBe("555-0100");
    expect(() => decryptContact(sealed, randomBytes(32))).toThrow();
  });

  it("treats every field as optional", () => {
    expect(normalizeContact({})).toBeNull();
    expect(normalizeContact({ name: "  " })).toBeNull();
    expect(normalizeContact({ relationship: "friend" })?.relationship).toBe("friend");
  });

  it("rejects malformed keys", () => {
    expect(() => parseContactKey("short")).toThrow();
    expect(parseContactKey(randomBytes(32).toString("base64"))).toHaveLength(32);
  });
});
