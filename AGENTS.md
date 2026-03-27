# AGENTS.md

You are working on LabTracker, a blood work tracking web app. The owner and sole developer is Coen. He communicates in English and Dutch, prefers short and direct answers, and dislikes em dashes.

## Project overview

LabTracker lets users upload lab PDFs, automatically extract blood markers, track them over time alongside protocol changes, supplements, and wellbeing check-ins, and run AI analysis that ties everything together. The core value proposition is the connected view: labs + protocol + supplements + wellbeing on one timeline.

Target audience: TRT users, enhanced athletes, general health optimizers, and biohackers. A user profile system (`settings.userProfile`) determines which persona the AI uses, which menu items are visible, and which markers are prioritized.

## Tech stack

- Frontend: React 18 + TypeScript + Vite 7, Tailwind CSS (dark theme, slate/cyan palette)
- Charts: Recharts
- PDF parsing: `pdfjs-dist` (text extraction) + `Tesseract.js` (OCR) + Gemini API (fallback)
- AI analysis: Claude API (via server proxy) or Gemini API
- Deployment: Vercel (serverless functions for API proxy)
- State: Browser `localStorage` (no database, no accounts yet)
- Tests: Vitest
- Schema version: 5

## Key commands

```bash
npm run dev
npm run build
npm run ci:check
npx vitest --run
npx vitest --watch
```

## Architecture summary

Read `architecture.md` for the full map. Short version:

- `src/App.tsx` - main orchestrator, all state, tab routing
- `src/pdfParsing.ts` - PDF text extraction, OCR, local marker parsing, Gemini fallback
- `src/analytics.ts` - marker series, alerts, trends, protocol impact, stability index
- `src/aiAnalysis.ts` - AI prompt construction, API calls, retry logic, memory
- `src/views/` - one view component per tab
- `src/components/` - reusable components
- `api/` - Vercel serverless functions (Claude proxy, Gemini proxy, rate limiting)

## Important conventions

- i18n: All user-facing strings use `tr(dutch, english)` or `trLocale(language, dutch, english)`. Always add both.
- No em dashes in user-facing copy.
- Tailwind only for styling. No CSS files. Dark theme is primary.
- Put shared types in `src/types.ts`. View-specific types live in their view file.
- Tests live next to source in `src/__tests__/` with pattern `featureName.test.ts`.

## File editing guidelines

- `pdfParsing.ts` is very large. Read and edit specific functions, not the entire file.
- `analytics.ts` is large. Use `architecture.md` to jump to key functions.
- `App.tsx` holds top-level state. Add state there and pass it down via props.
- After any change, run `npm run build` and keep TypeScript errors at zero.

## CI hygiene checklist

- Before commit/push, run `npm run ci:check` (lint + typecheck + tests + build).
- Do not commit generated folders like `.vite-cache/`, `.vite/`, `dist/`, or `dist2/`.
- If lint fails, fix source lint errors first before pushing.

## Common pitfalls

- The storage key is still `trt_lab_tracker_v1` (legacy name). Do not rename it, existing users would lose data.
- PDF parsing has a local-first cascade: text extraction -> local parsing -> OCR -> local parsing again -> Gemini AI fallback. Do not skip steps.
- The AI consent system requires explicit user opt-in before any data leaves the browser. Never bypass this.
- `canonicalizeMarker()` in `unitConversion.ts` is the single source of truth for marker name normalization. Always use it.

## Current priorities

See `state.md` for what is in progress right now.
