import assert from "node:assert/strict";
import test from "node:test";
import {
  createDictationBuffer,
  MAX_DICTATION_CHARACTERS,
  normalizeVapiTranscript,
} from "../src/lib/voice/input.ts";

const message = { type: "transcript", role: "user", transcriptType: "partial", transcript: "Hello" };
const event = (text, final = false) => ({ type: "transcript", text, final });

test("Vapi user transcript events normalize finality and ignore extra provider metadata", () => {
  assert.deepEqual(normalizeVapiTranscript({ ...message, transcript: "  Hello  ", callId: "ignored" }),
    event("Hello"));
  assert.deepEqual(normalizeVapiTranscript({ ...message, transcriptType: "final" }), event("Hello", true));
});

test("assistant, model, tool, webhook, and malformed events never become user dictation", () => {
  for (const input of [null, {}, { ...message, role: "assistant" }, { ...message, role: "system" },
    { ...message, type: "model-output" }, { ...message, type: "tool-calls" },
    { message }, { ...message, transcriptType: "unknown" }, { ...message, transcript: "  " },
    { ...message, type: 'transcript[transcriptType="final"]' }]) {
    assert.equal(normalizeVapiTranscript(input), null);
  }
});

test("normalization rejects invalid or oversized text while retaining emoji and international text", () => {
  for (const transcript of ["before\u0000after", "before\ud800after", "before\udfffafter",
    "x".repeat(MAX_DICTATION_CHARACTERS + 1), 123]) {
    assert.equal(normalizeVapiTranscript({ ...message, transcript }), null);
  }
  const transcript = "Hello \ud83d\ude00\nCaf\u00e9 \u4f60\u597d";
  assert.equal(normalizeVapiTranscript({ ...message, transcript }).text, transcript);
});

test("partial updates replace the preview and final segments preserve previous committed text", () => {
  const draft = createDictationBuffer();
  assert.equal(draft.apply(event("I like")).text, "I like");
  assert.equal(draft.apply(event("I like hiking")).text, "I like hiking");
  assert.equal(draft.apply(event("I like hiking.", true)).committedText, "I like hiking.");
  assert.equal(draft.read().partialText, "");
  assert.equal(draft.apply(event("Also")).text, "I like hiking. Also");
  assert.equal(draft.apply(event("Also music.", true)).text, "I like hiking. Also music.");
});

test("editable drafts preserve formatting and replace provisional text", () => {
  const draft = createDictationBuffer("Typed introduction\n");
  assert.equal(draft.apply(event("spoken words", true)).text, "Typed introduction\nspoken words");
  draft.apply(event("provisional"));
  assert.equal(draft.edit("Edited \ud83d\ude00\ntext").text, "Edited \ud83d\ude00\ntext");
  assert.equal(draft.read().partialText, "");
  assert.equal(draft.apply(event("next", true)).text, "Edited \ud83d\ude00\ntext next");
});

test("combined text bounds include separators and rejected updates are atomic", () => {
  const draft = createDictationBuffer("a".repeat(MAX_DICTATION_CHARACTERS - 2));
  draft.apply(event("b"));
  const before = draft.read();
  assert.equal(before.text.length, MAX_DICTATION_CHARACTERS);
  assert.throws(() => draft.apply(event("bc", true)), RangeError);
  assert.deepEqual(draft.read(), before);
  assert.throws(() => draft.apply(event("bc")), RangeError);
  assert.deepEqual(draft.read(), before);
});

test("invalid edits, resets, and events never alter a valid draft or expose its input", () => {
  const draft = createDictationBuffer("Existing");
  const invalid = "PRIVATE\u0000TEXT";
  for (const mutate of [() => draft.edit(invalid), () => draft.reset(invalid),
    () => draft.apply(event(invalid)), () => draft.apply({ type: "model-output", text: "bad", final: true })]) {
    assert.throws(mutate, (error) => error instanceof TypeError && !error.message.includes("PRIVATE"));
    assert.equal(draft.read().text, "Existing");
  }
  assert.throws(() => createDictationBuffer("\ud800"), TypeError);
  assert.throws(() => createDictationBuffer("x".repeat(MAX_DICTATION_CHARACTERS + 1)), TypeError);
});

test("abort clears text and ignores late transcript events until reset", () => {
  const draft = createDictationBuffer("Initial");
  draft.apply(event("preview"));
  assert.deepEqual(draft.abort(), { text: "", committedText: "", partialText: "", aborted: true });
  assert.equal(draft.apply(event("late final", true)).text, "");
  assert.equal(draft.edit("late edit").text, "");
  assert.equal(draft.reset("New draft").aborted, false);
  assert.equal(draft.apply(event("new words", true)).text, "New draft new words");
});

test("snapshots cannot mutate internal text and repeated spoken phrases remain legitimate", () => {
  const draft = createDictationBuffer();
  draft.apply(event("yes", true));
  const snapshot = draft.read();
  snapshot.committedText = "Changed outside";
  assert.equal(draft.read().text, "yes");
  assert.equal(draft.apply(event("yes", true)).text, "yes yes");
});
