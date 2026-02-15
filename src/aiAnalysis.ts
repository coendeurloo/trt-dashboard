import { sortReportsChronological } from "./utils";
import { AppLanguage, LabReport, UnitSystem } from "./types";
import { convertBySystem } from "./unitConversion";
import {
  DosePrediction,
  MarkerAlert,
  MarkerTrendSummary,
  ProtocolImpactSummary,
  TrtStabilityResult
} from "./analytics";

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: {
    message?: string;
  };
}

interface AnalyzeLabDataOptions {
  apiKey: string;
  reports: LabReport[];
  unitSystem: UnitSystem;
  language?: AppLanguage;
  analysisType?: "full" | "latestComparison";
  context?: {
    samplingFilter: "all" | "trough" | "peak";
    protocolImpact: ProtocolImpactSummary;
    alerts: MarkerAlert[];
    trendByMarker: Record<string, MarkerTrendSummary>;
    trtStability: TrtStabilityResult;
    dosePredictions: DosePrediction[];
  };
}

interface AnalysisMarkerRow {
  marker: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  abnormal: "low" | "high" | "normal" | "unknown";
}

interface AnalysisReportRow {
  testDate: string;
  sourceFileName: string;
  annotations: {
    dosageMgPerWeek: number | null;
    protocol: string;
    supplements: string;
    symptoms: string;
    notes: string;
    samplingTiming: "unknown" | "trough" | "mid" | "peak";
  };
  markers: AnalysisMarkerRow[];
}

interface LatestComparisonRow {
  marker: string;
  unit: string;
  previousDate: string;
  latestDate: string;
  previousValue: number;
  latestValue: number;
  delta: number;
  percentChange: number | null;
  previousAbnormal: AnalysisMarkerRow["abnormal"];
  latestAbnormal: AnalysisMarkerRow["abnormal"];
}

const ANALYSIS_MODEL_CANDIDATES = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest"
] as const;
const SIGNAL_MARKERS = [
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG",
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Cholesterol",
  "Triglyceriden",
  "Hemoglobin"
] as const;

const toRounded = (value: number): number => {
  if (Math.abs(value) >= 100) {
    return Number(value.toFixed(1));
  }
  if (Math.abs(value) >= 10) {
    return Number(value.toFixed(2));
  }
  return Number(value.toFixed(3));
};

const normalizeText = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const toEpochDay = (isoDate: string): number | null => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
};

const computeStdDev = (values: number[]): number => {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const buildPayload = (reports: LabReport[], unitSystem: UnitSystem): AnalysisReportRow[] => {
  const sorted = sortReportsChronological(reports);
  return sorted.map((report) => ({
    testDate: report.testDate,
    sourceFileName: report.sourceFileName,
    annotations: {
      dosageMgPerWeek: report.annotations.dosageMgPerWeek,
      protocol: report.annotations.protocol,
      supplements: report.annotations.supplements,
      symptoms: report.annotations.symptoms,
      notes: report.annotations.notes,
      samplingTiming: report.annotations.samplingTiming
    },
    markers: report.markers.map((marker) => {
      const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, unitSystem);
      const convertedMin =
        marker.referenceMin === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
      const convertedMax =
        marker.referenceMax === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;

      return {
        marker: marker.canonicalMarker,
        value: toRounded(converted.value),
        unit: converted.unit,
        referenceMin: convertedMin === null ? null : toRounded(convertedMin),
        referenceMax: convertedMax === null ? null : toRounded(convertedMax),
        abnormal: marker.abnormal
      };
    })
  }));
};

const isMarkdownTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);

const isMarkdownTableSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitTableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const stripComplexFormatting = (input: string): string => {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!isMarkdownTableLine(line)) {
      output.push(line);
      index += 1;
      continue;
    }

    const tableLines: string[] = [];
    while (index < lines.length && isMarkdownTableLine(lines[index])) {
      tableLines.push(lines[index]);
      index += 1;
    }

    if (tableLines.length === 0) {
      continue;
    }

    const header = splitTableCells(tableLines[0]);
    const dataLines = tableLines.slice(tableLines.length > 1 && isMarkdownTableSeparator(tableLines[1]) ? 2 : 1);
    if (dataLines.length === 0) {
      continue;
    }

    output.push("Omgezet overzicht:");
    dataLines.forEach((dataLine, rowIndex) => {
      const cells = splitTableCells(dataLine);
      const pairs: string[] = [];
      const pairCount = Math.min(header.length, cells.length);
      for (let cellIndex = 0; cellIndex < pairCount; cellIndex += 1) {
        const key = header[cellIndex];
        const value = cells[cellIndex];
        if (!key || !value) {
          continue;
        }
        pairs.push(`${key}: ${value}`);
      }
      if (pairs.length === 0) {
        pairs.push(cells.filter(Boolean).join("; "));
      }
      output.push(`${rowIndex + 1}. ${pairs.join("; ")}`);
    });
    output.push("");
  }

  return output
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const buildLatestVsPrevious = (reports: AnalysisReportRow[]) => {
  if (reports.length < 2) {
    return null;
  }

  const latest = reports[reports.length - 1];
  const previous = reports[reports.length - 2];
  const previousByMarker = new Map(previous.markers.map((marker) => [marker.marker, marker] as const));
  const latestByMarker = new Map(latest.markers.map((marker) => [marker.marker, marker] as const));

  const overlapping: LatestComparisonRow[] = latest.markers
    .map((latestMarker) => {
      const previousMarker = previousByMarker.get(latestMarker.marker);
      if (!previousMarker) {
        return null;
      }
      const delta = latestMarker.value - previousMarker.value;
      const percentChange =
        Math.abs(previousMarker.value) < 0.000001 ? null : ((latestMarker.value - previousMarker.value) / previousMarker.value) * 100;

      return {
        marker: latestMarker.marker,
        unit: latestMarker.unit,
        previousDate: previous.testDate,
        latestDate: latest.testDate,
        previousValue: toRounded(previousMarker.value),
        latestValue: toRounded(latestMarker.value),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        previousAbnormal: previousMarker.abnormal,
        latestAbnormal: latestMarker.abnormal
      };
    })
    .filter((row): row is LatestComparisonRow => row !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const newInLatest = latest.markers
    .filter((marker) => !previousByMarker.has(marker.marker))
    .map((marker) => ({
      marker: marker.marker,
      value: marker.value,
      unit: marker.unit,
      abnormal: marker.abnormal
    }));

  const missingInLatest = previous.markers
    .filter((marker) => !latestByMarker.has(marker.marker))
    .map((marker) => ({
      marker: marker.marker,
      value: marker.value,
      unit: marker.unit,
      abnormal: marker.abnormal
    }));

  return {
    previousDate: previous.testDate,
    latestDate: latest.testDate,
    previousAnnotations: previous.annotations,
    latestAnnotations: latest.annotations,
    overlapping,
    newInLatest,
    missingInLatest
  };
};

const buildDerivedSignals = (reports: AnalysisReportRow[]) => {
  const markerSeries = new Map<
    string,
    Array<{ date: string; value: number; abnormal: AnalysisMarkerRow["abnormal"]; unit: string }>
  >();

  for (const report of reports) {
    for (const marker of report.markers) {
      const points = markerSeries.get(marker.marker) ?? [];
      points.push({
        date: report.testDate,
        value: marker.value,
        abnormal: marker.abnormal,
        unit: marker.unit
      });
      markerSeries.set(marker.marker, points);
    }
  }

  const markerSummaries = Array.from(markerSeries.entries())
    .map(([marker, rawPoints]) => {
      const points = [...rawPoints].sort((a, b) => {
        const left = toEpochDay(a.date) ?? 0;
        const right = toEpochDay(b.date) ?? 0;
        return left - right;
      });
      const first = points[0];
      const last = points[points.length - 1];
      const values = points.map((point) => point.value);
      const delta = last.value - first.value;
      const percentChange = Math.abs(first.value) < 0.000001 ? null : (delta / first.value) * 100;
      const firstDay = toEpochDay(first.date);
      const lastDay = toEpochDay(last.date);
      const daysSpan = firstDay !== null && lastDay !== null ? Math.max(1, (lastDay - firstDay) / (24 * 60 * 60 * 1000)) : 1;
      const slopePer30Days = (delta / daysSpan) * 30;
      const outOfRangeCount = points.filter((point) => point.abnormal === "high" || point.abnormal === "low").length;

      return {
        marker,
        unit: last.unit,
        measurements: points.length,
        firstDate: first.date,
        lastDate: last.date,
        firstValue: toRounded(first.value),
        lastValue: toRounded(last.value),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        slopePer30Days: toRounded(slopePer30Days),
        minValue: toRounded(Math.min(...values)),
        maxValue: toRounded(Math.max(...values)),
        volatility: toRounded(computeStdDev(values)),
        outOfRangeCount,
        latestAbnormalFlag: last.abnormal
      };
    })
    .sort((a, b) => a.marker.localeCompare(b.marker));

  const protocolTimeline = reports.map((report) => ({
    date: report.testDate,
    dosageMgPerWeek: report.annotations.dosageMgPerWeek,
    protocol: report.annotations.protocol,
    supplements: report.annotations.supplements,
    symptoms: report.annotations.symptoms,
    notes: report.annotations.notes
  }));

  const protocolChangeEvents: Array<{
    date: string;
    changes: string[];
    context: {
      dosageMgPerWeek: number | null;
      protocol: string;
      supplements: string;
      symptoms: string;
      notes: string;
    };
  }> = [];

  for (let index = 0; index < protocolTimeline.length; index += 1) {
    const current = protocolTimeline[index];
    if (index === 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes: ["Baseline context"],
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
      continue;
    }

    const previous = protocolTimeline[index - 1];
    const changes: string[] = [];

    if (current.dosageMgPerWeek !== previous.dosageMgPerWeek) {
      changes.push(`Dosage: ${previous.dosageMgPerWeek ?? "none"} -> ${current.dosageMgPerWeek ?? "none"} mg/week`);
    }
    if (normalizeText(current.protocol) !== normalizeText(previous.protocol)) {
      changes.push("Protocol changed");
    }
    if (normalizeText(current.supplements) !== normalizeText(previous.supplements)) {
      changes.push("Supplements changed");
    }
    if (normalizeText(current.symptoms) !== normalizeText(previous.symptoms)) {
      changes.push("Symptoms changed");
    }

    if (changes.length > 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes,
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
    }
  }

  const markersPresent = new Set(markerSummaries.map((summary) => summary.marker));
  const sparseMarkers = markerSummaries.filter((summary) => summary.measurements < 2).map((summary) => summary.marker);
  const missingSignalMarkers = SIGNAL_MARKERS.filter((marker) => !markersPresent.has(marker));
  const reportsWithNotes = reports.filter((report) => report.annotations.notes.trim().length > 0).length;
  const reportsWithSymptoms = reports.filter((report) => report.annotations.symptoms.trim().length > 0).length;

  return {
    period: {
      reportCount: reports.length,
      firstDate: reports[0]?.testDate ?? null,
      lastDate: reports[reports.length - 1]?.testDate ?? null
    },
    markerSummaries,
    protocolChangeEvents,
    contextCompleteness: {
      reportsWithNotes,
      reportsWithSymptoms,
      sparseMarkers,
      missingSignalMarkers
    }
  };
};

export const analyzeLabDataWithClaude = async ({
  apiKey,
  reports,
  unitSystem,
  language = "nl",
  analysisType = "full",
  context
}: AnalyzeLabDataOptions): Promise<string> => {
  const sanitizedKey = apiKey.trim();
  if (!sanitizedKey) {
    throw new Error("Vul eerst je Claude API key in bij Settings.");
  }
  if (reports.length === 0) {
    throw new Error("Er zijn nog geen rapporten om te analyseren.");
  }
  if (analysisType === "latestComparison" && reports.length < 2) {
    throw new Error("Voor 'laatste vs vorige' zijn minimaal 2 rapporten nodig.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = buildPayload(reports, unitSystem);
  const derivedSignals = buildDerivedSignals(payload);
  const latestComparison = buildLatestVsPrevious(payload);
  const preferredOutputLanguage = language === "en" ? "English" : "Nederlands";

  const fullPrompt = [
    "Je bent een senior klinische data-analist voor TRT-monitoring en gedeelde besluitvorming met een behandelend arts.",
    `Vandaag is ${today}. Geef een actuele, evidence-informed analyse op basis van alle data hieronder.`,
    "Doel: slimme patroonherkenning, protocol-correlaties en bespreekopties voor arts/patient, zonder medische directieven.",
    "BELANGRIJK FORMAT:",
    "- Gebruik GEEN markdown-tabellen.",
    "- Gebruik GEEN pipes ('|'), HTML of complexe opmaak.",
    "- Gebruik alleen markdown-koppen, bullets en korte paragrafen.",
    "- Gebruik duidelijke regelafbreking (geen alles-op-een-regel output).",
    `- Schrijf de volledige output in: ${preferredOutputLanguage}.`,
    "Randvoorwaarden:",
    "- Gebruik uitsluitend data uit het JSON-blok.",
    "- Verwijs bij elke kernclaim naar concrete data (datum + marker + waarde + unit).",
    "- Interpreteer tijdsvolgorde, sampling timing (trough/peak), protocoltekst, supplementen en symptomen samen.",
    "- Benoem onzekerheden en confounders expliciet.",
    "- Schrijf action-neutral; geen voorschriften of medische opdrachten.",
    "Structuur:",
    "- Gebruik een natuurlijke, duidelijke opbouw met koppen waar nuttig.",
    "- GEEN vaste verplichte sectievolgorde.",
    "- GEEN verplichte bullets-per-sectie of verplichte confidence-labels per sectie.",
    "- Gebruik de meegeleverde computed context (protocol impact, trends, alerts, predictions) waar relevant.",
    "Vereiste extra sectie:",
    "- Voeg altijd een aparte sectie toe met kop: '## Supplement Advice (for doctor discussion)'.",
    "- Maak daarna subkoppen per supplement met '### [Supplementnaam]'.",
    "- Gebruik per supplement exact deze velden als bullets met vetgedrukte labels:",
    "  - **Current dose:** [huidige dosis of 'not currently used']",
    "  - **Suggested change:** [Keep / Increase / Decrease / Stop / Consider adding]",
    "  - **Why:** [korte uitleg op basis van concrete labdata + trend/context]",
    "  - **Expected effect:** [verwachte richting en wat je hoopt te verbeteren]",
    "  - **Evidence note:** [Auteur, jaar, type studie, 1 regel relevantie]",
    "  - **Confidence:** [High/Medium/Low]",
    "  - **Doctor discussion point:** [1 concrete vraag om te bespreken]",
    "- Neem expliciet mee of huidige dosis/protocol lijkt te passen bij de trends.",
    "- Overweeg naast huidige supplementen ook potentiële NIEUWE toevoegingen als data daar aanleiding toe geven.",
    "- Als ijzerstatus laag lijkt (bijv. Ferritine laag en/of Transferrine Saturatie laag, met passend bloedbeeld): neem expliciet een 'Consider adding iron' bespreekpunt op.",
    "- Bij zo'n ijzer-suggestie: noem triggerwaarden, verwachte richting, belangrijke kanttekeningen, en monitoring (Ferritine, Transferrine Saturatie, Hemoglobine, Hematocriet).",
    "- Doe géén stellige toevoegingsclaim als markers elkaar tegenspreken; benoem onzekerheid duidelijk.",
    "- Gebruik betrouwbare studies; bij voorkeur recent (2020+ waar mogelijk).",
    "- Als exacte studiegegevens onzeker zijn: benoem die onzekerheid expliciet en doe geen stellige claim.",
    "- Gebruik nette markdown-opmaak met duidelijke koppen, bullets en vetgedrukte labels; geen tabellen.",
    "Sluit af met een korte veiligheidsnoot dat dit geen diagnose of medisch advies is.",
    "DATA START",
    JSON.stringify(
      {
        analysisType,
        unitSystem,
        reports: payload,
        derivedSignals,
        context
      },
      null,
      2
    ),
    "DATA END"
  ].join("\n");

  const latestComparisonPrompt = [
    "Je bent een senior klinische data-analist voor TRT-monitoring en gedeelde besluitvorming met een behandelend arts.",
    `Vandaag is ${today}. Analyseer specifiek het laatste rapport versus het direct voorgaande rapport.`,
    "BELANGRIJK FORMAT:",
    "- Gebruik GEEN markdown-tabellen.",
    "- Gebruik GEEN pipes ('|'), HTML of complexe opmaak.",
    "- Gebruik markdown-koppen, bullets en korte paragrafen met duidelijke regelafbreking.",
    `- Schrijf de volledige output in: ${preferredOutputLanguage}.`,
    "Randvoorwaarden:",
    "- Gebruik uitsluitend data uit het JSON-blok.",
    "- Verwijs altijd naar beide datums en concrete waarden.",
    "- Schrijf action-neutral; geen medische directieven.",
    "Structuur:",
    "- Gebruik een natuurlijke, duidelijke opbouw met koppen waar nuttig.",
    "- GEEN vaste verplichte secties of sectievolgorde.",
    "- GEEN verplichte bullets-per-sectie of verplichte confidence-labels per sectie.",
    "- Leg de nadruk op concrete verschillen tussen laatste en vorige rapport.",
    "- Gebruik computed context (protocol impact, trends, alerts, predictions) waar relevant.",
    "Vereiste extra sectie:",
    "- Voeg altijd een aparte sectie toe met kop: '## Supplement Advice (for doctor discussion)'.",
    "- Maak daarna subkoppen per supplement met '### [Supplementnaam]'.",
    "- Gebruik per supplement exact deze velden als bullets met vetgedrukte labels:",
    "  - **Current dose:** [huidige dosis of 'not currently used']",
    "  - **Suggested change:** [Keep / Increase / Decrease / Stop / Consider adding]",
    "  - **Why:** [korte uitleg op basis van verschil laatste vs vorige rapport + context]",
    "  - **Expected effect:** [verwachte richting voor komende periode]",
    "  - **Evidence note:** [Auteur, jaar, type studie, 1 regel relevantie]",
    "  - **Confidence:** [High/Medium/Low]",
    "  - **Doctor discussion point:** [1 concrete vraag om te bespreken]",
    "- Vergelijk expliciet of huidig supplementen- en dose/protocolbeleid nog passend lijkt t.o.v. het vorige rapport.",
    "- Overweeg naast huidige supplementen ook potentiële NIEUWE toevoegingen als data daar aanleiding toe geven.",
    "- Als ijzerstatus laag lijkt (bijv. Ferritine laag en/of Transferrine Saturatie laag, met passend bloedbeeld): neem expliciet een 'Consider adding iron' bespreekpunt op.",
    "- Bij zo'n ijzer-suggestie: noem triggerwaarden, verwachte richting, belangrijke kanttekeningen, en monitoring (Ferritine, Transferrine Saturatie, Hemoglobine, Hematocriet).",
    "- Doe géén stellige toevoegingsclaim als markers elkaar tegenspreken; benoem onzekerheid duidelijk.",
    "- Gebruik betrouwbare studies; bij voorkeur recent (2020+ waar mogelijk).",
    "- Als exacte studiegegevens onzeker zijn: benoem die onzekerheid expliciet en doe geen stellige claim.",
    "- Gebruik nette markdown-opmaak met duidelijke koppen, bullets en vetgedrukte labels; geen tabellen.",
    "Sluit af met een korte veiligheidsnoot dat dit geen diagnose of medisch advies is.",
    "DATA START",
    JSON.stringify(
      {
        analysisType,
        unitSystem,
        latestComparison,
        reports: payload,
        derivedSignals,
        context
      },
      null,
      2
    ),
    "DATA END"
  ].join("\n");

  const prompt = analysisType === "latestComparison" ? latestComparisonPrompt : fullPrompt;

  const tryModel = async (model: string): Promise<{ status: number; body: ClaudeResponse }> => {
    let response: Response;
    try {
      response = await fetch("/api/claude/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          apiKey: sanitizedKey,
          payload: {
            model,
            max_tokens: 3000,
            temperature: 0.3,
            messages: [{ role: "user", content: prompt }]
          }
        })
      });
    } catch {
      throw new Error("PROXY_UNREACHABLE");
    }

    const text = await response.text();
    let body: ClaudeResponse = {};
    try {
      body = text ? (JSON.parse(text) as ClaudeResponse) : {};
    } catch {
      body = {};
    }
    return { status: response.status, body };
  };

  let lastStatus = 0;
  let lastErrorMessage = "";

  for (const model of ANALYSIS_MODEL_CANDIDATES) {
    let result: { status: number; body: ClaudeResponse };
    try {
      result = await tryModel(model);
    } catch (error) {
      if (error instanceof Error && error.message === "PROXY_UNREACHABLE") {
        throw new Error("AI_PROXY_UNREACHABLE");
      }
      throw error;
    }
    lastStatus = result.status;

    if (result.status >= 200 && result.status < 300) {
      const text = result.body.content?.find((item) => item.type === "text")?.text?.trim();
      if (!text) {
        throw new Error("AI_EMPTY_RESPONSE");
      }
      return stripComplexFormatting(text);
    }

    const errorMessage = result.body.error?.message ?? "";
    lastErrorMessage = errorMessage;
    const missingModel = result.status === 404 || (result.status === 400 && /model/i.test(errorMessage));
    if (missingModel) {
      continue;
    }
    break;
  }

  throw new Error(`AI_REQUEST_FAILED:${lastStatus || "unknown"}:${lastErrorMessage || ""}`);
};
