# Parser Batch Registry

Doel: voorkomen dat dezelfde bronfile meerdere keren in verschillende batches wordt gebruikt.

## Regels

1. `file_id` is de eerste 12 tekens van de SHA-256 hash van de lokale bronfile.
2. Echte bestandsnamen blijven buiten git; alleen neutrale labels staan in deze registry.
3. Dedupe: een `file_id` mag niet opnieuw voorkomen in een volgende batch, behalve als de oude regel `status=skipped` heeft met reden in `notes`.
4. Status-flow: `selected -> clustered -> templated -> fixture_done -> validated` (of `skipped`).
5. Batch-grootte default: 12 files.

## Status betekenissen

- `selected`: gekozen voor batch, nog niet geclusterd.
- `clustered`: layout-cluster + vendorlabel gezet.
- `templated`: template-route/heuristiek keuze vastgelegd.
- `fixture_done`: geanonimiseerde fixture + expected JSON gemaakt.
- `validated`: automatische tests + handmatige checks afgerond.
- `skipped`: bewust niet gebruikt, met reden in `notes`.

## Registry Entries

| file_id | label | batch | source_type | vendor | status | fixture_path | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7ab811f33477 | labcorp_scan_01 | B01 | webp_scan | labcorp | templated | tests/parser-fixtures/drafts/B01/labcorp-scan-01 | cluster C1; draft ready |
| 00619c887942 | labcorp_scan_02 | B01 | webp_scan | labcorp | templated | tests/parser-fixtures/drafts/B01/labcorp-scan-02 | cluster C1; draft ready |
| 4d4956f45995 | labcorp_scan_03 | B01 | webp_scan | labcorp | templated | tests/parser-fixtures/drafts/B01/labcorp-scan-03 | cluster C1; draft ready |
| 9fc2aac3dfef | labcorp_scan_04 | B01 | webp_scan | labcorp | templated | tests/parser-fixtures/drafts/B01/labcorp-scan-04 | cluster C1; draft ready |
| 21c90fc6457e | generic_scan_01 | B01 | jpg_scan | unknown | templated | tests/parser-fixtures/drafts/B01/generic-scan-01 | cluster C2; draft ready |
| 336cd63fa679 | generic_scan_02 | B01 | jpg_scan | unknown | templated | tests/parser-fixtures/drafts/B01/generic-scan-02 | cluster C2; draft ready |
| d8eb57342e0e | hormone_pdf_01 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/hormone-pdf-01 | cluster C3; draft ready |
| 16067529a29f | hormone_pdf_02 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/hormone-pdf-02 | cluster C3; draft ready |
| 27a7fdfcf13a | hormone_pdf_03 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/hormone-pdf-03 | cluster C3; draft ready |
| 060fbad9a3d4 | generic_pdf_01 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/generic-pdf-01 | cluster C4; draft ready |
| 6f659c1c16e5 | generic_pdf_02 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/generic-pdf-02 | cluster C4; draft ready |
| dc288dbc7ae8 | generic_pdf_03 | B01 | pdf_text | unknown | templated | tests/parser-fixtures/drafts/B01/generic-pdf-03 | cluster C4; draft ready |

