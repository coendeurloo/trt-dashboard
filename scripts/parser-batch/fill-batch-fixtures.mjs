import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

const root = process.cwd();
const registryPath = path.resolve(root, "docs/parser-batch-registry.md");
const examplelabsDir = path.resolve(root, "examplelabs");
const ocrCachePath = path.resolve(root, ".cache", "tesseract");

const args = process.argv.slice(2);
const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    return fallback;
  }
  return String(args[index + 1] ?? "").trim();
};

const batch = getArgValue("--batch");
if (!batch) {
  throw new Error("Missing required --batch (example: --batch B01)");
}

const splitCells = (line) => line.split("|").map((cell) => cell.trim()).slice(1, -1);

const loadRegistryRows = () => {
  const text = readFileSync(registryPath, "utf8");
  const lines = text.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === "## Registry Entries");
  if (sectionIndex < 0) {
    throw new Error("Section '## Registry Entries' not found in registry");
  }
  const headerIndex = lines.slice(sectionIndex + 1).findIndex((line) => line.trim().startsWith("| file_id |"));
  if (headerIndex < 0) {
    throw new Error("Registry table header not found");
  }

  const tableStart = sectionIndex + 1 + headerIndex;
  const rowStart = tableStart + 2;
  const rows = [];
  for (let i = rowStart; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (!trimmed.startsWith("|")) {
      if (trimmed.startsWith("## ")) {
        break;
      }
      continue;
    }
    const cells = splitCells(raw);
    if (cells.length !== 8) {
      continue;
    }
    rows.push({
      lineIndex: i,
      fileId: cells[0],
      label: cells[1],
      batch: cells[2],
      sourceType: cells[3],
      vendor: cells[4],
      status: cells[5],
      fixturePath: cells[6],
      notes: cells[7]
    });
  }

  return { text, lines, rows };
};

const hashFile = (filePath) => {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
};

const buildFileMap = () => {
  const map = new Map();
  const files = readdirSync(examplelabsDir).filter((name) => !name.startsWith("."));
  files.forEach((name) => {
    const fullPath = path.join(examplelabsDir, name);
    const fileId = hashFile(fullPath);
    if (!map.has(fileId)) {
      map.set(fileId, []);
    }
    map.get(fileId).push({
      fileName: name,
      filePath: fullPath
    });
  });
  return map;
};

const extractPdfText = async (filePath) => {
  const bytes = readFileSync(filePath);
  const data = new Uint8Array(bytes);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;
  const pageChunks = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({
      disableCombineTextItems: false
    });
    const line = content.items
      .map((item) => ("str" in item ? String(item.str ?? "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length > 0) {
      pageChunks.push(line);
    }
  }

  return pageChunks.join("\n");
};

const initOcrWorker = async () => {
  mkdirSync(ocrCachePath, { recursive: true });
  return createWorker("eng", 1, {
    cachePath: ocrCachePath,
    logger: () => {
      // Keep CLI output short; OCR progress is noisy.
    }
  });
};

const extractImageText = async (worker, filePath) => {
  const result = await worker.recognize(filePath);
  return String(result?.data?.text ?? "");
};

const extractPdfViaSipsOcr = async (worker, filePath) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "labtracker-pdf-ocr-"));
  const pngPath = path.join(tempDir, "page.png");
  try {
    execFileSync("sips", ["-s", "format", "png", filePath, "--out", pngPath], {
      stdio: "ignore"
    });
    return await extractImageText(worker, pngPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

const sanitizeTextForFixture = (rawText) => {
  const piiLinePattern =
    /\b(patient name|name|dob|date of birth|birth date|address|street|city|state|zip|postal|phone|fax|email|e-mail|mrn|member id|patient id|account|accession|requisition|specimen id)\b/i;
  const providerLinePattern =
    /\b(laboratory director|ordering provider|ordered by|medical director|performing site|dir:)\b/i;
  const addressLikePattern =
    /\b\d{2,5}\s+[a-z0-9.'-]+\s+(?:street|st|road|rd|avenue|ave|court|ct|boulevard|blvd|drive|dr|place|pl|lane|ln)\b/i;
  const webPattern = /\b(?:https?:\/\/|www\.)\S*/i;
  const idInlinePattern = /\b(?:mrn|member id|patient id|account|accession|requisition|specimen id)\s*[:#]?\s*[a-z0-9\-]{3,}\b/gi;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const phonePattern = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-])\d{2,4}[\s.-]\d{3,4}\b/g;
  const phoneContextPattern = /\b(?:phone|fax|tel|telephone|mobile|call|contact)\b/i;
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
  const longIdPattern = /\b\d{8,}\b/g;
  const personalHeaderPattern =
    /\b(first name last name|your details|dr doctor|customer service team|dear name|sample date ukas certification)\b/i;
  const markerSignalPattern =
    /\b(testosterone|estradiol|shbg|hematocrit|hemoglobin|rbc|wbc|platelets|psa|lh|fsh|prolactin|creatinine|glucose|cholesterol|triglycerides|albumin|ast|alt|bilirubin|ferritin|dhea|igf)\b/i;
  const unitSignalPattern = /\b(?:ng\/dL|pg\/mL|nmol\/L|mmol\/L|mg\/dL|g\/dL|g\/L|U\/L|IU\/L|mIU\/mL|x10e\d|thou\/mm3|%)\b/i;
  const rangeSignalPattern = /\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\b/;

  const sanitizePhoneCandidates = (line) =>
    line.replace(phonePattern, (candidate) => {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 10 ? "[REDACTED_PHONE]" : candidate;
    });

  const cleanedLines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\u0000/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => {
      let next = line;
      if (
        personalHeaderPattern.test(next) &&
        !markerSignalPattern.test(next.toLowerCase()) &&
        !unitSignalPattern.test(next) &&
        !rangeSignalPattern.test(next)
      ) {
        return "";
      }
      if ((providerLinePattern.test(next) || addressLikePattern.test(next) || webPattern.test(next)) && !markerSignalPattern.test(next.toLowerCase())) {
        return "";
      }
      if (piiLinePattern.test(next) && !markerSignalPattern.test(next.toLowerCase())) {
        const [label] = next.split(":");
        next = `${label?.trim() ?? "PII"}: [REDACTED]`;
      }
      next = next.replace(/\bPatient\s*:\s*[^|]+/gi, "Patient: [REDACTED]");
      next = next.replace(/\bPatient Name\s*:\s*[^|]+/gi, "Patient Name: [REDACTED]");
      next = next.replace(/\bFirst name Last name\b/gi, "[REDACTED_NAME]");
      next = next.replace(/\bDear Name\b/gi, "Dear [REDACTED]");
      next = next.replace(/\b(?:DOB|Date of Birth)\s*[:#]?\s*[0-9/.-]+\b/gi, "DOB: [REDACTED]");
      next = next.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+,?\s*(?:MD|PhD|ND)\b/g, "[REDACTED_PROVIDER]");
      next = next.replace(/\b(?:[A-Z][a-z]*\.?\s+){1,3}[A-Z][a-z-]+,\s*(?:MD|PhD|ND)\b/g, "[REDACTED_PROVIDER]");
      next = next.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\s+DOB:\s*\[REDACTED\]/g, "[REDACTED_NAME] DOB: [REDACTED]");
      next = next.replace(emailPattern, "[REDACTED_EMAIL]");
      if (phoneContextPattern.test(next)) {
        next = sanitizePhoneCandidates(next);
      }
      next = next.replace(ssnPattern, "[REDACTED_ID]");
      next = next.replace(idInlinePattern, "[REDACTED_ID]");
      next = next.replace(longIdPattern, (value) => (value.length >= 10 ? "[REDACTED_ID]" : value));
      return next;
    })
    .filter(Boolean);

  const focusedLines = cleanedLines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.length > 340 && !markerSignalPattern.test(lower) && !rangeSignalPattern.test(lower)) {
      return false;
    }
    return markerSignalPattern.test(lower) || unitSignalPattern.test(line) || rangeSignalPattern.test(line);
  });

  const sanitizedLines = focusedLines.length >= 20 ? focusedLines : cleanedLines;

  const deduped = [];
  for (const line of sanitizedLines) {
    if (deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join("\n").slice(0, 60000);
};

const markerCatalog = [
  { canonicalMarker: "Testosterone", pattern: /\btestosterone\b/i },
  { canonicalMarker: "Free Testosterone", pattern: /\bfree testosterone\b/i },
  { canonicalMarker: "Estradiol", pattern: /\bestradiol\b/i },
  { canonicalMarker: "SHBG", pattern: /\b(?:shbg|sex hormone binding globulin)\b/i },
  { canonicalMarker: "Hematocrit", pattern: /\b(?:hematocrit|hct)\b/i },
  { canonicalMarker: "Hemoglobin", pattern: /\b(?:hemoglobin|haemoglobin|hgb)\b/i },
  { canonicalMarker: "Red Blood Cells", pattern: /\b(?:red blood cells|rbc)\b/i },
  { canonicalMarker: "White Blood Cells", pattern: /\b(?:white blood cells|wbc)\b/i },
  { canonicalMarker: "Platelets", pattern: /\bplatelets?\b/i },
  { canonicalMarker: "PSA", pattern: /\b(?:psa|prostate specific antigen)\b/i },
  { canonicalMarker: "LH", pattern: /\blh\b/i },
  { canonicalMarker: "FSH", pattern: /\bfsh\b/i },
  { canonicalMarker: "Prolactin", pattern: /\bprolactin\b/i },
  { canonicalMarker: "Creatinine", pattern: /\bcreatinine\b/i },
  { canonicalMarker: "Glucose", pattern: /\bglucose\b/i },
  { canonicalMarker: "Total Cholesterol", pattern: /\b(?:total cholesterol|cholesterol)\b/i },
  { canonicalMarker: "HDL Cholesterol", pattern: /\bhdl\b/i },
  { canonicalMarker: "LDL Cholesterol", pattern: /\bldl\b/i },
  { canonicalMarker: "Triglycerides", pattern: /\btriglycerides?\b/i }
];

const corePriority = ["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Hematocrit"];
const defaultForbiddenMarkers = [
  "high risk individuals",
  "low risk individuals",
  "sensitive to",
  "further information",
  "this test was developed",
  "clinical correlation recommended"
];

const buildRequiredMarkers = (sanitizedText) => {
  const detected = markerCatalog
    .filter((entry) => entry.pattern.test(sanitizedText))
    .map((entry) => entry.canonicalMarker);
  const unique = Array.from(new Set(detected));
  const coreOnly = corePriority.filter((marker) => unique.includes(marker));
  return coreOnly.slice(0, 4).map((canonicalMarker) => ({ canonicalMarker }));
};

const appendNoteOnce = (currentNotes, addition) => {
  const notes = currentNotes && currentNotes !== "-" ? currentNotes : "";
  if (notes.toLowerCase().includes(addition.toLowerCase())) {
    return notes || addition;
  }
  return notes ? `${notes}; ${addition}` : addition;
};

const run = async () => {
  const { lines, rows } = loadRegistryRows();
  const batchRows = rows.filter((row) => row.batch === batch);
  if (batchRows.length === 0) {
    throw new Error(`No rows found for ${batch}`);
  }

  const fileMap = buildFileMap();
  const needsOcr = batchRows.some((row) => row.sourceType.includes("scan") || row.sourceType.startsWith("pdf"));
  const ocrWorker = needsOcr ? await initOcrWorker() : null;
  const updated = [];
  const failures = [];

  try {
    for (const row of batchRows) {
      if (!row.fixturePath || row.fixturePath === "-") {
        throw new Error(`Row ${row.label} has no fixture_path. Run parser:create-fixture-drafts first.`);
      }
      if (row.status === "skipped") {
        continue;
      }

      try {
        const candidates = fileMap.get(row.fileId) ?? [];
        if (candidates.length === 0) {
          throw new Error(`No file found in examplelabs/ for file_id ${row.fileId}`);
        }
        const source = candidates[0];
        let extractedText = "";

        if (row.sourceType.startsWith("pdf")) {
          extractedText = await extractPdfText(source.filePath);
          if (extractedText.trim().length < 40) {
            if (!ocrWorker) {
              throw new Error("OCR worker unavailable for PDF OCR fallback");
            }
            extractedText = await extractPdfViaSipsOcr(ocrWorker, source.filePath);
          }
        } else {
          if (!ocrWorker) {
            throw new Error("OCR worker unavailable for image scan");
          }
          extractedText = await extractImageText(ocrWorker, source.filePath);
        }

        const sanitizedText = sanitizeTextForFixture(extractedText);
        if (sanitizedText.length < 30) {
          throw new Error(`Extracted text too short (${sanitizedText.length} chars)`);
        }

        const fixtureDir = path.resolve(root, row.fixturePath);
        const inputPath = path.join(fixtureDir, "input.txt");
        const expectedPath = path.join(fixtureDir, "expected.json");
        const metaPath = path.join(fixtureDir, "source.meta.json");

        if (!existsSync(fixtureDir)) {
          throw new Error(`Fixture directory missing: ${row.fixturePath}`);
        }

        writeFileSync(inputPath, `${sanitizedText}\n`, "utf8");

        const expected = existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, "utf8")) : {};
        const hasManualExpectedContract =
          Array.isArray(expected.requiredMarkers) &&
          expected.requiredMarkers.length > 0 &&
          typeof expected.notes === "string" &&
          !/auto-seeded from sanitized source text/i.test(expected.notes);
        const requiredMarkers = hasManualExpectedContract ? expected.requiredMarkers : buildRequiredMarkers(sanitizedText);
        const nextExpected = {
          minimumConfidence:
            typeof expected.minimumConfidence === "number"
              ? expected.minimumConfidence
              : row.sourceType.includes("scan")
                ? 0.35
                : 0.5,
          expectedStrategy: expected.expectedStrategy ?? "heuristic",
          maxMissingFields:
            typeof expected.maxMissingFields === "number"
              ? expected.maxMissingFields
              : row.sourceType.includes("scan")
                ? 4
                : 3,
          forbiddenMarkers: Array.isArray(expected.forbiddenMarkers) && expected.forbiddenMarkers.length > 0
            ? expected.forbiddenMarkers
            : defaultForbiddenMarkers,
          requiredMarkers,
          notes:
            typeof expected.notes === "string" && expected.notes.trim().length > 0
              ? expected.notes
              : "Auto-seeded from sanitized source text. Handmatige review verplicht."
        };
        writeFileSync(expectedPath, `${JSON.stringify(nextExpected, null, 2)}\n`, "utf8");

        const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
        const nextMeta = {
          ...meta,
          batch: row.batch,
          file_id: row.fileId,
          label: row.label,
          source_type: row.sourceType,
          vendor: row.vendor,
          status: "fixture_done",
          source_artifact: "local-only (not committed)",
          fixture_mode: "sanitized_text_auto_seed"
        };
        writeFileSync(metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`, "utf8");

        const nextNotes = appendNoteOnce(row.notes, "fixture populated");
        const nextCells = [
          row.fileId,
          row.label,
          row.batch,
          row.sourceType,
          row.vendor,
          "fixture_done",
          row.fixturePath,
          nextNotes
        ];
        lines[row.lineIndex] = `| ${nextCells.join(" | ")} |`;

        updated.push({
          label: row.label,
          status: "fixture_done",
          sourceFile: source.fileName,
          chars: sanitizedText.length,
          requiredMarkers: requiredMarkers.length
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nextNotes = appendNoteOnce(row.notes, `auto-fill failed: ${message}`);
        const nextCells = [
          row.fileId,
          row.label,
          row.batch,
          row.sourceType,
          row.vendor,
          row.status,
          row.fixturePath,
          nextNotes
        ];
        lines[row.lineIndex] = `| ${nextCells.join(" | ")} |`;
        failures.push({
          label: row.label,
          reason: message
        });
      }
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  writeFileSync(registryPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`Updated ${updated.length} fixture rows in ${batch}:`);
  updated.forEach((item) => {
    console.log(
      `- ${item.label}: ${item.status}, ${item.chars} chars sanitized text, requiredMarkers=${item.requiredMarkers} (${item.sourceFile})`
    );
  });

  if (failures.length > 0) {
    console.log("\nFailed rows:");
    failures.forEach((item) => {
      console.log(`- ${item.label}: ${item.reason}`);
    });
    process.exit(1);
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
