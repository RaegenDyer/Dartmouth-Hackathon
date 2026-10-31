# Implementation plan

This is a handoff plan, not a list of completed features. Finish one complete
text flow before adding dictation or additional conversation scenarios.

## Foundation delivered

- Next.js/React/TypeScript project with a preparation page and liveness endpoint.
- Shared validation and streaming contracts, plus domain service interfaces.
- Server-only Anthropic client factory and Supabase browser/route factories.
- Application configuration example separate from management credentials.
- Draft SQL/data model and documented ownership/memory invariants.
- Contributor instructions and credential-free CI checks.
- Optional Vapi input interfaces, transcript normalization/editable buffer, and
  disabled server configuration; live audio/session transport is not implemented.

## Build order and acceptance criteria

| Order | Work area | Acceptance criteria |
| --- | --- | --- |
| 1 | Identity and database | Team chooses demo/participant login; implement refresh/sign-out; review and apply migration to a designated dev project; user A cannot read/write/reference user B's records |
| 2 | Chat service | Add atomic turn reservation and shared rate/token limits; implement authenticated stream with a configurable model and current context; duplicate submissions make one model call; timeout/cancel leaves a recoverable state |
| 3 | Interface | Discuss image-generated app designs informed by the 100 design masters with the collaborator leading frontend work; record their decision in docs/design/README.md before implementation; then build the selected scope with clear failure/retry states and no provider keys in browser code |
| 4 | Memory | Suggestion is visible as pending; user reviews exact text and expiry; approve/edit/delete work; expiry/reset and edits during streaming cannot silently reuse old context |
| 5 | Social action | One relevant proposal; explicit accept/dismiss; accepted action can be completed; illegal state transitions fail |
| 6 | Boundaries and data controls | Reviewed handoff/resources, no diagnosis/reliable-detection claims, account/history deletion, chosen retention rules, no raw personal content in operational logs |
| 7 | Deployment and demo | Create Vercel project; set only runtime variables; deploy after checks; exercise real login -> chat -> approved memory -> reload -> social step; record a demo within 2.5 minutes |

## Suggested contributor split

Assign actual people when the team is available. A small team can combine areas.

1. Interface and interaction: composer, streaming renderer, memory/action panels.
2. Identity and data: sessions, RLS/migrations, repositories, context versioning.
3. Conversation and policy: Anthropic stream, prompts, structured proposals,
   reviewed product-boundary routing.
4. Integration and demonstration: join the flows, exercise failure paths, prepare
   the pitch/demo, and manage deployment.

Shared contracts/schema need a short agreement before dependent branches start.
Feature work should use separate branches with small changes; avoid simultaneous
edits to the same contract or migration.

## First demonstration

Use a fictional adult newcomer with a few interests. Show a brief check-in, a
pending memory that the person edits and approves, that same memory after reload,
and one social action they choose. Show memory deletion as a real control.

Clearly distinguish a working feature from a planned one. Seven-day loneliness
and real-interaction measures are a later evaluation plan, not outcomes that a
hackathon prototype can already claim.

## Later additions

Optional Vapi microphone input should produce editable text and require a Send
action. The [voice-input foundation](voice.md) is prepared; implement the actual
SDK transport only after selecting supported browsers, verifying no spoken
replies and cost behavior, and handling microphone consent and audio retention.
Voice output, autonomous
outreach, live web search, a separate agent framework, and a vector database are
not prerequisites for this demo.
