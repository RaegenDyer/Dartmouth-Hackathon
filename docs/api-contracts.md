# API contracts

These are proposed contracts for implementation. Routes marked "Local" exist
and store data in Supabase (or process memory with `COMPANION_STORAGE=memory`),
but still differ from the proposal as noted (JSON instead of SSE, no version checks).
All other routes below are intentionally absent until their authorization,
business logic, persistence, and tests are ready. Shared request/event schemas
are in `src/lib/contracts/index.ts`.

## Common rules

- Private routes also require the age confirmation (AA-1) and an active, non-idle session (AA-3); see [guardrails](guardrails.md).
- Verify Supabase identity on every private route. Never accept a trusted user ID,
  role, model name, system instruction, or message history from a browser request.
- Accept JSON with strict schemas. Text limit: 1,000 characters per user
  message; initial JSON body cap: 16 KiB. Reject oversized bodies before reading
  them fully. A browser-side limit is a convenience, not the server's limit.
- Persisted text rejects NUL characters and unpaired UTF-16 surrogates before
  reaching PostgreSQL. Valid Unicode, including emoji and multiline text, is
  supported. Schema string limits count JavaScript UTF-16 code units.
- Check request origin/CSRF on cookie-authenticated mutations. Keep public CORS
  disabled unless a specific cross-origin client is introduced.
- Map database snake_case to camelCase DTOs in the server repository layer.
- Return 401 for unauthenticated requests. Return 404 for an unavailable or
  non-owned resource to avoid disclosing another person's IDs.
- Mutable records use `expectedVersion`; atomically update with ownership and
  version predicates. A stale update returns 409 and a refreshed record only if
  the actor still owns it.
- Use `Cache-Control: no-store` for private responses. Do not log request content.

## Routes

| Method and path | Input / output | Status |
| --- | --- | --- |
| `GET /api/health` | `{status:"ok",service:"dartmouth-hackathon",stage:"foundation"}` | Implemented; public liveness only |
| `GET /api/auth/session` | `{authenticated:false}` or `{authenticated:true,userId,isAnonymous,ageConfirmed}` from verified claims; 503 if Supabase is unconfigured or verification is unavailable | Implemented |
| `POST /api/auth/sign-out` | Same-origin only (403 otherwise); ends this browser's session; 204 on success, safe 503 if sign-out cannot be confirmed | Implemented |
| `POST /api/auth/anonymous` | Same-origin; body `{ageConfirmed:true}` (AA-1); starts or upgrades an anonymous session; 10 per IP per 10 min; 503 if anonymous sign-in is off | Implemented |
| `GET /api/companion/status` | Public `{chatEnabled}` for the OP-1 kill switch | Implemented |
| `DELETE /api/account` | Same-origin; deletes the user's app data (DP-5) and signs out; 204 | Local |
| `GET /api/profile` | Current actor's profile and version | Planned |
| `PATCH /api/profile` | `updateProfileSchema`; saved profile | Planned |
| `POST /api/conversations` | `createConversationSchema`; `{conversationId}` (no version yet) | Implemented |
| `GET /api/conversations` | The caller's saved conversations `{id,title,startedAt,ended}`, newest first | Implemented |
| `GET /api/conversations/:id` | One conversation and its messages | Implemented |
| `DELETE /api/conversations/:id` | Deletes the conversation, its messages, and its pending suggestions; 204 | Implemented |
| `GET /api/conversations/:id/messages` | Cursor-paginated visible history | Planned |
| `POST /api/chat` | `sendMessageSchema`; one JSON reply `{reply,route,safetyTriggered,conversationEnded,crisis,memoriesUsed,memoryProposals,socialAction}` instead of SSE; 503 `chatDisabled` when the kill switch is on; repeated `clientRequestId` returns the same turn | Local |
| `GET /api/memory-proposals` | Pending proposals owned by actor | Local |
| `POST /api/memory-proposals/:id/accept` | `{content, keep}` (no `expectedVersion` yet); expires after the policy period unless `keep` (MP-3); approved memory | Local |
| `POST /api/memory-proposals/:id/dismiss` | No body yet; 204 | Local |
| `GET /api/memories` | Approved, unexpired memories (no versions yet) | Local |
| `PATCH /api/memories/:id` | `updateMemorySchema`; saved memory and context revision | Planned |
| `DELETE /api/memories/:id` | No body yet; 204 | Local |
| `POST /api/memories/:id/keep` | Removes the memory's expiry (MP-3) | Local |
| `GET /api/social-actions` | Actor's proposals and accepted/completed actions | Planned |
| `PATCH /api/social-actions/:id` | `updateSocialActionSchema`; saved action | Planned |

Route IDs are UUIDs and are validated separately from the body. List responses
will need cursor/limit schemas (default 20, maximum 100) before implementation.
Account deletion, history deletion, sign-in (method not yet chosen), auth UI/callbacks, and optional
dictation endpoints are also implementation tasks; no placeholder route claims
these work.

## Chat request

```json
{
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "clientRequestId": "22222222-2222-4222-8222-222222222222",
  "content": "I moved here recently and my weekend looks empty."
}
```

The client generates a new request ID for a new turn and reuses it for a retry of
that turn. The server must atomically reserve the turn before calling Anthropic.
A repeated completed request returns the stored result without calling the model
again. A duplicate while processing returns 409. A timeout or cancellation needs
an explicit terminal status so future retries do not remain permanently blocked.
The turn-reservation persistence/RPC is not included in this initial schema draft.

## Stream format

Use `Content-Type: text/event-stream`, UTF-8, and no shared caching. Each record
is `data: <JSON>\n\n`; JSON conforms to `chatEventSchema`.

```text
data: {"type":"start","requestId":"22222222-2222-4222-8222-222222222222","assistantMessageId":"33333333-3333-4333-8333-333333333333"}

data: {"type":"delta","text":"Let's find one small step that feels manageable."}

data: {"type":"complete","messageId":"33333333-3333-4333-8333-333333333333","memoryProposalIds":[],"socialActionIds":[],"contextEpoch":0}

```

Validate before opening the stream where possible. Once streaming starts, emit a
typed error event and close it on failure. `complete` is sent only after the
assistant message is durably persisted. Proposed memories/social actions may be
absent if structured extraction fails; never fabricate successful IDs. Render
text as text, not untrusted HTML.

On `CONTEXT_CHANGED`, cancel the provider request, discard the stale unfinished
answer, and refresh the UI's context. This limits further stale output; it cannot
recall bytes already delivered to the browser. The UI must not silently show a
partial answer as completed.

## Errors

Before streaming, return an appropriate HTTP status and:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This record changed. Refresh it and try again.",
    "requestId": "22222222-2222-4222-8222-222222222222"
  }
}
```

Use safe, user-facing messages; keep provider errors, SQL errors, tokens, and
personal content out of the response. Stream error events also include
`retryable`, and must not invite retries of a turn that is already completed or
whose status is unknown. Return `Retry-After` with 429 where applicable.

## Memory and social-action writes

Accepting a proposal explicitly includes the reviewed content, optional expiry,
and expected proposal version. The server calls the atomic approval operation
under the user's session and returns the approved memory. Repeat acceptance must
resolve to the same memory or a clear version conflict, not a second memory.
The HTTP `dismiss` route maps to the database's `reject_memory_proposal` RPC and
`rejected` proposal state; social actions use the separate `dismissed` state.

An expiry must be null or in the future when accepting/editing a memory. The
shared schema validates timestamp syntax; the server validates its meaning
against server time. Every retrieval still filters expired records.

For social actions, allow proposed -> accepted/dismissed and accepted ->
completed/dismissed. Completed and dismissed are terminal in the first version.
The request schema validates status names; the service/database must validate
transitions from the stored state and ownership. A model-generated proposal is
never evidence that a person accepted an action.
