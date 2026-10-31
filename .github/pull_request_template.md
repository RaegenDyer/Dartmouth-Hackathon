## Summary

<!-- What changed and why. Keep PRs small: one feature per PR where possible. -->

## Features touched

- [ ] F1 Conversation
- [ ] F2 AI disclosure
- [ ] F3 Memory capture
- [ ] F4 Memory panel
- [ ] F5 Memory disclosure
- [ ] F6 Weekly social action
- [ ] F7 Only-connection redirect
- [ ] F8 Safety path
- [ ] F9 Scenario test suite
- [ ] Guardrails / CI / tooling only

## Acceptance tests run

- [ ] `npm run check` (lint, format, typecheck, unit, contract/runtime/schema checks)
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm run eval:fast`
- [ ] `npm run eval:llm` (required when prompts or `src/lib/companion/**` change)

## Boundary, safety, and memory rules

- [ ] No boundary rule, safety trigger list, or memory rule changed
- [ ] A rule changed. The reason is explained below, and the eval datasets in `evals/data` were updated to match

## Frontend style decision

- [ ] No user-facing UI changes
- [ ] UI changes follow the recorded decision in `docs/design/README.md` (link it)

## Assumptions
