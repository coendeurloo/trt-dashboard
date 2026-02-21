import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const examplelabsDir = path.resolve(root, "examplelabs");
const registryPath = path.resolve(root, "docs/parser-batch-registry.md");

const parseRegistryFileIds = (content) => {
  const lines = content.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === "## Registry Entries");
  if (sectionIndex < 0) {
    return new Set();
  }
  const tableLines = lines
    .slice(sectionIndex + 1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .slice(2);

  const ids = new Set();
  for (const line of tableLines) {
    const cells = line.split("|").map((cell) => cell.trim()).slice(1, -1);
    if (cells.length < 1) {
      continue;
    }
    const fileId = cells[0] ?? "";
    if (/^[a-f0-9]{12}$/.test(fileId)) {
      ids.add(fileId);
    }
  }
  return ids;
};

const hashFile = (filePath) => {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
};

const registryContent = readFileSync(registryPath, "utf8");
const usedIds = parseRegistryFileIds(registryContent);

const files = readdirSync(examplelabsDir)
  .filter((name) => !name.startsWith("."))
  .map((name) => {
    const fullPath = path.join(examplelabsDir, name);
    const fileId = hashFile(fullPath);
    const ext = path.extname(name).toLowerCase().replace(".", "") || "unknown";
    return {
      fileId,
      file: name,
      ext,
      inRegistry: usedIds.has(fileId)
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

console.log("file_id\text\tin_registry\tfile");
for (const item of files) {
  console.log(`${item.fileId}\t${item.ext}\t${item.inRegistry ? "yes" : "no"}\t${item.file}`);
}

const remaining = files.filter((item) => !item.inRegistry);
console.log("\nRemaining candidates:", remaining.length);
