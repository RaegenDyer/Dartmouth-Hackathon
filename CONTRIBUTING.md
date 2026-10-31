# Contributing

## Before frontend work

**The style checkpoint is currently pending.** When frontend work is about to
begin, the agent must bring up the style discussion with the collaborator
requesting or leading that work. Any project collaborator may choose the
direction; approval from the original project owner is not required.

Read [the concept gallery and decision record](docs/design/README.md) and
[the 100 design masters](docs/design/design-masters.md). Use the image-generation
model to design app mockups and visual directions based on compatible references
from that catalog. Revisit Warm editorial, Playful civic, Evening room, and the
raster icon study with the collaborator; use image generation to refine those
options or explore another direction when needed. The collaborator can choose
an existing generated concept if it suits the current scope.

Have that collaborator decide on the generated design before implementing
user-facing screens, layouts, visual components, or styling. Do not silently
invent and code a style or treat a general feature request as a style decision.
Record who decided, the selected generated concept(s), decision, scope, and date
in the design record, and update the root README checkpoint. If their decision
is unavailable, pause frontend implementation; backend and nonvisual preparation
can continue. A recorded decision covers the agreed scope without repeating the
discussion for every component.

When reviewing a frontend change, link its recorded style decision and surface a
missing decision before merging. This is a contributor/agent instruction and
review reminder, not an automated block on a direct Git push.

## First checkout

1. Clone this repository and start from the shared `main` branch, which contains
   the merged foundation. Use a feature branch for your work.
2. Install Node.js 22.13+ within Node 22. `.nvmrc` selects that release line.
3. Run `npm ci` and `npm run dev`. No credentials are needed to see the preparation
   page or call `GET /api/health`.
4. Read `docs/architecture.md` and `docs/api-contracts.md`. Use the shared schemas
   in `src/lib/contracts` rather than defining a competing request format.
5. Before handing off, run `npm run check` and `npm run build`.

In Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd`
for these commands (for example, `npm.cmd ci`). No policy change is needed.

The full checks also need Git and GnuPG; see the
[local secrets guide](docs/development-secrets.md) for executable detection.
Before the first local browser smoke test, run
`npx playwright install chromium --only-shell`, then `npm run build` and
`npm run test:e2e`. The five pending product flows remain explicitly skipped.

For hosting setup, use [the Vercel deployment guide](docs/deployment.md).
`vercel.json` runs the checks before building and includes development build
tools during installation. The first foundation deployment needs no app keys.

## Working on live integrations

For shared development settings, follow [the encrypted local setup guide](docs/development-secrets.md).
Receive the unlock file privately from the project owner, save it under
`.secrets/development-env.key`, and run `npm run env:pull` after cloning/pulling.
Use `npm run env:pull -- --merge` to fill blank/missing values in an existing
`.env.local`; nonblank local values are preserved. GitHub Actions Secrets cannot
be downloaded to a laptop; this is a separate encrypted application-only bundle.

You can also copy `.env.example` to `.env.local` and use your own development
keys. A separate key in the funded workspace makes individual development access
easier to revoke and attribute. Supabase public settings and the Anthropic model
must be supplied when those integrations are enabled if still blank in the template.

Only these values are application settings:

| Variable | Scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe application identity; RLS still required |
| `ANTHROPIC_API_KEY` | Server only |
| `ANTHROPIC_MODEL` | Server only; a model ID available to the configured workspace |
| `VOICE_INPUT_ENABLED` | Optional server flag; defaults to `false`; configuration only |
| `DEEPGRAM_API_KEY` | Server only; optional while voice is disabled |
| `TAVUS_AUDIO_ENABLED` | Independent optional server flag; defaults to `false` |
| `TAVUS_API_KEY` | Server only; optional while Tavus is disabled |
| `TAVUS_PAL_ID` | Server only; preconfigured Echo PAL ID for future activation |

The [Deepgram voice-input preparation](docs/voice.md) adds no live capture or microphone
UI. Leave it disabled for text work. Its private configuration must not be sent
to a browser, and enabling the flag alone does not implement the voice feature.
The separate [Tavus audio-output architecture](docs/tavus.md) is also disabled.
It prepares private audio-only sessions and supplied-text playback, with no
camera capture or video UI. Live Echo/audio-only compatibility remains untested.

Use an HTTP(S) Supabase URL and an `sb_publishable_` key; legacy `anon` JWTs
also work. Secret keys and `service_role` JWTs are rejected. Both public settings
may be blank for the preparation app, but a partial or invalid configuration
fails before Next.js bundles browser code. Do not put privileged keys in any
`NEXT_PUBLIC_*` variable. See [Supabase key types](https://supabase.com/docs/guides/getting-started/api-keys).

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
- `npm run check` includes request-contract, runtime-configuration, and dictation
  checks as well as lint, types, and SQL behavior. They use fake settings and do
  not call paid services. CI also runs `npm audit --audit-level=moderate`.
- `minimatch` is pinned to 11.0.1 through an npm override to fix the lint
  toolchain's [glob-pattern amplification advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
  The installed consumers use APIs retained in 11; rerun lint and the full checks
  when changing this override or upgrading those tools.
- Feature tests should cover ownership, approval, concurrency, and failure paths
  when those behaviors are implemented. Do not represent stubs as completed tests.

## Review checklist

Explain the user-visible behavior, the API/schema changes, and how you verified
it. In particular, check that one user's IDs cannot expose another user's data,
that expired/unapproved memories cannot enter model context, and that failures
do not leave the UI claiming an action or memory was saved when it was not.
For frontend work, also verify that the collaborator chose an image-generated
design for the change's scope and link the decision in the review description.
