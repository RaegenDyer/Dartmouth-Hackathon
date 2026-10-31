# Optional Tavus audio-output architecture

Status, October 31, 2026: prepare Tavus alongside Deepgram; defer Gemini while
credits are pending and defer mascot design. The current scope is audio only,
with no user camera capture, avatar video, or video-conversation interface.
Tavus is disabled by default. No live provider session has been created or tested.

## Boundaries and implemented preparation

Deepgram handles microphone transcription. The app backend and Claude generate
and validate the reply. Tavus is an optional output transport for supplied reply
text. Both providers can be configured independently; text-only operation needs
neither. Supabase remains responsible for app identity and saved data.

| Module | Implemented |
| --- | --- |
| `src/lib/tavus/contracts.ts` | Private audio-only session payload, safe session response parser, bounded supplied-text Echo message builder |
| `src/lib/tavus/server.ts` | Optional server-only key/PAL configuration |
| `src/lib/tavus/ports.ts` | Session-provider and receive-only audio-playback interfaces; no implementation |
| `scripts/check-tavus.mjs` | Pure request/response/message regression checks, without network access |

These are architecture contracts, not a REST/RTC integration. There is no API
route, browser SDK, microphone/camera capture, session store, or audio playback
implementation. Setting the flag does not activate a session.

## Intended mode and verification gap

Tavus documents `audio_only: true` to omit face video. Its default audio-only
pipeline still includes speech recognition, model processing, and TTS. Separately,
Echo mode accepts supplied text/audio; text Echo bypasses the conversation's
Perception/STT/LLM path and uses TTS. This is the intended way to keep our own
Deepgram/Claude pipeline authoritative. See [audio-only sessions](https://docs.tavus.io/sections/conversational-video-interface/conversation/customizations/audio-only)
and [Echo mode](https://docs.tavus.io/sections/conversational-video-interface/echo-mode).

**Echo plus audio-only together has not been verified on our account.** The
documentation describes them separately. The prepared payloads assume an Echo
PAL; the feature must remain off until this combination is tested. Do not
silently fall back to the full Tavus pipeline: that would change who generates
the reply and duplicate parts of the speech stack.

If this combination is unsupported, keep the Tavus adapter inactive and revisit
its role. Full audio-only Tavus with a custom model endpoint is a different
integration and needs an explicit architecture decision. No credit coverage,
latency, or cost advantage is established by these unit checks.

## Prepared request and message contracts

Creation is intended for `POST https://tavusapi.com/v2/conversations` using a
server-only `x-api-key`. The builder fixes `audio_only: true`, `require_auth:
true`, two participants, empty memory participant tags, no dynamic greeting,
recording disabled, and bounded duration/join/leave timeouts. The application
duration cap is five minutes; it is not a provider-plan limit. A preconfigured
PAL with an appropriate voice and no unwanted greeting is still required.

The response parser requires an active conversation, HTTPS Daily room URL, and
meeting token. It selects only those join fields. That does not verify token
signatures/expiry, prove session ownership, or establish provider retention.
Treat meeting tokens as bearer credentials: return only to the authenticated
owner with `Cache-Control: no-store`, pass via the RTC SDK's token option, and
keep them out of logs, browser URLs, and analytics. See [conversation API](https://docs.tavus.io/api-reference/conversations/create-conversation).

`buildTavusTextEcho` prepares a `conversation.echo` room message for the supplied
text, a stable UUID inference ID, and a boolean final-frame flag. It is an RTC
application message, not a REST text-to-speech endpoint. The UUID is not a billing
idempotency guarantee. Only send the final backend-approved answer, not raw model
JSON, personal context, or hidden memory instructions. See [Echo events](https://docs.tavus.io/sections/event-schemas/conversation-echo).

## Activation work, when requested

1. Store `TAVUS_API_KEY` and `TAVUS_PAL_ID` in ignored `.env.local` and Vercel
   server settings. Keep `TAVUS_AUDIO_ENABLED=false`. Configure Echo and validate
   it with audio-only, private-room access, no greeting, and no recording.
2. Implement verified-user create/end routes, same-origin checks, durable session
   ownership, concurrent-session limits, rate/cost budgets, and cleanup. Use the
   configured PAL, not a caller-selected PAL. Do not attach persistent Tavus
   memory identifiers. A provider timeout can leave creation's outcome unknown;
   reconcile instead of automatically creating a second billed session.
3. Implement the REST transport and the playback port. Join with camera and
   microphone capture disabled and receive audio only. User audio goes through
   Deepgram, not a second Tavus speech-recognition path. Confirm joined/ready state
   before sending text and handle stop, disconnect, interrupt, and late events.
4. End server sessions on normal cleanup using `POST /v2/conversations/{id}/end`;
   leaving a browser room alone is insufficient cleanup. Recover abandoned
   sessions and verify the application timeout. Ending and deleting provider
   records are different operations; review provider retention separately.
5. Add controls only after the collaborator-led style discussion. Verify behavior
   and billing on actual devices. Mascot design and video remain separate work.

The permanent key never belongs in `NEXT_PUBLIC_*`. Independent flags allow
Deepgram-only, Tavus output from typed input, or text-only preparation without
requiring both providers to run together.
