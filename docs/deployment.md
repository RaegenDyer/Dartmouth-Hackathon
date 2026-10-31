# Vercel hosting preparation

Status, October 31, 2026: project `candid-dartmouth` created in `raegendyer` and
connected to `RaegenDyer/Dartmouth-Hackathon`, production branch `main`. Next.js,
Node 22, locked installation, and the checked build command are configured.
The owner authorized the GitHub integration. Hosting was verified live at
https://candid-dartmouth.vercel.app on October 31, 2026, application commit
`a571b39969b5ad469086e95d3636350829142a92` (Vercel Ready, page/health HTTP 200).
The unconfigured session route returns a safe 503 as expected.
Configured activation was verified on the same public URL at application commit
`7fbd98070b565eef341737f9335549f730bfc830`, deployment
`dpl_2CpyUsAdcmYxzKy4HeZ4hyGX8Aw1` (Ready). Anonymous sign-in, one real Claude
reply, memory approval/reload, history, ownership isolation, and cleanup passed
all 32 hosted checks. Production uses `claude-sonnet-5-5` and Supabase storage.
Chat, anonymous auth, and encrypted Supabase persistence now exist in the app.
With blank app settings the first deployment shows setup instructions and health;
configured chat requires the established encryption key and runtime settings below.

## First deployment: steps in your accounts

1. Open the existing [candid-dartmouth project](https://vercel.com/raegendyer/candid-dartmouth).
   Do not create a second project for this repository.
2. Settings -> Git should show `RaegenDyer/Dartmouth-Hackathon`. The owner
   completed the GitHub App authorization, which is separate from the local
   GitHub management token.
3. Confirm the settings below. The repository's `vercel.json` supplies the
   framework, install command, and build command. Keep the output directory at
   the framework default.
4. Leave application settings empty for the first hosting verification. This
   shows setup instructions and keeps health credential-free. It does not enable
   working chat. No database changes are needed to verify this setup deployment.
5. Deploy the reviewed `main`, wait for Ready, and open the assigned domain.
   In Project Settings -> Environments -> Production -> Branch Tracking, confirm
   `main` is the production branch.
6. Verify the page and health endpoint using the checks below, then record the
   project name, production URL, commit SHA, and verification date in the README.

Vercel's [GitHub integration](https://vercel.com/docs/git/vercel-for-github)
connects the repository; [Git deployments](https://vercel.com/docs/git) use the
production branch for production deployments and other branches/PRs for previews.
GitHub Actions remains an independent check, so confirm it passes before merging.

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | Repository root (`./`) |
| Production branch | `main` |
| Node.js | 22.x, matching `package.json` |
| Install command | `npm ci --include=dev` (checks need the development build tools) |
| Build command | `npm run check && npm run build` |
| Output directory | Framework default; leave the override off |
| Domain | Start with the assigned `.vercel.app` domain |

This repository is now public. Vercel supports free collaboration for public
repositories, so its private-repository Hobby restriction no longer applies.
Public visibility does not grant Vercel GitHub App access by itself; complete
the import authorization above. If a contributor's deployment is blocked,
review [Vercel collaboration requirements](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
and Git provider connections. If the repository becomes private again, revisit
the plan requirements before relying on collaborator deployments.

## Verify the hosted foundation

1. Open the production domain and confirm the setup instructions load, or the
   chat screen if all runtime settings have deliberately been supplied.
2. Open `/api/health` on that same domain. Expect HTTP 200 and:

   ```json
   {"status":"ok","service":"dartmouth-hackathon","stage":"foundation"}
   ```

3. Check Vercel's deployment details show the intended `main` commit.
4. Test the production domain in a signed-out/private browser before sharing it
   with judges or collaborators. If a Vercel login appears, review Project
   Settings -> Deployment Protection for the intended audience. Production
   domains and generated deployment URLs can have different protection rules;
   use the appropriate share URL. See [Deployment Protection](https://vercel.com/docs/deployment-protection).

Passing these checks verifies hosting and liveness, not a working AI product or
live provider/database connectivity. No custom domain or additional service is
needed for this first deployment.

## Reproduce the configured app deployment

Production is configured and verified. These steps describe the settings needed
for another environment or future redeployment; retain the existing data key.

1. Recover the **existing** `CONTACT_ENCRYPTION_KEY` from the collaborator's
   configured environment and save it in ignored `.env.local`. Do not send its
   value in chat or generate a replacement for the shared database: stored text
   is encrypted under that key, and a different key cannot read it.
2. Verify the schema includes the reviewed migrations. Activation confirmed the
   two memory/proposal ciphertext checks already allow 2,048 characters, as in
   `supabase/migrations/202610310002_ciphertext_capacity.sql`; no duplicate DDL
   was run. Apply all three migrations to new databases and reconcile CLI history
   with the actual schema for existing projects.
3. Add runtime settings and redeploy. Current production uses
   `LLM_ADAPTER=anthropic`, `ANTHROPIC_MODEL=claude-sonnet-5-5`, and
   `COMPANION_STORAGE=supabase`. Optional voice flags remain false. Mock mode
   remains available for offline development and test fixtures.

In Project Settings -> Environment Variables, add the values for the intended
Production and/or Preview environment, then redeploy. GitHub Actions secrets are
not automatically copied to Vercel. Keep production credentials out of untrusted
preview builds; use designated development settings when previews need services.
Collaborator laptop setup uses a separate [encrypted development bundle](development-secrets.md),
not an export of GitHub Actions Secrets. Its unlock file and decrypted values
stay out of Vercel source uploads.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe HTTP(S) project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe `sb_publishable_` key; legacy `anon` JWT supported |
| `ANTHROPIC_API_KEY` | Server-only app key, stored as a sensitive environment variable |
| `ANTHROPIC_MODEL` | Production: `claude-sonnet-5-5`, verified available and exercised by the hosted check |
| `LLM_ADAPTER` | Production: `anthropic`; offline test fixtures use `mock` |
| `CONTACT_ENCRYPTION_KEY` | Required for production companion requests, including mock mode; established 32-byte base64 data key |
| `COMPANION_STORAGE` | `supabase` for persistent deployment; process memory is for tests |
| `VOICE_INPUT_ENABLED` | Optional server flag; leave `false` while live voice is unimplemented |
| `DEEPGRAM_API_KEY` | Optional server-only Deepgram key; never a public variable |
| `TAVUS_AUDIO_ENABLED` | Independent optional server flag; keep `false` during preparation |
| `TAVUS_API_KEY` | Optional server-only Tavus key; never a public variable |
| `TAVUS_PAL_ID` | Optional server-only Echo PAL ID |

The [voice-input architecture](voice.md) remains disabled and makes no calls.
The first foundation deployment needs no Deepgram values. Vapi is no longer used.
Enabling configuration
alone does not implement voice; use the documented activation work first.
The separate [Tavus audio-only scaffold](tavus.md) also needs no settings for the
first foundation deployment. Its mode combination, session ownership, and RTC
transport need verification/implementation before enabling live playback.

Configure the two public Supabase values together. Partial or privileged public
configuration fails before bundling. Never add `GITHUB_TOKEN`, `VERCEL_TOKEN`,
`SUPABASE_ACCESS_TOKEN`, or Supabase secret/service-role keys to app runtime
settings. The local `credentials.env` is management access and stays uncommitted.
See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Anonymous authentication is implemented. When permanent login or callback flows
are added, use the actual hosted domain in Supabase's Site URL and redirect
allowlist. Do not invent callback routes during this hosting verification.
Rate limits, turn deduplication, and inactivity tracking still use process memory;
the shared serverless implementation remains work before a wider pilot.

## Failed builds and recovery

The first Vercel attempt exposed a route-test fixture that relied on a
nonproduction environment. The fixture now supplies and restores its own random
test encryption key, so `npm run check` works with `NODE_ENV=production` without
any runtime secrets. This does not configure or weaken the deployed data key.
The configured build exposed a second test-isolation issue: Next.js's dotenv
loader inherited a production data key while verifying a dummy fixture with a
blank key. The roundtrip test now clears all fixture-owned variables from its
child environment and deliberately injects a dummy ambient key as regression
coverage. Full checks/build pass with the configured production environment.

1. Open the failed deployment's build logs and identify the first failing step.
   Check Node 22, the repository root, and the exact environment-variable names.
2. Correct the code or settings and redeploy the intended commit. Settings changes
   need a new deployment; restarting a local dev server does not update Vercel.
3. If a new production deployment breaks a previously working version, use the
   Production Deployment tile's **Instant Rollback** where available. On Hobby,
   rollback targets the immediately previous production deployment. Verify the
   page and health endpoint again. See [Instant Rollback](https://vercel.com/docs/instant-rollback).

Deployment does not approve a visual direction. Follow the collaborator-led,
image-generation [design workflow](design/README.md) before frontend design work.
