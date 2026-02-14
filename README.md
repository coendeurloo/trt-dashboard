# TRT Lab Results Tracker

A modern React + TypeScript web app to upload blood test PDFs, review extracted results, track TRT-related markers, and visualize trends over time.

## Features implemented

- Drag-and-drop PDF upload (`react-dropzone`)
- PDF text extraction + Claude API structured extraction (with fallback parser)
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
2. Double-click `Start TRT Lab Tracker.bat`
3. The app opens at `http://127.0.0.1:4173`

Stop it with `Stop TRT Lab Tracker.bat`.

### macOS / Linux

```bash
npm install
npm run build
npm run server:start:open
```

If you start via Finder/shortcut: the shell wrappers now auto-detect Node from common installs (`/opt/homebrew`, `/usr/local`, `nvm`, `volta`, `fnm`).

You can also double-click:
- `Start TRT Lab Tracker.command`
- `Stop TRT Lab Tracker.command`

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

Open **Settings** in the app and paste your Claude API key in the API field.

Note: key storage here is browser-side for demo/prototype use.

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
