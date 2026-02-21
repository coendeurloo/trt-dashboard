# Plan 01 - Quick Wins (0-1 dag)

Doel: meteen de grootste privacy- en duidelijkheidsrisico's verlagen zonder grote verbouwing.

## 1) Externe AI alleen na expliciete toestemming
- Wat is het?
  Een harde "stop" zodat data nooit automatisch naar externe AI gaat zonder toestemming.
- Waarom?
  Dit is de belangrijkste privacy-belofte van LabTracker.
- Hoe pak ik dit aan?
  1. Voeg een instelling toe: `aiExternalConsent`.
  2. Zet deze standaard op `false`.
  3. Blokkeer AI-calls in parser en analyse als die `false` is.
  4. Toon een duidelijke melding: "AI staat uit totdat je toestemming geeft."

## 2) Parser debug uit voor normale gebruikers
- Wat is het?
  De interne debug-opties niet tonen in productie.
- Waarom?
  Voorkomt verwarring en verkeerde instellingen.
- Hoe pak ik dit aan?
  1. Gebruik `VITE_ENABLE_PARSER_DEBUG` als echte UI-gate.
  2. In productie standaard uit.
  3. Alleen zichtbaar maken voor developer/test builds.

## 3) "Onbekend format" foutstatus toevoegen
- Wat is het?
  Een aparte foutmelding voor nieuwe/ongekende PDF-layouts.
- Waarom?
  Gebruiker snapt nu sneller wat er mis is en wat de volgende stap is.
- Hoe pak ik dit aan?
  1. Voeg warning code toe: `PDF_UNKNOWN_LAYOUT`.
  2. Trigger bij lage marker count + lage confidence.
  3. Toon 3 knoppen: handmatig invullen, OCR opnieuw, geanonimiseerde feedback sturen.

## 4) Privacy copy rechtzetten
- Wat is het?
  Teksten in de UI laten kloppen met echt gedrag.
- Waarom?
  Vertrouwen: geen misleidende claims.
- Hoe pak ik dit aan?
  1. Vervang "alles blijft lokaal" door "lokaal standaard, extern alleen met toestemming".
  2. Voeg bij AI-knoppen korte uitleg toe over datadeling.

## 5) Config/documentatie opschonen
- Wat is het?
  `.env.example` en README laten aansluiten op echte benodigde variabelen.
- Waarom?
  Minder deploy-fouten.
- Hoe pak ik dit aan?
  1. Vul benodigde server-keys aan in voorbeeldbestand.
  2. Leg uit welke keys server-only zijn en welke client-side zijn.

## Klaar-check (acceptatie)
- AI-call start niet zonder toestemming.
- Debug-opties zijn weg in productie.
- Onbekend format geeft duidelijke vervolgstappen.
- UI privacytekst is consistent.
- Documentatie klopt met Vercel setup.

