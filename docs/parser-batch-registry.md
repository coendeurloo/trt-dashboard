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
| 7ab811f33477 | labcorp_scan_01 | B01 | webp_scan | labcorp | fixture_done | tests/parser-fixtures/drafts/B01/labcorp-scan-01 | cluster C1; draft ready; fixture populated |
| 00619c887942 | labcorp_scan_02 | B01 | webp_scan | labcorp | fixture_done | tests/parser-fixtures/drafts/B01/labcorp-scan-02 | cluster C1; draft ready; fixture populated |
| 4d4956f45995 | labcorp_scan_03 | B01 | webp_scan | labcorp | fixture_done | tests/parser-fixtures/drafts/B01/labcorp-scan-03 | cluster C1; draft ready; fixture populated |
| 9fc2aac3dfef | labcorp_scan_04 | B01 | webp_scan | labcorp | fixture_done | tests/parser-fixtures/drafts/B01/labcorp-scan-04 | cluster C1; draft ready; fixture populated |
| 21c90fc6457e | generic_scan_01 | B01 | jpg_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B01/generic-scan-01 | cluster C2; draft ready; fixture populated |
| 336cd63fa679 | generic_scan_02 | B01 | jpg_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B01/generic-scan-02 | cluster C2; draft ready; fixture populated |
| d8eb57342e0e | hormone_pdf_01 | B01 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B01/hormone-pdf-01 | cluster C3; draft ready; fixture populated |
| 16067529a29f | hormone_pdf_02 | B01 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B01/hormone-pdf-02 | cluster C3; draft ready; fixture populated |
| 27a7fdfcf13a | hormone_pdf_03 | B01 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B01/hormone-pdf-03 | cluster C3; draft ready; fixture populated |
| 060fbad9a3d4 | generic_pdf_01 | B01 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B01/generic-pdf-01 | cluster C4; draft ready; fixture populated |
| 6f659c1c16e5 | generic_pdf_02 | B01 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B01/generic-pdf-02 | cluster C4; skipped wegens onleesbare scan/OCR; opnieuw opnemen in volgende batch met betere bron |
| dc288dbc7ae8 | generic_pdf_03 | B01 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B01/generic-pdf-03 | cluster C4; draft ready; fixture populated |
| baef8db003b5 | female_profile_pdf_01 | B02 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B02/female-profile-pdf-01 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| c23c5d460166 | blood_history_pdf_01 | B02 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B02/blood-history-pdf-01 | cluster pending; draft ready; fixture populated |
| 57c3aef46baa | bw_excelmale_scan_01 | B02 | webp_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B02/bw-excelmale-scan-01 | cluster pending; draft ready; fixture populated |
| 130db5906564 | bw_excelmale_scan_02 | B02 | webp_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B02/bw-excelmale-scan-02 | cluster pending; draft ready; fixture populated |
| 5151b7d145b8 | bw_excelmale_scan_03 | B02 | webp_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B02/bw-excelmale-scan-03 | cluster pending; draft ready; fixture populated |
| a182f2a07f23 | jmh_scan_01 | B02 | webp_scan | unknown | fixture_done | tests/parser-fixtures/drafts/B02/jmh-scan-01 | cluster pending; draft ready; fixture populated |
| d7a418b3d2a1 | jmh_scan_02 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-02 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| 00f92a5fb77e | jmh_scan_03 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-03 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| 53711d841fc0 | jmh_scan_04 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-04 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| bf74b1b189c4 | jmh_scan_05 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-05 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| cf689dd6dd2c | jmh_scan_07 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-07 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| 621ce57c1666 | jmh_scan_08 | B02 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B02/jmh-scan-08 | auto-skip: onleesbare OCR in B02; betere bron nodig |
| 2bf4577ded0c | bloodtest_scan_01 | B03 | webp_scan | unknown | skipped | tests/parser-fixtures/drafts/B03/bloodtest-scan-01 | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 76019ff58188 | bloodwork_clean_pdf_01 | B03 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B03/bloodwork-clean-pdf-01 | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 77ea441d2a63 | cbc_template_pdf_01 | B03 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B03/cbc-template-pdf-01 | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 8b674a7192fa | kilpatrick_pdf_01 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/kilpatrick-pdf-01 | cluster pending; draft ready; fixture populated |
| d511d7bd5881 | labrapport_nl_230502 | B03 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B03/labrapport-nl-230502 | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 22806db4b140 | labrapport_nl_240319 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/labrapport-nl-240319 | cluster pending; draft ready; fixture populated |
| 80779a5f9c34 | labrapport_nl_240624 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/labrapport-nl-240624 | cluster pending; draft ready; fixture populated |
| 77131a06a5ca | labrapport_nl_240926 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/labrapport-nl-240926 | cluster pending; draft ready; fixture populated |
| 53dfb7ed1ada | labrapport_nl_241007 | B03 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B03/labrapport-nl-241007 | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 1e832a177201 | labrapport_nl_241007_recheck | B03 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B03/labrapport-nl-241007-recheck | auto-skip: onleesbare OCR in B03; betere bron nodig |
| 163b0a1bbfe6 | labrapport_nl_250131 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/labrapport-nl-250131 | cluster pending; draft ready; fixture populated |
| b649f902bc18 | labrapport_latvia_250812 | B03 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B03/labrapport-latvia-250812 | cluster pending; draft ready; fixture populated |
| 01b190915a84 | labrapport_nl_251112 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/labrapport-nl-251112 | auto-skip: onleesbare OCR in B04; betere bron nodig |
| c78c9c12d6b2 | labrapport_nl_260219 | B04 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B04/labrapport-nl-260219 | cluster pending; draft ready; fixture populated |
| 4eb2f67dd745 | labs_noname_pdf_01 | B04 | pdf_text | unknown | fixture_done | tests/parser-fixtures/drafts/B04/labs-noname-pdf-01 | cluster pending; draft ready; fixture populated |
| 6521da11e444 | ricardo_pdf_01 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/ricardo-pdf-01 | auto-skip: onleesbare OCR in B04; betere bron nodig |
| 65a54c693caa | sep_bloodwork_pdf_01 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/sep-bloodwork-pdf-01 | auto-skip: onleesbare OCR in B04; betere bron nodig |
| 5dc149148775 | tb5of6_bloodwork_pdf_01 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/tb5of6-bloodwork-pdf-01 | auto-skip: onleesbare OCR in B04; betere bron nodig |
| 49df0537c0a0 | testosterone_sample_pdf_01 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/testosterone-sample-pdf-01 | auto-skip: onleesbare OCR in B04; betere bron nodig |
| ab75f42ab7b8 | z384_pdf_01 | B04 | pdf_text | unknown | skipped | tests/parser-fixtures/drafts/B04/z384-pdf-01 | auto-skip: onleesbare OCR in B04; betere bron nodig |












