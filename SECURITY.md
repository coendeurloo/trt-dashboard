# Security Policy

## Reporting a vulnerability
Please report vulnerabilities privately to: `trtlabtracker@gmail.com`

Include:
- Short summary of the issue
- Reproduction steps
- Impact assessment
- Suggested fix (if available)

Please do not open a public GitHub issue for active security vulnerabilities.

## Response targets
- Acknowledgement: within 3 business days
- Initial triage: within 7 business days
- Fix timeline: depends on severity and exploitability

## Supported versions
- Current default branch (`main`) is supported.
- Older commits are best-effort only.

## Scope highlights
- API endpoints under `api/`
- Client-side data handling under `src/`
- Share-link encryption and storage paths
- AI proxy and rate-limiting logic

## Privacy boundaries
- Default behavior is local parsing in the browser.
- External AI is opt-in and guarded by consent checks.
- Without consent, no external AI request is made.
- When consent is granted, payloads are limited to required fields for the selected action.

## Out of scope
- Issues requiring physical access to a user device
- Denial of service caused solely by local development environments
