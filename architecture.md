# architecture.md

## Directory structure

```text
labtracker/
|- api/                                   # Vercel serverless routes
|  |- claude/messages.ts                  # Claude proxy for AI analysis/extraction
|  |- gemini/extract.ts                   # Gemini proxy for parser rescue
|  |- gemini/analysis.ts                  # Gemini analysis proxy fallback
|  |- cloud/consent.ts                    # Cloud consent read/write
|  |- cloud/replace.ts                    # Full cloud snapshot replace
|  |- cloud/incremental.ts                # Incremental cloud patch sync
|  |- cloud/delete-account.ts             # Account deletion flow
|  |- share/shorten.ts                    # Short share-code creation
|  |- share/resolve.ts                    # Short share-code resolution
|  |- parser-improvement/submit.ts        # Beta parser-improvement PDF submission
|  |- dose/priors.ts                      # Dose prior API
|  |- _lib/                               # Shared server helpers
|  |  |- rateLimit.ts                     # Redis-backed rate limits
|  |  |- redisStore.ts                    # Upstash Redis wrapper
|  |  |- entitlements.ts                  # Paid-plan/entitlement checks
|  |  |- shareCrypto.ts                   # Share token crypto helpers
|  |  |- shareStore.ts                    # Short-link storage
|  |  |- parserImprovement.ts             # Submission parsing/validation
|  |  `- parserImprovementEmail.ts        # Resend email sender
|  |- health.ts                           # Health endpoint
|  `- __tests__/                          # API route tests
|
|- src/
|  |- App.tsx                             # Main orchestrator (local/cloud/share modes)
|  |- types.ts                            # Core domain + app mode types
|  |- constants.ts                        # Storage key, schema version, defaults
|  |- storage.ts                          # localStorage read/write + coercion
|  |- uploadFlow.ts                       # Upload + parser-rescue decision logic
|  |- pdfRouting.ts                       # Language/layout routing
|  |- pdfParsing.ts                       # Main parser pipeline
|  |- analytics.ts                        # Trends, alerts, protocol impact, stability
|  |- aiAnalysis.ts                       # Prompt building + analysis calls
|  |- analysisPremium.ts                  # Premium analysis pack
|  |- analysisScope.ts                    # Analysis report selection + summaries
|  |- analystMemory.ts                    # Cross-run analyst memory helpers
|  |- share.ts                            # Share token build/parse
|  |- shareClient.ts                      # Share API client
|  |- rateLimit.ts                        # Client beta limits
|  |- betaLimits.ts                       # Client-side beta gating
|  |- parserImprovementSubmission.ts      # Parser improvement payload helper
|  |- pdfExport.ts                        # PDF export utilities
|  |- csvExport.ts                        # CSV export utilities
|  |- unitConversion.ts                   # Unit conversion + canonicalizeMarker()
|  |- markerNormalization.ts              # Marker alias normalization
|  |- protocolStandards.ts                # Protocol standards and canonicalization
|  |- protocolUtils.ts                    # Protocol utility logic
|  |- supplementUtils.ts                  # Supplement timeline operations
|  |- doseResponseLimits.ts               # Dose-response eligibility/limits
|  |- doseResponsePriors.ts               # Dose-prior request helpers
|  |- baselineUtils.ts                    # Baseline report logic
|  |- chartHelpers.ts                     # Dashboard chart presets/helpers
|  |- predictiveTrends.ts                 # Predictive alert helpers
|  |- extractionDiff.ts                   # Local vs AI extraction diffing
|  |- wellbeingMetrics.ts                 # Profile-aware check-in metrics
|  |- markerCatalog.ts                    # Marker catalog metadata helpers
|  |- markerSpecimen.ts                   # Marker specimen metadata
|  |- i18n.ts                             # Translation helpers
|  |- locales/enToExtraLocales.ts         # EN to extra locale dictionary
|  |- cloud/                              # Cloud auth/sync client logic
|  |- hooks/                              # App orchestration hooks
|  |- views/                              # Route-like tab views
|  |- components/                         # Reusable UI components/modals
|  |- privacy/sanitizeForAI.ts            # Redaction/sanitization before AI calls
|  |- data/                               # Marker DB, dose priors, benchmarks, profiles
|  |- pdfParsing/locales/                 # Parser locale keyword packs
|  |- utils/                              # Marker confidence/review/matcher helpers
|  |- ui/demoBannerStyles.ts              # Shared demo banner styling helpers
|  |- lib/                                # Error-message helpers
|  |- types/analystMemory.ts              # Analyst memory sub-types
|  `- __tests__/                          # UI/domain tests (56 files)
|
|- tests/
|  `- parser-fixtures/                    # Parser fixture corpus (text + draft batches)
|
|- docs/
|  |- parser-batch-registry.md            # Fixture registry + dedupe ledger
|  |- parser-batch-scorecard.md           # Batch quality gates
|  `- parser-batch-report-b0*.json        # Generated batch metrics
|
`- scripts/
   `- parser-batch/*.mjs                  # Batch tooling for parser QA
```

## Data flow

```text
1) Upload and extraction (local-first)
User uploads PDF
  -> App.tsx handleUpload()
  -> uploadFlow.ts decides review/rescue path
  -> pdfRouting.ts selects parser profile
  -> pdfParsing.ts extractLabData()
     Step 1: extractPdfText() from text layer
     Step 2: fallbackExtractDetailed() local parsing strategies
     Step 3: extractPdfTextViaOcr() if text layer is weak
     Step 4: callGeminiExtraction() only if consent + policy allow
  -> ExtractionReviewTable + uncertainty modals
  -> storage.ts persists LabReport into localStorage

2) AI analysis
AnalysisView action
  -> useAnalysis.ts
  -> App.tsx runAiAnalysisWithConsent()
  -> AIConsentModal (per run if needed)
  -> aiAnalysis.ts analyzeLabDataWithClaude()
     - sanitizeAnalysisPayloadForAI()
     - buildFullAnalysisPrompt()/buildComparisonPrompt()
     - profile persona + hallucination guardrails + analyst memory
  -> /api/claude/messages (or /api/gemini/analysis fallback by provider selection)
  -> AnalysisView renders markdown output

3) Cloud mode (optional)
Cloud Sync enabled in Settings
  -> useCloudAuth.ts handles sign-in + consent status
  -> useCloudSync.ts bootstraps from cloud snapshot
  -> SupabaseCloudAdapter fetchSnapshot()/replaceAll()/applyPatch()
  -> /api/cloud/replace + /api/cloud/incremental + /api/cloud/consent
  -> conflict handling in CloudSyncPanel (use cloud copy vs replace cloud)

4) Share links
User generates share link in Settings
  -> useShareGeneration.ts
  -> share.ts buildShareSubsetData() + buildShareToken()
  -> shareClient.ts createShortShareLink() -> /api/share/shorten
  -> receiver opens /s/:code or ?s=...
  -> useShareBootstrap.ts resolveShortShareCode() -> /api/share/resolve
  -> app runs in share mode (read-only snapshot)

5) Parser-improvement submission (beta)
Low-confidence extraction + explicit user consent
  -> ParserImprovementSubmissionCard
  -> parserImprovementSubmission.ts builds multipart payload
  -> /api/parser-improvement/submit
  -> _lib/parserImprovement.ts validates submission
  -> _lib/parserImprovementEmail.ts sends PDF + metadata via Resend
```

## Key data types (`src/types.ts`)

- `LabReport`: report metadata, markers, annotations, extraction diagnostics
- `MarkerValue`: canonical marker value/unit/reference + confidence
- `Protocol` / `InterventionPlan`: protocol entries and schedule context
- `SupplementPeriod`: supplement timeline entries
- `SymptomCheckIn` / `WellbeingCheckIn`: profile-aware wellbeing snapshots
- `AIConsentDecision`: per-run consent flags (external AI, notes, symptoms, PDF attachment)
- `ParserUncertaintyAssessment`: uncertainty reasons and confidence markers
- `AppSettings`: theme, units, profile, AI/privacy settings, chart controls
- `StoredAppData`: full persisted app payload (schema v6)
- `AppMode`: `local` | `cloud` | `share`

## Big files and function index

### `src/App.tsx` (2891 lines)

- `requestParserRescueConsent()` ~line 953
- `handleUpload()` ~line 1012
- `improveDraftWithAi()` ~line 1170
- `runAiAnalysisWithConsent()` ~line 1663
- `cloudPanel` composition ~line 1925

### `src/pdfParsing.ts` (6159 lines)

- `extractPdfText()` ~line 354
- `extractPdfTextViaOcr()` ~line 971
- `normalizeMarker()` ~line 1341
- `parseLineRows()` ~line 3027
- `parseSpatialRows()` ~line 3339
- `fallbackExtractDetailed()` ~line 4813
- `callGeminiExtraction()` ~line 4972
- `extractLabData()` ~line 5418

### `src/analytics.ts` (3504 lines)

- `buildMarkerSeries()` ~line 1261
- `classifyMarkerTrend()` ~line 1320
- `buildAlerts()` ~line 1643
- `computeProfileStabilityIndex()` ~line 1933
- `buildProfileStabilitySeries()` ~line 1977

### `src/aiAnalysis.ts` (2399 lines)

- `buildPersona()` ~line 262
- `buildCoreRules()` ~line 273
- `HALLUCINATION_GUARDRAILS` ~line 374
- `buildMemoryContext()` ~line 464
- `buildFullAnalysisPrompt()` ~line 590
- `buildComparisonPrompt()` ~line 623
- `analyzeLabDataWithClaude()` ~line 2054

### `src/hooks/useCloudSync.ts` + `src/cloud/syncAdapter.ts`

- `loadFromCloud()` ~line 107
- `uploadLocalData()` ~line 216
- `replaceCloudWithLocal()` ~line 245
- `refreshFromCloud()` ~line 249
- `SupabaseCloudAdapter.fetchSnapshot()` ~line 83
- `SupabaseCloudAdapter.replaceAll()` ~line 222
- `SupabaseCloudAdapter.applyPatch()` ~line 242

## Environment variables

Based on `.env.example` and current server/client usage:

Server required:

- `CLAUDE_API_KEY`
- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SHARE_LINK_SECRET_BASE64`
- `RESEND_API_KEY`
- `LABTRACKER_REPORTS_TO`

Server optional:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_PUBLIC_ORIGIN`
- `SHARE_PUBLIC_ORIGIN`
- `LABTRACKER_AUTH_FROM`
- `LABTRACKER_AUTH_REPLY_TO`
- `LABTRACKER_SUPPORT_EMAIL`
- `LABTRACKER_REPORTS_FROM`
- `AI_LIMITS_DISABLED`
- `AI_DAILY_BUDGET_EUR`
- `AI_MONTHLY_BUDGET_EUR`
- `AI_PARSER_MAX_CALLS_PER_USER_PER_DAY`
- `AI_REQUIRE_ENTITLEMENT`
- `AI_ALLOWED_PAID_PLANS`
- `AI_ENTITLEMENT_SECRET`
- `AI_ENTITLEMENT_COOKIE_NAME`
- `AI_ALLOW_UNSAFE_HEADER_ENTITLEMENT`

Client (`VITE_*`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_PARSER_DEBUG`
- `VITE_GEMINI_API_KEY` (dev fallback)
- `VITE_AI_ANALYSIS_MARKER_CAP`
- `VITE_DISABLE_BETA_LIMITS`
- `VITE_SHARE_PUBLIC_ORIGIN`
