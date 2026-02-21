# Plan 03 - Schaalbaarheid en Productvolwassenheid (later)

Doel: LabTracker robuust maken voor veel verschillende US-lab PDF's, meer gebruikers en betaalde AI-features, zonder privacy-belofte te breken.

## 1) Parser-architectuur voor nieuwe US layouts
- Wat is het?
  Een vaste volgorde: template parser -> slimme heuristiek -> AI fallback (alleen met consent).
- Waarom?
  Nieuwe lab-layouts blijven komen; een duidelijke strategie voorkomt fragiele "if-else" groei.
- Hoe pak ik dit aan?
  1. Introduceer `ParseStrategy` met 3 routes: `template`, `heuristic`, `ai_fallback`.
  2. Maak een `layoutFingerprint` (bijv. kopregels, kolomtitels, paginapatroon) zonder persoonsgegevens.
  3. Laat de parser altijd een `ParseResult` teruggeven met: `status`, `confidence`, `missingFields`, `strategyUsed`.

## 2) Unknown-layout detectie + leerlus
- Wat is het?
  Expliciet herkennen wanneer een PDF niet betrouwbaar is geparsed, plus een veilige feedbacklus.
- Waarom?
  Je wilt snel zien welke nieuwe formats misgaan en gericht verbeteren.
- Hoe pak ik dit aan?
  1. Markeer `unknown_layout` bij lage confidence of te weinig markers.
  2. Toon gebruiker 2 directe opties: "Handmatig corrigeren" of "Geanonimiseerde parser-feedback delen".
  3. Sla alleen minimale debug-data op (fingerprint, foutcode, ontbrekende velden), geen ruwe lab-PDF.

## 3) Datamodel normalisatie en unit-conversie
- Wat is het?
  Eén interne standaard voor markers en units, los van bronlab-notatie.
- Waarom?
  Trends worden betrouwbaarder als "Total Testosterone", "Testosterone Total" en varianten samenkomen.
- Hoe pak ik dit aan?
  1. Voeg `canonicalMarkerId` toe naast originele markernaam.
  2. Definieer toegestane units per marker + conversieregels.
  3. Flag records als `needs_review` als unit ontbreekt of conversie onzeker is.

## 4) Privacy-veilige observability
- Wat is het?
  Inzicht in fouten/prestaties zonder gevoelige gezondheidsdata te loggen.
- Waarom?
  Je moet problemen kunnen oplossen zonder privacy-risico.
- Hoe pak ik dit aan?
  1. Gebruik event logging met anonieme velden: route, fase, duur, foutcode.
  2. Voeg `traceId` toe zodat support een fout kan terugvinden zonder inhoud te zien.
  3. Blokkeer logging van markerwaarden, namen en ruwe PDF-tekst.

## 5) Performance hardening voor grote PDF's
- Wat is het?
  Grote uploads stabiel verwerken zonder vastlopende UI.
- Waarom?
  Bodybuilding/TRT gebruikers uploaden vaak meerpagina-rapporten.
- Hoe pak ik dit aan?
  1. Houd `pdfjs` en OCR lazy-loaded.
  2. Verwerk pagina's in chunks (bijv. 2-3 tegelijk) met voortgangsbalk.
  3. Stop netjes bij timeout en bied "ga verder met OCR" of "alleen handmatige invoer" aan.

## 6) UX-volwassenheid: mobiel + basis-toegankelijkheid
- Wat is het?
  Kernflow goed bruikbaar op telefoon en voor keyboard-gebruikers.
- Waarom?
  Veel gebruikers openen labresultaten mobiel; basis-a11y voorkomt frustratie.
- Hoe pak ik dit aan?
  1. Zorg dat upload, review en trends werken op kleine schermen.
  2. Verbeter focus states, labels, foutmeldingen en contrast.
  3. Voeg duidelijke statuslabels toe per stap (upload, extractie, review, trends).

## 7) Betaalde AI-feature veilig activeren
- Wat is het?
  Stripe-paywall en feature flags server-side, niet alleen in de client.
- Waarom?
  Voorkomt bypass en onverwachte kosten.
- Hoe pak ik dit aan?
  1. Controleer entitlement op server bij elke AI-call.
  2. Koppel limieten per gebruiker/plan.
  3. Geef heldere melding bij limiet of geen toegang.

## Klaar-check (acceptatie)
- Nieuwe/ongekende layouts krijgen voorspelbaar `unknown_layout` gedrag.
- Parser heeft meetbare kwaliteitsmetriek per strategie.
- Trends gebruiken genormaliseerde markers en consistente units.
- Logs bevatten geen gezondheidsinhoud of persoonsgegevens.
- Grote PDF's blijven responsief met duidelijke voortgang.
- Mobiele flow en keyboard-bediening zijn bruikbaar.
- AI-betaalfeature kan niet client-side worden omzeild.
