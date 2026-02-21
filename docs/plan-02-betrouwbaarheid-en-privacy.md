# Plan 02 - Betrouwbaarheid en Privacy (1-3 dagen)

Doel: de AI-flow veilig en transparant maken, en parserkwaliteit structureel verhogen.

## 1) Anonimisatie-laag voor AI payloads
- Wat is het?
  Een vaste stap die persoonsgegevens verwijdert/vervangt vóór een externe API-call.
- Waarom?
  Beschermt gevoelige medische data.
- Hoe pak ik dit aan?
  1. Maak een centrale functie `sanitizeForAI()`.
  2. Verwijder: naam, adres, geboortedatum, IDs, contactgegevens.
  3. Laat vrije tekst (symptomen/notities) standaard uit.
  4. Log alleen veilige metadata (bijv. aantal markers, route, confidence).

## 2) Toestemmingsscherm voor AI (pre-flight)
- Wat is het?
  Een kort scherm vóór AI-run: "wat sturen we precies?" + aan/uit keuzes.
- Waarom?
  Duidelijk en controleerbaar voor de gebruiker.
- Hoe pak ik dit aan?
  1. Toon payload-samenvatting (zonder ruwe data dump).
  2. Toggles: parser rescue, analyse, symptomen/notities meesturen.
  3. Knoppen: "Alleen deze keer", "Altijd toestaan", "Niet toestaan".

## 3) Rate limit en budget persistent maken
- Wat is het?
  Limits opslaan buiten geheugen (Redis/KV), zodat Vercel schaalbaar blijft.
- Waarom?
  In-memory counters zijn niet betrouwbaar bij serverless herstarts.
- Hoe pak ik dit aan?
  1. Vervang in-memory maps door Redis/KV counters met TTL.
  2. Houd aparte limieten voor parser (Gemini) en analyse (Claude).
  3. Toon nette foutmelding met retry-moment.

## 4) Parser fixture testset (privacy-safe)
- Wat is het?
  Een vaste map met voorbeeld-PDF's + verwacht JSON-resultaat.
- Waarom?
  Nieuwe layout regressies snel zien.
- Hoe pak ik dit aan?
  1. Map `tests/parser-fixtures/` aanmaken.
  2. Alleen synthetic of geanonimiseerde PDFs gebruiken.
  3. Per PDF expected JSON + minimale kwaliteitsdrempel.
  4. Test faalt als kritieke markers ontbreken.

## 5) Betere fout- en voortgangsfeedback
- Wat is het?
  Stap-voor-stap status tijdens verwerking.
- Waarom?
  Minder onzekerheid bij trage/lastige PDFs.
- Hoe pak ik dit aan?
  1. Statuslabels: tekstlaag -> OCR -> AI rescue.
  2. Voeg "opnieuw proberen" en "handmatig invullen" direct toe bij fout.

## Klaar-check (acceptatie)
- Payload gaat geanonimiseerd naar AI.
- Consent-flow is verplicht en zichtbaar.
- Rate limits blijven correct bij meerdere instanties.
- Parser fixture-tests draaien in CI.
- Upload feedback is duidelijk in elke stap.

