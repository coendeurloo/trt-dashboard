# Contributing to LabTracker

Thanks for contributing.

## Quick start
1. Install dependencies: `npm ci`
2. Start local dev server: `npm run dev`
3. Run quality checks before opening a PR: `npm run ci:check`

## Branch and PR flow
1. Create a feature branch from `main`.
2. Keep PRs focused (one problem per PR).
3. Include a short test plan in the PR description.
4. If you change parser logic, add or update fixtures/tests.

## Required local checks
- `npm run lint`
- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`

## Testing notes
- Unit/integration tests: `npm test`
- Coverage report (HTML): `coverage/index.html` after `npm run test:coverage`
- Parser batch checks:
  - `npm run parser:batch-report`
  - `npm run parser:batch-strict`

## Security and privacy guardrails
- Do not commit real patient data.
- Use synthetic or anonymized fixtures only.
- Keep AI external calls opt-in by default.
- If you find a security issue, follow `SECURITY.md`.
