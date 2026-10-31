# Project guidance

- This repository is the Dartmouth hackathon companion project. Do not carry
  assumptions or credentials over from other projects.
- Read README.md, docs/architecture.md, and docs/api-contracts.md before feature
  work. Keep implemented behavior distinct from proposed contracts and drafts.
- Use Node 22 and npm. Run npm run check and npm run build for code changes.
- Keep provider and management secrets out of Git, logs, browser bundles, and
  shared documents. Inspect secret presence without printing values. Read local
  management credentials only when an authorized task actually needs them.
- Database access in the app uses verified user identity and RLS. Management
  tokens are reserved for account/project administration and deployment tooling.
- Preserve explicit user control over saved memories and social actions. Do not
  implement clinical claims, a promise of reliable crisis detection, autonomous
  contact with other people, or hidden memory persistence.
- For account and console setup, prefer focused step-by-step guidance. Use
  existing authorized access when the user asks you to carry out the action.
