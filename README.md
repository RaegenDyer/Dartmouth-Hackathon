# Dartmouth Hackathon

## Start here: agent handoff

**Status as of October 30, 2026: the technical foundation is ready for feature
implementation. The app is not yet a working end-to-end product or a deployed
website.** The foundation is on `prep/architecture-foundation`.

**Current user direction:** prioritize reusable capabilities and preparation for
multiple contributors. Product features are exploratory and mutable. Treat the
feature sketches, database draft, API contracts, and backlog as proposals, not
approved requirements. Do not implement an entire proposed feature list merely
because it appears in the documentation.

| Area | Actual progress | Still needed |
| --- | --- | --- |
| Application framework | Next.js/React/TypeScript starter runs without credentials. `/` is a preparation page; `GET /api/health` is the only implemented API route. | Product interface and application endpoints |
| Anthropic | Credentials verified with a successful live text request. Server-only SDK client factory exists. | Connect the app to a model request/response flow; choose model and usage limits |
| Supabase | Project access, a read-only SQL query, and authentication-configuration access verified. Browser/server client factories exist. | App login/session refresh, user-scoped repositories, and an applied schema |
| Data model | Draft migration for profiles, conversations, messages, memory proposals, memories, and social actions; 24 isolated PostgreSQL behavior checks pass. | Revise tables to match chosen features; verify real Supabase Auth/Data API behavior and concurrency before application |
| Vercel | Hosting choice settled and API token verified. | Create the hosting project, set application environment variables, and deploy; no deployment has been performed |
| GitHub | Repository access and secret uploads verified. Contributor instructions and a credential-free CI workflow exist. | Feature branches and later deployment automation |
| Contracts and boundaries | Zod request/event schemas, domain interfaces, environment validation, and provider factories are written. | Actual authenticated route handlers and service logic; these definitions are not completed integrations |

The model client factory does not implement chat. The Supabase factories do not
implement authentication. A migration file does not mean the hosted database has
that schema. Only the preparation page and liveness route currently run in the
application; normal startup makes no Anthropic or Supabase calls.

### Verified baseline

At foundation commit `9f39a7e`, the following passed locally and the automated
[GitHub checks passed](https://github.com/RaegenDyer/Dartmouth-Hackathon/actions/runs/41150082460):

- Clean dependency installation with `npm ci`.
- `npm run check`: lint, TypeScript, and 24 isolated database checks.
- `npm run build`: production build.
- Local production-server smoke checks: preparation page and health endpoint
  succeed; the unimplemented chat endpoint returns 404.

CI covers dependency installation, `npm run check`, and the build. The
production-server smoke checks were run locally.

Database checks use an in-memory PGlite/PostgreSQL runtime with synthetic users
and simplified Supabase identity/role stubs. They do not test hosted JWTs, the
Supabase Data API, or simultaneous network requests. No migration was applied to
the shared Supabase project during preparation.

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

## Exploratory product direction

The current idea is a nonclinical companion for adults settling into a new city
or program, helping them build human connections. **Designed to be uninstalled**
is a working principle. The name, visual direction, and detailed features are
not finalized. Text input and text output are the working scope; optional
speech-to-text input can be added later. Voice responses are not currently planned.

## Start locally

Use Node.js 22.13 or newer within the Node 22 release line and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For the checks used in CI:

```sh
npm run check
npm run build
```

The default preparation page does not contact Supabase or Anthropic. Feature
developers can copy `.env.example` to `.env.local` and fill in application
settings when working on those integrations. See [contributor setup](CONTRIBUTING.md).

## Shared architecture

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web app and API | Next.js App Router, React, TypeScript | Intended home for interface, verified sessions, request validation, and orchestration |
| Hosting | Vercel, Node.js runtime | Selected target for the app and bounded HTTP/SSE requests; not deployed yet |
| Data and identity | Supabase Postgres and Auth | Selected services for user-owned data and identity; app integration remains to be built |
| Conversation model | Anthropic API through its official SDK | Server-only client factory exists; generation endpoint remains to be built |
| Shared contracts | Zod and TypeScript | Draft request validation and stream-event shapes |
| Quality checks | ESLint, TypeScript, isolated Postgres checks, production build, GitHub Actions | Implemented baseline that works without service credentials |

Start with [architecture](docs/architecture.md), [API contracts](docs/api-contracts.md),
[data model](docs/data-model.md), and the [implementation backlog](docs/implementation-plan.md).

## Repository map

```text
src/app/                     Next.js pages and route handlers
src/lib/contracts/           Shared request and stream schemas
src/lib/domain/              Service boundary interfaces
src/lib/anthropic/           Server-only model client factory
src/lib/supabase/            Browser and server client factories
src/lib/env/                 Explicit runtime configuration boundaries
supabase/migrations/         Reviewable database changes; not applied automatically
docs/                        Architecture, contracts, decisions, implementation order
.github/workflows/           Checks; no production deployment workflow yet
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
