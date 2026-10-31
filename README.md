# Dartmouth Hackathon

A nonclinical AI companion for adults settling into a new city or program. The
goal is to help people build human connections through a short conversation and
one manageable social action. The working principle is **designed to be
uninstalled**. A product name and visual direction have not been chosen.

## Current stage

This branch contains a runnable **development foundation**, not a completed
companion. The preparation page and `/api/health` run without credentials. Chat,
login, memory screens, and social-action flows are planned and are not exposed as
fake or partially working API endpoints.

Accounts and management access have been verified for Anthropic, Supabase, Vercel,
and GitHub. The database migration is a local draft. No database migration or
hosting deployment is performed by this foundation.

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
| Web app and API | Next.js App Router, React, TypeScript | Interface, verified sessions, request validation, orchestration |
| Hosting | Vercel, Node.js runtime | Serve the app and bounded HTTP/SSE requests |
| Data and identity | Supabase Postgres and Auth | Per-user records, row-level access, versioned migrations |
| Conversation model | Anthropic API through its official SDK | Text generation behind a server-only adapter |
| Shared contracts | Zod and TypeScript | Request validation and stream-event shapes |
| Quality checks | ESLint, TypeScript, isolated Postgres checks, production build, GitHub Actions | A baseline that works without service credentials |

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
- GitHub Actions Secrets: management credentials for future authorized workflows.
- Vercel environment settings: only application runtime settings, once deployed.

`GITHUB_TOKEN`, `VERCEL_TOKEN`, and `SUPABASE_ACCESS_TOKEN` must not be imported by
application modules or copied to Vercel's application environment. Normal database
requests use a user's verified session and the Supabase publishable key, so RLS
continues to enforce ownership. A Supabase service-role/secret key is not part of
the planned app runtime.

Text input and text output are the initial scope. Optional speech-to-text can
populate an editable text box later; no voice-response platform is required.
