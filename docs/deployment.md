# Vercel hosting preparation

Status, October 30, 2026: prepared; no deployment verified yet. The foundation is
on `main`. The first deployment serves the preparation page and `/api/health`;
authentication, chat, and saved-data features are still implementation work.
The account check found the `raegendyer` Hobby team, no Vercel projects, and a
private personal GitHub repository. Import and GitHub App authorization remain.

## First deployment: steps in your accounts

1. Open [Vercel New Project](https://vercel.com/new), sign in, and choose the
   intended account/team. Import `RaegenDyer/Dartmouth-Hackathon` from GitHub.
2. If the repository is missing, configure the Vercel GitHub App and grant it
   access to this repository. This account authorization is separate from the
   GitHub token in the local credential file.
3. Confirm the settings below. The repository's `vercel.json` supplies the
   framework, install command, and build command. Keep the output directory at
   the framework default.
4. Leave application environment variables empty for this first foundation
   deployment. This page and health endpoint do not call Anthropic or Supabase.
   Applying the draft database migration is not needed to verify hosting.
5. Click **Deploy**, wait for Ready, and open the production domain Vercel assigns.
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

For a private repository with multiple contributors, check the chosen Vercel
plan before relying on every contributor's push creating a deployment. Hobby
does not support private-repository collaboration; Vercel checks commit-author
access and requires the Hobby team's owner as the author. Review
[Vercel collaboration requirements](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
if an author is blocked; selecting a paid team is a separate account decision.

## Verify the hosted foundation

1. Open the production domain and confirm the preparation page loads.
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

## Add application settings when integrations are implemented

In Project Settings -> Environment Variables, add the values for the intended
Production and/or Preview environment, then redeploy. GitHub Actions secrets are
not automatically copied to Vercel. Keep production credentials out of untrusted
preview builds; use designated development settings when previews need services.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe HTTP(S) project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe `sb_publishable_` key; legacy `anon` JWT supported |
| `ANTHROPIC_API_KEY` | Server-only app key, stored as a sensitive environment variable |
| `ANTHROPIC_MODEL` | Model ID available to the configured Anthropic workspace |

Configure the two public Supabase values together. Partial or privileged public
configuration fails before bundling. Never add `GITHUB_TOKEN`, `VERCEL_TOKEN`,
`SUPABASE_ACCESS_TOKEN`, or Supabase secret/service-role keys to app runtime
settings. The local `credentials.env` is management access and stays uncommitted.
See [Vercel environment variables](https://vercel.com/docs/environment-variables).

When authentication is implemented, configure Supabase's Site URL and redirect
allowlist using the actual hosted domain and implemented callback routes. No
callback route or auth flow exists yet; do not invent one during hosting setup.

## Failed builds and recovery

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
