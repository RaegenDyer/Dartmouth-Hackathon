# Shared development settings

GitHub Actions Secrets hold workflow credentials. Their saved values cannot be
downloaded to a developer's laptop through GitHub's secrets API. This repository
also has a separate encrypted development-settings bundle so trusted collaborators
can configure their own local environment without committing plaintext keys.

## Collaborator setup

1. Clone this repository or pull the latest `main`. Install the project's Node 22
   release line and dependencies with `npm ci`.
2. Receive `development-env.key` privately from the project owner. Save it as
   `.secrets/development-env.key` inside this checkout. The directory is ignored
   by Git and excluded from Vercel uploads. Keep this file out of issues, pull
   requests, chat transcripts, and shared source files.
3. Run `npm run env:pull`. The script decrypts `secrets/development.env.gpg` into
   `.env.local`. If that file already exists, use `npm run env:pull -- --merge`
   to fill only blank/missing application settings while preserving nonblank
   values you already configured.
4. Start the app with `npm run dev`. Voice flags and `LLM_ADAPTER=mock` are the
   distributed defaults. Enable a live feature only after its integration work
   and configuration are ready. Choose an available Anthropic model when needed;
   supply Supabase public settings if they remain blank.

In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
The helper finds `gpg` on PATH or the bundled Git for Windows executable.
If it cannot find GnuPG, install it from [the official downloads](https://gnupg.org/download/)
or set `GPG_BINARY` to your installed executable. No additional service account
is needed for this local decryption step.

The unlock file contains a randomly generated passphrase for standard GPG AES256
encryption. The passphrase and actual API keys are never printed by these commands.
The script parses environment data as data; it does not execute shell assignments.
It also requires `.env.local` to be ignored and untracked before importing.
GPG must confirm successful decryption; an unencrypted OpenPGP packet is refused.
Values that cannot round-trip safely through dotenv and Next.js expansion,
including dollar references, are rejected before the bundle is replaced.

## What is shared

The bundle allowlists available development values for:

- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.
- `DEEPGRAM_API_KEY`.
- `TAVUS_API_KEY` and `TAVUS_PAL_ID`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Only populated values are included. Blank template settings stay blank and must
be supplied when their integration is used. Disabled voice flags and mock model
selection are included as defaults. Existing nonblank local choices take priority
during a merge.

The shared file excludes GitHub tokens, Vercel management tokens, Supabase access
tokens/service-role keys, and contact-encryption keys. Collaborators use their own
management access if their task requires administration. The encrypted bundle
is for funded application development, not production-secret distribution.

## Owner updates and access

Run `npm run env:encrypt` after changing local development settings. The helper
selects only allowlisted nonblank values from `.env.local`, falling back to
`credentials.env` for application values such as the existing Anthropic key.
It uses the existing unlock file. On first creation it generates that file only
after verifying Git ignores the private path. If the encrypted bundle exists but
the unlock file is missing, recover the original file instead of replacing it.

Commit and push the updated `secrets/development.env.gpg` ciphertext. Share the
unlock file only through the owner's chosen private channel with people who need
development access, and retain a private backup. Each collaborator then pulls
the repo and imports the bundle locally. The owner handles that private handoff;
the repository does not send messages or expose a public unlock endpoint.

Removing repository access or changing the unlock file does not revoke API keys
already received. To revoke shared provider access, rotate those provider keys,
update local settings and GitHub Actions Secrets, and regenerate the encrypted
bundle. Previously published encrypted versions can remain in Git history.

Routine CI remains credential-free. It tests this mechanism with dummy values;
there is no workflow that exports repository secret values or unlock files.
