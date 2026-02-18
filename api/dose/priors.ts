import { IncomingMessage, ServerResponse } from "node:http";

interface DosePriorEvidence {
  citation: string;
  studyType: string;
  relevance: string;
  quality: "high" | "medium" | "low";
}

interface DosePrior {
  marker: string;
  unitSystem: "eu" | "us";
  unit: string;
  slopePerMg: number;
  sigma: number;
  doseRange: {
    min: number;
    max: number;
  };
  evidence: DosePriorEvidence[];
}

interface PriorRequestBody {
  unitSystem?: "eu" | "us";
  markers?: string[];
}

const MAX_JSON_BYTES = 512 * 1024;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<PriorRequestBody> =>
  new Promise((resolve, reject) => {
    if (req.readableEnded) {
      resolve({});
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_JSON_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw) as PriorRequestBody);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => reject(error));
  });

const DOSE_PRIORS: DosePrior[] = [
  { marker: "Testosterone", unitSystem: "eu", unit: "nmol/L", slopePerMg: 0.1, sigma: 4.2, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Bhasin et al., 2001", studyType: "Randomized dose-response trial", relevance: "Serum testosterone rose with dose in controlled settings.", quality: "high" }] },
  { marker: "Testosterone", unitSystem: "us", unit: "ng/dL", slopePerMg: 2.9, sigma: 120, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Bhasin et al., 2001", studyType: "Randomized dose-response trial", relevance: "Serum testosterone rose with dose in controlled settings.", quality: "high" }] },
  { marker: "Free Testosterone", unitSystem: "eu", unit: "nmol/L", slopePerMg: 0.0012, sigma: 0.08, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "TRT kinetics review", studyType: "Meta-analysis", relevance: "Free testosterone typically increases with androgen exposure.", quality: "medium" }] },
  { marker: "Free Testosterone", unitSystem: "us", unit: "pg/mL", slopePerMg: 0.36, sigma: 18, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "TRT kinetics review", studyType: "Meta-analysis", relevance: "Free testosterone typically increases with androgen exposure.", quality: "medium" }] },
  { marker: "Estradiol", unitSystem: "eu", unit: "pmol/L", slopePerMg: 0.95, sigma: 35, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Aromatization studies in TRT", studyType: "Observational + mechanistic", relevance: "Estradiol often trends with testosterone exposure.", quality: "medium" }] },
  { marker: "Estradiol", unitSystem: "us", unit: "pg/mL", slopePerMg: 0.26, sigma: 10, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Aromatization studies in TRT", studyType: "Observational + mechanistic", relevance: "Estradiol often trends with testosterone exposure.", quality: "medium" }] },
  { marker: "Hematocrit", unitSystem: "eu", unit: "%", slopePerMg: 0.015, sigma: 1.3, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "TRT erythrocytosis cohorts", studyType: "Observational cohorts", relevance: "Higher androgen exposure can increase hematocrit in susceptible users.", quality: "medium" }] },
  { marker: "Hematocrit", unitSystem: "us", unit: "%", slopePerMg: 0.015, sigma: 1.3, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "TRT erythrocytosis cohorts", studyType: "Observational cohorts", relevance: "Higher androgen exposure can increase hematocrit in susceptible users.", quality: "medium" }] },
  { marker: "Apolipoprotein B", unitSystem: "eu", unit: "mg/dL", slopePerMg: 0.014, sigma: 11, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Androgen-lipoprotein reviews", studyType: "Systematic review", relevance: "ApoB may increase on some androgen protocols.", quality: "medium" }] },
  { marker: "Apolipoprotein B", unitSystem: "us", unit: "mg/dL", slopePerMg: 0.014, sigma: 11, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Androgen-lipoprotein reviews", studyType: "Systematic review", relevance: "ApoB may increase on some androgen protocols.", quality: "medium" }] },
  { marker: "LDL Cholesterol", unitSystem: "eu", unit: "mmol/L", slopePerMg: 0.0005, sigma: 0.2, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Androgen lipid cohorts", studyType: "Observational cohorts", relevance: "LDL response is heterogeneous but can be dose-related.", quality: "medium" }] },
  { marker: "LDL Cholesterol", unitSystem: "us", unit: "mg/dL", slopePerMg: 0.02, sigma: 8, doseRange: { min: 60, max: 220 }, evidence: [{ citation: "Androgen lipid cohorts", studyType: "Observational cohorts", relevance: "LDL response is heterogeneous but can be dose-related.", quality: "medium" }] }
];

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    let body: PriorRequestBody;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: { message: error instanceof Error ? error.message : "Invalid request body" } });
      return;
    }

    const unitSystem = body.unitSystem === "eu" || body.unitSystem === "us" ? body.unitSystem : "eu";
    const markers = Array.isArray(body.markers)
      ? body.markers
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const markerSet = new Set(markers);
    const priors = DOSE_PRIORS.filter(
      (prior) => prior.unitSystem === unitSystem && (markerSet.size === 0 || markerSet.has(prior.marker))
    );

    sendJson(res, 200, {
      priors,
      source: "server-curated",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}
