# Dartmouth Hackathon

## Start here: agent handoff

**Status as of October 30, 2026: the technical foundation is ready for feature
implementation. The app is not yet a working end-to-end product or a deployed
website.** The foundation has been merged into `main` through PR #1.

**Current user direction:** prioritize reusable capabilities and preparation for
multiple contributors. Product features are exploratory and mutable. Treat the
feature sketches, database draft, API contracts, and backlog as proposals, not
approved requirements. Do not implement an entire proposed feature list merely
because it appears in the documentation.

**Frontend style checkpoint: DECIDED for the chat screen.** On October 31, 2026,
Neeraj Kumar selected generated concept [01 / Warm editorial](docs/design/concepts/01-warm-editorial.png)
for the chat-screen scope. The [design decision record](docs/design/README.md#collaborator-design-decision-record)
lists exactly what is in scope. Other screens still require the collaborator
style discussion, image-generated mockups informed by the
[100 design masters](docs/design/design-masters.md), and a recorded decision.

| Area | Actual progress | Still needed |
| --- | --- | --- |
| Application framework | Next.js/React/TypeScript app. `/` is the chat screen (direction 01 / Warm editorial): anonymous session start, conversation, message composer, crisis-resource view, memory suggestions to save/edit/dismiss, saved memories to delete, and sign-out. Without Supabase settings it shows setup instructions; health still runs credential-free. | Conversations/Saved/Settings screens; streaming replies; raster icons |
| Anthropic | Credentials verified with a successful live text request. Server-only SDK client factory exists. | Connect the app to a model request/response flow; choose model and usage limits |
| Supabase | Project access, a read-only SQL query, and authentication-configuration access verified. Browser/server client factories exist. Auth plumbing: session-refresh Proxy (`src/proxy.ts`), `getClaims()`-verified actor helper (`requireSession` in `src/lib/auth/server.ts`), same-origin mutation guard, `GET /api/auth/session`, `POST /api/auth/anonymous` (chosen local-testing sign-in, Oct 31), and `POST /api/auth/sign-out`; unit-tested with a mocked client and smoke-tested without credentials. | Turn on anonymous sign-ins and run `npm run verify:auth` against the hosted project; decide on permanent accounts for multi-day evaluation; Supabase-backed repositories and an applied schema |
| Data model | Draft migration for profiles, conversations, messages, memory proposals, memories, and social actions; 37 isolated PostgreSQL behavior checks pass, including expiry and input-bound regressions. | Revise tables to match chosen features; verify real Supabase Auth/Data API behavior and concurrency before application |
| Vercel | Account access verified; `vercel.json` configures Next.js, locked installation with build tools, and checks before building. [Deployment guide](docs/deployment.md) prepared. | Import the GitHub repository and create the project; initial foundation needs no app variables; no deployment has been performed |
| GitHub | Public repository on `main`; access and secret uploads verified. Contributor instructions and a credential-free CI workflow exist. | Feature branches and later deployment automation |
| Companion core (milestone 1, step 1) | Server-side modules in `src/lib/companion`: `respond()` conversation service, safety pre/post checks and crisis view, memory store and fact-only capture as **proposals that the user approves** (nothing is saved automatically), code-enforced memory disclosure, weekly social-action scheduler, boundary rules (AI status, only-connection, dependence, prompt reveal), rate limiter, encrypted emergency contact, account-data deletion. Mocked and Anthropic LLM adapters. In-memory repositories. Authenticated route handlers for conversations, chat, memory proposals, and memories, backed by **process memory (local testing only; cleared on restart)**. Vitest unit/route tests and a deterministic eval suite (`evals/`). See the [milestone report](docs/milestone-1-report.md). | Supabase-backed repositories (required before any deployment), SSE streaming, version checks. The `eval-llm` run has not been executed yet. |
| Contracts and boundaries | Zod request/event schemas, domain interfaces, validated runtime/build configuration, and provider factories; contract and configuration regression checks. | Actual authenticated route handlers and service logic; these definitions are not completed integrations |
| Optional voice input | [Vapi architecture](docs/voice.md), session/provider interfaces, user-transcript normalization, bounded editable draft buffer, and isolated server configuration. Disabled by default. | Assistant/account setup, verified-user session bootstrap, actual SDK transport, no-spoken-reply/cost validation, and browser/device checks; no microphone or calls run yet |
| Visual exploration | [100 design references and three image-generated desktop/mobile concepts](docs/design/README.md), plus a transparent raster icon-family study. | Chat screen decided (01 / Warm editorial, Oct 31); other screens still need the collaborator design discussion; production raster icons still need generating |

Chat works end to end locally, but conversations and memories live in server
memory and vanish on restart; it is not ready to deploy. A migration file does not
mean the hosted database has that schema. Anthropic is called only when
`LLM_ADAPTER=anthropic`; otherwise replies come from the deterministic mock.

### Verified baseline

The October 30 foundation review adds stricter stored-text validation, wall-clock
memory-approval expiry checks, bounded database fields/interests, and public
configuration validation before bundling. The Anthropic client fixes the official
endpoint and disables SDK request logging. Existing generated visual proposals
and the pending collaborator style decision remain as documented above.

Current local verification:

- Clean dependency installation with `npm ci`.
- `npm run check`: lint, TypeScript, 9 contract checks, 13 runtime/configuration
  checks, 9 voice-input checks, and 37 isolated database checks. These require no
  service credentials or paid provider calls.
- `npm run build`: production build.
- `npm audit`: zero reported vulnerabilities after updating the lint toolchain's
  transitive `minimatch` dependency through a pinned override.
- Local production-server smoke checks: preparation page and health endpoint
  succeed, unsupported health writes return 405, and the unimplemented chat
  endpoint returns 404.

CI (`.github/workflows/ci.yml`) runs separate jobs named `lint` (ESLint and
Prettier), `typecheck`, `unit` (Vitest plus the contract/runtime/schema checks),
`e2e` (Playwright), `security` (`npm audit` and gitleaks), `build`, and
`eval-fast`. `.github/workflows/eval-llm.yml` runs the LLM-judged evals weekly and
on PRs that touch `src/lib/companion`, `src/lib/anthropic`, or `evals`. It needs
the `ANTHROPIC_API_KEY` secret and an `ANTHROPIC_MODEL` repository variable.
Branch protection on `main` must be configured in the GitHub settings so that the
seven CI jobs are required checks. The production-server smoke checks were run locally. The original
foundation commit `9f39a7e` also has a recorded
[successful CI baseline](https://github.com/RaegenDyer/Dartmouth-Hackathon/actions/runs/41150082460).

Database checks use an in-memory PGlite/PostgreSQL runtime with synthetic users
and simplified Supabase identity/role stubs. They do not test hosted JWTs, the
Supabase Data API, or simultaneous network requests. No migration was applied to
the shared Supabase project during preparation.

Desktop relocation was checked on October 30 after repairing the missing local
branch reference, restoring the health route, and reinstalling incomplete local
dependencies from the lockfile. All 43 tracked files matched Git's saved content,
all four generated PNGs passed integrity checks, and no tracked paths referenced
the old OneDrive location. The full checks and production build pass from the
new Desktop folder. These local repairs did not require source-code changes.

### Next technical milestone

Prove one small path through the stack: **open the app -> establish a user session
-> save and retrieve a simple user-owned record -> send text to Claude -> display
the response**. Then deploy that path. This validates the connections while
leaving product behavior open to revision. Login method, data retention, model
selection, cost limits, and the final feature scope remain decisions to make.

Before feature work, read [AGENTS.md](AGENTS.md), this status summary, and the
relevant architecture documents. Update this README in the same change whenever
a capability becomes implemented, a migration is applied, or a deployment is
verified. Distinguish provider access, code scaffolding, and tested app behavior.

### Hosting preparation

Follow [the Vercel setup guide](docs/deployment.md) to import `main` from GitHub.
The October 30 account check found a Hobby account with no Vercel projects. The
owner has since made the GitHub repository public, and unauthenticated access
has been verified. Vercel supports collaboration for public repositories on
Hobby; the earlier private-repository restriction no longer applies to this
repository. See the guide's linked collaboration requirements.

The first deployment can serve the preparation page and `/api/health` with no
application environment variables or Supabase migration. Add integration settings
when those features are implemented. Record the actual production URL and tested
commit here after the first hosted deployment is verified.

## Exploratory product direction

The current idea is a nonclinical companion for adults settling into a new city
or program, helping them build human connections. **Designed to be uninstalled**
is a working principle. The name, visual direction, and detailed features are
not finalized. Text input and text output are the working scope; optional
speech-to-text input can be added later. Voice responses are not currently planned.
Vapi is selected for that optional input path; its disabled architecture and
transcript handling are prepared without a live provider connection.

## Start locally

Use Node.js 22.13 or newer within the Node 22 release line and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For the checks used in CI:

```sh
npm run check        # lint, Prettier, typecheck, Vitest, contract/runtime/schema checks
npm run build
npm run test:e2e     # Playwright; builds must exist (npm run build) first
npm run eval:fast    # deterministic evals with the mocked LLM; writes evals/reports/eval-fast.{md,json}
npm run eval:llm     # LLM-judged evals; needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL
```

### Guardrails

[docs/guardrails.md](docs/guardrails.md) is the guardrail specification;
[docs/guardrails-status.md](docs/guardrails-status.md) maps every ID to its code and
test, and lists what is partial or still a team decision (session cap, memory
expiry, retention, inactivity timeout, age-gate wording, pilot countries, and
provider data terms).

### Test the chat locally

1. `cp .env.example .env.local` (ignored by Git) and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the
     Supabase dashboard (Project Settings > API Keys; use the `sb_publishable_` key).
   - For real Claude replies: `LLM_ADAPTER=anthropic`, `ANTHROPIC_API_KEY`, and
     `ANTHROPIC_MODEL` (for example `claude-sonnet-5-5`). Leave `LLM_ADAPTER=mock`
     to test without a key. The Anthropic endpoint URL is fixed in code on purpose.
2. In Supabase, turn on Authentication > Sign In / Providers > Anonymous sign-ins.
3. `npm run dev`, open http://localhost:3000, and choose **Start a private session**.
4. Optional: `npm run verify:auth` runs the live session/refresh/sign-out checks.

`CONTACT_ENCRYPTION_KEY` (32 random bytes, base64) encrypts emergency contacts; a
random per-process key is used when it is blank. Restart `npm run dev` after
changing `.env.local`. See [contributor setup](CONTRIBUTING.md).

## Shared architecture

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web app and API | Next.js App Router, React, TypeScript | Intended home for interface, verified sessions, request validation, and orchestration |
| Hosting | Vercel, Node.js runtime | Selected target for the app and bounded HTTP/SSE requests; not deployed yet |
| Data and identity | Supabase Postgres and Auth | Selected services for user-owned data and identity; app integration remains to be built |
| Conversation model | Anthropic API through its official SDK | Server-only client factory exists; generation endpoint remains to be built |
| Shared contracts | Zod and TypeScript | Draft request validation and stream-event shapes |
| Quality checks | ESLint, TypeScript, contract/configuration regressions, isolated Postgres checks, dependency audit, production build, GitHub Actions | Implemented baseline that works without service credentials |

Start with [architecture](docs/architecture.md), [API contracts](docs/api-contracts.md),
[data model](docs/data-model.md), and the [implementation backlog](docs/implementation-plan.md).

## Repository map

```text
src/app/                     Next.js pages and route handlers
src/lib/contracts/           Shared request and stream schemas
src/lib/domain/              Service boundary interfaces
src/lib/anthropic/           Server-only model client factory
src/lib/supabase/            Browser and server client factories
src/lib/auth/                Verified-session helpers and origin guard
src/proxy.ts                 Supabase session-cookie refresh (not authorization)
src/lib/env/                 Explicit runtime configuration boundaries
src/lib/companion/           Conversation, safety, memory, disclosure, scheduler, LLM adapter
tests/unit/                  Vitest unit tests
e2e/                         Playwright end-to-end tests
evals/                       Eval datasets (data/), runner, and committed reports
src/lib/voice/               Optional dictation ports, transcript buffer, server config
supabase/migrations/         Reviewable database changes; not applied automatically
docs/                        Architecture, contracts, decisions, implementation order
.github/workflows/           Checks; no production deployment workflow yet
vercel.json                  Vercel framework, installation, and checked build
```

## Credential boundaries

- `.env.local`: local **application** settings; ignored by Git.
- `.env.example`: safe names and empty values; committed for contributors.
- `credentials.env`: local **management** access; ignored by Git and Vercel uploads.
- GitHub Actions Secrets: `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`,
  `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_PROJECT_REF` have been uploaded and their
  presence verified. GitHub does not return their saved values to local clones.
- Vercel environment settings: only application runtime settings, once deployed.

`GITHUB_TOKEN`, `VERCEL_TOKEN`, and `SUPABASE_ACCESS_TOKEN` must not be imported by
application modules or copied to Vercel's application environment. Implement
normal database requests with a user's verified session and the Supabase
publishable key so RLS enforces ownership. A Supabase service-role/secret key is
not part of the planned app runtime. Never print credential values or commit
local environment files.
