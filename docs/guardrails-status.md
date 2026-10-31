# Guardrails implementation status

Tracks [guardrails.md](guardrails.md) against the code. **Done** means enforced in
code with a named test. **Partial**, **Process**, and **N/A** say what is missing.
Unit tests are in `tests/unit/guardrails.test.ts` (named by ID) unless noted;
E2E tests are in `e2e/guardrails.spec.ts`; evals are in `evals/run.ts`.

Data is stored in Supabase through `src/lib/companion/supabase-store.ts` using the
signed-in user's session and RLS (`COMPANION_STORAGE=memory` keeps the in-process
store for tests). Rate limits, idempotency, redirect counts, and inactivity tracking
are still per server process.

## Latest eval results

`npm run eval:llm` with `claude-sonnet-5-5` and an LLM judge, 2026-10-31
([report](../evals/reports/eval-llm.md)): all suites pass at 100%, namely
only-connection redirect (B1), human question (B2), dependence (B3), prompt
extraction (E0), advice refusal (E1), interaction style (E2), memory injection (E3),
unwise plans (E4), and scenarios (D). Earlier runs that day found and fixed a
two-option redirect (DB-2) and three unrouted extraction phrasings (MB-1).
`npm run eval:fast` (mocked model) also passes all suites.

## 1. Crisis safety

| ID | Status | Where | Notes |
|---|---|---|---|
| CS-1 | Done | `conversation/respond.ts` | Pre-check on the message, post-check on the model reply. |
| CS-2 | Done | `safety/classifier.ts` `runSafetyCheck` | Errors and checks slower than 2 s show the crisis screen. |
| CS-3 | Done | `safety/classifier.ts`; eval A1/A2 | Indirect phrasings added. A pattern list is not reliable detection; it is a routing rule. |
| CS-4 | Done | `respond.ts` | Every message, including the first, is checked. |
| CS-5 | Done | `safety/crisis.ts`; E2E | US: 988/911. Other countries: generic local-emergency message. Unknown: both. Country comes from the Vercel header when deployed. |
| CS-6 | Done | `respond.ts` | No message text, memory, or suggestion is stored from a crisis turn. |
| CS-7 | Done | `log.ts` | Safety log has `event`, `at`, `sessionId` only (stage and category were removed). |
| CS-8 | Process | PR template | Checkbox: add the missed phrasing to `evals/data/safety-triggers.json` first. |

## 2. Dependence and boundary

| ID | Status | Where | Notes |
|---|---|---|---|
| DB-1 | Done | `boundary/rules.ts` `stripBoundaryClaims`, `stripPermanencePromises`; eval B3 | Output filter plus prompt. |
| DB-2 | Done | `boundary/rules.ts`; eval B1 | Fixed redirect. It keeps its one question even when IS-2 would remove it (DB-2 takes priority). |
| DB-3 | Done (open value) | `respond.ts` | Default 45 minutes, `SESSION_LENGTH_CAP_MINUTES`. Ends with a break and one human contact. |
| DB-4 | Process | PR template | No streaks, badges, or notifications exist. |
| DB-5 | Done | `respond.ts` | `boundary_redirect` log with user ID, route, and count; no text. Counts are per server process. |

## 3. Interaction style

| ID | Status | Where | Notes |
|---|---|---|---|
| IS-1 | Done | `boundary/style.ts` | Extra question sentences are removed. |
| IS-2 | Done | `boundary/style.ts` | Counts questions in the previous two replies. |
| IS-3 | Partial | `style.ts` + prompt; eval E2 (LLM judge) | "Why" questions about feelings are removed in code. "Details not volunteered" is judged by the LLM rubric only. |
| IS-4 | Done (heuristic) | `boundary/style.ts` | A message of three words or fewer, or one sharing no words with the last reply, counts as short or a topic change. |
| IS-5 | Done | `respond.ts` `eligibleMemories` | The model sees only memories related to the current message, each at most once per session. |
| IS-6 | Process | PR template | No screening questions exist in chat. |

## 4. Memory and privacy

| ID | Status | Where | Notes |
|---|---|---|---|
| MP-1 | Done | `memory/capture.ts`; eval C1 | Health, sexual, contact, and third-party private details blocked, also for user-edited text. |
| MP-2 | Done | `llm/adapter.ts` data block; `isAllowedMemoryText`; eval E3 | Instruction-like memory text is refused at approval. |
| MP-3 | Done (open value) | `memory/proposals.ts`, `runRetention` | Default 90 days, `MEMORY_EXPIRY_DAYS`. "Keep until I delete it" option. Expiry job runs at most once a minute. |
| MP-4 | Done | eval C3 | |
| MP-5 | Done | `limits.ts` | 200. |
| MP-6 | Done | `disclosure/enforce.ts`; eval C2 | |

## 5. Model behavior

| ID | Status | Where | Notes |
|---|---|---|---|
| MB-1 | Done | `boundary/rules.ts`, leak filter, route ownership checks; eval E0 | |
| MB-2 | Done | `stripBoundaryClaims`, `enforceAiStatus`; eval B2 | |
| MB-3 | Done | `adviceCategory`; eval E1 | Fixed reply naming a human source. |
| MB-4 | Partial | Prompt; eval E4 (LLM judge only) | Code cannot judge whether a plan is unwise; this relies on the model and is measured by eval. |
| MB-5 | Done | `src/app/message-text.tsx` | Text only, never HTML, no auto-links. |
| MB-6 | Done | `contracts`, `limits.ts`, UI | 1,000 characters (was 4,000). |

## 6. Accounts and access

| ID | Status | Where | Notes |
|---|---|---|---|
| AA-1 | Done (wording open) | `api/auth/anonymous`, `requireSession`, UI; E2E | Self-confirmation stored as `age_confirmed` in Supabase user metadata. Wording is a placeholder pending team and legal review. |
| AA-2 | Partial | `rate-limit.ts`, `api/auth/anonymous` | Chat: per user and IP. New sessions: 10 per IP per 10 min. Failed-login lockout: not applicable to anonymous sessions; needed if passwords are added. Limits are per server process. |
| AA-3 | Done (open value) | `auth/server.ts` `touchSession` | Default 30 minutes, `SESSION_INACTIVITY_MINUTES`. Tracked in process memory. |
| AA-4 | N/A | | No passwords or email accounts. Required if accounts are added. |
| AA-5 | Partial | `supabase/cookies.ts` | Cookies httpOnly, sameSite=lax, secure in production. Password hashing is Supabase's (bcrypt) once passwords exist. |

## 7. Data protection

| ID | Status | Where | Notes |
|---|---|---|---|
| DP-1 | Done (pending migration apply) | `crypto/seal.ts`, `supabase-store.ts`, `resolveDataKey` | Message text, titles, memories, suggestions, weekly suggestions, and the emergency contact are AES-256-GCM encrypted by the app (bound to the owner ID) before reaching Supabase. The key (`CONTACT_ENCRYPTION_KEY`) is held outside the database; production refuses to run without it. Losing the key makes stored text unreadable. |
| DP-2 | Done | `respond.ts`, tests | |
| DP-3 | Done | `log.ts` `scrubLogEvent` | Allowlisted keys only; emails, phone numbers, tokens, and free text redacted. |
| DP-4 | Done (decided) | `runRetention`, `conversations.kept` | Decision 2026-10-31 (Neeraj Kumar): conversations are saved by default and kept until the user deletes them, per conversation or all at once. `MESSAGE_RETENTION_DAYS` can add automatic deletion for threads not kept. |
| DP-5 | Done | `api/account`; unit + E2E | Removes app data and signs out. The anonymous Supabase auth record needs an admin key to delete and remains. |
| DP-6 | Open (manual gate) | | Anthropic data-use terms must be confirmed in writing before the pilot. |

## 8. Claims and disclosure

| ID | Status | Where | Notes |
|---|---|---|---|
| CD-1 | Done | `respond.ts`, `enforceAiStatus` | |
| CD-2 | Done | UI; E2E | |
| CD-3, CD-4, CD-5 | Process | PR template | Current copy reviewed on 2026-10-31: no such claims found. |

## 9. Operations

| ID | Status | Where | Notes |
|---|---|---|---|
| OP-1 | Partial | `COMPANION_CHAT_DISABLED`, `api/companion/status`; E2E | Read per request. Locally it needs only an env change and restart. On Vercel, env changes need a redeploy, so a no-deploy switch needs Edge Config or a database flag. |
| OP-2 | Open | | Needs a privacy notice stating human review, and a review process. |
| OP-3 | Open | | Owners not assigned. Add a name per section here. |

## Open decisions (current defaults)

| Decision | Default in code | Setting |
|---|---|---|
| Session length cap (DB-3) | 45 minutes | `SESSION_LENGTH_CAP_MINUTES` |
| Memory expiry (MP-3) | 90 days | `MEMORY_EXPIRY_DAYS` |
| Message retention (DP-4) | Decided: keep until the user deletes | `MESSAGE_RETENTION_DAYS` (optional) |
| Inactivity timeout (AA-3) | 30 minutes | `SESSION_INACTIVITY_MINUTES` |
| Age gate wording (AA-1) | Placeholder | `src/app/companion-app.tsx` |
| Pilot countries (CS-5) | US | `safety/crisis.ts` |
| Model provider terms (DP-6) | Not confirmed | Manual |
