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
| B01 | 11 | 100.0% (62/62) | n/a (0 expected units) | n/a (0 expected ranges) | n/a (datum niet verplicht in B01) | 0.0% (0/121) | 0.0% (0/11) | PASS | `generic_pdf_02` is bewust `skipped` door onleesbare scan/OCR; opnieuw opnemen met betere bron in B02 |
| B02 | 5 | 100.0% (17/17) | n/a (0 expected units) | n/a (0 expected ranges) | n/a (datum niet verplicht in B02) | 0.0% (0/33) | 0.0% (0/5) | PASS* | 7/12 items auto-`skipped` wegens onleesbare OCR; opnieuw testen met betere scans/PDF-bronnen |
| B03 | 6 | 100.0% (29/29) | n/a (0 expected units) | n/a (0 expected ranges) | n/a (datum niet verplicht in B03) | 0.0% (0/150) | 0.0% (0/6) | PASS* | 6/12 items auto-`skipped` wegens onleesbare OCR of te weinig bruikbare tekst; betere bronkwaliteit nodig |
| B04 | 2 | 100.0% (6/6) | n/a (0 expected units) | n/a (0 expected ranges) | n/a (datum niet verplicht in B04) | 0.0% (0/26) | 0.0% (0/2) | PASS* | 6/8 items auto-`skipped` wegens onleesbare OCR of onvoldoende bruikbare tekst |

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
| B01 | 27a7fdfcf13a | owner | 2026-02-21 | ja | n/a | ja | ja | onderaan staat een herhaalde marker-tabel die als voorkeur-bron kan dienen |

## Owner Handcheck Notes (2026-02-21)

- Datum is nooit verplicht voor B01.
- `generic-pdf-01`: meerdere datums + dubbele markers in hetzelfde rapport.
- `generic-pdf-02`: scan van lage kwaliteit.
- `hormone-pdf-01`: extra tekst na Androstenedione moet worden genegeerd.
- `hormone-pdf-02`: veel tekst/grafieken na TPOab moeten worden genegeerd.
- `hormone-pdf-03`: markerlijst volgens owner inhoudelijk juist; onderaan staat een nette herhaalde tabel.
