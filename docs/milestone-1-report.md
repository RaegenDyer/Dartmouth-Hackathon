# Milestone 1 progress report

Status as of October 31, 2026. This covers the first review point: the scaffold,
CI pipeline, and the server-side companion modules with their tests. No new UI
was built. The team should review this foundation before UI work starts.

## Stack

The stack already in this repository stays the same:

| Concern | Choice | Notes |
| --- | --- | --- |
| Frontend and backend | Next.js App Router, TypeScript (strict) | Unchanged |
| Database | Supabase Postgres | Kept over SQLite/Docker because the repository already has a migration and 37 isolated schema checks. All companion data access goes through repository interfaces, with in-memory implementations for now. |
| Auth | Supabase Auth | Session refresh, verified session inspection, and sign-out plumbing exist. The sign-in method is still open. The installed SSR SDK defaults to browser-readable cookies; an httpOnly session policy has not been implemented. |
| LLM | Anthropic, server-only, through `src/lib/companion/llm` | Mock adapter by default (`LLM_ADAPTER=mock`) |
| Tests | Vitest, Playwright | Added |
| Evals | `evals/` data files and a runner | Added |

## What was built

- `conversation/respond.ts`: `respond(sessionId, userMessage)` returns
  `reply_text`, `memories_used`, and `safety_triggered`, plus `route`, `crisis`,
  `social_action`, and `memories_created`. It owns the safety check, boundary
  routing, disclosure enforcement, the weekly suggestion, and memory capture.
  `deleteAccountData(userId)` removes messages, sessions, memories, social
  actions, and the emergency contact.
- `safety/`: a deterministic pre-LLM check on the user message and a post-LLM
  check on the reply. Crisis copy shows 988 and 911, says the normal conversation
  is ending, asks no questions, and makes no promise of confidentiality. After a
  trigger, the session stays on the crisis path. Crisis message text is never
  stored or saved as a memory; a placeholder is stored instead. Safety events log
  timestamp, session ID, stage, and category only. Emergency contacts are
  AES-256-GCM encrypted at rest and decrypted only to build the crisis view.
- `memory/`: a store with list, list active, create, update text, set expiry,
  delete, and delete all. Deletion takes effect on the next `respond()` call.
  History from before a memory change or expiry is not sent to the model, so a
  deleted fact cannot come back through old turns. Capture is rule-based: only
  first-person facts are saved, and emotional, diagnostic, personality, crisis,
  and prompt-injection content is excluded. Memories are saved without a
  confirmation prompt; the user edits them afterwards.
- `disclosure/`: the model's `memories_used` is filtered to the user's active
  memories, and any memory the reply does not name gets a "You mentioned ..."
  prefix in code.
- `scheduler/`: at most one social action per user per seven days. It uses the
  user's stated plan if there is one, otherwise the fixed list, and it is phrased
  with "No pressure either way."
- `boundary/`: AI-status enforcement (human claims are replaced), the
  only-connection redirect, dependence replies, removal of permanence promises,
  refusal of prompt-reveal requests, and replacement of leaked context.
- `llm/`: the single adapter boundary. It owns the system prompt, puts memories
  in a delimited JSON data block, enforces a 9-second timeout, and parses the
  JSON reply. Includes a mock adapter and an Anthropic adapter.
- `limits.ts`, `rate-limit.ts`: limits of 4,000 characters per message, 280
  characters per memory, and 50 memories per user. Rate limits are 20 messages
  per minute per user and 60 per IP.
- CI: the `lint`, `typecheck`, `unit`, `e2e`, `security`, `build`, and
  `eval-fast` jobs, plus a separate `eval-llm` workflow and a PR template.

## What is stubbed or not yet built

- Sign-up/log-in flows, emergency contact form, feature route handlers, the
  chat UI, the memory panel, and the account-deletion endpoint. The deletion
  logic exists but no authenticated route calls it yet. UI work waits on the
  frontend style decision in `docs/design/README.md`, which is still pending.
- Supabase-backed repositories. Only the in-memory repositories exist so far.
- The rate limiter keeps its state in process memory. It works for one instance
  only; a deployment with several instances needs a shared store.
- E2E covers only the health endpoint and the home page. The five milestone
  flows are recorded as `test.fixme` and show as skipped.
- `eval-llm` has never been run. A model still needs to be selected before a live
  evaluation is deliberately enabled.
- Output escaping relies on React's default text rendering. That is still to be
  verified once the chat UI exists.
- Branch protection on `main` must be set in the GitHub settings. The available
  tools cannot configure it.

## Assumptions and open decisions

1. **Memory flow conflicts with the existing draft schema.** The migration and
   `docs/architecture.md` describe AI-proposed memories that the user approves
   before saving. The milestone spec forbids confirmation prompts and saves
   memories directly for review afterwards. The new modules follow the spec. The
   migration was left unchanged; the team should revise it before writing the
   Supabase repositories.
2. A session is one chat thread. The AI disclosure is added to the first reply
   of every new session.
3. Only-connection, dependence, and prompt-reveal replies use fixed copy written
   in code rather than model output, so these rules cannot be skipped. The
   `eval-llm` judge still grades those replies.
4. A post-LLM safety trigger on the model's reply also ends the session's normal
   conversation.
5. Memories are written in the second person ("Your roommate is hard to live
   with.").

## Acceptance status

| Test | Status |
| --- | --- |
| Unit: companion services, auth boundaries, and model timeout | Passing (178 tests) |
| eval-fast: safety recall 100%, benign false positives 0%, only-connection, human question, dependence, memory capture, disclosure, deletion, scenarios | Passing ([report](../evals/reports/eval-fast.md)) |
| F1 round-trip under 10 seconds and the thread persists after reload | Not yet testable (no UI or database) |
| F4 and the panel parts of F8 in the UI | Not built |
| eval-llm thresholds (B1 90%, B2 100%, B3 95%) | Not run |
| E2E milestone flows | Pending UI (`test.fixme`) |

**Caveat on the eval numbers.** The trigger, benign, and capture sets were
written together with the rule-based classifiers, so the 100% and 0% results
show the rules match the sets, not that they work in real use. The sets need
phrasings written by people other than the authors before anyone relies on these
numbers. Keyword safety detection is not reliable crisis detection, and this app
must not claim that it is.

## October 31 review and self-critique

Regression fixes now cover concurrent memory creation exceeding the 50-item cap,
invalid expiry dates and malformed Unicode, mutable Date/object references,
stale session updates recreating deleted sessions, and context changes while a
reply is generated. Overlapping turns are rejected within a service instance.
Memory changes advance a monotonic revision; clearing all memories keeps a
history cutoff so old transcript facts are not restored to model context.

The first context check compared memory contents. Self-review exposed an edit
followed by a revert within the same millisecond, which that approach missed;
the revision check and a dedicated regression replace it. Context revisions and
history cutoffs retain minimal invalidation state in the in-memory scaffold;
production account deletion needs a bounded lifecycle for that state.

The model deadline now returns a fallback even if an adapter ignores its abort
signal. This bounds waiting, not provider execution or cost. The post-generation
context check also precedes separate awaited suggestion/persistence operations;
it is not a transaction and does not eliminate every deletion or expiry race.
Production storage still requires durable turn claims, revision checks, and
atomic commits. Future routes/UI must surface `TURN_IN_PROGRESS` as a conflict.

Authentication now distinguishes provider unavailability from a missing/invalid
session, keeps public pages available on refresh exceptions, and returns a safe
503 when sign-out cannot be confirmed. Sign-out avoids a redundant claims
lookup. The encrypted development importer requires successful GPG decryption
and an ignored/untracked destination; tests also use Next.js's actual dotenv
loader to catch values its expansion would corrupt. Dictation corrections can
clear a revoked provisional preview without losing committed words.

Verification uses synthetic fixtures and mocked providers. Hosted JWTs, database
transactions/concurrency, browser audio, and the proposed approval-first memory
flow remain integration/product work. No paid model or voice calls are required
by these regression checks.

The full-history secret scan also identified a synthetic service-role JWT in
the original development-settings negative test. Its header/signature are
placeholders. One exact historical fingerprint is documented in
`.gitleaksignore`; no file or detector rule is excluded. The current fixture
constructs its dummy payload explicitly, and CI prints fully redacted finding
details for future scan failures.

## October 31 UI and memory quality pass

Neeraj's UI and saved-memory editor are merged through PR #6 (`2d7d6ca`). The
Warm hearth theme, generated raster icons, phone tabs, coming-soon labels, public
landing at `/`, and app at `/app` are preserved.

Natural chat could miss memory suggestions because capture required narrow
sentence starts, while duplicate detection reused a disclosure heuristic that
accepted 60% word overlap. Capture now recognizes common prefaces and explicit
independent factual clauses. Duplicate checks compare content, subject, and
qualifiers, keeping separate hobbies, people, changed facts, and new details
distinct. Expired rows do not suppress a freshly stated fact. Signatures are
prepared once per turn, and a full pending queue stops further insert attempts.
The limits remain two proposals per turn and 20 pending proposals, with explicit
Save required before any fact enters approved-memory context.

Self-critique of broader capture exposed possible extraction from quotes,
reported speech, hypotheticals, and negated facts. Source filtering and model
grounding regressions cover those cases, invented facts, Unicode place names,
and explicit opt-outs. These are conservative lexical checks, not semantic
proof; unusual paraphrases can still be missed. This pass adds no model call.

Synthetic long-content checks reproduced a document over 12,000 pixels tall on
desktop/tablet while the transcript also scrolled. The app shell now fits the
viewport, the transcript uses the remaining space, and side panels scroll
independently without wheel chaining. Tablet users switch panes through the
existing labeled rail. Auto-follow preserves older-message reading positions.
The first browser pass exposed absolutely positioned accessibility labels still
escaping the clipping boundary; positioned shell/transcript containers address
that cause without globally disabling landing-page scrolling. Short windows,
phone tabs, keyboard-focusable regions, and composer visibility have regressions.
Real mobile software-keyboard behavior still needs physical-device testing.

Saved-memory edits previously wrote text before checking expiry. Complete input
validation now precedes one SQL update and one in-memory context change. A
text-only edit preserves the original precise expiry; date controls use the
person's local calendar. Database failures, invalid combined edits, ownership,
same-origin checks, and maximum length have regressions. Separate competing
requests still lack optimistic version checks; a single-statement edit does not
resolve that broader concurrency requirement.

Startup catches network, HTTP, malformed payload, and memory-list loading
failures with a bounded retry flow. An unavailable suggestions endpoint no longer
looks like an empty inbox. Memory-edit failures keep the draft visible, prevent
duplicate pending saves, and allow retry. Browser tests use synthetic API
fixtures rather than participant data or paid models.

Verification for this quality pass: `npm run check` passes 328 unit tests plus
105 contract/runtime/voice/Tavus/environment/schema checks; the production build
passes; all 13 mocked eval suites pass; and 23 active browser checks pass (four
pre-existing milestone placeholders remain skipped). The browser suite includes
desktop, tablet, phone, and short windows and validates actual scroll geometry,
not only CSS declarations. These results do not establish complete natural-
language understanding, cross-instance atomic turns, or physical-device keyboard
coverage.
