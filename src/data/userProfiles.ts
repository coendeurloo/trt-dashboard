import { UserProfileConfig } from "../types";

export const USER_PROFILES: UserProfileConfig[] = [
  {
    id: "trt",
    labelEn: "TRT / HRT",
    labelNl: "TRT / HRT",
    descriptionEn:
      "Testosterone replacement therapy. Focus on hormone balance, hematocrit safety, and estradiol management.",
    descriptionNl:
      "Testosteron-substitutietherapie. Focus op hormoonbalans, hematocriet-veiligheid en estradiol-management."
  },
  {
    id: "enhanced",
    labelEn: "Enhanced athlete",
    labelNl: "Enhanced atleet",
    descriptionEn: "Multiple compounds, higher doses. Focus on liver, kidney, lipids, and cardiovascular markers.",
    descriptionNl: "Meerdere middelen, hogere doseringen. Focus op lever, nieren, lipiden en cardiovasculaire markers."
  },
  {
    id: "health",
    labelEn: "General health",
    labelNl: "Algemene gezondheid",
    descriptionEn: "Overall health optimization. Vitamins, metabolic markers, thyroid, inflammation.",
    descriptionNl: "Algehele gezondheidsoptimalisatie. Vitaminen, metabole markers, schildklier, ontsteking."
  },
  {
    id: "biohacker",
    labelEn: "Biohacker / longevity",
    labelNl: "Biohacker / longevity",
    descriptionEn: "Quantified self and longevity optimization. Correlations, trends, experimental protocols.",
    descriptionNl: "Quantified self en longevity-optimalisatie. Correlaties, trends, experimentele protocollen."
  }
];
