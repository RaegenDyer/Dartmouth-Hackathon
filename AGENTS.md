# Project guidance

- This repository is the Dartmouth hackathon companion project. Do not carry
  assumptions or credentials over from other projects.
- Mandatory frontend style checkpoint: before creating any user-facing frontend
  screens, layouts, visual components, or styling, reopen the style discussion
  with the project owner. Read docs/design/README.md and show/revisit its three
  generated directions and raster icon study. No direction is currently approved;
  the assistant's recommendation is not approval. If the owner has not recorded
  a selection, revised direction, or explicit waiver, pause frontend design and
  ask for that decision. Backend and nonvisual preparation may continue.
- Record the owner's style decision, its scope, and date in docs/design/README.md
  before proceeding, and update the README checkpoint status. An approval or
  waiver covers its agreed scope; do not ask again for every component. Flag
  frontend changes for this checkpoint during review before they are merged.
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
- For app visual design, use the image-generation workflow for original raster
  icons and illustrative assets. The user prefers these over SVG/vector icon
  packs, icon fonts, emoji, or CSS-drawn asset substitutes. Keep accessible text
  labels and real HTML controls. Visual concepts remain proposals until selected.
