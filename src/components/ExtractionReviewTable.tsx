import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Trash2, X, XCircle, Wrench } from "lucide-react";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { createId, deriveAbnormalFlag, safeNumber } from "../utils";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "../unitConversion";
import {
  AppLanguage,
  ExtractionDraft,
  ExtractionRoute,
  MarkerValue,
  ParserDebugMode,
  Protocol,
  ReportAnnotations,
  SupplementPeriod
} from "../types";
import {
  canonicalizeSupplement,
  SUPPLEMENT_FREQUENCY_OPTIONS,
  SUPPLEMENT_OPTIONS,
  supplementFrequencyLabel
} from "../protocolStandards";
import { getActiveSupplementsAtDate, supplementPeriodsToText } from "../supplementUtils";
import ProtocolEditor from "./ProtocolEditor";
import { blankProtocolDraft } from "./protocolEditorModel";
import EditableCell from "./EditableCell";
import { RangeType } from "../data/markerDatabase";
import VisualRangeBar from "./VisualRangeBar";
import { ReviewMarker, applyMarkerAutoFix, enrichMarkerForReview } from "../utils/markerReview";

export interface ExtractionReviewTableProps {
  draft: ExtractionDraft;
  annotations: ReportAnnotations;
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  inheritedSupplementsPreview: SupplementPeriod[];
  inheritedSupplementsSourceLabel: string;
  selectedProtocolId: string | null;
  parserDebugMode?: ParserDebugMode;
  language: AppLanguage;
  onDraftChange: (draft: ExtractionDraft) => void;
  onAnnotationsChange: (annotations: ReportAnnotations) => void;
  onSelectedProtocolIdChange: (protocolId: string | null) => void;
  onProtocolCreate: (protocol: Protocol) => void;
  onAddSupplementPeriod: (period: SupplementPeriod) => void;
  isImprovingWithAi?: boolean;
  showLowQualityReviewBanner?: boolean;
  onOpenParserImprovement?: () => void;
  parserImprovementSubmitted?: boolean;
  onImproveWithAi?: () => void;
  onEnableAiRescue?: () => void;
  onRetryWithOcr?: () => void;
  onStartManualEntry?: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const ExtractionReviewTable = ({
  draft,
  annotations,
  protocols,
  supplementTimeline,
  inheritedSupplementsPreview,
  inheritedSupplementsSourceLabel,
  selectedProtocolId,
  parserDebugMode = "text_ocr_ai",
  language,
  onDraftChange,
  onAnnotationsChange,
  onSelectedProtocolIdChange,
  onProtocolCreate,
  onAddSupplementPeriod,
  isImprovingWithAi = false,
  showLowQualityReviewBanner = false,
  onOpenParserImprovement,
  parserImprovementSubmitted = false,
  onImproveWithAi,
  onEnableAiRescue,
  onRetryWithOcr,
  onStartManualEntry,
  onSave,
  onCancel
}: ExtractionReviewTableProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const showParserDebugInfo =
    import.meta.env.DEV || /^(1|true|yes)$/i.test(String(import.meta.env.VITE_ENABLE_PARSER_DEBUG ?? "").trim());

  const [showCreateProtocol, setShowCreateProtocol] = useState(false);
  const [protocolDraft, setProtocolDraft] = useState(blankProtocolDraft());
  const [protocolFeedback, setProtocolFeedback] = useState("");
  const [showSupplementOverrideEditor, setShowSupplementOverrideEditor] = useState(false);
  const [supplementNameInput, setSupplementNameInput] = useState("");
  const [supplementDoseInput, setSupplementDoseInput] = useState("");
  const [supplementFrequencyInput, setSupplementFrequencyInput] = useState("daily");
  const [addTimelineStartDate, setAddTimelineStartDate] = useState(draft.testDate);
  const [addTimelineEndDate, setAddTimelineEndDate] = useState("");
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [markerNameDisplayMode, setMarkerNameDisplayMode] = useState<"report" | "canonical">("report");
  const [isProtocolModalReady, setIsProtocolModalReady] = useState(false);

  const closeCreateProtocolModal = useCallback(() => {
    setShowCreateProtocol(false);
    setProtocolDraft(blankProtocolDraft());
    setProtocolFeedback("");
  }, []);

  useEffect(() => {
    if (!showCreateProtocol) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCreateProtocolModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCreateProtocol, closeCreateProtocolModal]);

  useEffect(() => {
    if (!showCreateProtocol) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showCreateProtocol]);

  useEffect(() => {
    if (!showCreateProtocol) {
      setIsProtocolModalReady(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setIsProtocolModalReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showCreateProtocol]);

  const warningCodes = Array.from(new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])]));
  const configuredParserModeLabel = (() => {
    if (parserDebugMode === "text_only") {
      return tr("tekst-only", "text-only");
    }
    if (parserDebugMode === "text_ocr") {
      return tr("tekst + OCR", "text + OCR");
    }
    return tr("tekst + OCR + AI", "text + OCR + AI");
  })();
  const debugInfo = draft.extraction.debug;
  const extractionRoute: ExtractionRoute =
    debugInfo?.extractionRoute ??
    (draft.extraction.aiUsed ? "gemini-with-text" : debugInfo?.ocrUsed ? "local-ocr" : "local-text");
  const routeUsedLabel = (() => {
    if (extractionRoute === "local-text") {
      return tr("alleen tekstlaag", "text layer only");
    }
    if (extractionRoute === "local-ocr") {
      return tr("OCR fallback", "OCR fallback");
    }
    if (extractionRoute === "local-text-ocr-merged") {
      return tr("tekst + OCR (samengevoegd)", "text + OCR (merged)");
    }
    if (extractionRoute === "gemini-with-text") {
      return tr("tekst + AI", "text + AI");
    }
    if (extractionRoute === "gemini-with-ocr") {
      return tr("OCR + AI", "OCR + AI");
    }
    if (extractionRoute === "gemini-vision-only") {
      return tr("AI PDF-rescue", "AI PDF rescue");
    }
    return tr("geen parserdata", "no parser data");
  })();
  const resultOrigin = draft.extraction.aiUsed ? "ai" : "local";
  const resultOriginLabel = resultOrigin === "ai" ? tr("AI toegepast", "AI applied") : tr("Lokaal resultaat", "Local result");
  const isManualEntry = draft.extraction.model === "manual-entry";
  const warningMessages = warningCodes
    .map((code) => {
      if (code === "PDF_TEXT_LAYER_EMPTY") {
        return tr(
          "Deze PDF heeft geen bruikbare tekstlaag. OCR is gebruikt; controleer de uitgelezen markers extra goed.",
          "This PDF has no usable text layer. OCR was used; review extracted markers carefully."
        );
      }
      if (code === "PDF_TEXT_EXTRACTION_FAILED") {
        return tr(
          "De tekstextractie uit dit PDF-bestand mislukte. De app is doorgeschakeld naar een veilige fallback.",
          "Text extraction failed for this PDF. The app switched to a safe fallback."
        );
      }
      if (code === "PDF_OCR_INIT_FAILED") {
        return tr(
          "OCR kon niet worden gestart voor dit bestand. Voeg ontbrekende markers handmatig toe.",
          "OCR could not be started for this file. Add missing markers manually."
        );
      }
      if (code === "PDF_OCR_PARTIAL") {
        return tr(
          "OCR was slechts gedeeltelijk succesvol. Sommige markers kunnen ontbreken of onjuist zijn.",
          "OCR was only partially successful. Some markers may be missing or incorrect."
        );
      }
      if (code === "PDF_LOW_CONFIDENCE_LOCAL") {
        return tr(
          "De parserzekerheid is laag. Controleer datum, markerwaarden en referentiebereiken voordat je opslaat.",
          "Parser confidence is low. Check date, marker values, and reference ranges before saving."
        );
      }
      if (code === "PDF_UNKNOWN_LAYOUT") {
        return tr(
          "Onbekend labformat gedetecteerd. Controleer de extractie handmatig of probeer OCR opnieuw.",
          "Unknown lab format detected. Review extraction manually or retry OCR."
        );
      }
      if (code === "PDF_AI_SKIPPED_COST_MODE") {
        return tr(
          "AI-verbetering is overgeslagen door je kosteninstellingen. Je kunt handmatig verbeteren indien nodig.",
          "AI refinement was skipped by your cost settings. You can run manual improve if needed."
        );
      }
      if (code === "PDF_AI_TEXT_ONLY_INSUFFICIENT") {
        return tr(
          "AI op tekst-only vond onvoldoende markerregels. De parser probeerde extra herstelstappen waar mogelijk.",
          "AI text-only extraction found too few marker rows. The parser attempted extra rescue steps when possible."
        );
      }
      if (code === "PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE") {
        return tr(
          "PDF-rescue is overgeslagen door de huidige kostenmodus (ultra laag).",
          "PDF rescue was skipped by the current cost mode (ultra low)."
        );
      }
      if (code === "PDF_AI_PDF_RESCUE_SKIPPED_SIZE") {
        return tr(
          "PDF-rescue is overgeslagen omdat dit bestand te groot is voor de veilige uploadlimiet.",
          "PDF rescue was skipped because this file is too large for the safe upload limit."
        );
      }
      if (code === "PDF_AI_PDF_RESCUE_FAILED") {
        return tr(
          "PDF-rescue met AI is mislukt. Controleer markers handmatig of probeer opnieuw met een kleiner bestand.",
          "AI PDF rescue failed. Review markers manually or try again with a smaller file."
        );
      }
      if (code === "PDF_AI_SKIPPED_BUDGET") {
        return tr(
          "AI-verbetering is overgeslagen omdat het dag- of maandbudget is bereikt.",
          "AI refinement was skipped because the daily or monthly budget was reached."
        );
      }
      if (code === "PDF_AI_SKIPPED_RATE_LIMIT") {
        return tr(
          "AI-verbetering is overgeslagen door rate limits. Probeer later opnieuw.",
          "AI refinement was skipped due to rate limits. Try again later."
        );
      }
      if (code === "PDF_AI_LIMITS_UNAVAILABLE") {
        return tr(
          "AI-verbetering is tijdelijk niet beschikbaar omdat de limietservice niet reageert.",
          "AI refinement is temporarily unavailable because the limits service is unreachable."
        );
      }
      if (code === "PDF_AI_PLAN_REQUIRED") {
        return tr(
          "AI-verbetering is geblokkeerd: je huidige plan bevat deze AI-functie niet.",
          "AI refinement is blocked: your current plan does not include this AI feature."
        );
      }
      if (code === "PDF_AI_DISABLED_BY_PARSER_MODE") {
        return tr(
          "AI-verbetering is uitgeschakeld door de gekozen parser-debugmodus.",
          "AI refinement is disabled by the selected parser debug mode."
        );
      }
      if (code === "PDF_AI_CONSENT_REQUIRED") {
        return tr(
          "Externe AI staat uit totdat je expliciet toestemming geeft in Instellingen > Privacy & AI.",
          "External AI is disabled until you explicitly grant consent in Settings > Privacy & AI."
        );
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
  const unknownLayoutDetected = warningCodes.includes("PDF_UNKNOWN_LAYOUT");
  const lowQualityReviewMessage =
    draft.markers.length > 3
      ? tr(
          "Parserkwaliteitssignalen geven aan dat dit rapport extra controle nodig heeft voordat je opslaat.",
          "Parser quality signals indicate this report needs extra review before saving."
        )
      : draft.markers.length > 1
      ? tr(
          "Er zijn maar {count} markers uit dit rapport gehaald. Controleer ze zorgvuldig voordat je opslaat.",
          "Only {count} markers were extracted from this report. Review them carefully before saving."
        ).replace("{count}", String(draft.markers.length))
      : draft.markers.length === 1
        ? tr(
            "Er is maar 1 marker uit dit rapport gehaald. Controleer die zorgvuldig voordat je opslaat.",
            "Only 1 marker was extracted from this report. Review it carefully before saving."
          )
      : tr(
          "Er zijn nog geen bruikbare markers uit dit rapport gehaald. Controleer het resultaat zorgvuldig voordat je opslaat.",
          "No usable markers were extracted from this report yet. Review the result carefully before saving."
        );

  const selectedProtocol = useMemo(
    () => protocols.find((protocol) => protocol.id === selectedProtocolId) ?? null,
    [protocols, selectedProtocolId]
  );

  useEffect(() => {
    if (selectedProtocolId && !selectedProtocol) {
      onSelectedProtocolIdChange(null);
    }
  }, [selectedProtocol, selectedProtocolId, onSelectedProtocolIdChange]);

  useEffect(() => {
    setAddTimelineStartDate(draft.testDate);
  }, [draft.testDate]);

  useEffect(() => {
    setMarkerNameDisplayMode("report");
  }, [draft.sourceFileName]);

  const autoMatchedSupplements = useMemo(
    () => getActiveSupplementsAtDate(supplementTimeline, draft.testDate),
    [supplementTimeline, draft.testDate]
  );

  const supplementAnchorState =
    annotations.supplementAnchorState === "inherit" ||
    annotations.supplementAnchorState === "anchor" ||
    annotations.supplementAnchorState === "none" ||
    annotations.supplementAnchorState === "unknown"
      ? annotations.supplementAnchorState
      : annotations.supplementOverrides === null
        ? "inherit"
        : annotations.supplementOverrides.length > 0
          ? "anchor"
          : "none";

  const inheritedSupplements = inheritedSupplementsPreview.length > 0 ? inheritedSupplementsPreview : autoMatchedSupplements;
  const overrideSupplements = annotations.supplementOverrides ?? [];
  const activeSupplements =
    supplementAnchorState === "anchor"
      ? overrideSupplements
      : supplementAnchorState === "none" || supplementAnchorState === "unknown"
        ? []
        : inheritedSupplements;
  const inheritedSupplementsText = supplementPeriodsToText(inheritedSupplements);
  const activeSupplementsText = supplementPeriodsToText(activeSupplements);
  const supplementStatusText =
    supplementAnchorState === "unknown"
      ? tr("Onbekend op deze testdatum.", "Unknown on this test date.")
      : supplementAnchorState === "none"
        ? tr("Geen supplementen op deze testdatum.", "No supplements on this test date.")
      : supplementAnchorState === "inherit"
          ? tr(
              "Dit rapport gebruikt je huidige actieve stack hierboven.",
              "This report uses your current active stack shown above."
            )
          : activeSupplementsText || tr("Geen supplementen actief op deze datum.", "No supplements active on this date.");
  const supplementSuggestions = useMemo(() => {
    const query = supplementNameInput.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return SUPPLEMENT_OPTIONS.filter((option) => option.toLowerCase().includes(query)).slice(0, 8);
  }, [supplementNameInput]);

  const showReviewSupplementSection = false;

  const abnormalLabel = (value: MarkerValue["abnormal"]): string => {
    if (value === "high") {
      return tr("Hoog", "High");
    }
    if (value === "low") {
      return tr("Laag", "Low");
    }
    if (value === "normal") {
      return tr("Normaal", "Normal");
    }
    return tr("Onbekend", "Unknown");
  };

  const hasRawValue = (row: MarkerValue): boolean => typeof row.rawValue === "number" && Number.isFinite(row.rawValue);
  const hasRawUnit = (row: MarkerValue): boolean => Boolean(row.rawUnit?.trim());
  const hasRawReferenceMin = (row: MarkerValue): boolean => row.rawReferenceMin !== undefined;
  const hasRawReferenceMax = (row: MarkerValue): boolean => row.rawReferenceMax !== undefined;
  const displayValue = (row: MarkerValue): number => (hasRawValue(row) ? row.rawValue! : row.value);
  const displayUnit = (row: MarkerValue): string => (hasRawUnit(row) ? row.rawUnit!.trim() : row.unit);
  const displayReferenceMin = (row: MarkerValue): number | null => (hasRawReferenceMin(row) ? row.rawReferenceMin ?? null : row.referenceMin);
  const displayReferenceMax = (row: MarkerValue): number | null => (hasRawReferenceMax(row) ? row.rawReferenceMax ?? null : row.referenceMax);
  const isCanonicalNameMode = markerNameDisplayMode === "canonical";
  const reportNameFallback = tr("Onbekende marker", "Unknown marker");
  const resolveCanonicalName = (row: ReviewMarker): string | null => {
    const canonicalFromMatch = row._matchResult?.canonical?.canonicalName?.trim();
    if (canonicalFromMatch) {
      return canonicalFromMatch;
    }
    const canonicalFromRow = row.canonicalMarker?.trim();
    return canonicalFromRow && canonicalFromRow !== "Unknown Marker" ? canonicalFromRow : null;
  };
  const resolveCanonicalDisplayName = (row: ReviewMarker): string => {
    const canonicalName = resolveCanonicalName(row);
    if (!canonicalName) {
      return reportNameFallback;
    }
    return getMarkerDisplayName(canonicalName, language);
  };
  const resolveReportDisplayName = (row: ReviewMarker): string =>
    row.marker?.trim() || row.rawMarker?.trim() || reportNameFallback;
  const resolveSourceReportName = (row: ReviewMarker): string =>
    row.rawMarker?.trim() || row.marker?.trim() || reportNameFallback;
  const formatMaybeNumber = (value: number | null | undefined): string =>
    value === null || value === undefined || !Number.isFinite(value) ? "-" : String(Number(value.toFixed(3)));
  const reviewMarkers = draft.markers as ReviewMarker[];
  const isActionableAutoFix = (row: ReviewMarker): boolean =>
    row._confidence?.autoFixable === true && (row._confidence?.overall ?? "ok") !== "ok";
  const markersNeedingReview = reviewMarkers.filter((row) => (row._confidence?.overall ?? "ok") !== "ok");
  const autoFixableMarkers = reviewMarkers.filter(isActionableAutoFix);

  const statusLabel = (row: ReviewMarker): string => {
    const overall = row._confidence?.overall ?? "ok";
    if (overall === "error") {
      return tr("Fout", "Error");
    }
    if (overall === "review") {
      return tr("Check", "Check");
    }
    return tr("OK", "OK");
  };

  const statusIcon = (row: ReviewMarker) => {
    const overall = row._confidence?.overall ?? "ok";
    if (overall === "error") {
      return <XCircle className="h-4 w-4 text-rose-300" />;
    }
    if (overall === "review") {
      return <AlertTriangle className="h-4 w-4 text-amber-300" />;
    }
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  };

  const statusClassName = (row: ReviewMarker): string => {
    const overall = row._confidence?.overall ?? "ok";
    if (overall === "error") {
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    }
    if (overall === "review") {
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    }
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  };

  const reviewTooltip = (row: ReviewMarker): string | undefined => {
    const issues = row._confidence?.issues ?? [];
    if (issues.length > 0) {
      return issues.map((issue) => `- ${issue}`).join("\n");
    }
    const overall = row._confidence?.overall ?? "ok";
    if (overall === "review") {
      return tr(
        "Controle aanbevolen: de parser heeft een onzeker punt gezien.",
        "Check recommended: the parser detected an uncertain point."
      );
    }
    if (overall === "error") {
      return tr(
        "Parserfout: controleer deze rij handmatig.",
        "Parser error: review this row manually."
      );
    }
    return undefined;
  };

  const resolveRangeType = (row: ReviewMarker): RangeType => {
    const markerRangeType = row._matchResult?.canonical?.defaultRangeType;
    if (markerRangeType) {
      return markerRangeType;
    }
    const hasMin = displayReferenceMin(row) !== null;
    const hasMax = displayReferenceMax(row) !== null;
    if (hasMin && hasMax) {
      return "min-max";
    }
    if (hasMax) {
      return "max-only";
    }
    if (hasMin) {
      return "min-only";
    }
    return "none";
  };

  const applyAutoFixToAll = () => {
    if (autoFixableMarkers.length === 0) {
      return;
    }
    onDraftChange({
      ...draft,
      markers: reviewMarkers.map((row) => (isActionableAutoFix(row) ? applyMarkerAutoFix(row) : row))
    });
  };

  const applyAutoFixToRow = (rowId: string) => {
    onDraftChange({
      ...draft,
      markers: reviewMarkers.map((row) => (row.id === rowId && isActionableAutoFix(row) ? applyMarkerAutoFix(row) : row))
    });
  };

  const cloneSupplementsAsDraftOverrides = (periods: SupplementPeriod[]): SupplementPeriod[] =>
    periods.map((period) => ({
      id: createId(),
      name: period.name,
      dose: period.dose,
      frequency: period.frequency,
      startDate: draft.testDate,
      endDate: draft.testDate
    }));

  const addSupplementOverride = () => {
    const name = canonicalizeSupplement(supplementNameInput);
    if (!name) {
      return;
    }
    const normalizedFrequency = supplementFrequencyInput.trim() || "unknown";
    const period: SupplementPeriod = {
      id: createId(),
      name,
      dose: supplementDoseInput.trim(),
      frequency: normalizedFrequency,
      startDate: draft.testDate,
      endDate: draft.testDate
    };
    onAnnotationsChange({
      ...annotations,
      supplementAnchorState: "anchor",
      supplementOverrides: [...overrideSupplements, period]
    });
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const removeSupplementOverride = (id: string) => {
    const nextOverrides = overrideSupplements.filter((item) => item.id !== id);
    onAnnotationsChange({
      ...annotations,
      supplementAnchorState: nextOverrides.length > 0 ? "anchor" : "none",
      supplementOverrides: nextOverrides.length > 0 ? nextOverrides : []
    });
  };

  const resetSupplementsToInherited = () => {
    onAnnotationsChange({
      ...annotations,
      supplementAnchorState: "inherit",
      supplementOverrides: null
    });
    setShowSupplementOverrideEditor(false);
  };

  const markSupplementsUnchanged = () => {
    onAnnotationsChange({
      ...annotations,
      supplementAnchorState: "inherit",
      supplementOverrides: null
    });
    setShowSupplementOverrideEditor(false);
  };

  const startCustomSupplements = () => {
    const seed = overrideSupplements.length > 0 ? overrideSupplements : cloneSupplementsAsDraftOverrides(inheritedSupplements);
    onAnnotationsChange({
      ...annotations,
      supplementAnchorState: "anchor",
      supplementOverrides: seed
    });
    setShowSupplementOverrideEditor(true);
  };

  const addOverridesToTimeline = () => {
    if (overrideSupplements.length === 0) {
      return;
    }
    const startDate = addTimelineStartDate || draft.testDate;
    const endDate = addTimelineEndDate.trim() ? addTimelineEndDate : null;
    overrideSupplements.forEach((supplement) => {
      onAddSupplementPeriod({
        ...supplement,
        id: createId(),
        startDate,
        endDate
      });
    });
  };

  const updateRow = (rowId: string, updater: (row: MarkerValue) => MarkerValue) => {
    onDraftChange({
      ...draft,
      markers: reviewMarkers.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const next = updater(row);
        const sourceValue = typeof next.rawValue === "number" ? next.rawValue : next.value;
        const sourceUnit = next.rawUnit ?? next.unit;
        const sourceReferenceMin = next.rawReferenceMin !== undefined ? next.rawReferenceMin : next.referenceMin;
        const sourceReferenceMax = next.rawReferenceMax !== undefined ? next.rawReferenceMax : next.referenceMax;
        const normalized = normalizeMarkerMeasurement({
          canonicalMarker: next.canonicalMarker,
          value: sourceValue,
          unit: sourceUnit,
          referenceMin: sourceReferenceMin,
          referenceMax: sourceReferenceMax
        });
        return enrichMarkerForReview({
          ...next,
          rawValue: sourceValue,
          rawUnit: sourceUnit,
          rawReferenceMin: sourceReferenceMin,
          rawReferenceMax: sourceReferenceMax,
          value: normalized.value,
          unit: normalized.unit,
          referenceMin: normalized.referenceMin,
          referenceMax: normalized.referenceMax,
          abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
        });
      })
    });
  };

  const addRow = () => {
    const nextRow = enrichMarkerForReview({
      id: createId(),
      marker: "",
      rawMarker: "",
      canonicalMarker: "Unknown Marker",
      value: 0,
      unit: "",
      referenceMin: null,
      referenceMax: null,
      rawValue: 0,
      rawUnit: "",
      rawReferenceMin: null,
      rawReferenceMax: null,
      abnormal: "unknown",
      confidence: 0.4
    });

    onDraftChange({
      ...draft,
      markers: [
        ...draft.markers,
        nextRow
      ]
    });
  };

  const removeRow = (rowId: string) => {
    onDraftChange({
      ...draft,
      markers: draft.markers.filter((row) => row.id !== rowId)
    });
  };

  const saveProtocolFromDraft = () => {
    const name = protocolDraft.name.trim();
    if (!name) {
      setProtocolFeedback(tr("Geef een protocolnaam op.", "Please enter a protocol name."));
      return;
    }
    if (protocolDraft.compounds.length === 0) {
      setProtocolFeedback(tr("Voeg minimaal 1 compound toe.", "Add at least 1 compound."));
      return;
    }

    const now = new Date().toISOString();
    const protocol: Protocol = {
      id: createId(),
      name,
      items: protocolDraft.compounds,
      compounds: protocolDraft.compounds,
      notes: protocolDraft.notes,
      createdAt: now,
      updatedAt: now
    };

    onProtocolCreate(protocol);
    onSelectedProtocolIdChange(protocol.id);
    closeCreateProtocolModal();
  };

  const createProtocolModal = showCreateProtocol ? (
    <div
      className="app-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-protocol-modal-title"
      onClick={closeCreateProtocolModal}
    >
      <div className="app-modal-shell max-w-4xl" onClick={(event) => event.stopPropagation()}>
        <div className="app-modal-header p-5 sm:p-6">
          <div className="app-modal-header-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                {tr("Protocol", "Protocol")}
              </div>
              <h3 id="create-protocol-modal-title" className="mt-3 text-xl font-semibold text-slate-50 sm:text-2xl">
                {tr("Nieuw protocol", "Create protocol")}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {tr(
                  "Maak een protocol aan zonder je review-scherm te verlaten.",
                  "Create a protocol without leaving the review screen."
                )}
              </p>
            </div>
            <button
              type="button"
              className="app-modal-close-btn"
              onClick={closeCreateProtocolModal}
              aria-label={tr("Sluiten", "Close")}
              title={tr("Sluiten", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="max-h-[56vh] overflow-y-auto pr-1">
            {isProtocolModalReady ? (
              <ProtocolEditor value={protocolDraft} language={language} onChange={setProtocolDraft} />
            ) : (
              <div className="animate-pulse space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/45 p-4">
                <div className="h-4 w-32 rounded bg-slate-800" />
                <div className="h-10 rounded bg-slate-800/80" />
                <div className="h-28 rounded bg-slate-800/70" />
                <div className="h-20 rounded bg-slate-800/60" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
              onClick={closeCreateProtocolModal}
            >
              <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-3 py-1.5 text-sm font-semibold text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/22"
              onClick={saveProtocolFromDraft}
            >
              <Save className="h-4 w-4" /> {tr("Opslaan en selecteren", "Save and select")}
            </button>
          </div>
          {protocolFeedback ? <p className="text-sm text-amber-200">{protocolFeedback}</p> : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 shadow-soft"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {isManualEntry ? tr("Handmatig waarden invoeren", "Enter values manually") : tr("Controleer geextraheerde data", "Review extracted data")}
          </h2>
          {!isManualEntry ? (
            <>
              <p className="text-sm text-slate-300">
                {draft.sourceFileName} | {draft.markers.length} {tr("markers", "markers")}
                <span
                  className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                    resultOrigin === "ai"
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                      : "border-slate-600 bg-slate-800/70 text-slate-300"
                  }`}
                >
                  {resultOriginLabel}
                </span>
                <span className="ml-2 inline-flex items-center rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-100">
                  {tr("gebruikt", "used")}: {routeUsedLabel}
                </span>
                {showParserDebugInfo ? (
                  <span className="ml-2 inline-flex items-center rounded-full border border-slate-600 bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300">
                    {tr("ingestelde parsermodus", "configured parser mode")}: {configuredParserModeLabel}
                  </span>
                ) : null}
              </p>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {draft.extraction.needsReview ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {tr("Controleren", "Needs review")}
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-400"
            onClick={onCancel}
          >
            <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            onClick={onSave}
          >
            <Save className="h-4 w-4" /> {tr("Rapport opslaan", "Save report")}
          </button>
        </div>
      </div>

      {showLowQualityReviewBanner ? (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {tr("Controleer dit rapport extra goed", "Review this report carefully")}
            </p>
            <p className="mt-1 text-xs text-amber-100/95 sm:text-sm">{lowQualityReviewMessage}</p>
          </div>
          {onOpenParserImprovement && !parserImprovementSubmitted ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/45 bg-slate-950/25 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/15 sm:text-sm"
              onClick={onOpenParserImprovement}
            >
              {tr("Stuur PDF om parser te verbeteren", "Send PDF to improve parser")}
            </button>
          ) : null}
        </div>
      ) : null}

      {warningMessages.length > 0 && !showLowQualityReviewBanner ? (
        <div className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {tr("Parserwaarschuwingen", "Parser warnings")} ({warningMessages.length})
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
              onClick={() => setShowWarningDetails((current) => !current)}
            >
              {showWarningDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showWarningDetails ? tr("Minder tonen", "Show less") : tr("Details tonen", "Show details")}
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-100/95 sm:text-sm">
            {tr(
              "Controleer testdatum, markerwaarden en referenties voordat je opslaat.",
              "Check test date, marker values, and references before saving."
            )}
          </p>
          <ul className="mt-2 space-y-1 text-xs sm:text-sm">
            {warningMessages.slice(0, 2).map((message) => (
              <li key={message}>- {message}</li>
            ))}
            {!showWarningDetails && warningMessages.length > 2 ? (
              <li className="text-amber-100/80">
                {tr(`+ ${warningMessages.length - 2} extra waarschuwingen`, `+ ${warningMessages.length - 2} more warnings`)}
              </li>
            ) : null}
          </ul>
          {showWarningDetails ? (
            <>
              <ul className="mt-2 space-y-1 text-xs sm:text-sm">
                {warningMessages.slice(2).map((message) => (
                  <li key={message}>- {message}</li>
                ))}
              </ul>
              <div className="mt-2 rounded-md border border-amber-500/20 bg-slate-950/30 p-2 text-xs text-amber-100/95">
                <p className="font-medium">{tr("Checklist voor opslaan", "Checklist before saving")}</p>
                <p>- {tr("Controleer of de testdatum klopt.", "Confirm the test date is correct.")}</p>
                <p>- {tr("Controleer kritieke markers (Testosterone, Estradiol, SHBG, Hematocrit).", "Verify critical markers (Testosterone, Estradiol, SHBG, Hematocrit).")}</p>
                <p>- {tr("Vul ontbrekende referentiewaarden handmatig aan waar nodig.", "Fill in missing reference ranges manually where needed.")}</p>
              </div>
              {showParserDebugInfo && debugInfo ? (
                <p className="mt-2 text-[11px] text-amber-100/80">
                  {tr("Debug", "Debug")}: text items {debugInfo.textItems} | OCR {debugInfo.ocrUsed ? "on" : "off"} | kept rows {debugInfo.keptRows} | rejected rows{" "}
                  {debugInfo.rejectedRows}
                  {debugInfo.aiAttemptedModes?.length ? ` | AI modes ${debugInfo.aiAttemptedModes.join("->")}` : ""}
                  {debugInfo.aiRescueTriggered ? " | rescue on" : ""}
                  {debugInfo.aiRescueReason ? ` | rescue reason ${debugInfo.aiRescueReason}` : ""}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {unknownLayoutDetected ? (
        <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-sm text-rose-100">
          <p className="font-medium">{tr("Volgende stap bij onbekend format", "Next step for unknown format")}</p>
          <p className="mt-1 text-xs text-rose-100/90 sm:text-sm">
            {tr(
              "Parser kon nog geen bruikbare markers vinden. Kies een vervolgstap hieronder.",
              "Parser could not find usable markers yet. Pick a follow-up action below."
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetryWithOcr ? (
              <button
                type="button"
                className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20 sm:text-sm"
                onClick={onRetryWithOcr}
              >
                {tr("OCR opnieuw proberen", "Retry OCR")}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 sm:text-sm"
                disabled
              >
                {tr("OCR opnieuw proberen (upload opnieuw)", "Retry OCR (re-upload first)")}
              </button>
            )}
            {onStartManualEntry ? (
              <button
                type="button"
                className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/20 sm:text-sm"
                onClick={onStartManualEntry}
              >
                {tr("Handmatig invullen", "Enter manually")}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-rose-100/80 sm:text-sm">
            {tr(
              "Wil je ons helpen de parser te verbeteren? Gebruik dan de knop om het originele PDF-bestand expliciet te delen.",
              "Want to help us improve the parser? Use the button to explicitly share the original PDF."
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(170px,0.8fr)_minmax(0,1.2fr)] xl:grid-cols-[minmax(160px,0.7fr)_minmax(0,1.6fr)_minmax(220px,1fr)]">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Afnamedatum", "Test date")}</label>
          <input
            type="date"
            value={draft.testDate}
            onChange={(event) => onDraftChange({ ...draft, testDate: event.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Protocol", "Protocol")}</label>
          <div className="flex min-w-0 items-center gap-2">
            <select
              value={selectedProtocolId ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                onSelectedProtocolIdChange(nextValue ? nextValue : null);
              }}
              className="review-context-input min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{tr("Geen protocol", "No protocol")}</option>
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.name}
                </option>
              ))}
            </select>
            {selectedProtocol ? (
              <button
                type="button"
                className="shrink-0 whitespace-nowrap rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-100"
                onClick={() => onSelectedProtocolIdChange(null)}
              >
                {tr("Ontkoppel", "Detach")}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200"
              onClick={() => setShowCreateProtocol(true)}
            >
              <Plus className="h-4 w-4" /> {tr("Nieuw", "New")}
            </button>
          </div>
          {!selectedProtocol && protocols.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              {tr("Nog geen protocol opgeslagen. Klik op Nieuw om er een aan te maken.", "No saved protocol yet. Click New to create one.")}
            </p>
          ) : null}
        </div>
        <div className="md:col-span-2 xl:col-span-1">
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Meetmoment", "Sampling timing")}</label>
          <select
            value={annotations.samplingTiming}
            onChange={(event) =>
              onAnnotationsChange({
                ...annotations,
                samplingTiming: event.target.value as ReportAnnotations["samplingTiming"]
              })
            }
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          >
            <option value="unknown">{tr("Onbekend", "Unknown")}</option>
            <option value="trough">Trough</option>
            <option value="mid">{tr("Tussenin", "In-between")}</option>
            <option value="peak">Peak</option>
          </select>
        </div>
      </div>

      {markersNeedingReview.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-700/50 bg-amber-950/40 p-3 text-amber-100">
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {tr("{count} markers hebben controle nodig", "{count} markers need review").replace(
              "{count}",
              String(markersNeedingReview.length)
            )}
          </p>
          <p className="mt-1 text-xs text-amber-100/90 sm:text-sm">
            {tr(
              "We konden sommige marker-namen, eenheden of referentiebereiken niet volledig herkennen.",
              "We could not fully recognize some marker names, units, or reference ranges."
            )}
          </p>
          {autoFixableMarkers.length > 0 ? (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 sm:text-sm"
              onClick={applyAutoFixToAll}
            >
              <Wrench className="h-4 w-4" />
              {tr("Auto-fix {count} markers", "Auto-fix {count} markers").replace(
                "{count}",
                String(autoFixableMarkers.length)
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/45 p-2.5">
        <p className="text-xs text-slate-300 sm:text-sm">
          {tr("Markernaam weergave", "Marker name display")}
        </p>
        <div className="inline-flex rounded-md border border-slate-700 bg-slate-900/70 p-0.5">
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-xs font-medium sm:text-sm ${
              markerNameDisplayMode === "report"
                ? "bg-cyan-500/20 text-cyan-100"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            onClick={() => setMarkerNameDisplayMode("report")}
          >
            {tr("Rapportlabels", "Report labels")}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-xs font-medium sm:text-sm ${
              markerNameDisplayMode === "canonical"
                ? "bg-cyan-500/20 text-cyan-100"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            onClick={() => setMarkerNameDisplayMode("canonical")}
          >
            {tr("Canonieke namen", "Canonical names")}
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-700">
        <div className="overflow-x-hidden overflow-y-hidden">
          <table className="w-full table-fixed divide-y divide-slate-700 text-sm">
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead className="bg-slate-900/80 text-left text-slate-300">
              <tr>
                <th className="px-3 py-2">{tr("Marker", "Marker")}</th>
                <th className="px-3 py-2 text-right">{tr("Waarde", "Value")}</th>
                <th className="px-3 py-2">{tr("Eenheid", "Unit")}</th>
                <th className="px-3 py-2 text-right">{tr("Ref min", "Ref min")}</th>
                <th className="px-3 py-2 text-right">{tr("Ref max", "Ref max")}</th>
                <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
                <th className="px-3 py-2 text-center">{tr("Visual Range", "Visual Range")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tr("Acties", "Actions")}</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">{tr("Review", "Review")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {reviewMarkers.map((row) => {
                const rangeType = resolveRangeType(row);
                const rangeMin =
                  displayReferenceMin(row) !== null ? displayReferenceMin(row) : row._matchResult?.canonical?.defaultRange?.min;
                const rangeMax =
                  displayReferenceMax(row) !== null ? displayReferenceMax(row) : row._matchResult?.canonical?.defaultRange?.max;
                const optimalMin = row._matchResult?.canonical?.optimalRange?.min;
                const optimalMax = row._matchResult?.canonical?.optimalRange?.max;
                const hasVisualRange = rangeType !== "none" && (rangeMin !== undefined || rangeMax !== undefined);
                const reviewTitle = reviewTooltip(row);
                const reviewTooltipId = `review-tooltip-${row.id}`;

                return (
                  <tr key={row.id} className="bg-slate-900/35">
                <td className="min-w-0 align-top px-3 py-2">
                  {isCanonicalNameMode ? (
                    <>
                      <p className="break-words text-sm text-slate-100">{resolveCanonicalDisplayName(row)}</p>
                      <p className="mt-1 break-words text-[11px] text-slate-500">
                        {tr("Uit rapport", "From report")}: {resolveSourceReportName(row)}
                      </p>
                    </>
                  ) : (
                    <>
                      <EditableCell
                        value={resolveReportDisplayName(row)}
                        clickToEdit
                        inlineIcon
                        onCommit={(value) =>
                          updateRow(row.id, (current) => ({
                            ...current,
                            marker: value,
                            canonicalMarker: canonicalizeMarker(value)
                          }))
                        }
                        placeholder={tr("Markernaam", "Marker name")}
                        editLabel={tr("Markernaam bewerken", "Edit marker name")}
                      />
                      <p className="mt-1 break-words text-[11px] text-slate-500">
                        {tr("Gekoppeld aan", "Mapped to")}: {resolveCanonicalDisplayName(row)}
                      </p>
                      {row.rawMarker && row.rawMarker !== row.marker ? (
                        <p className="break-words text-[11px] text-slate-500">
                          {tr("In rapport", "In report")}: {row.rawMarker}
                        </p>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="align-top px-3 py-2 text-right">
                  <EditableCell
                    value={displayValue(row)}
                    align="right"
                    clickToEdit
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        rawValue: safeNumber(value) ?? displayValue(current)
                      }))
                    }
                  />
                  {hasRawValue(row) && row.rawValue !== row.value ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr("Canoniek/App", "Canonical/App")}: {formatMaybeNumber(row.value)}
                    </p>
                  ) : null}
                </td>
                <td className="align-top px-3 py-2">
                  <EditableCell
                    value={displayUnit(row)}
                    clickToEdit
                    editLabel={tr("Eenheid bewerken", "Edit unit")}
                    onCommit={(value) => updateRow(row.id, (current) => ({ ...current, rawUnit: value }))}
                    placeholder={tr("Eenheid", "Unit")}
                  />
                  {hasRawUnit(row) && displayUnit(row) !== row.unit ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr("Canonieke/App-eenheid", "Canonical/App unit")}: {row.unit}
                    </p>
                  ) : null}
                </td>
                <td className="align-top px-3 py-2 text-right">
                  <EditableCell
                    value={displayReferenceMin(row)}
                    align="right"
                    clickToEdit
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        rawReferenceMin: value.trim() ? safeNumber(value) : null
                      }))
                    }
                  />
                  {hasRawReferenceMin(row) && row.rawReferenceMin !== row.referenceMin ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr("Canonieke/App ref", "Canonical/App ref")}: {formatMaybeNumber(row.referenceMin)}
                    </p>
                  ) : null}
                </td>
                <td className="align-top px-3 py-2 text-right">
                  <EditableCell
                    value={displayReferenceMax(row)}
                    align="right"
                    clickToEdit
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        rawReferenceMax: value.trim() ? safeNumber(value) : null
                      }))
                    }
                  />
                  {hasRawReferenceMax(row) && row.rawReferenceMax !== row.referenceMax ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {tr("Canonieke/App ref", "Canonical/App ref")}: {formatMaybeNumber(row.referenceMax)}
                    </p>
                  ) : null}
                </td>
                <td className="align-top px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.abnormal === "high"
                        ? "bg-rose-500/20 text-rose-300"
                        : row.abnormal === "low"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {abnormalLabel(row.abnormal)}
                  </span>
                </td>
                <td className="align-top px-3 py-2 text-center">
                  {hasVisualRange ? (
                    <VisualRangeBar
                      value={displayValue(row)}
                      rangeType={rangeType}
                      min={rangeMin === null ? undefined : rangeMin}
                      max={rangeMax === null ? undefined : rangeMax}
                      optimalMin={optimalMin}
                      optimalMax={optimalMax}
                      unit={displayUnit(row)}
                    />
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </td>
                <td className="align-top whitespace-nowrap px-3 py-2 text-right">
                  {isActionableAutoFix(row) ? (
                    <button
                      type="button"
                      className="mr-1 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-xs text-amber-200 hover:bg-amber-500/20"
                      onClick={() => applyAutoFixToRow(row.id)}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span className="hidden 2xl:inline">{tr("Auto-fix", "Auto-fix")}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                    onClick={() => removeRow(row.id)}
                    aria-label={tr("Rij verwijderen", "Remove row")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
                <td className="align-top whitespace-nowrap px-3 py-2 text-right">
                  <div className="group relative inline-flex">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassName(row)}`}
                      aria-describedby={reviewTitle ? reviewTooltipId : undefined}
                      tabIndex={reviewTitle ? 0 : -1}
                    >
                      {statusIcon(row)}
                      {statusLabel(row)}
                    </span>
                    {reviewTitle ? (
                      <div
                        id={reviewTooltipId}
                        role="tooltip"
                        className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 max-w-[320px] whitespace-pre-line rounded-md border border-slate-600 bg-slate-900/95 px-2.5 py-2 text-left text-xs leading-relaxed text-slate-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        {reviewTitle}
                      </div>
                    ) : null}
                  </div>
                </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
          onClick={addRow}
        >
          <Plus className="h-4 w-4" /> {tr("Markerrij toevoegen", "Add marker row")}
        </button>
        {onEnableAiRescue ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onEnableAiRescue}
            disabled={isImprovingWithAi}
          >
            {isImprovingWithAi
              ? tr("AI-rescue bezig...", "AI rescue in progress...")
              : tr("AI-rescue met PDF (optioneel)", "AI rescue with PDF (optional)")}
          </button>
        ) : null}
        {onImproveWithAi ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
            onClick={onImproveWithAi}
            disabled={isImprovingWithAi}
          >
            {isImprovingWithAi ? tr("AI verbetert extractie...", "AI is improving extraction...") : tr("Verbeter extractie met AI", "Improve extraction with AI")}
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onOpenParserImprovement?.()}
          disabled={!onOpenParserImprovement || parserImprovementSubmitted}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {tr("Meld probleem + stuur PDF", "Report issue + send PDF")}
        </button>
      </div>
      {onEnableAiRescue || onImproveWithAi ? (
        <p className="mt-2 rounded-md border border-slate-700/70 bg-slate-900/45 px-3 py-2 text-xs text-slate-300">
          {tr(
            "AI is optioneel. Zonder expliciete toestemming blijft de verwerking lokaal en wordt er niets extern verstuurd.",
            "AI is optional. Without explicit consent, processing stays local and nothing is sent externally."
          )}
        </p>
      ) : null}

      <div className="review-context-card mt-3 space-y-3 rounded-xl border border-slate-700 bg-slate-900/45 p-3">
          {showReviewSupplementSection ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/45 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs uppercase tracking-wide text-slate-400">
                {tr("Supplementen op moment van test", "Supplements at time of test")}
              </label>
              {supplementAnchorState === "inherit" ? (
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  {tr("Zelfde als huidige stack", "Keep active stack")}
                </span>
              ) : (
                <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                  {tr("Aangepast op dit rapport", "Changed on this report")}
                </span>
              )}
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              <p className="font-medium text-slate-200">
                {tr(
                  "Gebruik je huidige actieve stack voor dit rapport?",
                  "Use your current active stack for this report?"
                )}
              </p>
              <p className="mt-1 text-slate-400">
                {tr("Huidige actieve stack", "Current active stack")}:{" "}
                {inheritedSupplementsText || tr("Geen actieve stack", "No active stack")}
                {inheritedSupplementsSourceLabel ? ` - ${inheritedSupplementsSourceLabel}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    supplementAnchorState === "inherit"
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                      : "border-slate-600 text-slate-200 hover:border-cyan-500/50"
                  }`}
                  onClick={markSupplementsUnchanged}
                >
                  {tr("Behoud actieve stack", "Keep active stack")}
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    supplementAnchorState !== "inherit"
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                      : "border-slate-600 text-slate-200 hover:border-cyan-500/50"
                  }`}
                  onClick={startCustomSupplements}
                >
                  {tr("Pas actieve stack aan", "Change active stack")}
                </button>
              </div>
            </div>

            <p className="mt-2 text-sm text-slate-300">
              {supplementAnchorState === "anchor" && activeSupplementsText
                ? `${tr("Aangepaste stack", "Custom stack")}: ${activeSupplementsText}`
                : supplementStatusText}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                onClick={() => {
                  if (supplementAnchorState !== "anchor") {
                    startCustomSupplements();
                    return;
                  }
                  setShowSupplementOverrideEditor((current) => !current);
                }}
              >
                {supplementAnchorState === "anchor" && showSupplementOverrideEditor
                  ? tr("Verberg editor", "Hide editor")
                  : supplementAnchorState === "anchor"
                    ? tr("Bewerk aangepaste stack", "Edit custom stack")
                    : tr("Aangepaste stack invoeren", "Enter custom stack")}
              </button>
              {supplementAnchorState !== "inherit" ? (
                <button
                  type="button"
                  className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-100"
                  onClick={resetSupplementsToInherited}
                >
                  {tr("Terug naar zelfde als vorige", "Reset to inherited")}
                </button>
              ) : null}
            </div>

            {supplementAnchorState === "anchor" && showSupplementOverrideEditor ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
            <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{tr("Supplement", "Supplement")}</label>
                <input
                  value={supplementNameInput}
                  onChange={(event) => setSupplementNameInput(event.target.value)}
                  placeholder={tr("Zoek of typ supplement", "Search or type supplement")}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
                {supplementSuggestions.length > 0 ? (
                  <div className="mt-1 rounded-md border border-slate-700 bg-slate-900/95 p-1">
                    {supplementSuggestions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                        onClick={() => setSupplementNameInput(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{tr("Dosis", "Dose")}</label>
                <input
                  value={supplementDoseInput}
                  onChange={(event) => setSupplementDoseInput(event.target.value)}
                  placeholder={tr("bijv. 4000 IU", "e.g. 4000 IU")}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{tr("Frequentie", "Frequency")}</label>
                <select
                  value={supplementFrequencyInput}
                  onChange={(event) => setSupplementFrequencyInput(event.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tr(option.label.nl, option.label.en)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                  onClick={addSupplementOverride}
                >
                  <Plus className="mr-1 inline-block h-4 w-4" />
                  {tr("Toevoegen", "Add")}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {overrideSupplements.length === 0 ? (
                <p className="text-sm text-slate-400">{tr("Nog geen overrides toegevoegd.", "No overrides added yet.")}</p>
              ) : (
                overrideSupplements.map((supplement) => (
                  <div key={supplement.id} className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-sm text-slate-200">
                      <span className="font-medium">{supplement.name}</span>
                      {supplement.dose ? ` - ${supplement.dose}` : ""}
                      {` - ${supplementFrequencyLabel(supplement.frequency, language)}`}
                    </p>
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                      onClick={() => removeSupplementOverride(supplement.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {overrideSupplements.length > 0 ? (
              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                <p className="mb-2 text-sm font-medium text-slate-200">{tr("Voeg deze ook toe aan je supplement-tijdlijn", "Add these to your supplement timeline")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{tr("Startdatum", "Start date")}</label>
                    <input
                      type="date"
                      value={addTimelineStartDate}
                      onChange={(event) => setAddTimelineStartDate(event.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{tr("Einddatum (optioneel)", "End date (optional)")}</label>
                    <input
                      type="date"
                      value={addTimelineEndDate}
                      onChange={(event) => setAddTimelineEndDate(event.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                  onClick={addOverridesToTimeline}
                >
                  {tr("Toevoegen aan tijdlijn", "Add to timeline")}
                </button>
              </div>
            ) : null}
              </div>
            ) : null}
          </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Symptomen", "Symptoms")}</label>
              <textarea
                value={annotations.symptoms}
                onChange={(event) => onAnnotationsChange({ ...annotations, symptoms: event.target.value })}
                className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                placeholder={tr("Energie, libido, stemming, slaap", "Energy, libido, mood, sleep")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Notities", "Notes")}</label>
              <textarea
                value={annotations.notes}
                onChange={(event) => onAnnotationsChange({ ...annotations, notes: event.target.value })}
                className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                placeholder={tr("Aanvullende observaties", "Additional observations")}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-700/80 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-slate-400"
              onClick={onCancel}
            >
              <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
              onClick={onSave}
            >
              <Save className="h-4 w-4" /> {tr("Rapport opslaan", "Save report")}
            </button>
          </div>
      </div>

    </motion.div>
    {createProtocolModal && typeof document !== "undefined" ? createPortal(createProtocolModal, document.body) : null}
    </>
  );
};

export default ExtractionReviewTable;

