# Candid

Candid is the product name (decided 2026-10-31 by Neeraj Kumar). The repository
keeps its original name, Dartmouth-Hackathon.

## Start here: agent handoff

**Status as of October 31, 2026: Candid is live at
https://candid-dartmouth.vercel.app with anonymous sign-in, Claude Sonnet 5.5,
approval-first memories, and encrypted Supabase persistence verified end to end.**
The existing data key was recovered and checked against three existing encrypted
records. The hosted schema already has the Unicode ciphertext-capacity fix.
All 32 hosted activation checks passed; both disposable test users were removed.

**Current user direction:** prioritize reusable capabilities and preparation for
multiple contributors. Product features are exploratory and mutable. Treat the
feature sketches, database draft, API contracts, and backlog as proposals, not
approved requirements. Do not implement an entire proposed feature list merely
because it appears in the documentation.

**Frontend style checkpoint: DECIDED for the chat app.** On October 31, 2026,
Neeraj Kumar approved the "Candid minimal" direction (off-white, Geist, hairline
grid, one orange accent; inspired by skillsync.com) from an HTML preview, replacing
01 / Warm editorial. See the [design decision record](docs/design/README.md#current-decision-candid-minimal-supersedes-01-for-the-app)
for scope. Other screens, illustrations, and the mascot still need the
collaborator design discussion and image-generated artwork.

| Area | Actual progress | Still needed |
| --- | --- | --- |
| Application framework | Next.js/React/TypeScript app. `/` uses the approved Candid minimal direction: anonymous session start, chat, crisis-resource view, memory suggestions to save/edit/dismiss, saved memories to delete, history, and sign-out. Health remains credential-free. | Remaining screens, streaming replies, and raster icons |
| Anthropic | Production uses `claude-sonnet-5-5` with `LLM_ADAPTER=anthropic`; one bounded hosted model reply passed the activation check. Offline checks use mock fixtures. | Shared usage/rate budgets before a wider pilot |
| Supabase | Anonymous sign-in enabled and verified live (`npm run verify:auth`, 16 checks). Session-refresh Proxy, `getClaims()`-verified actor with age gate and inactivity timeout, same-origin mutation guard, hardened cookies, and session/anonymous/sign-out routes. | Decide on permanent accounts so people can return across devices |
| Data model | Hosted schema includes the 2,048-character ciphertext checks from `202610310002`; no duplicate DDL was needed during activation. App text is encrypted; 52 isolated checks and the hosted Unicode approval/reload test pass. | Durable turn claims, atomic version/count checks, and shared rate limits |
| Vercel | [Live app](https://candid-dartmouth.vercel.app), Next.js, Node 22, checked builds, and GitHub production branch `main`. Production runtime settings are configured; data/model keys are sensitive variables. Hosted sign-in/chat/persistence verified on October 31. | Permanent accounts, monitoring, and shared serverless limits for a wider pilot |
| GitHub | Public repository on `main`; access and secret uploads verified. Contributor instructions and a credential-free CI workflow exist. | Feature branches and later deployment automation |
| Companion core (milestone 1) | `src/lib/companion`: conversation service with the [guardrails](docs/guardrails.md) enforced in code, memory suggestions that the user approves, Supabase-backed storage (`supabase-store.ts`), and authenticated routes for conversations, chat, memories, and account deletion. Unit, route, schema, E2E, and mocked/LLM-judged evals pass. | SSE streaming and version checks; see [guardrails status](docs/guardrails-status.md) for partial items |
| Contracts and boundaries | Zod schemas, validated configuration, provider factories, and authenticated conversation/chat/memory routes with regression coverage. | Streaming, durable idempotency, and remaining proposed profile/social-action routes |
| Optional voice input | [Deepgram architecture](docs/voice.md), session/provider interfaces, mono-microphone transcript normalization, bounded editable draft buffer, and isolated server configuration. Disabled by default; Vapi retired. | Verified-user session bootstrap, actual audio transport, microphone controls, and browser/device checks; no live capture or provider connection yet |
| Optional audio output | [Tavus architecture](docs/tavus.md), private audio-only request/response contracts, supplied-text Echo builder, session/playback interfaces, and isolated server settings. Disabled by default; no camera/video flow. | Verify Echo + audio-only together on the account, implement authenticated ownership/budgets and REST/RTC transport; no live sessions or playback yet |
| Optional mascot | Cute, whimsical animal/creature preference recorded; mascot implementation is deferred while speech architecture is prepared. | Collaborator design discussion, image-generated character options, selection, and animation; no mascot assets or UI implemented |
| Visual exploration | [100 design references and three image-generated desktop/mobile concepts](docs/design/README.md), plus a transparent raster icon-family study. Current app uses Neeraj's recorded Candid minimal decision. | Other screens and illustrative assets still need the collaborator design discussion; production raster icons need generating |

Chat and memory approval/reload work end to end on the hosted app. Conversations,
memories, and suggestions are saved in Supabase, encrypted by the app, and kept until
the user deletes them. Rate limits and idempotency are still per server process,
so a multi-instance deployment needs shared stores for those. A migration file does not
mean the hosted database has that schema. Anthropic is called only when
`LLM_ADAPTER=anthropic`; otherwise replies come from the deterministic mock.

### Verified baseline

The October 30 foundation review adds stricter stored-text validation, wall-clock
memory-approval expiry checks, bounded database fields/interests, and public
configuration validation before bundling. The Anthropic client fixes the official
endpoint and disables SDK request logging. The chat-scoped style decision is
recorded above; other screens still need their collaborator design discussion.

Current local verification:

- Clean dependency installation with `npm ci`.
- `npm run check`: lint, formatting, TypeScript, 247 Vitest unit tests,
  9 contract checks, 16 runtime/configuration checks, 12 voice-input checks,
  7 Tavus contract checks, 9 encrypted-environment checks, and 52 isolated
  database checks. These require no
  service credentials or paid provider calls.
- `npm run build`: production build.
- `npm audit`: zero reported vulnerabilities after updating the lint toolchain's
  transitive `minimatch` dependency through a pinned override.
- Browser checks: 7 pass, including the home page, health, and mocked guardrail
  flows; 4 unfinished milestone flows remain skipped. Fast evals: 13 suites pass.
- Hosted activation: 32 checks pass for anonymous identity, secure cookies,
  one real Claude reply, approval-first memory, maximum-length Unicode storage,
  reload/decryption, history, cross-user 404s, and deletion. Both disposable Auth
  users and all their app rows were removed and the cleanup verified.
- Configured production: `npm run check` and `npm run build` pass with the real
  runtime variables and `NODE_ENV=production`; GitHub CI passed for `7fbd980`.

The October 31 review adds regressions for stale memory context after generation,
overlapping turns, memory-limit races, mutable repository snapshots, provider
outages, ignored model cancellation, and encrypted-settings import failures.
Sign-out avoids a redundant claims lookup, and memory insertion no longer sorts
and copies rows to check capacity. See the [review limits](docs/milestone-1-report.md#october-31-review-and-self-critique)
before treating the in-memory services as production persistence.

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
Supabase Data API, or simultaneous network requests. The original preparation
did not apply a hosted migration; the later collaborator's persistence work
records two applied migrations. Activation verified that the hosted ciphertext
constraints already match the additive Unicode-capacity migration.

Desktop relocation was checked on October 30 after repairing the missing local
branch reference, restoring the health route, and reinstalling incomplete local
dependencies from the lockfile. All 43 tracked files matched Git's saved content,
all four generated PNGs passed integrity checks, and no tracked paths referenced
the old OneDrive location. The full checks and production build pass from the
new Desktop folder. These local repairs did not require source-code changes.

### Next technical milestone

Hosted login/chat/database verification is complete for the current prototype.
Next technical work is durable turn reservations, shared usage/rate limits,
atomic context/version checks, permanent participant accounts, and streaming.
Product decisions remain with the collaborating team.

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

Project [candid-dartmouth](https://vercel.com/raegendyer/candid-dartmouth) now exists
with Node 22 and the checked build command. The owner authorized the GitHub
integration, and this repository's `main` is connected. The first deployment
shows the Candid page with setup required and `/api/health` with blank app
settings. Configured chat requires the existing data key and runtime values in
the deployment guide.

First hosted verification, October 31, 2026: production
https://candid-dartmouth.vercel.app, application commit
`a571b39969b5ad469086e95d3636350829142a92`. Vercel reported Ready; unauthenticated
`GET /` and `GET /api/health` returned 200. `GET /api/auth/session` returned the
expected safe 503 because Supabase runtime settings are absent. This verifies
hosting, not a live configured login/chat/database flow. GitHub CI passed for
that commit; the build also passed with `NODE_ENV=production`.

Configured activation, October 31, 2026: application commit
`7fbd98070b565eef341737f9335549f730bfc830`, Vercel deployment
`dpl_2CpyUsAdcmYxzKy4HeZ4hyGX8Aw1`, Ready. Production now uses the verified existing
data key, Supabase storage, and Claude Sonnet 5.5. The hosted smoke test passed
32 checks with exactly one normal model turn and two disposable identities.
Supabase's anonymous provider was already enabled and the ciphertext constraints
were already correct, so no authentication toggle or schema DDL was required.

## Exploratory product direction

The current idea is a nonclinical companion for adults settling into a new city
or program, helping them build human connections. **Designed to be uninstalled**
is a working principle. The product is named **Candid** (decided 2026-10-31); the
chat-screen visual direction is decided, and detailed features are not finalized.
Text input and text output are the working scope; optional speech-to-text input can
be added later. On October 31, the owner dropped Vapi and chose a cute, whimsical
animal/creature direction for an optional mascot. Deepgram is the selected
speech-input provider; its disabled architecture and transcript handling are
prepared without a live connection. The latest direction also prepares Tavus for
optional audio-only supplied replies, while Gemini is deferred until credits are
available. Video conversation is outside scope. Mascot work is deferred; the actual
design still needs the collaborator-led image-generation discussion.

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
src/lib/tavus/               Optional audio-output contracts, ports, server config
supabase/migrations/         Reviewable database changes; not applied automatically
docs/                        Architecture, contracts, decisions, implementation order
.github/workflows/           Checks; no production deployment workflow yet
vercel.json                  Vercel framework, installation, and checked build
```

## Credential boundaries

- `.env.local`: local **application** settings; ignored by Git.
- `.env.example`: safe names and empty values; committed for contributors.
- `credentials.env`: local **management** access; ignored by Git and Vercel uploads.
- GitHub Actions Secrets: `ANTHROPIC_API_KEY`, `CONTACT_ENCRYPTION_KEY` (backup of
  the established data key, added 2026-10-31), `VERCEL_TOKEN`,
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `DEEPGRAM_API_KEY`,
  `TAVUS_API_KEY`, and `TAVUS_PAL_ID` have been uploaded and their presence verified.
  GitHub does not return their saved values to local clones, and the running app
  never reads them: hosted runtime settings live in Vercel environment variables.
- `secrets/development.env.gpg`: encrypted application-only development settings
  for collaborators. Use [the local secrets guide](docs/development-secrets.md).
  Its separate unlock file `.secrets/development-env.key` stays private/ignored;
  management tokens are excluded. `npm run env:pull` decrypts locally, and
  `npm run env:pull -- --merge` preserves nonblank existing settings.
- Vercel environment settings: only application runtime settings, once deployed.

`GITHUB_TOKEN`, `VERCEL_TOKEN`, and `SUPABASE_ACCESS_TOKEN` must not be imported by
application modules or copied to Vercel's application environment. Implement
normal database requests with a user's verified session and the Supabase
publishable key so RLS enforces ownership. A Supabase service-role/secret key is
not part of the planned app runtime. Never print credential values or commit
local environment files.
