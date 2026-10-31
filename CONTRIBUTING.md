# Contributing

## First checkout

1. Clone this repository and switch to the shared foundation branch when it is
   published. Use a feature branch for your work.
2. Install Node.js 22.13+ within Node 22. `.nvmrc` selects that release line.
3. Run `npm ci` and `npm run dev`. No credentials are needed to see the preparation
   page or call `GET /api/health`.
4. Read `docs/architecture.md` and `docs/api-contracts.md`. Use the shared schemas
   in `src/lib/contracts` rather than defining a competing request format.
5. Before handing off, run `npm run check` and `npm run build`.

## Working on live integrations

Copy `.env.example` to `.env.local`. Get development application settings through
the project owner using an approved private channel, or use your own development
Anthropic key. A separate key in the funded workspace makes individual development
access easier to revoke and attribute.

Only these values are application settings:

| Variable | Scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe application identity; RLS still required |
| `ANTHROPIC_API_KEY` | Server only |
| `ANTHROPIC_MODEL` | Server only; a model ID available to the configured workspace |

Management credentials are not required to develop the interface or run normal
user-scoped application queries. Do not copy the owner's `credentials.env` into
your branch, put management tokens in application environment files, or log
environment objects. GitHub Actions secrets are not downloaded by `git clone`.

The Supabase browser/server helpers are factories, not a finished authentication
flow. The server helper is intended for Route Handlers and Server Actions that
can write cookies. Implement and verify session refresh before adding protected
features; do not infer identity from an unverified cookie or a request body.

## Split the work by feature

| Work area | Initial files | Agreed boundary |
| --- | --- | --- |
| Interface | `src/app`, future `src/components` | Calls shared API contracts; never calls Anthropic directly |
| Auth and data | `src/lib/supabase`, `supabase` | Verified identity, RLS, migrations, user-scoped repositories |
| Conversation | `src/lib/anthropic`, future chat route/service | Streaming, bounded context, retry/idempotency rules |
| Memory and social actions | Future feature services/routes | Explicit memory approval, editing, expiry, action acceptance |
| Integration and demo | CI, cross-feature checks, demo script | One complete flow and clear explanations of limitations |

Use role labels until the team assigns people. Agree on changes to contracts,
schema, and stream events before merging dependent feature branches. Keep
unrelated changes out of the same branch.

## Changes and migrations

- Commit `package-lock.json` with dependency changes; use `npm ci` elsewhere.
- Keep server-only code out of browser imports. Use the environment accessors;
  do not pass a whole environment object to a component.
- Treat model output as untrusted text and validate structured suggestions.
- Include a new migration for schema changes. Do not edit a migration that has
  already been applied in a shared environment.
- Run database integration checks against a designated development/test project,
  with separate users, before applying a migration to the shared app database.
- CI uses no provider credentials. SQL checks run only in an isolated in-memory
  PostgreSQL instance; CI does not apply SQL to Supabase or deploy the app.
- Feature tests should cover ownership, approval, concurrency, and failure paths
  when those behaviors are implemented. Do not represent stubs as completed tests.

## Review checklist

Explain the user-visible behavior, the API/schema changes, and how you verified
it. In particular, check that one user's IDs cannot expose another user's data,
that expired/unapproved memories cannot enter model context, and that failures
do not leave the UI claiming an action or memory was saved when it was not.
