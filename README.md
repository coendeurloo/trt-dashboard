# LabTracker

![LabTracker Logo](./src/assets/labtracker-logo-light.svg)

LabTracker is a privacy-first web app for men on TRT to turn messy lab PDFs into clear trends and actionable insights. Upload reports, validate extracted markers, compare latest vs previous labs, and run AI-assisted analysis in one dashboard.

## Features implemented

- Drag-and-drop PDF upload (`react-dropzone`)
- Adaptive PDF parser for mixed lab layouts (tables, line-based rows, multi-line rows)
- Smart OCR fallback for scanned PDFs (`tesseract.js`, client-side, only when needed)
- Claude structured extraction + AI lab analysis (full and latest-vs-previous)
- Editable extraction review table with hover edit icon
- Report context fields:
  - Testosterone dosage (mg/week)
  - Protocol
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
  - Export JSON
  - Export CSV (selected markers)
  - Export PDF report screenshot (`html2canvas` + `jspdf`)
- Responsive UI + dark/light mode persistence
- Medical disclaimer

## Run the app

### Windows (easiest)

1. Install Node.js LTS from [https://nodejs.org](https://nodejs.org)
2. Double-click `Start LabTracker.bat`
3. The app opens at `http://127.0.0.1:4173`

Stop it with `Stop LabTracker.bat`.

### macOS / Linux

```bash
npm install
npm run build
npm run server:start:open
```

If you start via Finder/shortcut: the shell wrappers now auto-detect Node from common installs (`/opt/homebrew`, `/usr/local`, `nvm`, `volta`, `fnm`).

You can also double-click:
- `Start LabTracker.command`
- `Stop LabTracker.command`

Stop server:

```bash
npm run server:stop
```

Check status:

```bash
npm run server:status
```

### Development mode

```bash
npm install
npm run dev
```

## Claude API key

This app now uses a server-side API key.

1. Copy `.env.example` to `.env`
2. Set `CLAUDE_API_KEY=...` in `.env`
3. Restart the dev server (`npm run dev`) or static server (`npm run app:start`)

On Vercel, add the same project environment variable:
- `CLAUDE_API_KEY`

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

## Windows notes

- Start/stop is now cross-platform via `scripts/server-control.mjs`
- Existing shell wrappers still work on macOS/Linux:
  - `scripts/start-server.sh`
  - `scripts/stop-server.sh`
