export interface StudyBenchmark {
  marker: string;
  context: string;
  finding: string;
  source: {
    authors: string;
    title: string;
    journal: string;
    year: number;
    url: string;
    doi?: string;
  };
  doseRange?: {
    min: number;
    max: number;
  };
  valueRange?: {
    mean?: number;
    low?: number;
    high?: number;
    unit: string;
  };
}

export const STUDY_BENCHMARKS: StudyBenchmark[] = [
  {
    marker: "Testosterone",
    context: "Hypogonadal men on IM testosterone cypionate 100 mg/week",
    finding: "Trough total testosterone increased from a mean of 10.9 nmol/L to 18.6 nmol/L at 12 weeks.",
    source: {
      authors: "Wenker et al.",
      title: "Comparison of Outcomes for Hypogonadal Men Treated with Intramuscular Testosterone Cypionate versus Subcutaneous Testosterone Enanthate",
      journal: "Journal of Urology",
      year: 2021,
      url: "https://pubmed.ncbi.nlm.nih.gov/34694927/",
      doi: "10.1097/JU.0000000000002045"
    },
    doseRange: { min: 100, max: 100 },
    valueRange: { mean: 18.6, unit: "nmol/L" }
  },
  {
    marker: "Testosterone",
    context: "Hypogonadal men on SubQ testosterone enanthate 100 mg/week",
    finding: "Trough total testosterone increased from 8.6 nmol/L to 19.2 nmol/L at 12 weeks with subcutaneous delivery.",
    source: {
      authors: "Wenker et al.",
      title: "Comparison of Outcomes for Hypogonadal Men Treated with Intramuscular Testosterone Cypionate versus Subcutaneous Testosterone Enanthate",
      journal: "Journal of Urology",
      year: 2021,
      url: "https://pubmed.ncbi.nlm.nih.gov/34694927/",
      doi: "10.1097/JU.0000000000002045"
    },
    doseRange: { min: 100, max: 100 },
    valueRange: { mean: 19.2, unit: "nmol/L" }
  },
  {
    marker: "Testosterone",
    context: "Endocrine Society clinical guideline target range for TRT (trough)",
    finding: "The Endocrine Society recommends targeting trough testosterone in the 12.1-20.8 nmol/L (350-600 ng/dL) range.",
    source: {
      authors: "Bhasin et al.",
      title: "Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline",
      journal: "Journal of Clinical Endocrinology & Metabolism",
      year: 2018,
      url: "https://pubmed.ncbi.nlm.nih.gov/29562364/",
      doi: "10.1210/jc.2018-00229"
    },
    valueRange: { low: 12.1, high: 20.8, unit: "nmol/L" }
  },
  {
    marker: "Hematocrit",
    context: "Men on IM testosterone cypionate 200 mg every 2 weeks",
    finding: "Hematocrit increased from median 41.6% to 43.8% at 2 months; no polycythemia (HCT >50%) in this cohort.",
    source: {
      authors: "Masterson et al.",
      title: "Impact of Testosterone Therapy on Hematocrit and Polycythemia",
      journal: "Investigative and Clinical Urology",
      year: 2021,
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8090421/"
    },
    valueRange: { low: 41.6, high: 43.8, unit: "%" }
  },
  {
    marker: "Hematocrit",
    context: "SubQ testosterone cypionate cohort with erythrocytosis tracking",
    finding: "In one reported cohort, 32% developed erythrocytosis (HCT >=53%); IM rates around 40-66% are cited in literature.",
    source: {
      authors: "Williamson et al.",
      title: "Erythrocytosis in Subcutaneous Testosterone Replacement Therapy",
      journal: "Journal of Sexual Medicine",
      year: 2022,
      url: "https://academic.oup.com/jsm/article/19/Supplement_1/S7/7013449",
      doi: "10.1016/j.jsxm.2022.01.025"
    },
    valueRange: { mean: 53, unit: "% threshold" }
  },
  {
    marker: "Hematocrit",
    context: "Clinical safety thresholds for TRT monitoring",
    finding: "US and European guidance recommends pausing or adjusting TRT when hematocrit exceeds 54%, with interval monitoring during follow-up.",
    source: {
      authors: "American Urological Association",
      title: "Testosterone Deficiency Guideline",
      journal: "AUA Guideline",
      year: 2022,
      url: "https://www.auanet.org/guidelines-and-quality/guidelines/testosterone-deficiency-guideline"
    },
    valueRange: { high: 54, unit: "%" }
  },
  {
    marker: "Estradiol",
    context: "IM vs SubQ testosterone comparison at equal weekly dose",
    finding: "SubQ testosterone enanthate was associated with lower estradiol versus IM testosterone cypionate at equivalent weekly dosing.",
    source: {
      authors: "Wenker et al.",
      title: "Comparison of Outcomes for Hypogonadal Men Treated with Intramuscular Testosterone Cypionate versus Subcutaneous Testosterone Enanthate",
      journal: "Journal of Urology",
      year: 2021,
      url: "https://pubmed.ncbi.nlm.nih.gov/34694927/",
      doi: "10.1097/JU.0000000000002045"
    }
  },
  {
    marker: "Free Testosterone",
    context: "Testosterone binding physiology in adult men",
    finding: "Guideline context describes only a small free fraction, with substantial SHBG-bound and albumin-bound fractions shaping bioavailable testosterone.",
    source: {
      authors: "Petak et al.",
      title: "American Association of Clinical Endocrinologists Medical Guidelines for Clinical Practice for the Evaluation and Treatment of Hypogonadism in Adult Male Patients-2002 Update",
      journal: "Endocrine Practice",
      year: 2002,
      url: "https://pubmed.ncbi.nlm.nih.gov/15260010/"
    }
  },
  {
    marker: "PSA",
    context: "PSA monitoring during TRT per Endocrine Society guideline",
    finding: "A confirmed PSA increase >1.4 ng/mL in 12 months, or absolute PSA >4.0 ng/mL, warrants urologic evaluation.",
    source: {
      authors: "Bhasin et al.",
      title: "Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline",
      journal: "Journal of Clinical Endocrinology & Metabolism",
      year: 2018,
      url: "https://pubmed.ncbi.nlm.nih.gov/29562364/",
      doi: "10.1210/jc.2018-00229"
    },
    valueRange: { high: 4.0, unit: "ng/mL" }
  },
  {
    marker: "Triglyceriden",
    context: "Hypogonadal men on long-acting IM testosterone (12 months)",
    finding: "Triglycerides decreased from 147.2 to 131.2 mg/dL after 6 months and remained lower at 12 months in this cohort.",
    source: {
      authors: "Han and Ahn",
      title: "Effect of testosterone replacement therapy on lipid profile in the patients with testosterone deficiency syndrome",
      journal: "Translational Andrology and Urology",
      year: 2014,
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4708389/"
    },
    valueRange: { mean: -16, unit: "mg/dL reduction at 6 months" }
  }
];

/**
 * Returns benchmarks relevant to the given canonical marker names.
 * Uses exact match on the marker field.
 * Limits to max 8 entries to keep prompt size manageable.
 */
export const getRelevantBenchmarks = (canonicalMarkerNames: string[]): StudyBenchmark[] => {
  const markerSet = new Set(canonicalMarkerNames.map((marker) => marker.toLowerCase()));
  return STUDY_BENCHMARKS.filter((benchmark) => markerSet.has(benchmark.marker.toLowerCase())).slice(0, 8);
};
