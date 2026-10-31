# Project guidance

- This repository is the Dartmouth hackathon companion project. Do not carry
  assumptions or credentials over from other projects.
- Mandatory frontend design workflow: when frontend work is about to begin,
  reopen the style discussion with the collaborator currently requesting or
  leading that work. Any project collaborator may make the decision; approval
  from the original project owner is not required. Read docs/design/README.md
  and docs/design/design-masters.md, and show the existing generated concepts.
- Use the image-generation model to design app screens and visual directions
  informed by compatible references from the catalog of 100 design masters.
  This applies to the app mockups and layouts, not just icons. Discuss the
  generated options with the collaborator and use image generation for requested
  refinements or new directions. Existing generated concepts can be selected if
  they fit the current scope. Do not independently invent and implement a style
  in frontend code before this discussion and the collaborator's decision.
- Record the deciding collaborator, selected generated concept(s), decision,
  scope, and date in docs/design/README.md, and update the README checkpoint
  before frontend implementation. If no collaborator decision is available,
  pause implementation; backend and nonvisual preparation may continue. A
  decision covers its agreed scope without repeating it for every component.
  Link the decision when reviewing frontend changes before merging.
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
- Deepgram is selected for optional speech input; Vapi was dropped on October 31.
  Read docs/voice.md before voice work. Keep voice disabled by default; transport
  is not implemented. Preserve editable dictation and explicit Send. Keep the
  permanent Deepgram key server-only. Spoken output is a separate optional
  decision; outbound calls remain outside scope.
- The optional mascot direction is a cute, whimsical animal or creature, rendered
  in the app with generated raster artwork/animation. Tavus is not required for
  this direction. Discuss and image-generate the actual mascot design with the
  collaborating person before implementation; the style checkpoint stays pending.
- For app visual design, use the image-generation workflow for app mockups as
  well as original raster icons and illustrative assets. The user prefers
  generated raster assets over SVG/vector icon packs, icon fonts, emoji, or
  CSS-drawn asset substitutes. Keep accessible text
  labels and real HTML controls. Visual concepts remain proposals until selected.
