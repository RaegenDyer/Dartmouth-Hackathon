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

## Guardrails ([docs/guardrails.md](../docs/guardrails.md))

- [ ] No guardrail changed, or the changed ID is named below with its updated test or eval
- [ ] CS-8: any missed crisis phrasing was added to `evals/data/safety-triggers.json` before the code change
- [ ] DB-4: no streaks, badges, or return-notifications added
- [ ] IS-6: no audience screening questions asked in chat
- [ ] CD-3/CD-4/CD-5: copy makes no claim to reduce loneliness or prevent harm, never says the emergency contact is notified, and avoids "absolute", "100 percent private", "never accessed", and "unbreakable"
- [ ] [docs/guardrails-status.md](../docs/guardrails-status.md) updated if a status changed

## Frontend style decision

- [ ] No user-facing UI changes
- [ ] UI changes follow the recorded decision in `docs/design/README.md` (link it)

## Assumptions
