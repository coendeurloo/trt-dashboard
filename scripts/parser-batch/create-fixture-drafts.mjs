import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.resolve(root, "docs/parser-batch-registry.md");

const args = process.argv.slice(2);
const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    return fallback;
  }
  return String(args[index + 1] ?? "").trim();
};

const batch = getArgValue("--batch");
const labelsRaw = getArgValue("--labels");

if (!batch) {
  throw new Error("Missing required --batch (example: --batch B01)");
}
if (!labelsRaw) {
  throw new Error("Missing required --labels (comma-separated labels)");
}

const labels = labelsRaw
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (labels.length === 0) {
  throw new Error("No valid labels passed in --labels");
}

const loadRegistry = () => readFileSync(registryPath, "utf8");

const splitCells = (line) => line.split("|").map((cell) => cell.trim()).slice(1, -1);

const sanitizeSlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "fixture";

const defaultRequiredMarkers = [
  { canonicalMarker: "Testosterone" },
  { canonicalMarker: "Free Testosterone" },
  { canonicalMarker: "Estradiol" },
  { canonicalMarker: "SHBG" },
  { canonicalMarker: "Hematocrit" }
];

const defaultForbiddenMarkers = [
  "high risk individuals",
  "low risk individuals",
  "sensitive to",
  "further information"
];

const createDraftFixture = ({ batch, label, fileId, sourceType, vendor }) => {
  const fixtureDir = path.resolve(root, "tests", "parser-fixtures", "drafts", batch, sanitizeSlug(label));
  mkdirSync(fixtureDir, { recursive: true });

  const inputPath = path.join(fixtureDir, "input.txt");
  const expectedPath = path.join(fixtureDir, "expected.json");
  const metaPath = path.join(fixtureDir, "source.meta.json");

  if (!existsSync(inputPath)) {
    const inputTemplate = [
      "# PLAK HIER ALLEEN GEANONIMISEERDE TEKST",
      "# Verwijder namen, IDs, adressen, telefoon en e-mail.",
      "# Laat alleen labtabellen/markerregels staan.",
      ""
    ].join("\n");
    writeFileSync(inputPath, inputTemplate, "utf8");
  }

  if (!existsSync(expectedPath)) {
    const expectedTemplate = {
      minimumConfidence: 0.6,
      expectedStrategy: "heuristic",
      maxMissingFields: 2,
      forbiddenMarkers: defaultForbiddenMarkers,
      requiredMarkers: defaultRequiredMarkers,
      notes: "Update requiredMarkers en thresholds na eerste handmatige review."
    };
    writeFileSync(expectedPath, `${JSON.stringify(expectedTemplate, null, 2)}\n`, "utf8");
  }

  const meta = {
    batch,
    file_id: fileId,
    label,
    source_type: sourceType,
    vendor,
    status: "templated"
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  return path.relative(root, fixtureDir).replace(/\\/g, "/");
};

const statusRank = {
  selected: 0,
  clustered: 1,
  templated: 2,
  fixture_done: 3,
  validated: 4,
  skipped: -1
};

const normalizeStatus = (status) => (status in statusRank ? status : "selected");

const nextStatusForDraft = (currentStatus) => {
  const normalized = normalizeStatus(currentStatus);
  if (normalized === "validated" || normalized === "fixture_done") {
    return normalized;
  }
  if (normalized === "skipped") {
    return normalized;
  }
  return "templated";
};

const appendNoteOnce = (currentNotes, addition) => {
  const notes = currentNotes && currentNotes !== "-" ? currentNotes : "";
  if (notes.toLowerCase().includes(addition.toLowerCase())) {
    return notes || addition;
  }
  return notes ? `${notes}; ${addition}` : addition;
};

const registry = loadRegistry();
const lines = registry.split(/\r?\n/);
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

const updatedLines = [...lines];
const selectedSet = new Set(labels);
const updated = [];

for (let i = rowStart; i < lines.length; i += 1) {
  const raw = lines[i] ?? "";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("|")) {
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith("## ")) {
      break;
    }
    continue;
  }

  const cells = splitCells(raw);
  if (cells.length !== 8) {
    continue;
  }

  const [fileId, label, batchId, sourceType, vendor, status, fixturePath, notes] = cells;
  if (batchId !== batch || !selectedSet.has(label)) {
    continue;
  }

  const draftPath = createDraftFixture({
    batch: batchId,
    label,
    fileId,
    sourceType,
    vendor
  });

  const nextStatus = nextStatusForDraft(status);
  const nextNotes = appendNoteOnce(notes, "draft ready");
  const nextCells = [fileId, label, batchId, sourceType, vendor, nextStatus, draftPath, nextNotes];
  updatedLines[i] = `| ${nextCells.join(" | ")} |`;
  updated.push({ label, draftPath });
}

if (updated.length === 0) {
  throw new Error("No rows were updated. Check --batch/--labels values.");
}

writeFileSync(registryPath, `${updatedLines.join("\n")}\n`, "utf8");

console.log("Updated registry rows:");
updated.forEach((item) => {
  console.log(`- ${item.label}: ${item.draftPath}`);
});
