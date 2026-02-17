# LabTracker Pre-Launch Smoke Checklist

Use this checklist after each production deployment.

## Test window
- Date:
- Tester:
- Deployed commit:
- Environment: Production (`labtracker-dashboard.vercel.app`)

## 1) PDF upload flow
- [ ] Open dashboard with empty state.
- [ ] Click `Upload your first PDF`.
- [ ] Confirm file picker opens immediately.
- [ ] Upload a known-good PDF.
- [ ] Confirm extraction review appears and can be saved.
- [ ] Confirm saved report appears on dashboard.

## 2) AI analysis
- [ ] Run `Full AI analysis`.
- [ ] Confirm loading state is shown on the correct button.
- [ ] Confirm successful output renders with sections.
- [ ] Run `Latest vs previous`.
- [ ] Confirm loading state is shown on the correct button.
- [ ] Confirm output is returned without server errors.

## 3) Protocol linking
- [ ] Create a new protocol.
- [ ] Link protocol to a report during extraction review.
- [ ] Save and verify protocol is attached in report context.
- [ ] Open protocol page and confirm saved protocol data is intact.

## 4) Share link roundtrip
- [ ] Generate share link with protocol visible.
- [ ] Open link in incognito tab.
- [ ] Confirm snapshot is read-only.
- [ ] Confirm protocol context appears when not hidden.
- [ ] Generate share link with protocol hidden.
- [ ] Confirm protocol details are removed in shared view.

## 5) Light/dark readability
- [ ] Switch to light mode and inspect:
  - [ ] Demo banner readability
  - [ ] Protocol selector readability
  - [ ] AI beta-limit strip readability
- [ ] Switch to dark mode and inspect same areas.

## 6) Responsive sanity (mobile widths)
- [ ] Check 390px width:
  - [ ] Sidebar/dashboard usable
  - [ ] Extraction review fields not clipped
  - [ ] Compounds/supplements inputs usable
  - [ ] AI analysis actions accessible

## Result log
- Status: `PASS` / `PASS WITH NOTES` / `FAIL`
- Notes:
- Follow-up issues:
