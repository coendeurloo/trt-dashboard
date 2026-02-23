# LabTracker

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./src/assets/labtracker-logo-dark.svg" />
    <img src="./src/assets/labtracker-logo-light.svg" alt="LabTracker logo" width="520" />
  </picture>
</p>

LabTracker is a privacy-first web app that turns messy lab PDFs into clear trends and actionable insights. Upload reports, validate extracted markers, compare latest vs previous labs, and run AI-assisted analysis in one dashboard.

Current beta focus: hormone and bloodwork tracking (including TRT-style workflows).  
Roadmap direction: broader performance and general health lab tracking.

Live app: [labtracker.app](https://labtracker.app)

## Privacy behavior (important)

- Default: parsing stays local in the browser (text extraction + OCR when needed).
- External AI is **off by default** and only used after explicit opt-in in `Settings > Privacy & AI`.
- If opt-in is off, parser fallback AI and AI analysis are both blocked.
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
  - Primary markers: Testosterone, Free Testosterone, Estradiol, Hematocrit, SHBG
  - All markers view
  - Reference range shading toggle
  - Abnormal highlight toggle
  - Annotation vertical lines toggle
  - Time range filter (3m/6m/12m/all/custom)
  - Unit conversion EU/US
  - Multi-marker comparison mode with dual axes
- Persistent storage in browser (`window.storage` fallback to `localStorage`)
- Data management:
  - Delete report
  - Bulk delete
  - Export CSV (selected markers)
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
- `SHARE_LINK_SECRET_BASE64` (required for encrypted short share links)
- `SHARE_PUBLIC_ORIGIN` (optional, defaults to `https://labtracker.app`)
- `AI_DAILY_BUDGET_EUR` (optional, `0` = disabled)
- `AI_MONTHLY_BUDGET_EUR` (optional, `0` = disabled)
- `AI_PARSER_MAX_CALLS_PER_USER_PER_DAY` (optional)

Client/build flags:
- `VITE_ENABLE_PARSER_DEBUG` (optional, keep `false` for normal production)
- `VITE_GEMINI_API_KEY` (dev-only fallback, do not use in production)
- `VITE_AI_ANALYSIS_MARKER_CAP` (optional)
- `VITE_SHARE_PUBLIC_ORIGIN` (optional, defaults to `https://labtracker.app`)

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
