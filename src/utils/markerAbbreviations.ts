const MARKER_SHORT_NAMES: Record<string, string> = {
  "Free Testosterone": "Free T",
  "LDL Cholesterol": "LDL",
  "HDL Cholesterol": "HDL",
  "Non-HDL Cholesterol": "Non-HDL",
  "Total Cholesterol": "T. Chol",
  "Apolipoprotein B": "ApoB",
  "Free Androgen Index": "FAI",
  "LDL/HDL ratio": "LDL/HDL",
  "LDL/HDL Ratio": "LDL/HDL",
  "T/E2 ratio": "T/E2",
  "T/E2 Ratio": "T/E2"
};

export const shortMarkerName = (canonical: string, fallbackLabel?: string): string =>
  MARKER_SHORT_NAMES[canonical] ?? fallbackLabel ?? canonical;
