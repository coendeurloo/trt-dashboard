import { convertBySystem } from "./unitConversion";
import { LabReport, UnitSystem } from "./types";
import { injectionFrequencyLabel } from "./protocolStandards";

const escapeCsv = (value: string | number | null): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const buildCsv = (reports: LabReport[], selectedMarkers: string[], unitSystem: UnitSystem): string => {
  const markerSet = new Set(selectedMarkers);
  const headers = [
    "Test Date",
    "Marker",
    "Value",
    "Unit",
    "Reference Min",
    "Reference Max",
    "Dosage mg/week",
    "Compound",
    "Injection Frequency",
    "Protocol",
    "Supplements",
    "Symptoms",
    "Notes"
  ];

  const rows: string[] = [headers.join(",")];

  reports.forEach((report) => {
    report.markers.forEach((marker) => {
      if (markerSet.size > 0 && !markerSet.has(marker.canonicalMarker)) {
        return;
      }

      const convertedValue = convertBySystem(
        marker.canonicalMarker,
        marker.value,
        marker.unit,
        unitSystem
      );

      const convertedMin =
        marker.referenceMin === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
      const convertedMax =
        marker.referenceMax === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;

      rows.push(
        [
          escapeCsv(report.testDate),
          escapeCsv(marker.canonicalMarker),
          escapeCsv(Number(convertedValue.value.toFixed(3))),
          escapeCsv(convertedValue.unit),
          escapeCsv(convertedMin === null ? null : Number(convertedMin.toFixed(3))),
          escapeCsv(convertedMax === null ? null : Number(convertedMax.toFixed(3))),
          escapeCsv(report.annotations.dosageMgPerWeek),
          escapeCsv(report.annotations.compound),
          escapeCsv(injectionFrequencyLabel(report.annotations.injectionFrequency, "en")),
          escapeCsv(report.annotations.protocol),
          escapeCsv(report.annotations.supplements),
          escapeCsv(report.annotations.symptoms),
          escapeCsv(report.annotations.notes)
        ].join(",")
      );
    });
  });

  return rows.join("\n");
};
