import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTavusAudioSessionRequest,
  buildTavusTextEcho,
  MAX_TAVUS_ECHO_CHARACTERS,
  MAX_TAVUS_SESSION_SECONDS,
  parseTavusAudioSessionResponse,
} from "../src/lib/tavus/contracts.ts";

const response = {
  conversation_id: "c123456",
  conversation_url: "https://tavus.daily.co/c123456",
  status: "active",
  meeting_token: "test-only-meeting-token",
};
const speech = {
  conversationId: "c123456",
  inferenceId: "11111111-1111-4111-8111-111111111111",
  text: "A response from our backend.",
};

test("audio session payload fixes private audio-only, bounded, nonrecording defaults", () => {
  const payload = buildTavusAudioSessionRequest({ palId: " pcb7a34da5fe " });
  assert.deepEqual(payload, {
    pal_id: "pcb7a34da5fe",
    audio_only: true,
    require_auth: true,
    max_participants: 2,
    participant_tags: [],
    dynamic_greeting: false,
    properties: {
      max_call_duration: MAX_TAVUS_SESSION_SECONDS,
      participant_left_timeout: 0,
      participant_absent_timeout: 30,
      enable_recording: false,
      auto_start_recording: false,
    },
  });
  assert.equal(buildTavusAudioSessionRequest({ palId: "p1", maxDurationSeconds: 60 })
    .properties.max_call_duration, 60);
});

test("call settings reject excessive duration, unsafe IDs, and caller-controlled overrides", () => {
  for (const input of [
    { palId: "p1", maxDurationSeconds: 0 },
    { palId: "p1", maxDurationSeconds: MAX_TAVUS_SESSION_SECONDS + 1 },
    { palId: "p1", maxDurationSeconds: 1.5 },
    { palId: "../another-pal" },
    { palId: "p1", require_auth: false },
    { palId: "p1", participant_tags: ["someone"] },
    { palId: "p1", audio_only: false },
  ]) assert.throws(() => buildTavusAudioSessionRequest(input), TypeError);
});

test("private response parsing selects only session fields and strips provider extras", () => {
  assert.deepEqual(parseTavusAudioSessionResponse({ ...response, metadata: "ignored" }), {
    conversationId: "c123456",
    conversationUrl: "https://tavus.daily.co/c123456",
    meetingToken: "test-only-meeting-token",
  });
});

test("private response requires active session and explicit nonempty token", () => {
  for (const input of [{ ...response, status: "ended" }, { ...response, meeting_token: "" },
    { ...response, meeting_token: undefined }, { ...response, meeting_token: "bad token" }]) {
    assert.throws(() => parseTavusAudioSessionResponse(input), TypeError);
  }
});

test("join URLs reject insecure or unexpected hosts, credentials, ports, and token queries", () => {
  for (const conversation_url of ["http://tavus.daily.co/c1", "https://example.com/c1",
    "https://tavus.daily.co.attacker.example/c1", "https://secret@tavus.daily.co/c1",
    "https://tavus.daily.co:444/c1", "https://tavus.daily.co/c1?t=secret",
    "https://tavus.daily.co/c1#secret", "https://tavus.daily.co/"]) {
    assert.throws(() => parseTavusAudioSessionResponse({ ...response, conversation_url }), TypeError);
  }
});

test("text echo sends only supplied text with stable turn ID and final-frame flag", () => {
  assert.deepEqual(buildTavusTextEcho(speech), {
    message_type: "conversation",
    event_type: "conversation.echo",
    conversation_id: "c123456",
    properties: {
      modality: "text", text: speech.text, inference_id: speech.inferenceId, done: true,
    },
  });
});

test("speech bounds and Unicode checks reject invalid requests without exposing text", () => {
  for (const text of [" ", "PRIVATE\u0000TEXT", "PRIVATE\ud800TEXT",
    "x".repeat(MAX_TAVUS_ECHO_CHARACTERS + 1)]) {
    assert.throws(() => buildTavusTextEcho({ ...speech, text }), (error) =>
      error instanceof TypeError && error.message === "Invalid Tavus speech request.");
  }
  assert.equal(buildTavusTextEcho({ ...speech, text: "Hello \ud83d\ude00\nCaf\u00e9" })
    .properties.text, "Hello \ud83d\ude00\nCaf\u00e9");
  assert.throws(() => buildTavusTextEcho({ ...speech, inferenceId: "retry" }), TypeError);
  assert.throws(() => buildTavusTextEcho({ ...speech, audio: "unexpected" }), TypeError);
});
