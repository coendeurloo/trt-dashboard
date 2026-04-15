# state.md

Last updated: April 11, 2026

**Note for Claude:** Always work from `C:\Users\deurl\Documents\LabTracker` (not `/sessions/` clone)

## Current status

Beta is live at `labtracker.app`.
LabTracker now runs in local-first mode by default, with optional cloud mode (account + sync) behind explicit consent.
Core flows are in place: upload -> extraction review -> save -> trend dashboard -> AI analysis.
Parser QA is active with batch registry + scorecards.

## Recently completed

- Protocol dose UX overhaul shipped (multi-pass):
  - Dose input now supports both `Per administration` and `Weekly dose` in the same row
  - 2-way sync works both directions based on last edited field when frequency is known
  - Canonical storage stays weekly-compatible (`dose` and `doseMg` keep weekly values for simulator compatibility)
  - Clarified compact column labels for dose fields in protocol editor and onboarding
  - Fixed compound table overflow so the delete `X` stays inside the grid on desktop widths
- AI analysis flow upgrade shipped:
  - Refactored AI Analysis hero input flow for a clearer ask-first experience
  - Optimized Claude analysis flow and related pipeline/build integration
  - Analysis view tests updated to cover the new hero flow behavior
- Cloud account flow polish shipped:
  - Added branded verification email flow and centered verification layouts
  - Added verification funnel analytics and sign-in prefill
  - Added password reset flow and improved account UX
  - Fixed stale `session expired` modal state behavior
  - Added privacy-first Sentry monitoring plus timezone fix for keepalive monitor
- Protocol Impact UX refinement shipped in multiple passes:
  - View restructured to single-event insight flow with clear hierarchy and progressive disclosure
  - Outcome is now primary: top "What changed after this update" summary with top 3 marker changes
  - Marker cards simplified to name + `before -> after` + percent change (reduced dashboard noise)
  - Compact metadata line added (`improved • worsened • confidence`) instead of a heavy summary card
  - Protocol changes moved to a lighter secondary section and then merged into the top split layout to reduce unused space
  - Top section now uses a 2-column desktop layout (Outcome + Protocol changes) and stacked mobile layout
  - Hero typography reduced for readability while keeping strong scanability
  - Protocol-change dropdown/timeline labels now include compound context (for example dose change + compound name)
  - Protocol Impact view tests updated to match new hierarchy; targeted test suite and build both green
- UX Remediation Wave 3 (resterende punten) shipped:
  - Uniforme header-stat chips per tab via `AppShell` (Dashboard, Reports, Alerts, Supplements, Protocols, Wellbeing)
  - Dashboard chart settings vervangen door echte `ChartSettingsDrawer` (desktop right drawer, mobile/tablet bottom sheet)
  - Drawer sluit nu via `X`, `Esc` en backdrop, met body scroll lock tijdens open
  - Mobiele navigatie verbeterd: grotere close target (44x44), swipe-to-close, en safe-area padding
  - Herbruikbare `EmptyStateCard` toegevoegd en toegepast op Alerts, Protocols en Wellbeing
  - Banners gecomprimeerd: nooit meer 2 persistente top-banners tegelijk (demo-banner heeft nu subtiele backup-tip inline)
  - Desktop-sidebar is inklapbaar (`expanded`/`compact`) met icon-first compacte modus en upload-shortcut
  - Sidebar-voorkeur wordt persistent opgeslagen in settings (`sidebarCollapsedDesktop`)
  - Wave-scope i18n-dekking aangevuld voor nieuwe shell/drawer/empty-state tekst
  - Regressie-suite groen (typecheck + volledige vitest)
- Dashboard upload layout hotfix shipped:
  - Removed the large primary upload card from dashboard main content
  - Restored the original full upload panel in the desktop sidebar
  - Kept quick-upload behavior working through the restored sidebar flow
  - Updated AppShell/Dashboard contracts and related tests
- UX Remediation Wave 1 (kritiek + hoog) shipped:
  - Central delete orchestrator with global 10s Undo toast in `App`
  - Confirm dialogs before destructive deletes in Reports, Protocols, Supplements (Check-ins kept existing confirm step)
  - Undo coverage for report delete (single + bulk), supplement delete, protocol delete, and check-in delete
  - Upload UI de-duplicated with sidebar as the single primary upload area (dashboard no longer shows oversized upload card)
  - Quick Upload now does direct picker first, with fallback to sidebar upload panel (navigate + smooth scroll + highlight + status feedback)
  - Supplements UX feedback improved: add-form auto-scroll/focus, required-field validation, success feedback, and explicit Cancel label in edit mode
  - Language selector removed from shell header; language change is now in Settings > Appearance only
- UX Remediation Wave 2 (current slice) shipped:
  - Dashboard all-marker filtering integrated into the top filter bar with search + category filtering
  - Category UX simplified to broader grouped categories via compact selector (no horizontal chip rail / no horizontal scrollbar)
  - Alerts view now prioritizes actionable alerts before positive signals
  - Hormone stability info popover layering/opacity adjusted to avoid semi-transparent overlap artifacts
  - Added compact wellbeing reminder modal that prompts after 7 days without a check-in
- Added/updated test coverage for delete undo, upload fallback, delete confirmations, shell/dashboard prop changes, and supplements UX flows
- Claude streaming upgraded end-to-end (real SSE, no fake reveal): backend proxy streams directly to frontend, frontend renders progressive chunks, and abort/race handling is in place
- AI Analysis page redesigned into clearer hierarchy: header -> compact info bar -> lighter stats strip -> primary Ask AI workspace + secondary quick actions -> full-width output
- Ask AI panel visual refinement round shipped: shorter focused textarea, CTA anchored directly under input, tighter suggestions rhythm, quieter helper note, improved light/dark polish
- Ask AI prompt behavior updated to be question-first (no broad "story so far" fallback), with output guard remapping generic sections into direct-answer structure when needed
- Analyst memory prompt is now profile-aware (TRT / enhanced / health / biohacker) instead of hardcoded TRT framing
- Modal responsiveness polish applied: desktop max-width respected, mobile-friendly bottom-sheet behavior for key modals, and AI output remains inline on the page
- Local AI suggestions now generated deterministically from report signals via dedicated suggestion utility + hook (no AI/API usage)
- Protocol UX simplified: no visible version management on Protocols page, cleaner cards, and clearer copy
- Protocol edit save flow now explicit for linked reports: `Nieuw protocol maken` (default) vs `Bestaand aanpassen` with linked-report warning list
- `replace_existing` flow now updates linked report labels and clears protocol snapshot/version refs so retroactive edits are truly retroactive
- Report-specific protocol modal wording simplified (no "version" jargon in user-facing labels)
- Active protocol logic updated app-wide: newest created/edited protocol is now active, with visible `Active` badge on Protocol cards
- Save-choice warning modal restyled for better light-mode readability/contrast
- Personal info system shipped: name, DOB, biological sex, height, weight stored in personalInfo with dashboard greeting ("Good morning, Coen") and contextual nudges
- Settings redesigned with 6-tab layout: Profile, Appearance, Analysis, Data, Markers, Account (replaces flat scroll)
- Onboarding wizard expanded to 6 steps: success, personal info, protocol, wellbeing check-in, supplements, summary with autocomplete inputs
- User profile system shipped end-to-end: onboarding + settings selector, profile-aware labels, profile-based tab visibility, and profile-aware analytics/AI persona behavior
- Schema moved to v6 with `userProfile` in app settings and safe normalization on load
- External AI consent flow hardened: explicit consent modal, per-run sharing choices, local-first defaults, and sanitized AI payloads (`sanitizeForAI`)
- Cloud auth + sync foundation shipped: email/Google sign-in, consent endpoint, sync replace/incremental endpoints, delete-account flow, and Cloud Sync panel in settings
- Parser uncertainty handling shipped with `PDF_UNKNOWN_LAYOUT` and in-app parser-improvement submission flow (explicit consent required)
- Parser robustness upgrades for Quest/LabCorp fixtures and expanded marker coverage (including Cardio IQ aliases)
- Modal/UX polish round completed across extraction review, parser upload summary, reports cards/header density, and wellbeing check-ins
- Parser batch workflow + scorecards added and running (B01-B04 currently logged as PASS/PASS* with source-quality caveats)
- Test coverage expanded to 74 test files in `src/__tests__`

## In progress

- Improving parser fixture quality: many candidate files are still auto-skipped due unreadable OCR/source quality
- AI analysis UX polish: continued copy/spacing tuning and prompt quality iteration based on real-user feedback
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

Current: v7, stored in `localStorage` key `trt_lab_tracker_v1`.
`userProfile` and `sidebarCollapsedDesktop` are part of `AppSettings`, with normalization handled in `src/storage.ts`.
