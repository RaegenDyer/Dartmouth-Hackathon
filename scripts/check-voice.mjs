import assert from "node:assert/strict";
import test from "node:test";
import {
  createDictationBuffer,
  MAX_DICTATION_CHARACTERS,
  normalizeDeepgramTranscript,
} from "../src/lib/voice/input.ts";

const message = {
  type: "Results", is_final: false, channel_index: [0, 1],
  channel: { alternatives: [{ transcript: "Hello" }] },
};
const event = (text, final = false) => ({ type: "transcript", text, final });
const withText = (transcript) => ({
  ...message, channel: { alternatives: [{ transcript }] },
});

test("Deepgram Results select the first alternative and ignore provider metadata", () => {
  assert.deepEqual(normalizeDeepgramTranscript({
    ...message, metadata: { request_id: "ignored" },
    channel: { alternatives: [{ transcript: "  Hello  ", confidence: 0.9 }, { transcript: "Other" }] },
  }), event("Hello"));
  assert.deepEqual(normalizeDeepgramTranscript({ ...message, is_final: true }), event("Hello", true));
});

test("non-result, legacy provider, Flux, webhook, and malformed events are ignored", () => {
  for (const input of [null, {}, { ...message, type: "Metadata" },
    { ...message, type: "UtteranceEnd" }, { ...message, type: "TurnInfo" },
    { message }, { type: "transcript", role: "user", transcriptType: "final", transcript: "Hello" },
    { ...message, is_final: "true" }, { ...message, is_final: undefined },
    { ...message, channel: null }, { ...message, channel: { alternatives: [] } },
    { ...message, channel: { alternatives: [{}] } }]) {
    assert.equal(normalizeDeepgramTranscript(input), null);
  }
});

test("empty transcript corrections clear only the provisional preview", () => {
  const draft = createDictationBuffer("Committed");
  draft.apply(event("incorrect preview"));
  const emptyPartial = normalizeDeepgramTranscript(withText("  "));
  assert.deepEqual(emptyPartial, event(""));
  assert.equal(draft.apply(emptyPartial).text, "Committed");
  assert.equal(draft.read().partialText, "");
  draft.apply(event("another incorrect preview"));
  const emptyFinal = normalizeDeepgramTranscript({ ...withText(""), is_final: true });
  assert.deepEqual(emptyFinal, event("", true));
  assert.equal(draft.apply(emptyFinal).text, "Committed");
  assert.equal(draft.read().committedText, "Committed");
  assert.equal(draft.read().partialText, "");
});

test("only explicit single-channel microphone results are accepted", () => {
  for (const channel_index of [undefined, [], [0], [0, 2], [1, 2], [0, 1, 2], ["0", 1]]) {
    assert.equal(normalizeDeepgramTranscript({ ...message, channel_index }), null);
  }
  assert.deepEqual(normalizeDeepgramTranscript(message), event("Hello"));
});

test("segment finality follows is_final rather than speech_final", () => {
  assert.deepEqual(normalizeDeepgramTranscript({ ...message, speech_final: true }), event("Hello"));
  const draft = createDictationBuffer();
  draft.apply(normalizeDeepgramTranscript({ ...withText("First segment"), is_final: true, speech_final: false }));
  draft.apply(normalizeDeepgramTranscript(withText("next preview")));
  assert.equal(draft.read().text, "First segment next preview");
  draft.apply(normalizeDeepgramTranscript({ ...withText("next segment"), is_final: true, speech_final: true }));
  assert.equal(draft.read().text, "First segment next segment");
  assert.equal(draft.read().partialText, "");
});

test("normalization rejects invalid or oversized text while retaining emoji and international text", () => {
  for (const transcript of ["before\u0000after", "before\ud800after", "before\udfffafter",
    "x".repeat(MAX_DICTATION_CHARACTERS + 1), 123]) {
    assert.equal(normalizeDeepgramTranscript(withText(transcript)), null);
  }
  const transcript = "Hello \ud83d\ude00\nCaf\u00e9 \u4f60\u597d";
  assert.equal(normalizeDeepgramTranscript(withText(transcript)).text, transcript);
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
