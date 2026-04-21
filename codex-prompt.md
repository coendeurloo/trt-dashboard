# Codex prompt — LabTracker AI Coach UX revision

Paste everything below into ChatGPT Codex. It is written to be framework-agnostic but assumes a React/Tailwind stack (adapt file names if yours differ).

---

## Task

Refactor the **AI Coach** page of the LabTracker app. The current layout has four competing entry points (two preset buttons, a free-text textarea, and four suggestion chips), a dense single-line "context" string that the user has no control over, a cryptic usage meter, a flat nine-item sidebar, and redundant "Ask AI" labels. Rework the page to match the revised design described below. Do **not** restyle the overall dark-theme + teal accent palette — keep colors, fonts, and the general card aesthetic identical to what the app uses today. Only change structure, hierarchy, and the pieces called out.

The accompanying HTML mockup I'll provide alongside this prompt is the visual target; match its structure and hierarchy, not necessarily its exact markup.

## Scope

Only change:

1. The AI Coach page/route and its immediate components.
2. The app sidebar (grouping only — do **not** rename routes or change navigation behavior).

Do not touch: routing, data fetching, AI backend calls, auth, or any other page.

## Changes

### 1. Collapse the four entry points into one primary flow

- The free-text textarea becomes the **hero** of the card. It should be the largest, most visually prominent interactive element.
- Rename the card heading from "Ask AI" to **"Your question"**. The submit button keeps the label **"Ask AI"**.
- Move the four **suggestion chips** (the locally generated ones: "Which marker should I prioritize…", "Why is my Estradiol high?", etc.) so they render **above** the textarea, not below the submit button. Label this group with a small uppercase tracking-wide label: `SUGGESTED FROM YOUR DATA`. Keep the existing small caption underneath: "Generated locally from your reports — the AI only runs after you submit."
- Convert the two existing action buttons **"Run full analysis"** and **"Compare latest vs previous"** into **preset chips** rendered directly above the textarea, under a label `OR START FROM A PRESET`. Clicking a preset should prefill the textarea with an editable pre-written prompt (e.g. clicking "Full analysis of latest report" populates the textarea with something like: _"Run a full analysis of my latest lab report. Call out anything outside range or trending the wrong way, and tell me what to prioritize."_). The user can edit before submitting. Presets do **not** auto-submit.
- Add a small "More presets" chip at the end of the preset row as an extension point (can be a no-op button for now, wired to a `TODO` comment).
- Style the preset chips with a subtle teal-tinted border/background so they read as "starters", distinct from the neutral suggestion chips above them.
- The submit button ("Ask AI") sits inside the textarea's bottom-right corner, tight to the input — not floating far below it. Include a subtle keyboard hint on the bottom-left of the input toolbar: `Ctrl + Enter to submit`. Wire Ctrl/Cmd+Enter to submit.

### 2. Remove the context line entirely

Delete the line:

> `11 reports in scope · 74 biomarkers · Conventional · Test E. 105mg, HCG 1000iu`

**Do not** replace it with chips, a summary, or any other visible element. The user has no control over any of these values, so exposing them adds visual noise without enabling a decision. The backend should still send the same scope to the AI on submit; only the UI representation goes away.

### 3. Replace the cryptic usage meter with explicit progress bars

Remove the line `Usage: 0/5 today · 1/25 month`. In its place, render a thin card/row above the context bar with:

- The trust statement on the left: `AI only runs when you start an action` (with the existing shield icon).
- Two horizontal progress bars on the right, each labeled:
  - `Today's analyses` — `0 of 5` — bar filled proportionally.
  - `This month` — `1 of 25` — bar filled proportionally.
- A small `What's this?` text link at the far right, which opens a tooltip/popover (scaffold — can be a TODO) explaining what counts as an analysis and when the counters reset.

### 4. Group the sidebar

Keep all nine existing nav items and their routes unchanged. Group them visually under three small uppercase section labels:

- **YOUR DATA**: Dashboard, Wellbeing, Lab Results, Alerts
- **PROTOCOLS**: Protocols, Supplements, Protocol Impact, Dose Simulator
- **AI**: AI Coach

Use the existing nav-item component; only add `<SidebarGroupLabel>` (or equivalent) rows between the groups. The section labels should be 10–11px, uppercase, letter-spaced, and use the existing muted-ink color token.

Demote the Upload PDF block in the sidebar: replace the large "Upload lab PDF" dropzone with a **compact outlined button** of the same label at the bottom of the sidebar, above "Add manual values" and "Settings". The full dropzone UI should move to a dedicated modal/panel opened by the button.

**Do not** add an "attach PDF" affordance inside the AI Coach textarea or anywhere on the AI Coach page — PDF ingestion happens only via the sidebar button.

### 5. Reduce label redundancy

- Page title stays: **AI Coach**
- Page subtitle becomes: **"Ask questions about your lab data. AI only runs when you start an action."** (merges the old subtitle and the separate notice line into one).
- Remove the standalone notice `AI runs only when you explicitly start an action.` from its own bar — that sentence is now part of the subtitle and the usage meter row.
- Card heading: **Your question** (not "Ask AI").
- Submit button: **Ask AI** (unchanged).

### 6. Make the "Recent" section functional

Add a **Recent** section directly below the "Your question" card. This replaces no existing feature — it is new functionality. Purpose: give the user quick access to past AI answers, reinforce that AI runs are finite and reviewable, and reduce the temptation to re-ask the same question.

**Layout**

- Small uppercase tracking-wide heading on the left: `RECENT`.
- On the right of the heading: a `View all` link to a full history page/route (`/ai-coach/history` — create the route as a stub if it doesn't exist).
- Grid of the **4 most recent** analyses below the heading. Two columns on desktop, one column on mobile. Each card shows:
  - **Top row**: date (e.g. `Apr 14`), a middot, and the question/preset that triggered it (e.g. `Compared latest vs previous` or a truncated version of the free-text question). On the far right, a small `AI` tag.
  - **Body**: first 1–2 lines of the AI's answer, truncated with ellipsis.
  - The whole card is clickable and opens the full analysis view.

**Data model**

Persist each AI analysis when a response completes. Store at minimum:

```ts
type AiAnalysis = {
  id: string;              // uuid
  createdAt: string;       // ISO timestamp
  prompt: string;          // what the user submitted (raw textarea content)
  presetKey?: string;      // "full-analysis" | "compare-latest-previous" | undefined if free-text
  title: string;           // short human label: preset name, or first ~60 chars of prompt
  answer: string;          // full AI response (markdown or plain text)
  scopeSnapshot: {         // frozen copy of what the AI saw, for audit
    reportCount: number;
    biomarkerCount: number;
    units: string;
    activeProtocol: string | null;
  };
};
```

Pick the simplest persistence that fits the existing stack:
- If the app has a backend DB → add a table/endpoint (`GET /api/ai/analyses?limit=4`, `POST /api/ai/analyses`, `GET /api/ai/analyses/:id`).
- If it's client-side only → use the existing local store (IndexedDB / Zustand persist / whatever is already used for lab data). Do not introduce `localStorage` if the app already has a richer store.

**Wire-up**

- After an `Ask AI` submit succeeds, insert a new `AiAnalysis` record and invalidate/refetch the Recent list.
- The Recent list query returns the latest 4 by `createdAt desc`.
- Clicking a card navigates to `/ai-coach/history/:id` and renders the full answer. Scaffold this detail route with just a header (date + title), the prompt in a quote block, the rendered answer, and a "Back to AI Coach" link. Full polish can come later.
- `View all` navigates to `/ai-coach/history` which renders the same cards in a vertical list, no limit. Again, scaffold is fine — simple pagination or just a "Load more" button is acceptable.

**States**

- **Loading**: show 4 skeleton cards with the same dimensions as the real cards.
- **Empty** (first-time user, no analyses yet): hide the entire Recent section — do not render a visible empty state. As soon as there's at least one analysis, the section appears.
- **Error** (fetch failed): render a single compact card with: "Couldn't load recent analyses. [Retry]". Do not block the rest of the page.

**Acceptance for this section**

- Submitting a question via Ask AI causes a new card to appear in Recent within the same session, without a full page reload.
- Clicking a card opens the full analysis at `/ai-coach/history/:id`.
- The Recent section is hidden entirely when the user has zero analyses.
- The `scopeSnapshot` is captured at submit time and stored alongside the answer, so the user can later see what the AI was looking at — even if the underlying data has since changed.

### 7. Accessibility fixes

- Bump all secondary text (captions, chip labels, "Synced" chip, usage meter labels) to meet WCAG AA contrast (≥ 4.5:1 on the dark background). If the current muted-ink token is too dim, introduce a `ink-200`/`ink-300` distinction and use the lighter token for all body-adjacent text.
- Add `aria-label="Switch to light mode"` (or "Switch to dark mode", depending on current state) to the theme toggle in the top-right.
- Give the green "Synced" chip a `title` / tooltip: `Your data is synced across devices`.
- Ensure all suggestion and preset chips are real `<button>` elements with `type="button"` and are keyboard-focusable with a visible focus ring.
- Ensure all chips and buttons are at least 36px tall to approach touch-target guidance.

## What NOT to change

- Do not restyle the brand logo, top-right account chip, or theme toggle beyond adding the aria-label.
- Do not change the AI backend request shape — the submit handler should send the same payload as today; just source the prompt text from the textarea (which may now be prefilled by a preset).
- Do not remove any of the four existing suggestion strings. Keep them verbatim.
- Do not introduce new libraries unless strictly necessary. Use whatever is already in the project (likely Tailwind + Radix/shadcn-style primitives).

## Acceptance criteria

- [ ] The AI Coach page has one clearly dominant textarea. Suggestions render above the textarea. Presets render between suggestions and textarea. The "Ask AI" button is visually attached to the textarea.
- [ ] Clicking a preset prefills the textarea; the user can edit before submitting. No auto-submit.
- [ ] Ctrl/Cmd+Enter submits the textarea.
- [ ] The "11 reports · 74 biomarkers · Conventional · …" context string is removed from the UI and not replaced with any visible substitute. Backend payload is unchanged.
- [ ] The usage meter shows two labeled progress bars with explicit "X of Y" readouts.
- [ ] The sidebar has three visual groups with uppercase labels; all routes still work.
- [ ] The Upload PDF block is a compact button in the sidebar footer; the old large dropzone is gone from the sidebar.
- [ ] No "attach PDF" / paperclip affordance exists anywhere on the AI Coach page.
- [ ] The standalone "AI runs only when you explicitly start an action" bar is removed; the message now lives in the page subtitle.
- [ ] The card heading reads "Your question", not "Ask AI".
- [ ] Theme toggle has an aria-label. All secondary text passes AA contrast.
- [ ] A "Recent" section appears below the question card once the user has at least one past analysis; it shows the 4 most recent, each card is clickable, and "View all" links to a history page. Empty state = section hidden.
- [ ] Submitting a question persists a new `AiAnalysis` record (with a frozen `scopeSnapshot`) and the new card appears in Recent without a full page reload.
- [ ] A `/ai-coach/history` list route and `/ai-coach/history/:id` detail route exist (scaffolds are acceptable).
- [ ] Existing `pnpm lint` / `pnpm typecheck` / `pnpm test` (or equivalent) pass.

## Deliverable

- A single PR with a clear title like `refactor(ai-coach): consolidate entry points, improve context/usage hierarchy`.
- A short PR description listing the six change blocks above.
- Before/after screenshots of the AI Coach page and the sidebar.

## Tone / design reference

If the repo uses Tailwind tokens, prefer existing color tokens (`bg-900`, `ink-100`, `teal-300`, etc., or their project equivalents) rather than hard-coded hex. The revised design is calm, focused, trust-forward — every change should reduce decision load on the user, not add density.
