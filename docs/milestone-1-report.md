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
| Auth | Supabase Auth (email and password) | Supabase hashes passwords with bcrypt and issues httpOnly session cookies through `@supabase/ssr`. This meets the hashing and cookie requirements without a second auth library. Not wired up yet. |
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

- Auth (sign up, log in, log out, emergency contact form), route handlers, the
  chat UI, the memory panel, and the account-deletion endpoint. The deletion
  logic exists but no authenticated route calls it yet. UI work waits on the
  frontend style decision in `docs/design/README.md`, which is still pending.
- Supabase-backed repositories. Only the in-memory repositories exist so far.
- The rate limiter keeps its state in process memory. It works for one instance
  only; a deployment with several instances needs a shared store.
- E2E covers only the health endpoint and the home page. The five milestone
  flows are recorded as `test.fixme` and show as skipped.
- `eval-llm` has never been run. This environment had no `ANTHROPIC_API_KEY`.
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
| Unit: memory store, scheduler, safety classifier, disclosure enforcement, `respond()` | Passing (141 tests) |
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
