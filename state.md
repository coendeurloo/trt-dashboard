# state.md

Last updated: March 15, 2026

**Note for Claude:** Always work from `C:\Users\deurl\Documents\LabTracker` (not `/sessions/` clone)

## Current status

Beta is live at `labtracker.app`.
LabTracker now runs in local-first mode by default, with optional cloud mode (account + sync) behind explicit consent.
Core flows are in place: upload -> extraction review -> save -> trend dashboard -> AI analysis.
Parser QA is active with batch registry + scorecards.

## Recently completed

- Onboarding wizard shipped: 5-step progressive disclosure modal on first PDF upload with autocomplete inputs for compounds/supplements, wellbeing check-in, and feature tour
- User profile system shipped end-to-end: onboarding + settings selector, profile-aware labels, profile-based tab visibility, and profile-aware analytics/AI persona behavior
- Schema moved to v6 with `userProfile` in app settings and safe normalization on load
- External AI consent flow hardened: explicit consent modal, per-run sharing choices, local-first defaults, and sanitized AI payloads (`sanitizeForAI`)
- Cloud auth + sync foundation shipped: email/Google sign-in, consent endpoint, sync replace/incremental endpoints, delete-account flow, and Cloud Sync panel in settings
- Parser uncertainty handling shipped with `PDF_UNKNOWN_LAYOUT` and in-app parser-improvement submission flow (explicit consent required)
- Parser robustness upgrades for Quest/LabCorp fixtures and expanded marker coverage (including Cardio IQ aliases)
- Modal/UX polish round completed across extraction review, parser upload summary, reports cards/header density, and wellbeing check-ins
- Parser batch workflow + scorecards added and running (B01-B04 currently logged as PASS/PASS* with source-quality caveats)
- Test coverage expanded to 56 test files in `src/__tests__`

## In progress

- Improving parser fixture quality: many candidate files are still auto-skipped due unreadable OCR/source quality
- AI analysis UX polish: loading/error clarity and friendlier handling when providers are overloaded
- Mobile and light-mode readability polish

## Next up

- Continue parser batches with cleaner source PDFs/scans and complete manual UI handchecks
- Improve user-facing handling for Anthropic overload errors (`529`) with clearer retry guidance
- Add profile-specific demo dataset variants (`src/demoData.ts` TODO)
- Distribution push: Reddit launch post + short demo video

## Known issues

- AI analysis can still return `529` during Anthropic overload windows
- Storage key remains `trt_lab_tracker_v1` (legacy, cannot rename without migration)
- Light mode remains less polished than dark mode in some surfaces
- Parser throughput is bottlenecked by poor source document quality (OCR-heavy inputs)

## Schema

Current: v6, stored in `localStorage` key `trt_lab_tracker_v1`.
`userProfile` is now part of `AppSettings`, with normalization handled in `src/storage.ts`.
