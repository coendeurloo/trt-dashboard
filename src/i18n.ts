import { AppLanguage, TabKey } from "./types";
import { translateFromEnglish } from "./locales/enToExtraLocales";

type LocalizedText = {
  en: string;
  nl: string;
  es?: string;
  pt?: string;
  de?: string;
  ru?: string;
  zh?: string;
};

export const APP_LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
  { value: "zh", label: "中文" },
  { value: "nl", label: "Nederlands" }
];

type MarkerMeta = {
  name: LocalizedText;
  what: LocalizedText;
  why: LocalizedText;
  low?: LocalizedText;
  high?: LocalizedText;
};

export const UI_TEXT = {
  subtitle: {
    nl: "Houd markers, protocolcontext en trends bij.",
    en: "Track markers, protocol context, and trends."
  },
  uploadPdf: {
    nl: "Upload PDF",
    en: "Upload PDF"
  },
  addManualValue: {
    nl: "Handmatige waarde toevoegen",
    en: "Add manual value"
  },
  reports: {
    nl: "Rapporten",
    en: "Reports"
  },
  markersTracked: {
    nl: "Markers gevolgd",
    en: "Markers tracked"
  },
  outOfRange: {
    nl: "Buiten referentie",
    en: "Out of range"
  },
  trtStabilityShort: {
    nl: "Hormonale stabiliteit",
    en: "Hormone stability"
  },
  language: {
    nl: "Taal",
    en: "Language"
  },
  theme: {
    nl: "Thema",
    en: "Theme"
  },
  startAtZero: {
    nl: "Start op nul",
    en: "Start at zero"
  },
  useDataRange: {
    nl: "Gebruik databereik",
    en: "Use data range"
  },
  unknownMarkerInfoTitle: {
    nl: "Marker informatie",
    en: "Marker information"
  },
  unknownMarkerInfoWhat: {
    nl: "Geen uitgebreide omschrijving beschikbaar voor deze marker.",
    en: "No detailed description is available for this marker."
  },
  unknownMarkerInfoWhy: {
    nl: "Wordt meestal meegenomen voor algemene trend- en contextanalyse.",
    en: "Usually included for general trend and context analysis."
  },
  unknownMarkerInfoLow: {
    nl: "Een lage waarde kan relevant zijn afhankelijk van context, klachten en referentiebereik.",
    en: "A low value can matter depending on context, symptoms, and reference range."
  },
  unknownMarkerInfoHigh: {
    nl: "Een hoge waarde kan relevant zijn afhankelijk van context, klachten en referentiebereik.",
    en: "A high value can matter depending on context, symptoms, and reference range."
  },
  aiProxyUnreachable: {
    nl: "Kon de lokale AI-proxy niet bereiken. Herstart de app-server en probeer opnieuw.",
    en: "Could not reach the local AI proxy. Restart the app server and try again."
  },
  aiEmptyResponse: {
    nl: "AI-provider gaf geen analyse-tekst terug.",
    en: "AI provider returned no analysis text."
  },
  aiRequestFailed: {
    nl: "AI-analyse mislukt.",
    en: "AI analysis failed."
  },
  aiRateLimited: {
    nl: "Je hebt het maximale aantal analyses bereikt. Probeer het over {minutes} minuten opnieuw.",
    en: "You've reached the analysis limit. Please try again in {minutes} minutes."
  },
  pdfProxyUnreachable: {
    nl: "Kon de lokale AI-proxy niet bereiken voor PDF-extractie. Herstart de app-server en probeer opnieuw.",
    en: "Could not reach the local AI proxy for PDF extraction. Restart the app server and try again."
  },
  pdfEmptyResponse: {
    nl: "Claude gaf geen bruikbare extractie-tekst terug.",
    en: "Claude returned no usable extraction text."
  },
  pdfExtractionFailed: {
    nl: "PDF-extractie via AI is mislukt.",
    en: "AI PDF extraction failed."
  },
  pdfProcessFailed: {
    nl: "Kon dit PDF-bestand niet verwerken.",
    en: "Could not process this PDF file."
  },
  pdfTextLayerEmptyWarning: {
    nl: "Deze PDF heeft geen bruikbare tekstlaag. We hebben OCR gebruikt; controleer de extractie zorgvuldig.",
    en: "This PDF has no usable text layer. OCR was used; please review extraction carefully."
  },
  pdfTextExtractionFailedWarning: {
    nl: "De tekstextractie uit dit PDF-bestand mislukte. We zijn doorgeschakeld naar een veilige fallback.",
    en: "Text extraction failed for this PDF. We switched to a safe fallback."
  },
  pdfOcrInitFailedWarning: {
    nl: "OCR kon niet worden gestart voor dit bestand. Voeg waar nodig markers handmatig toe.",
    en: "OCR could not be started for this file. Add markers manually where needed."
  },
  pdfOcrPartialWarning: {
    nl: "OCR was slechts gedeeltelijk succesvol. Sommige markers kunnen ontbreken.",
    en: "OCR was only partially successful. Some markers may be missing."
  },
  pdfLowConfidenceLocalWarning: {
    nl: "De parserzekerheid is laag. Controleer datum, markerwaarden en referenties voor je opslaat.",
    en: "Parser confidence is low. Check date, marker values, and references before saving."
  }
} as const;

export type UiTextKey = keyof typeof UI_TEXT;

const pickLocalizedText = (
  value: Partial<Record<AppLanguage, string>> & { en: string },
  language: AppLanguage
): string => {
  if (language === "nl") {
    return value.nl ?? value.en;
  }
  if (language === "en") {
    return value.en;
  }
  return value[language] ?? translateFromEnglish(language, value.en);
};

export const trLocale = (language: AppLanguage, nl: string, en: string): string => {
  if (language === "nl") {
    return nl;
  }
  if (language === "en") {
    return en;
  }
  return translateFromEnglish(language, en);
};

export const t = (language: AppLanguage, key: UiTextKey): string => {
  const value = UI_TEXT[key];
  return value ? pickLocalizedText(value, language) : key;
};

const TAB_LABELS: Record<TabKey, LocalizedText> = {
  dashboard: { nl: "Dashboard", en: "Dashboard" },
  checkIns: { nl: "Welzijn", en: "Wellbeing" },
  protocol: { nl: "Protocollen", en: "Protocols" },
  supplements: { nl: "Supplementen", en: "Supplements" },
  protocolImpact: { nl: "Protocol-impact", en: "Protocol Impact" },
  doseResponse: { nl: "Dosis-simulator", en: "Dose Simulator" },
  protocolDose: { nl: "Protocol & Dosis", en: "Protocol & Dose" },
  alerts: { nl: "Alerts", en: "Alerts" },
  reports: { nl: "Alle Rapporten", en: "All Reports" },
  settings: { nl: "Instellingen", en: "Settings" },
  analysis: { nl: "AI Lab Analyse", en: "AI Lab Analysis" }
};

export const getTabLabel = (tab: TabKey, language: AppLanguage): string => {
  const label = TAB_LABELS[tab];
  return label ? pickLocalizedText(label, language) : tab;
};

const MARKER_NAME_TRANSLATIONS: Record<string, LocalizedText> = {
  Albumine: { nl: "Albumine", en: "Albumin" },
  "Dihydrotestosteron (DHT)": { nl: "Dihydrotestosteron (DHT)", en: "Dihydrotestosterone (DHT)" },
  "Vitamin D (D3+D2) OH": { nl: "Vitamine D (D3+D2) OH", en: "Vitamin D (D3+D2) OH" },
  "Red Blood Cells": { nl: "Rode bloedcellen", en: "Red Blood Cells" },
  "Cholesterol/HDL Ratio": { nl: "Cholesterol/HDL-ratio", en: "Cholesterol/HDL ratio" },
  "T/E2 Ratio": { nl: "T/E2-ratio", en: "T/E2 ratio" },
  "LDL/HDL Ratio": { nl: "LDL/HDL-ratio", en: "LDL/HDL ratio" },
  "Vitamine B12": { nl: "Vitamine B12", en: "Vitamin B12" },
  Foliumzuur: { nl: "Foliumzuur", en: "Folate" },
  MCV: { nl: "MCV", en: "MCV" },
  Transferrine: { nl: "Transferrine", en: "Transferrin" },
  "Transferrine Saturatie": { nl: "Transferrineverzadiging", en: "Transferrin Saturation" },
  Homocysteine: { nl: "Homocysteïne", en: "Homocysteine" },
  Ureum: { nl: "Ureum", en: "Urea" },
  PSA: { nl: "PSA", en: "PSA" },
  "Albumine Urine": { nl: "Albumine urine", en: "Urine Albumin" },
  "Urine ACR": { nl: "Urine ACR", en: "Urine ACR" },
  "Creatinine Urine": { nl: "Creatinine urine", en: "Urine Creatinine" },
  MCH: { nl: "MCH", en: "MCH" },
  MCHC: { nl: "MCHC", en: "MCHC" },
  "RDW-CV": { nl: "RDW-CV", en: "RDW-CV" },
  Platelets: { nl: "Bloedplaatjes", en: "Platelets" },
  "Monocytes Abs.": { nl: "Monocyten abs.", en: "Monocytes Abs." },
  "Basophils Abs.": { nl: "Basofielen abs.", en: "Basophils Abs." },
  "Lymphocytes Abs.": { nl: "Lymfocyten abs.", en: "Lymphocytes Abs." },
  "Eosinophils Abs.": { nl: "Eosinofielen abs.", en: "Eosinophils Abs." },
  "Neutrophils Abs.": { nl: "Neutrofielen abs.", en: "Neutrophils Abs." },
  "Free Testosterone (calculated)": { nl: "Vrij Testosteron (berekend)", en: "Free Testosterone (calculated)" },
  Leukocyten: { nl: "Leukocyten", en: "Leukocytes" }
};

const MARKER_META: Record<string, MarkerMeta> = {
  Testosterone: {
    name: { nl: "Testosteron", en: "Testosterone" },
    what: {
      nl: "Belangrijk mannelijk hormoon voor energie, libido, spieropbouw en herstel.",
      en: "Primary male hormone linked to energy, libido, muscle building, and recovery."
    },
    why: {
      nl: "Wordt gevolgd om hormonale respons en balans te beoordelen.",
      en: "Tracked to evaluate hormonal response and balance."
    },
    low: {
      nl: "Laag: kan samengaan met vermoeidheid, laag libido, stemmingsklachten en minder herstel.",
      en: "Low: can be associated with fatigue, low libido, mood issues, and reduced recovery."
    },
    high: {
      nl: "Hoog: kan gepaard gaan met meer kans op androgenische bijwerkingen en stijgend hematocriet.",
      en: "High: may increase risk of androgenic side effects and rising hematocrit."
    }
  },
  "Free Testosterone": {
    name: { nl: "Vrij Testosteron", en: "Free Testosterone" },
    what: {
      nl: "Biologisch actieve fractie testosteron die niet sterk gebonden is aan SHBG.",
      en: "Biologically active testosterone fraction that is not tightly bound to SHBG."
    },
    why: {
      nl: "Helpt klachten verklaren wanneer totaal testosteron niet het hele beeld geeft.",
      en: "Helps explain symptoms when total testosterone does not tell the full story."
    },
    low: {
      nl: "Laag: kan passen bij androgenetekort, ook als totaal testosteron normaal lijkt.",
      en: "Low: can fit androgen deficiency even when total testosterone appears normal."
    },
    high: {
      nl: "Hoog: kan wijzen op een hoge actieve androgenenbelasting met meer kans op bijwerkingen.",
      en: "High: may indicate a high active androgen load with higher side-effect risk."
    }
  },
  "Free Testosterone (calculated)": {
    name: { nl: "Vrij Testosteron (berekend)", en: "Free Testosterone (calculated)" },
    what: {
      nl: "Afgeleide schatting van vrije testosteron op basis van totaal testosteron, SHBG en albumine.",
      en: "Derived free testosterone estimate based on Total Testosterone, SHBG, and Albumin."
    },
    why: {
      nl: "Geeft extra context naast gemeten vrij testosteron en vervangt die gemeten waarde niet.",
      en: "Adds context next to measured free testosterone and does not replace measured values."
    },
    low: {
      nl: "Laag: kan passen bij lagere vrije androgenenbelasting; beoordeel samen met klachten en gemeten waarden.",
      en: "Low: may fit lower free androgen exposure; interpret with symptoms and measured values."
    },
    high: {
      nl: "Hoog: kan passen bij hogere vrije androgenenbelasting; beoordeel naast hematocriet, estradiol en klachten.",
      en: "High: may fit higher free androgen exposure; interpret alongside hematocrit, estradiol, and symptoms."
    }
  },
  Estradiol: {
    name: { nl: "Estradiol", en: "Estradiol" },
    what: {
      nl: "Belangrijk oestrogeen bij mannen; speelt mee in botgezondheid, stemming en vochtbalans.",
      en: "Important estrogen in men; contributes to bone health, mood, and fluid balance."
    },
    why: {
      nl: "Wordt gemeten om aromatisering en T/E2-balans te volgen.",
      en: "Measured to monitor aromatization and T/E2 balance."
    },
    low: {
      nl: "Laag: kan samengaan met droge gewrichten, minder libido en stemmings- of botklachten.",
      en: "Low: can relate to dry joints, reduced libido, and mood or bone complaints."
    },
    high: {
      nl: "Hoog: kan samengaan met vochtretentie, gevoelige borsten en stemmingsschommelingen.",
      en: "High: can relate to fluid retention, breast tenderness, and mood swings."
    }
  },
  Hematocrit: {
    name: { nl: "Hematocriet", en: "Hematocrit" },
    what: {
      nl: "Percentage rode bloedcellen in het totale bloedvolume.",
      en: "Percentage of red blood cells in total blood volume."
    },
    why: {
      nl: "Cruciaal in hormoontrajecten omdat verhoogde waarden de bloedviscositeit kunnen verhogen.",
      en: "Critical during hormone treatment because elevated values can increase blood viscosity."
    },
    low: {
      nl: "Laag: kan passen bij anemie of ijzertekort met vermoeidheid en minder inspanningstolerantie.",
      en: "Low: may fit anemia or iron deficiency with fatigue and reduced exercise tolerance."
    },
    high: {
      nl: "Hoog: kan wijzen op verhoogde viscositeit en vraagt extra cardiovasculaire monitoring.",
      en: "High: can indicate increased viscosity and warrants extra cardiovascular monitoring."
    }
  },
  SHBG: {
    name: { nl: "SHBG", en: "SHBG" },
    what: {
      nl: "Transporteiwit dat testosteron en estradiol bindt in het bloed.",
      en: "Binding protein that carries testosterone and estradiol in blood."
    },
    why: {
      nl: "Belangrijk voor interpretatie van vrije hormoonfractie naast totaalwaarden.",
      en: "Important for interpreting free hormone fraction alongside total values."
    },
    low: {
      nl: "Laag: vaak relatief meer vrije androgenen; kan samengaan met metabole ontregeling.",
      en: "Low: often means relatively more free androgens; may relate to metabolic dysregulation."
    },
    high: {
      nl: "Hoog: kan vrije testosteronfractie verlagen ondanks normale totaal testosteronwaarde.",
      en: "High: can reduce free testosterone fraction despite normal total testosterone."
    }
  },
  Albumine: {
    name: { nl: "Albumine", en: "Albumin" },
    what: {
      nl: "Belangrijk plasma-eiwit uit de lever voor vochtbalans en transport van stoffen.",
      en: "Major plasma protein made by the liver for fluid balance and transport."
    },
    why: {
      nl: "Geeft context over voedingstoestand, leverfunctie en eiwitverlies via nieren.",
      en: "Provides context on nutritional status, liver function, and kidney protein loss."
    },
    low: {
      nl: "Laag: kan passen bij ontsteking, leverziekte, ondervoeding of eiwitverlies via urine.",
      en: "Low: can fit inflammation, liver disease, undernutrition, or urinary protein loss."
    },
    high: {
      nl: "Hoog: is vaak relatief en past meestal bij uitdroging.",
      en: "High: is often relative and usually fits dehydration."
    }
  },
  "Dihydrotestosteron (DHT)": {
    name: { nl: "Dihydrotestosteron (DHT)", en: "Dihydrotestosterone (DHT)" },
    what: {
      nl: "Sterk werkend androgeen dat ontstaat uit testosteron via 5-alfa-reductase.",
      en: "Potent androgen formed from testosterone via 5-alpha reductase."
    },
    why: {
      nl: "Kan helpen bij duiding van androgenische effecten zoals libido, huid en haar.",
      en: "Can help interpret androgenic effects such as libido, skin, and hair."
    },
    low: {
      nl: "Laag: kan passen bij minder androgenische werking, bijvoorbeeld op libido of vitaliteit.",
      en: "Low: can fit reduced androgenic action, for example in libido or vitality."
    },
    high: {
      nl: "Hoog: kan samengaan met acne, vette huid, haarverlies en mogelijke prostaatklachten.",
      en: "High: can be associated with acne, oily skin, hair loss, and possible prostate symptoms."
    }
  },
  "Vitamin D (D3+D2) OH": {
    name: { nl: "Vitamine D (D3+D2) OH", en: "Vitamin D (D3+D2) OH" },
    what: {
      nl: "25-OH vitamine D is de standaardmarker voor vitamine D-voorraad.",
      en: "25-OH vitamin D is the standard marker of vitamin D stores."
    },
    why: {
      nl: "Wordt gemeten voor botgezondheid, spierfunctie en algemene immuuncontext.",
      en: "Measured for bone health, muscle function, and general immune context."
    },
    low: {
      nl: "Laag: kan samenhangen met spierzwakte, botverlies en hoger fractuurrisico.",
      en: "Low: can be associated with muscle weakness, bone loss, and higher fracture risk."
    },
    high: {
      nl: "Hoog: meestal door over-suppletie en kan leiden tot hypercalciëmieklachten.",
      en: "High: usually due to over-supplementation and can cause hypercalcemia symptoms."
    }
  },
  "Red Blood Cells": {
    name: { nl: "Rode bloedcellen", en: "Red Blood Cells" },
    what: {
      nl: "Aantal rode bloedcellen dat zuurstof door het lichaam transporteert.",
      en: "Count of red blood cells that carry oxygen through the body."
    },
    why: {
      nl: "Belangrijk voor beoordeling van anemie of polycythemie naast Hb/Ht.",
      en: "Important for assessing anemia or polycythemia alongside Hb/Hct."
    },
    low: {
      nl: "Laag: kan passen bij anemie, met klachten zoals moeheid en verminderde belastbaarheid.",
      en: "Low: may fit anemia, with symptoms like fatigue and lower tolerance."
    },
    high: {
      nl: "Hoog: kan passen bij hemoconcentratie of verhoogde erytropoëse.",
      en: "High: can fit hemoconcentration or increased erythropoiesis."
    }
  },
  Hemoglobin: {
    name: { nl: "Hemoglobine", en: "Hemoglobin" },
    what: {
      nl: "Zuurstofdragend eiwit in rode bloedcellen.",
      en: "Oxygen-carrying protein inside red blood cells."
    },
    why: {
      nl: "Wordt samen met hematocriet gebruikt voor bloedbeeld en viscositeitsinschatting.",
      en: "Used with hematocrit to evaluate blood profile and viscosity risk."
    },
    low: {
      nl: "Laag: kan wijzen op anemie en kan vermoeidheid, duizeligheid of kortademigheid geven.",
      en: "Low: can indicate anemia and may cause fatigue, dizziness, or shortness of breath."
    },
    high: {
      nl: "Hoog: kan samengaan met verhoogde bloedviscositeit.",
      en: "High: can be associated with increased blood viscosity."
    }
  },
  MCV: {
    name: { nl: "MCV", en: "MCV" },
    what: {
      nl: "Gemiddeld volume van rode bloedcellen.",
      en: "Average volume of red blood cells."
    },
    why: {
      nl: "Helpt anemie te typeren als microcytair, normocytair of macrocytair.",
      en: "Helps classify anemia as microcytic, normocytic, or macrocytic."
    },
    low: {
      nl: "Laag: past vaak bij ijzertekort of thalassemiepatronen.",
      en: "Low: often fits iron deficiency or thalassemia patterns."
    },
    high: {
      nl: "Hoog: kan passen bij B12-/folaattekort, alcohol of bepaalde medicatie.",
      en: "High: can fit B12/folate deficiency, alcohol use, or certain medication effects."
    }
  },
  MCH: {
    name: { nl: "MCH", en: "MCH" },
    what: {
      nl: "Gemiddelde hoeveelheid hemoglobine per rode bloedcel.",
      en: "Average amount of hemoglobin per red blood cell."
    },
    why: {
      nl: "Geeft extra context bij anemiediagnostiek samen met MCV en MCHC.",
      en: "Adds context in anemia evaluation together with MCV and MCHC."
    },
    low: {
      nl: "Laag: past vaak bij ijzergebrek met hypochrome cellen.",
      en: "Low: often fits iron deficiency with hypochromic cells."
    },
    high: {
      nl: "Hoog: kan passen bij macrocytaire patronen, bijvoorbeeld bij B12-/folaattekort.",
      en: "High: can fit macrocytic patterns, for example with B12/folate deficiency."
    }
  },
  MCHC: {
    name: { nl: "MCHC", en: "MCHC" },
    what: {
      nl: "Concentratie hemoglobine binnen rode bloedcellen.",
      en: "Concentration of hemoglobin within red blood cells."
    },
    why: {
      nl: "Helpt onderscheid maken tussen hypochrome en normochrome anemiepatronen.",
      en: "Helps distinguish hypochromic from normochromic anemia patterns."
    },
    low: {
      nl: "Laag: past vaak bij ijzergebrek of chronisch bloedverlies.",
      en: "Low: often fits iron deficiency or chronic blood loss."
    },
    high: {
      nl: "Hoog: is zeldzamer en kan voorkomen bij sferocytose, uitdroging of meetartefact.",
      en: "High: is less common and may occur with spherocytosis, dehydration, or lab artifact."
    }
  },
  Platelets: {
    name: { nl: "Bloedplaatjes", en: "Platelets" },
    what: {
      nl: "Cellen die belangrijk zijn voor bloedstolling en wondheling.",
      en: "Cells that are important for blood clotting and wound healing."
    },
    why: {
      nl: "Wordt gemeten voor inschatting van bloedings- en tromboserisico.",
      en: "Measured to assess bleeding and clotting risk."
    },
    low: {
      nl: "Laag: kan samengaan met verhoogde bloedingsneiging.",
      en: "Low: can be associated with increased bleeding tendency."
    },
    high: {
      nl: "Hoog: kan passen bij ontsteking of reactieve trombocytose en soms meer stolrisico.",
      en: "High: can fit inflammation or reactive thrombocytosis and sometimes higher clot risk."
    }
  },
  Leukocyten: {
    name: { nl: "Leukocyten", en: "Leukocytes" },
    what: {
      nl: "Totale wittebloedcelgetal, belangrijk voor afweer.",
      en: "Total white blood cell count, important for immune defense."
    },
    why: {
      nl: "Geeft algemene informatie over infectie- of ontstekingsactiviteit.",
      en: "Provides general information about infection or inflammation activity."
    },
    low: {
      nl: "Laag: kan passen bij verminderde afweer of beenmergsuppressie.",
      en: "Low: can fit reduced immune defense or bone marrow suppression."
    },
    high: {
      nl: "Hoog: past vaak bij infectie, ontsteking, stressrespons of corticosteroïdgebruik.",
      en: "High: often fits infection, inflammation, stress response, or corticosteroid use."
    }
  },
  "Neutrophils Abs.": {
    name: { nl: "Neutrofielen abs.", en: "Neutrophils Abs." },
    what: {
      nl: "Absolute hoeveelheid neutrofielen, de belangrijkste acute afweercellen.",
      en: "Absolute neutrophil count, key cells in acute immune response."
    },
    why: {
      nl: "Wordt gebruikt om infectierisico en acute ontstekingsactiviteit te duiden.",
      en: "Used to interpret infection risk and acute inflammatory activity."
    },
    low: {
      nl: "Laag: kan wijzen op neutropenie met verhoogde gevoeligheid voor infecties.",
      en: "Low: can indicate neutropenia with increased infection susceptibility."
    },
    high: {
      nl: "Hoog: past vaak bij acute infectie, ontsteking of stressreactie.",
      en: "High: often fits acute infection, inflammation, or stress response."
    }
  },
  "Lymphocytes Abs.": {
    name: { nl: "Lymfocyten abs.", en: "Lymphocytes Abs." },
    what: {
      nl: "Absolute hoeveelheid lymfocyten, belangrijk voor adaptieve immuniteit.",
      en: "Absolute lymphocyte count, important for adaptive immunity."
    },
    why: {
      nl: "Helpt bij interpretatie van virale respons en immuunstatus.",
      en: "Helps interpret viral response and immune status."
    },
    low: {
      nl: "Laag: kan voorkomen bij stress, corticosteroïden of immuunsuppressie.",
      en: "Low: can occur with stress, corticosteroids, or immunosuppression."
    },
    high: {
      nl: "Hoog: kan passen bij virale infecties of chronische immuunstimulatie.",
      en: "High: can fit viral infections or chronic immune stimulation."
    }
  },
  "Monocytes Abs.": {
    name: { nl: "Monocyten abs.", en: "Monocytes Abs." },
    what: {
      nl: "Absolute hoeveelheid monocyten, betrokken bij opruiming en weefselherstel.",
      en: "Absolute monocyte count involved in cleanup and tissue repair."
    },
    why: {
      nl: "Geeft aanvullende context over chronische ontstekingsactiviteit.",
      en: "Provides additional context on chronic inflammatory activity."
    },
    low: {
      nl: "Laag: is vaak niet specifiek, maar kan passen bij beenmergremming.",
      en: "Low: is often nonspecific but can fit bone marrow suppression."
    },
    high: {
      nl: "Hoog: kan passen bij herstel na infectie, chronische ontsteking of immuunactivatie.",
      en: "High: can fit post-infection recovery, chronic inflammation, or immune activation."
    }
  },
  "Eosinophils Abs.": {
    name: { nl: "Eosinofielen abs.", en: "Eosinophils Abs." },
    what: {
      nl: "Absolute hoeveelheid eosinofielen, betrokken bij allergische en parasitaire reacties.",
      en: "Absolute eosinophil count involved in allergic and parasitic responses."
    },
    why: {
      nl: "Nuttig bij beoordeling van allergie, astma of eosinofiele ontsteking.",
      en: "Useful for assessing allergy, asthma, or eosinophilic inflammation."
    },
    low: {
      nl: "Laag: is meestal klinisch minder relevant.",
      en: "Low: is usually of limited clinical significance."
    },
    high: {
      nl: "Hoog: kan passen bij allergie, astma, medicatiereactie of parasitaire infectie.",
      en: "High: can fit allergy, asthma, drug reaction, or parasitic infection."
    }
  },
  "Basophils Abs.": {
    name: { nl: "Basofielen abs.", en: "Basophils Abs." },
    what: {
      nl: "Absolute hoeveelheid basofielen, zeldzame cellen betrokken bij allergische reacties.",
      en: "Absolute basophil count, rare cells involved in allergic responses."
    },
    why: {
      nl: "Geeft aanvullende context bij allergie en bepaalde hematologische patronen.",
      en: "Provides added context in allergy and some hematologic patterns."
    },
    low: {
      nl: "Laag: is meestal niet klinisch betekenisvol.",
      en: "Low: is usually not clinically meaningful."
    },
    high: {
      nl: "Hoog: kan passen bij allergie, chronische ontsteking of myeloproliferatieve processen.",
      en: "High: can fit allergy, chronic inflammation, or myeloproliferative processes."
    }
  },
  Ferritine: {
    name: { nl: "Ferritine", en: "Ferritin" },
    what: {
      nl: "Opslageiwit voor ijzer en belangrijkste marker van ijzervoorraden.",
      en: "Iron storage protein and key marker of iron stores."
    },
    why: {
      nl: "Belangrijk bij moeheid, ijzertekort, flebotomie en herstelmonitoring.",
      en: "Important for fatigue, iron deficiency, phlebotomy, and recovery monitoring."
    },
    low: {
      nl: "Laag: past vaak bij uitgeputte ijzervoorraad, soms al vóór anemie zichtbaar.",
      en: "Low: often reflects depleted iron stores, sometimes before anemia appears."
    },
    high: {
      nl: "Hoog: kan passen bij ontsteking, leverbelasting of ijzerstapeling.",
      en: "High: can fit inflammation, liver stress, or iron overload."
    }
  },
  Transferrine: {
    name: { nl: "Transferrine", en: "Transferrin" },
    what: {
      nl: "Transporteiwit dat ijzer in het bloed vervoert.",
      en: "Transport protein that carries iron in blood."
    },
    why: {
      nl: "Onderdeel van ijzerstatusanalyse samen met ferritine en saturatie.",
      en: "Part of iron status analysis with ferritin and saturation."
    },
    low: {
      nl: "Laag: kan passen bij ontsteking, leverziekte of ondervoeding.",
      en: "Low: can fit inflammation, liver disease, or undernutrition."
    },
    high: {
      nl: "Hoog: wordt vaak gezien bij ijzertekort.",
      en: "High: is often seen with iron deficiency."
    }
  },
  "Transferrine Saturatie": {
    name: { nl: "Transferrineverzadiging", en: "Transferrin Saturation" },
    what: {
      nl: "Percentage transferrine dat met ijzer verzadigd is.",
      en: "Percentage of transferrin that is saturated with iron."
    },
    why: {
      nl: "Geeft aan hoeveel ijzer direct beschikbaar is voor weefsels en bloedaanmaak.",
      en: "Indicates how much iron is immediately available for tissues and blood production."
    },
    low: {
      nl: "Laag: past bij functioneel ijzertekort of beperkte ijzerbeschikbaarheid.",
      en: "Low: fits functional iron deficiency or limited iron availability."
    },
    high: {
      nl: "Hoog: kan passen bij ijzerstapeling en vraagt context met ferritine.",
      en: "High: can fit iron overload and should be interpreted with ferritin."
    }
  },
  Foliumzuur: {
    name: { nl: "Foliumzuur", en: "Folate" },
    what: {
      nl: "Vitamine B9, essentieel voor DNA-synthese en bloedcelvorming.",
      en: "Vitamin B9, essential for DNA synthesis and blood cell production."
    },
    why: {
      nl: "Wordt gemeten bij macrocytaire patronen, homocysteïne en energietekortklachten.",
      en: "Measured in macrocytic patterns, homocysteine shifts, and fatigue context."
    },
    low: {
      nl: "Laag: kan leiden tot macrocytaire anemie en verhoogde homocysteïne.",
      en: "Low: can lead to macrocytic anemia and elevated homocysteine."
    },
    high: {
      nl: "Hoog: komt vaak door suppletie; bij klachten altijd B12 mee beoordelen.",
      en: "High: often reflects supplementation; B12 should be reviewed in context."
    }
  },
  "Vitamine B12": {
    name: { nl: "Vitamine B12", en: "Vitamin B12" },
    what: {
      nl: "Vitamine nodig voor zenuwfunctie, DNA-synthese en rodebloedcelvorming.",
      en: "Vitamin needed for nerve function, DNA synthesis, and red blood cell formation."
    },
    why: {
      nl: "Belangrijk bij moeheid, neuropathische klachten en homocysteïne/methylatie-analyse.",
      en: "Important in fatigue, neuropathic symptoms, and homocysteine/methylation analysis."
    },
    low: {
      nl: "Laag: kan passen bij neuropathie, cognitieve klachten en macrocytaire anemie.",
      en: "Low: can fit neuropathy, cognitive symptoms, and macrocytic anemia."
    },
    high: {
      nl: "Hoog: vaak door suppletie; soms ook bij lever- of niercontext interpretatie nodig.",
      en: "High: often due to supplementation; may also need liver/kidney context."
    }
  },
  Homocysteine: {
    name: { nl: "Homocysteïne", en: "Homocysteine" },
    what: {
      nl: "Zwavelhoudend tussenproduct in methylering en aminozuurstofwisseling.",
      en: "Sulfur-containing intermediate in methylation and amino acid metabolism."
    },
    why: {
      nl: "Wordt gebruikt als marker voor methylatiebalans en cardiovasculaire risicocontext.",
      en: "Used as a marker of methylation balance and cardiovascular risk context."
    },
    low: {
      nl: "Laag: is meestal niet problematisch en past vaak bij effectieve B-vitamine-inname.",
      en: "Low: is usually not problematic and often fits effective B-vitamin intake."
    },
    high: {
      nl: "Hoog: kan passen bij B12/folaat/B6-tekort, nierfactoren of verhoogd vaatrisico.",
      en: "High: can fit B12/folate/B6 deficiency, kidney factors, or higher vascular risk."
    }
  },
  "Glucose Nuchter": {
    name: { nl: "Glucose Nuchter", en: "Fasting Glucose" },
    what: {
      nl: "Bloedsuiker gemeten na vasten.",
      en: "Blood glucose measured after fasting."
    },
    why: {
      nl: "Basismarker voor glucoseregulatie en metabole gezondheid.",
      en: "Core marker for glucose regulation and metabolic health."
    },
    low: {
      nl: "Laag: kan passen bij hypoglykemieklachten zoals trillen, zweten of duizeligheid.",
      en: "Low: can fit hypoglycemia symptoms such as shakiness, sweating, or dizziness."
    },
    high: {
      nl: "Hoog: kan passen bij insulineresistentie, prediabetes of diabetes.",
      en: "High: can fit insulin resistance, prediabetes, or diabetes."
    }
  },
  Insuline: {
    name: { nl: "Insuline", en: "Insulin" },
    what: {
      nl: "Hormoon dat glucoseopname en energieopslag reguleert.",
      en: "Hormone that regulates glucose uptake and energy storage."
    },
    why: {
      nl: "Samen met glucose belangrijk voor insulineresistentie-inschatting (HOMA-IR).",
      en: "Important with glucose for insulin resistance estimation (HOMA-IR)."
    },
    low: {
      nl: "Laag: kan passen bij lage insuline-output of bij zeer lage koolhydraatinname.",
      en: "Low: can fit low insulin output or very low carbohydrate intake."
    },
    high: {
      nl: "Hoog: wijst vaak op compensatoire hyperinsulinemie bij insulineresistentie.",
      en: "High: often points to compensatory hyperinsulinemia in insulin resistance."
    }
  },
  Cholesterol: {
    name: { nl: "Totaal Cholesterol", en: "Total Cholesterol" },
    what: {
      nl: "Totale som van cholesterolfracties in het bloed.",
      en: "Overall sum of cholesterol fractions in blood."
    },
    why: {
      nl: "Startpunt voor lipidenprofielinterpretatie met LDL, HDL en triglyceriden.",
      en: "Starting point for lipid profile interpretation with LDL, HDL, and triglycerides."
    },
    low: {
      nl: "Laag: is vaak gunstig, maar interpretatie gebeurt altijd met het volledige profiel.",
      en: "Low: is often favorable, but interpretation should use the full lipid profile."
    },
    high: {
      nl: "Hoog: kan cardiovasculair risico verhogen, vooral bij ongunstige LDL/ApoB-context.",
      en: "High: can raise cardiovascular risk, especially with unfavorable LDL/ApoB context."
    }
  },
  "LDL Cholesterol": {
    name: { nl: "LDL-cholesterol", en: "LDL Cholesterol" },
    what: {
      nl: "Atherogene cholesterolfractie die geassocieerd is met plaquevorming.",
      en: "Atherogenic cholesterol fraction associated with plaque formation."
    },
    why: {
      nl: "Belangrijke marker voor cardiovasculaire risicostratificatie.",
      en: "Important marker for cardiovascular risk stratification."
    },
    low: {
      nl: "Laag: wordt doorgaans als gunstiger gezien in risicocontext.",
      en: "Low: is generally viewed as more favorable in risk context."
    },
    high: {
      nl: "Hoog: geassocieerd met hoger atherosclerotisch cardiovasculair risico.",
      en: "High: associated with increased atherosclerotic cardiovascular risk."
    }
  },
  "HDL Cholesterol": {
    name: { nl: "HDL-cholesterol", en: "HDL Cholesterol" },
    what: {
      nl: "Cholesterolfractie betrokken bij reverse cholesterol transport.",
      en: "Cholesterol fraction involved in reverse cholesterol transport."
    },
    why: {
      nl: "Wordt samen met LDL/triglyceriden gebruikt voor lipidencontext.",
      en: "Used with LDL/triglycerides to contextualize lipid status."
    },
    low: {
      nl: "Laag: kan passen bij ongunstiger cardiometabool profiel.",
      en: "Low: can fit a less favorable cardiometabolic profile."
    },
    high: {
      nl: "Hoog: wordt vaak als gunstiger gezien, maar altijd in context van totaalprofiel.",
      en: "High: is often viewed as favorable, but always in full-profile context."
    }
  },
  "Non-HDL Cholesterol": {
    name: { nl: "Non-HDL-cholesterol", en: "Non-HDL Cholesterol" },
    what: {
      nl: "Totaal van atherogene cholesterolfracties (totaal minus HDL).",
      en: "Total of atherogenic cholesterol fractions (total minus HDL)."
    },
    why: {
      nl: "Robuuste risicomarker, vooral bij hogere triglyceriden.",
      en: "Robust risk marker, especially when triglycerides are higher."
    },
    low: {
      nl: "Laag: is doorgaans gunstiger voor cardiovasculair risico.",
      en: "Low: is generally more favorable for cardiovascular risk."
    },
    high: {
      nl: "Hoog: wijst op hogere atherogene partikelbelasting.",
      en: "High: indicates a higher atherogenic particle burden."
    }
  },
  "Cholesterol/HDL Ratio": {
    name: { nl: "Cholesterol/HDL-ratio", en: "Cholesterol/HDL ratio" },
    what: {
      nl: "Verhouding van totaal cholesterol ten opzichte van HDL.",
      en: "Ratio of total cholesterol relative to HDL."
    },
    why: {
      nl: "Snelle samenvatting van lipidenbalans in één kengetal.",
      en: "Quick single-number summary of lipid balance."
    },
    low: {
      nl: "Laag: wordt meestal gezien als gunstiger lipidenpatroon.",
      en: "Low: is usually seen as a more favorable lipid pattern."
    },
    high: {
      nl: "Hoog: kan wijzen op ongunstiger cardiovasculair risicoprofiel.",
      en: "High: can indicate a less favorable cardiovascular risk profile."
    }
  },
  Triglyceriden: {
    name: { nl: "Triglyceriden", en: "Triglycerides" },
    what: {
      nl: "Belangrijkste circulerende vetvorm, beïnvloed door voeding en insulinegevoeligheid.",
      en: "Main circulating fat form, influenced by diet and insulin sensitivity."
    },
    why: {
      nl: "Relevant voor metabool syndroom, levervet en cardiovasculaire risicocontext.",
      en: "Relevant to metabolic syndrome, liver fat, and cardiovascular risk context."
    },
    low: {
      nl: "Laag: is meestal gunstig en past vaak bij goede metabole controle.",
      en: "Low: is usually favorable and often fits good metabolic control."
    },
    high: {
      nl: "Hoog: kan passen bij insulineresistentie, alcohol, voeding of metabole ontregeling.",
      en: "High: can fit insulin resistance, alcohol effects, diet, or metabolic dysregulation."
    }
  },
  "Apolipoprotein B": {
    name: { nl: "Apolipoproteïne B", en: "Apolipoprotein B" },
    what: {
      nl: "Marker voor het aantal atherogene lipoproteïnedeeltjes.",
      en: "Marker of the number of atherogenic lipoprotein particles."
    },
    why: {
      nl: "Sterke marker voor atherosclerotisch risico naast LDL-cholesterol.",
      en: "Strong marker of atherosclerotic risk alongside LDL cholesterol."
    },
    low: {
      nl: "Laag: wijst op lagere atherogene partikelbelasting.",
      en: "Low: indicates a lower atherogenic particle burden."
    },
    high: {
      nl: "Hoog: geassocieerd met hoger cardiovasculair risico.",
      en: "High: associated with higher cardiovascular risk."
    }
  },
  Ureum: {
    name: { nl: "Ureum", en: "Urea" },
    what: {
      nl: "Afbraakproduct van eiwitmetabolisme dat via de nieren wordt uitgescheiden.",
      en: "Protein metabolism waste product excreted by the kidneys."
    },
    why: {
      nl: "Geeft context over nierfunctie, hydratatie en eiwitbelasting.",
      en: "Provides context on kidney function, hydration, and protein load."
    },
    low: {
      nl: "Laag: kan passen bij lage eiwitinname, overhydratie of leverfactoren.",
      en: "Low: can fit low protein intake, overhydration, or liver factors."
    },
    high: {
      nl: "Hoog: kan passen bij dehydratie, hoge eiwitinname of verminderde nierklaring.",
      en: "High: can fit dehydration, high protein intake, or reduced kidney clearance."
    }
  },
  eGFR: {
    name: { nl: "eGFR", en: "eGFR" },
    what: {
      nl: "Geschatte glomerulaire filtratiesnelheid, maat voor nierfiltratie.",
      en: "Estimated glomerular filtration rate, a measure of kidney filtration."
    },
    why: {
      nl: "Wordt gebruikt om nierfunctie over tijd te volgen.",
      en: "Used to track kidney function over time."
    },
    low: {
      nl: "Laag: kan wijzen op verminderde nierfunctie en vraagt trendmatige opvolging.",
      en: "Low: can indicate reduced kidney function and warrants trend-based follow-up."
    },
    high: {
      nl: "Hoog: kan passen bij hyperfiltratie; interpretatie hangt af van context.",
      en: "High: can fit hyperfiltration; interpretation depends on context."
    }
  },
  PSA: {
    name: { nl: "PSA", en: "PSA" },
    what: {
      nl: "Prostaatspecifiek antigeen, eiwit geproduceerd door prostaatweefsel.",
      en: "Prostate-specific antigen, a protein produced by prostate tissue."
    },
    why: {
      nl: "Wordt gevolgd voor prostaatmonitoring, vooral in leeftijds- en hormooncontext.",
      en: "Tracked for prostate monitoring, especially in age and hormone-treatment context."
    },
    low: {
      nl: "Laag: wordt meestal als geruststellend gezien binnen context.",
      en: "Low: is usually considered reassuring in context."
    },
    high: {
      nl: "Hoog: kan stijgen bij benigne prostaatgroei, ontsteking of andere prostaatprikkels.",
      en: "High: can rise with benign enlargement, inflammation, or other prostate stimuli."
    }
  },
  "Albumine Urine": {
    name: { nl: "Albumine urine", en: "Urine Albumin" },
    what: {
      nl: "Hoeveelheid albumine die in de urine wordt uitgescheiden.",
      en: "Amount of albumin excreted in urine."
    },
    why: {
      nl: "Vroege marker voor nierschade, vooral bij hypertensie of glucoseproblemen.",
      en: "Early marker of kidney damage, especially with hypertension or glucose issues."
    },
    low: {
      nl: "Laag: wordt doorgaans als gunstig beschouwd.",
      en: "Low: is generally considered favorable."
    },
    high: {
      nl: "Hoog: kan wijzen op verhoogde glomerulaire doorlaatbaarheid.",
      en: "High: can indicate increased glomerular permeability."
    }
  },
  "Creatinine Urine": {
    name: { nl: "Creatinine urine", en: "Urine Creatinine" },
    what: {
      nl: "Creatinineconcentratie in urine, beïnvloed door spiermassa en verdunning.",
      en: "Creatinine concentration in urine, influenced by muscle mass and dilution."
    },
    why: {
      nl: "Wordt gebruikt om urinemetingen zoals ACR te normaliseren.",
      en: "Used to normalize urine measures such as ACR."
    },
    low: {
      nl: "Laag: kan passen bij verdunde urine of lage spiermassa.",
      en: "Low: can fit dilute urine or lower muscle mass."
    },
    high: {
      nl: "Hoog: kan passen bij geconcentreerde urine of dehydratie.",
      en: "High: can fit concentrated urine or dehydration."
    }
  },
  "Urine ACR": {
    name: { nl: "Urine ACR", en: "Urine ACR" },
    what: {
      nl: "Albumine/creatinine-ratio in urine als gestandaardiseerde nierschademarker.",
      en: "Urine albumin/creatinine ratio, a standardized kidney damage marker."
    },
    why: {
      nl: "Belangrijke marker voor vroege nierschade en CKD-risicostratificatie.",
      en: "Important marker for early kidney damage and CKD risk stratification."
    },
    low: {
      nl: "Laag: wijst meestal op afwezigheid van significante albuminurie.",
      en: "Low: usually indicates absence of significant albuminuria."
    },
    high: {
      nl: "Hoog: kan wijzen op persisterende albuminurie en hoger nierrisico.",
      en: "High: can indicate persistent albuminuria and higher kidney risk."
    }
  },
  "T/E2 Ratio": {
    name: { nl: "T/E2-ratio", en: "T/E2 ratio" },
    what: {
      nl: "Verhouding tussen totaal testosteron en estradiol.",
      en: "Ratio between total testosterone and estradiol."
    },
    why: {
      nl: "Handige samenvatting van androgenen-oestrogenenbalans tijdens hormoonbehandeling.",
      en: "Useful summary of androgen-estrogen balance during hormone treatment."
    },
    low: {
      nl: "Laag: kan wijzen op relatief sterke oestrogeencomponent t.o.v. testosteron.",
      en: "Low: can indicate a relatively stronger estrogen component vs testosterone."
    },
    high: {
      nl: "Hoog: kan wijzen op relatief lage oestrogeencomponent of hoge androgenencomponent.",
      en: "High: can indicate relatively lower estrogen or higher androgen influence."
    }
  },
  "LDL/HDL Ratio": {
    name: { nl: "LDL/HDL-ratio", en: "LDL/HDL ratio" },
    what: {
      nl: "Verhouding tussen LDL en HDL als samenvatting van lipidenbalans.",
      en: "Ratio between LDL and HDL as a summary of lipid balance."
    },
    why: {
      nl: "Wordt gebruikt als aanvullende cardiovasculaire risicocontext.",
      en: "Used as additional cardiovascular risk context."
    },
    low: {
      nl: "Laag: doorgaans gunstiger patroon.",
      en: "Low: generally a more favorable pattern."
    },
    high: {
      nl: "Hoog: kan passen bij ongunstiger atherogeen profiel.",
      en: "High: can fit a less favorable atherogenic profile."
    }
  },
  "Free Androgen Index": {
    name: { nl: "Vrije Androgenen Index", en: "Free Androgen Index" },
    what: {
      nl: "Afgeleide index uit testosteron en SHBG als benadering van androgenenbeschikbaarheid.",
      en: "Derived index from testosterone and SHBG as an estimate of androgen availability."
    },
    why: {
      nl: "Geeft extra context wanneer totale testosteronwaarde alleen niet voldoende is.",
      en: "Adds context when total testosterone alone is not sufficient."
    },
    low: {
      nl: "Laag: kan passen bij relatief lage biologische androgenenwerking.",
      en: "Low: can fit relatively low biologically active androgen effect."
    },
    high: {
      nl: "Hoog: kan passen bij relatief hoge androgenenwerking.",
      en: "High: can fit relatively high androgen effect."
    }
  },
  "HOMA-IR": {
    name: { nl: "HOMA-IR", en: "HOMA-IR" },
    what: {
      nl: "Afgeleide index op basis van nuchtere glucose en insuline.",
      en: "Derived index based on fasting glucose and insulin."
    },
    why: {
      nl: "Wordt gebruikt voor vroegtijdige trendinschatting van insulineresistentie.",
      en: "Used for early trend estimation of insulin resistance."
    },
    low: {
      nl: "Laag: past doorgaans bij betere insulinegevoeligheid.",
      en: "Low: generally fits better insulin sensitivity."
    },
    high: {
      nl: "Hoog: past bij toenemende insulineresistentie.",
      en: "High: fits increasing insulin resistance."
    }
  },
  "ALAT (GPT)": {
    name: { nl: "ALAT (GPT)", en: "ALAT (GPT)" },
    what: {
      nl: "Leverenzym (alanine-aminotransferase) dat vrijkomt bij levercelstress.",
      en: "Liver enzyme (alanine aminotransferase) released with hepatocellular stress."
    },
    why: {
      nl: "Wordt gemeten voor levermonitoring bij medicatie, supplementen en metabole belasting.",
      en: "Measured for liver monitoring with medication, supplements, and metabolic load."
    },
    low: {
      nl: "Laag: is meestal niet klinisch relevant.",
      en: "Low: is usually not clinically relevant."
    },
    high: {
      nl: "Hoog: kan passen bij leverontsteking, leververvetting of andere leverprikkels.",
      en: "High: can fit liver inflammation, fatty liver, or other liver stressors."
    }
  },
  "ASAT (GOT)": {
    name: { nl: "ASAT (GOT)", en: "ASAT (GOT)" },
    what: {
      nl: "Enzym in lever en spierweefsel; stijgt bij celbeschadiging.",
      en: "Enzyme in liver and muscle tissue; rises with cellular injury."
    },
    why: {
      nl: "Wordt samen met ALAT gebruikt om lever- versus spiercomponent te duiden.",
      en: "Used with ALAT to interpret liver versus muscle contribution."
    },
    low: {
      nl: "Laag: is meestal niet klinisch relevant.",
      en: "Low: is usually not clinically relevant."
    },
    high: {
      nl: "Hoog: kan passen bij leverbelasting of intensieve spierbelasting.",
      en: "High: can fit liver stress or intense muscle stress."
    }
  },
  GGT: {
    name: { nl: "GGT", en: "GGT" },
    what: {
      nl: "Lever- en galwegenzym dat gevoelig is voor cholestase en leverbelasting.",
      en: "Liver and bile duct enzyme sensitive to cholestasis and liver stress."
    },
    why: {
      nl: "Nuttig voor aanvullende levercontext, inclusief alcoholgerelateerde belasting.",
      en: "Useful for additional liver context, including alcohol-related burden."
    },
    low: {
      nl: "Laag: meestal niet klinisch relevant.",
      en: "Low: usually not clinically relevant."
    },
    high: {
      nl: "Hoog: kan passen bij lever- of galwegbelasting.",
      en: "High: can fit liver or biliary stress."
    }
  },
  CRP: {
    name: { nl: "CRP", en: "CRP" },
    what: {
      nl: "C-reactief proteïne, een acute-fase marker voor ontsteking.",
      en: "C-reactive protein, an acute-phase marker of inflammation."
    },
    why: {
      nl: "Wordt gebruikt om systemische ontstekingsactiviteit te volgen.",
      en: "Used to track systemic inflammatory activity."
    },
    low: {
      nl: "Laag: past doorgaans bij lage ontstekingsactiviteit.",
      en: "Low: generally fits low inflammatory activity."
    },
    high: {
      nl: "Hoog: kan wijzen op infectie, ontsteking of weefselschade.",
      en: "High: can indicate infection, inflammation, or tissue injury."
    }
  },
  Creatinine: {
    name: { nl: "Creatinine", en: "Creatinine" },
    what: {
      nl: "Afbraakproduct van spiermetabolisme dat via de nieren wordt geklaard.",
      en: "Muscle metabolism byproduct cleared by the kidneys."
    },
    why: {
      nl: "Kernmarker voor nierfunctie, vaak samen geïnterpreteerd met eGFR.",
      en: "Core kidney marker, often interpreted together with eGFR."
    },
    low: {
      nl: "Laag: kan passen bij lage spiermassa of overhydratie.",
      en: "Low: can fit low muscle mass or overhydration."
    },
    high: {
      nl: "Hoog: kan passen bij verminderde nierklaring of dehydratie.",
      en: "High: can fit reduced kidney clearance or dehydration."
    }
  },
  TSH: {
    name: { nl: "TSH", en: "TSH" },
    what: {
      nl: "Hypofysehormoon dat de schildklier aanstuurt.",
      en: "Pituitary hormone that regulates the thyroid gland."
    },
    why: {
      nl: "Belangrijk bij energie-, gewicht- en temperatuurregulatieklachten.",
      en: "Important when evaluating energy, weight, and temperature regulation symptoms."
    },
    low: {
      nl: "Laag: kan passen bij (subklinische) hyperthyreoïdie.",
      en: "Low: can fit (subclinical) hyperthyroidism."
    },
    high: {
      nl: "Hoog: kan passen bij (subklinische) hypothyreoïdie.",
      en: "High: can fit (subclinical) hypothyroidism."
    }
  },
  "Free T4": {
    name: { nl: "Vrij T4", en: "Free T4" },
    what: {
      nl: "Vrij thyroxine, het direct beschikbare schildklierhormoon in je bloed.",
      en: "Free thyroxine, the directly available thyroid hormone in blood."
    },
    why: {
      nl: "Wordt samen met TSH gebruikt om schildklierfunctie en conversiepatronen te beoordelen.",
      en: "Used with TSH to assess thyroid function and conversion patterns."
    },
    low: {
      nl: "Laag: kan passen bij hypothyreoïdie of centrale as-problematiek.",
      en: "Low: can fit hypothyroidism or central axis issues."
    },
    high: {
      nl: "Hoog: kan passen bij hyperthyreoïdie, overbehandeling of acute stressfactoren.",
      en: "High: can fit hyperthyroidism, overtreatment, or acute stress factors."
    }
  },
  "Free T3": {
    name: { nl: "Vrij T3", en: "Free T3" },
    what: {
      nl: "Vrij trijodothyronine, de meest actieve schildklierhormoonfractie op weefselniveau.",
      en: "Free triiodothyronine, the most biologically active thyroid hormone fraction."
    },
    why: {
      nl: "Helpt bij interpretatie van conversie van T4 naar T3 en klachten ondanks normale TSH.",
      en: "Helps interpret T4-to-T3 conversion and symptoms despite normal TSH."
    },
    low: {
      nl: "Laag: kan passen bij verminderde omzetting, ziektebelasting of calorietekort.",
      en: "Low: can fit reduced conversion, illness burden, or caloric restriction."
    },
    high: {
      nl: "Hoog: kan passen bij hyperthyreoïdie of overmatige schildklieractiviteit.",
      en: "High: can fit hyperthyroidism or excessive thyroid activity."
    }
  }
};

const normalizeMarkerLookup = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const MARKER_META_ALIAS_LOOKUP: Record<string, string> = {
  "alat gpt": "ALAT (GPT)",
  alat: "ALAT (GPT)",
  "asat got": "ASAT (GOT)",
  asat: "ASAT (GOT)",
  got: "ASAT (GOT)",
  gamma: "GGT",
  "gamma gt": "GGT",
  "gamma g t": "GGT",
  ggt: "GGT",
  crp: "CRP",
  "serum creatinine": "Creatinine",
  "creatinine serum": "Creatinine",
  creatinine: "Creatinine",
  tsh: "TSH",
  ft4: "Free T4",
  "free t4": "Free T4",
  "vrij t4": "Free T4",
  ft3: "Free T3",
  "free t3": "Free T3",
  "vrij t3": "Free T3",
  "albumin urine": "Albumine Urine",
  "urine albumin": "Albumine Urine",
  "albumin creatinine ratio": "Urine ACR",
  "albumin creatinine ratio urine": "Urine ACR",
  "alat (gpt)": "ALAT (GPT)",
  "asat (got)": "ASAT (GOT)"
};

const resolveMarkerMeta = (marker: string): MarkerMeta | undefined => {
  const direct = MARKER_META[marker];
  if (direct) {
    return direct;
  }

  const normalized = normalizeMarkerLookup(marker);
  if (!normalized) {
    return undefined;
  }

  const aliasKey = MARKER_META_ALIAS_LOOKUP[normalized];
  if (aliasKey && MARKER_META[aliasKey]) {
    return MARKER_META[aliasKey];
  }

  const exactByNormalizedKey = Object.entries(MARKER_META).find(
    ([candidate]) => normalizeMarkerLookup(candidate) === normalized
  );
  return exactByNormalizedKey?.[1];
};

export const getMarkerDisplayName = (marker: string, language: AppLanguage): string => {
  const translated = MARKER_NAME_TRANSLATIONS[marker];
  if (translated) {
    return pickLocalizedText(translated, language);
  }
  const meta = resolveMarkerMeta(marker);
  return meta ? pickLocalizedText(meta.name, language) : marker;
};

export const getMarkerMeta = (
  marker: string,
  language: AppLanguage
): { title: string; what: string; why: string; low: string; high: string } => {
  const meta = resolveMarkerMeta(marker);
  if (!meta) {
    return {
      title: getMarkerDisplayName(marker, language),
      what: t(language, "unknownMarkerInfoWhat"),
      why: t(language, "unknownMarkerInfoWhy"),
      low: t(language, "unknownMarkerInfoLow"),
      high: t(language, "unknownMarkerInfoHigh")
    };
  }

  return {
    title: getMarkerDisplayName(marker, language),
    what: pickLocalizedText(meta.what, language),
    why: pickLocalizedText(meta.why, language),
    low: meta.low?.[language] ?? t(language, "unknownMarkerInfoLow"),
    high: meta.high?.[language] ?? t(language, "unknownMarkerInfoHigh")
  };
};
