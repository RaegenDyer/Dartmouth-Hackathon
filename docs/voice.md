# Optional voice-input architecture

Status, October 30, 2026: Vapi is the selected optional voice provider because the
owner reported the Deepgram offer link was unavailable. Voice remains disabled
by default. This is architecture and tested transcript handling, not a live
microphone integration. Text input/output remains the working app scope.

## Implemented preparation

- `src/lib/voice/input.ts`: provider/session interfaces, a normalizer for standard
  Vapi SDK user transcript messages, and an editable in-memory dictation buffer.
- `src/lib/voice/server.ts`: separate server-only configuration. Disabled voice
  requires no Vapi credentials and does not affect Anthropic/Supabase setup.
- `scripts/check-voice.mjs` and the runtime checks: partial/final transcript
  handling, bounds, Unicode, editing, cancellation, and safe configuration errors.

No SDK transport, microphone capture, browser token endpoint, webhook, provider
account changes, audio storage, or spoken replies are implemented. Configuration
alone does not activate a call. No Vapi SDK dependency is installed yet.

## Intended path when activated

```mermaid
flowchart LR
  Person[Person explicitly starts dictation] --> Browser[Browser microphone]
  Browser -. future WebRTC transport .-> Vapi[Vapi]
  Vapi -. user transcript events .-> Draft[Editable local draft]
  Draft --> Review[Person reviews and presses Send]
  Review --> API[Normal authenticated chat API]
  API --> Claude[Planned server-side Anthropic chat]
```

Audio transport should connect the browser directly to Vapi. Vercel supplies a
bounded authenticated session bootstrap rather than proxying a long-lived audio
socket. That bootstrap and the chat route remain implementation work.

Use only standard SDK events with `type: "transcript"`, `role: "user"`, and
`transcriptType: "partial" | "final"`. Extra provider metadata is ignored.
Assistant, model, and tool messages never become user input. Webhook envelopes
and filtered-subscription event names need a separate adapter; they are not
accepted by this normalizer. See [Vapi web calls](https://docs.vapi.ai/quickstart/web)
and [event shapes](https://docs.vapi.ai/server-url/events).

Partial transcripts replace the provisional preview; finalized segments append
to committed draft text. The combined limit is 4,000 UTF-16 code units, matching
the chat request's string limit. Repeated phrases are legitimate; this buffer
does not guess whether identical final events are duplicates. The transport must
avoid replaying events. Invalid or excessive updates leave the previous draft
unchanged. Drafts are not automatically submitted, saved, or sent to Claude.

Create a fresh buffer for each capture session. Abort clears its text and ignores
late events. Stop and detach capture before handing the draft to normal editing;
`reset()` is an explicit local reset, not protection against events from an old
connection. A future transport must guard callbacks by session generation.

## Vapi is a voice pipeline, not confirmed standalone dictation

Vapi's standard pipeline combines transcription, a model, and speech synthesis.
Its `mute-assistant` control can silence the assistant while transcription
continues, but this does not establish that model/TTS work or charges stop.
Browser playback muting and `assistant-waits-for-user` also do not establish that.
Before live activation, verify the no-spoken-reply behavior, first-message race,
and billed services with a short controlled call. Keep the app's Anthropic chat
flow separate; never treat Vapi-generated responses as the app's saved answer.
See [Vapi live controls](https://docs.vapi.ai/calls/call-features).

## Configuration and remaining integration work

Keep these optional settings blank/disabled until voice is being implemented:

| Setting | Scope | Default |
| --- | --- | --- |
| `VOICE_INPUT_ENABLED` | Server configuration flag; `true` or `false` | `false` |
| `VAPI_PRIVATE_KEY` | Server only; private Vapi key | Unset |
| `VAPI_ASSISTANT_ID` | Server only; approved assistant UUID | Unset |

The configuration getter validates the key/ID only when enabled. It does not
prove the key is valid or that live voice is ready. Never serialize its returned
private configuration or put the private key in a `NEXT_PUBLIC_*` variable.

When activation is requested:

1. Configure the Vapi account/assistant and verify the behavior and billing above.
   Put the private key in ignored `.env.local` and Vercel server settings; keep
   the flag false while preparation is incomplete.
2. Implement verified-user bootstrap, origin/CSRF checks, durable per-user start
   budgets, concurrent-session limits, and safe cancellation. Issue a short-lived
   public-scope browser credential restricted to exact app origins and the chosen
   assistant; disallow transient assistants. Validate signing against Vapi.
   Tokens are not a substitute for call ownership or duration limits. See
   [Vapi JWT authentication](https://docs.vapi.ai/customization/jwt-authentication).
3. Configure a short server-enforced assistant duration. Turn off unnecessary
   recording/logging/transcript artifacts and monitoring/control access; verify
   provider retention separately. Muting and artifact settings do not establish
   zero retention or zero cost. See [call duration](https://docs.vapi.ai/documentation/assistants/conversation-behavior/call-timeout-settings)
   and [artifact settings](https://docs.vapi.ai/assistants/call-recording).
4. Add the browser SDK lazily and verify its Node/browser requirements before
   pinning a version. Require an explicit user gesture, microphone permission,
   and HTTPS. Confirm connection using SDK lifecycle events; clean up microphone
   tracks, listeners, pending starts, and active calls on stop/error/abort/unmount.
   Exercise permission refusal, timeouts, disconnects, and late events on devices.
5. Follow the collaborator-led [style workflow](design/README.md) before adding
   microphone controls. Present editable text and require Send. Validate that
   text again through the normal authenticated chat request schema.

No phone number, outbound call, or spoken-response feature is required for this
optional input architecture. Live call validation and browser tests remain open.
