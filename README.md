# Candid

Candid is the product name (decided 2026-10-31 by Neeraj Kumar). The repository
keeps its original name, Dartmouth-Hackathon.

## Start here: agent handoff

**Status as of October 31, 2026: the merged app includes chat, anonymous sessions,
approval-first memories, and Supabase persistence. Hosting setup has begun; no
Vercel deployment is verified yet.** The final merge review found and fixed a
Unicode ciphertext-capacity regression. The new additive database migration is
pending application before the configured chat is released.

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
| Anthropic | Server-only client and conversation adapter are connected to the chat service. Mock mode remains available without paid calls. | Set the intended model for deployment and shared usage limits |
| Supabase | Anonymous sign-in enabled and verified live (`npm run verify:auth`, 16 checks). Session-refresh Proxy, `getClaims()`-verified actor with age gate and inactivity timeout, same-origin mutation guard, hardened cookies, and session/anonymous/sign-out routes. | Decide on permanent accounts so people can return across devices |
| Data model | Collaborator recorded migrations `202610300001` and `202610310001` applied on 2026-10-31 with RLS and live two-user isolation. App text is encrypted before storage; 52 isolated PostgreSQL checks now pass. | Apply additive migration `202610310002` for Unicode ciphertext capacity; durable turn claims and shared rate limits |
| Vercel | Project `candid-dartmouth` created in `raegendyer`, with Next.js, Node 22, locked installation, and checked builds. GitHub integration and production branch `main` verified. [Deployment guide](docs/deployment.md) updated. | Supply the existing encryption key for configured chat; first hosted deployment pending verification |
| GitHub | Public repository on `main`; access and secret uploads verified. Contributor instructions and a credential-free CI workflow exist. | Feature branches and later deployment automation |
| Companion core (milestone 1) | `src/lib/companion`: conversation service with the [guardrails](docs/guardrails.md) enforced in code, memory suggestions that the user approves, Supabase-backed storage (`supabase-store.ts`), and authenticated routes for conversations, chat, memories, and account deletion. Unit, route, schema, E2E, and mocked/LLM-judged evals pass. | SSE streaming and version checks; see [guardrails status](docs/guardrails-status.md) for partial items |
| Contracts and boundaries | Zod schemas, validated configuration, provider factories, and authenticated conversation/chat/memory routes with regression coverage. | Streaming, durable idempotency, and remaining proposed profile/social-action routes |
| Optional voice input | [Deepgram architecture](docs/voice.md), session/provider interfaces, mono-microphone transcript normalization, bounded editable draft buffer, and isolated server configuration. Disabled by default; Vapi retired. | Verified-user session bootstrap, actual audio transport, microphone controls, and browser/device checks; no live capture or provider connection yet |
| Optional audio output | [Tavus architecture](docs/tavus.md), private audio-only request/response contracts, supplied-text Echo builder, session/playback interfaces, and isolated server settings. Disabled by default; no camera/video flow. | Verify Echo + audio-only together on the account, implement authenticated ownership/budgets and REST/RTC transport; no live sessions or playback yet |
| Optional mascot | Cute, whimsical animal/creature preference recorded; mascot implementation is deferred while speech architecture is prepared. | Collaborator design discussion, image-generated character options, selection, and animation; no mascot assets or UI implemented |
| Visual exploration | [100 design references and three image-generated desktop/mobile concepts](docs/design/README.md), plus a transparent raster icon-family study. | Chat screen decided (01 / Warm editorial, Oct 31); other screens still need the collaborator design discussion; production raster icons still need generating |

Chat works end to end locally. Conversations, memories, and suggestions are saved
in Supabase (migrations applied 2026-10-31), encrypted by the app, and kept until
the user deletes them. Rate limits and idempotency are still per server process,
so a multi-instance deployment needs shared stores for those. A migration file does not
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
records two applied migrations. The new Unicode-capacity migration is pending.

Desktop relocation was checked on October 30 after repairing the missing local
branch reference, restoring the health route, and reinstalling incomplete local
dependencies from the lockfile. All 43 tracked files matched Git's saved content,
all four generated PNGs passed integrity checks, and no tracked paths referenced
the old OneDrive location. The full checks and production build pass from the
new Desktop folder. These local repairs did not require source-code changes.

### Next technical milestone

Deploy the reviewed `main` through the connected Vercel project. Before enabling
configured chat, recover the existing `CONTACT_ENCRYPTION_KEY`, apply the additive
Unicode-capacity migration, and supply the Supabase public settings. Model
selection and shared cost/rate limits remain deployment decisions. A setup-page
deployment can verify hosting first without application credentials.

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
can show setup instructions and
`/api/health` with blank app settings. Configured chat requires the existing data
key and runtime values in the deployment guide. Record the production URL and
tested commit after a hosted deployment is verified.

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
- GitHub Actions Secrets: `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`,
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `DEEPGRAM_API_KEY`,
  `TAVUS_API_KEY`, and `TAVUS_PAL_ID` have been uploaded and their presence verified.
  GitHub does not return their saved values to local clones.
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
