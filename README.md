# LabTracker

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./src/assets/labtracker-logo-dark.svg" />
    <img src="./src/assets/labtracker-logo-light.svg" alt="LabTracker logo" width="520" />
  </picture>
</p>

LabTracker is a privacy-first web app that turns messy lab PDFs into clear trends and actionable insights. Upload reports, review extracted biomarkers, compare latest vs previous labs, and run AI-assisted analysis in one dashboard.

Current beta focus: hormone and bloodwork tracking (including TRT-style workflows).  
Roadmap direction: broader performance and general health lab tracking.

Live app: [labtracker.app](https://labtracker.app)

## Privacy behavior (important)

- Default: parsing stays local in the browser (text extraction + OCR when needed).
- External AI is **off by default**.
- Before any external AI run, the app shows a consent check where the user can choose what to share.
- If consent is not granted, parser fallback AI and AI analysis are both blocked.
- Parser rescue can use redacted text and, only when explicitly allowed, the full PDF.
- AI limits/budget are stored in Upstash Redis. If Redis is unavailable, external AI calls fail closed (`503 AI_LIMITS_UNAVAILABLE`).

## Features implemented

- Drag-and-drop PDF upload (`react-dropzone`)
- Adaptive PDF parser for mixed lab layouts (tables, line-based rows, multi-line rows)
- Smart OCR fallback for scanned PDFs (`tesseract.js`, client-side, only when needed)
- Gemini parser fallback (server proxy) + Claude AI lab analysis (full and latest-vs-previous)
- Editable extraction review table with hover edit icon
- Report context fields:
  - Protocol
  - Sampling timing
  - Supplements
  - Symptoms
  - Notes
- Dashboard charts (`recharts`):
  - Key Biomarkers: Testosterone, Free Testosterone, Estradiol, Hematocrit, SHBG
  - All Biomarkers view
  - Reference range shading toggle
  - Abnormal highlight toggle
  - Annotation vertical lines toggle
  - Time range filter (3m/6m/12m/all/custom)
  - Unit conversion SI (Metric) / Conventional
  - Multi-biomarker comparison mode with dual axes
- Persistent storage in browser (`window.storage` fallback to `localStorage`)
- Data management:
  - Delete report
  - Bulk delete
  - Export CSV (selected biomarkers)
  - Export PDF report screenshot (`html2canvas` + `jspdf`)
- Responsive UI + dark/light mode persistence
- Medical disclaimer

## Environment variables

Use `.env.example` as template.

Server-only (Vercel + local server):
- `CLAUDE_API_KEY` (required)
- `GEMINI_API_KEY` (required)
- `UPSTASH_REDIS_REST_URL` (required for AI limits/budget store)
- `UPSTASH_REDIS_REST_TOKEN` (required for AI limits/budget store)
- `SUPABASE_URL` (required for cloud auth/sync server routes)
- `SUPABASE_ANON_KEY` (required for cloud auth/sync server routes)
- `SUPABASE_SERVICE_ROLE_KEY` (required for cloud auth/sync server routes)
- `APP_PUBLIC_ORIGIN` (recommended for branded auth emails and verification redirects; production default `https://labtracker.app`)
- `RESEND_API_KEY` (required for parser-improvement emails and branded cloud verification emails)
- `LABTRACKER_AUTH_FROM` (recommended for production auth emails)
- `LABTRACKER_AUTH_REPLY_TO` (optional auth reply-to inbox)
- `LABTRACKER_SUPPORT_EMAIL` (optional support address shown in auth emails)
- `SHARE_LINK_SECRET_BASE64` (required for encrypted short share links)
- `SHARE_PUBLIC_ORIGIN` (optional, defaults to `https://labtracker.app`)
- `AI_DAILY_BUDGET_EUR` (optional, `0` = disabled)
- `AI_MONTHLY_BUDGET_EUR` (optional, `0` = disabled)
- `AI_PARSER_MAX_CALLS_PER_USER_PER_DAY` (optional)
- `AI_LIMITS_DISABLED` (optional debug switch; `true` disables server-side AI limits/budget checks)

Client/build flags:
- `VITE_ENABLE_PARSER_DEBUG` (optional, keep `false` for normal production)
- `VITE_GEMINI_API_KEY` (dev-only fallback, do not use in production)
- `VITE_AI_ANALYSIS_MARKER_CAP` (optional)
- `VITE_DISABLE_BETA_LIMITS` (optional debug switch; `true` disables client beta usage caps)
- `VITE_SHARE_PUBLIC_ORIGIN` (optional, defaults to `https://labtracker.app`)

Important: never expose server keys (`CLAUDE_API_KEY`, `GEMINI_API_KEY`, `UPSTASH_*`, `SHARE_LINK_SECRET_BASE64`) in client-side `VITE_*` variables.

## Beta parser-improvement PDF submissions

- When a PDF parses with very low quality, the review screen can show an inline beta card that lets the user explicitly consent to sending the original PDF to the LabTracker team.
- The submission includes the original PDF plus safe parser metadata such as confidence, warning codes, extraction route, marker count, and optional user-entered context.
- This flow is intended only for beta parser-improvement submissions. If the user skips it, the normal review and save flow continues unchanged.

Required server env vars for this feature:
- `RESEND_API_KEY`
- `LABTRACKER_REPORTS_TO`
- `LABTRACKER_REPORTS_FROM` (optional, recommended for production; otherwise a clearly marked beta/test sender is used)

## Branded cloud verification emails

- Cloud sign-up now uses a branded verification email instead of the default provider template.
- The email lands on `/auth/confirm` first, so aggressive inbox scanners cannot consume the real verification link before the user clicks.
- After verification, the user lands on `/auth/verified` and signs in manually. The app does not auto-login after email verification.

Recommended production auth-email env vars:
- `APP_PUBLIC_ORIGIN=https://labtracker.app`
- `LABTRACKER_AUTH_FROM=LabTracker Security <noreply@mail.labtracker.app>`
- `LABTRACKER_AUTH_REPLY_TO=trtlabtracker@gmail.com`
- `LABTRACKER_SUPPORT_EMAIL=trtlabtracker@gmail.com`
- `LABTRACKER_REPORTS_FROM=LabTracker Reports <reports@mail.labtracker.app>`

Local testing:
- Run the app with `npx vercel dev` so the Vercel API route is available locally.
- Set the env vars above in your local Vercel environment or `.env`.
- Upload a known poor-quality lab PDF until the beta card appears in the review screen.
- Check the consent box, optionally add note/country/lab/language, click `Send PDF to improve parser`, and confirm the success state plus received email attachment.

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- react-dropzone
- date-fns
- pdfjs-dist
- framer-motion

## Local launcher scripts

For local desktop usage, launcher scripts are kept in the repo root:
- `Start LabTracker.command`
- `Start LabTracker.bat`
- `Stop LabTracker.command`
- `Stop LabTracker.bat`

These are local-dev convenience scripts and are not required for the hosted Vercel app.

## Quality checks

Before merging, run:
- `npm run lint`
- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`

One-shot local gate:
- `npm run ci:check`

See:
- `CONTRIBUTING.md`
- `SECURITY.md`

## Parser QA workflow (batch protocol)

- Registry: `docs/parser-batch-registry.md` (tracks file hashes, batch status, and dedupe)
- Scorecard: `docs/parser-batch-scorecard.md` (go/no-go metrics per batch)
- Local scan helper: `npm run parser:scan-examplelabs`
  - Scans `examplelabs/`
  - Computes 12-char SHA-256 IDs per file
  - Shows which files are already present in the registry
- Draft fixtures maken: `npm run parser:create-fixture-drafts -- --batch B01 --labels label_1,label_2`
- Draft fixtures vullen (extractie + anonimisatie): `npm run parser:fill-batch-fixtures -- --batch B01`
- Batch score-rapport genereren: `npm run parser:batch-report`
  - Output: `docs/parser-batch-report-b01.json` (of andere batch via `PARSER_BATCH_ID`)
- Strikte batch-validatie draaien: `npm run parser:batch-strict`
  - Gebruik dit als go/no-go check; het mag FAIL geven zolang de batch nog niet op `validated` staat.
