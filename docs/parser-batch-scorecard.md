# Parser Batch Scorecard

Doel: per batch objectief beslissen of we doorgaan naar de volgende batch.

## Metrics + Formules

- `Required Marker Recall` = gevonden verplichte markers / totaal verplichte markers
- `Unit Accuracy` = correcte units / markers met unit-verwachting
- `Reference Range Accuracy` = correcte min/max ranges / markers met range-verwachting
- `Date Accuracy` = correcte datum / totaal files
- `False Positive Rate` = foutieve markers / totaal gevonden markers
- `Unknown Layout Rate` = files met `PDF_UNKNOWN_LAYOUT` / totaal files

## Go/No-Go Drempels

Batch is PASS als alles waar is:

- Required Marker Recall >= 90%
- Unit Accuracy >= 90%
- Reference Range Accuracy >= 85%
- Date Accuracy >= 90%
- False Positive Rate <= 5%

Als FAIL:

1. Geen volgende batch starten.
2. Parser/template fix uitvoeren.
3. Zelfde batch opnieuw valideren.

## Batch Resultaten

| batch | files | required marker recall | unit accuracy | reference range accuracy | date accuracy | false positive rate | unknown layout rate | verdict | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | 12 | - | - | - | - | - | - | pending | waiting for fixture_done + validation |

## Handmatige UI Check (minimaal 5 files)

Checklist per file:

- Kernmarkers aanwezig (Testosterone, Free T, Estradiol, SHBG, Hematocrit)
- Datum klopt
- Units/ranges plausibel
- Geen onzinmarkers

| batch | file_id | reviewer | date_checked | core_markers_ok | date_ok | units_ranges_ok | no_noise_markers | comments |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | 7ab811f33477 | - | - | - | - | - | - | - |
| B01 | 00619c887942 | - | - | - | - | - | - | - |
| B01 | d8eb57342e0e | - | - | - | - | - | - | - |
| B01 | 16067529a29f | - | - | - | - | - | - | - |
| B01 | 060fbad9a3d4 | - | - | - | - | - | - | - |
