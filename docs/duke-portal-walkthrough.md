# Duke Builder Portal — automated application walkthrough

How Claude fills a new-service application at builderportal.duke-energy.app
for a DUKE project. First proven live on 130 Dogwood Dr Cir (June 10 2026).

**Trigger:** Adam says "apply for Duke on <address>" (or clicks the ⚡ button
and asks). The ⚡ "Duke portal — new service application" button on the
project's Electric tab copies the fill payload (JSON, `lib/dukeWebApply.ts`
`dukeWebPayloadWithDirections`) to the clipboard and opens the portal — the
payload includes computed turn-by-turn Directions and the nearest cross
street (`lib/directions.ts`).

## Ground rules

- **Claude never enters the login password** (hard rule). Adam clicks
  Sign In — Chrome autofills. Note: Duke uses Microsoft B2C with PER-TAB
  sessionStorage tokens, so Adam must sign in IN the automation tab; a
  login in another tab does not carry over.
- **Final Submit is Adam's click.** Fill everything, stop at
  /service-request/request-summary, report the judgment calls.
- The Claude-in-Chrome content-script tools (screenshot/find/read_page)
  hit a "document_idle" bug on this machine — drive everything through
  `javascript_tool`. JS `.click()` works on this Angular SPA; popups
  (the Login button) are blocked for JS clicks, so login needs Adam anyway.

## Angular Material recipes

- Text input: set via native setter then dispatch `input` + `blur`:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)`
- mat-select: `el.click()` → wait ~450ms → click the `mat-option` whose
  text matches → wait ~250ms.
- Radio: click the `label` inside the `mat-radio-button`.
- Tiles (Request Type page): click the innermost element with the exact
  tile text, or its `[class*="card"]` ancestor.
- **mat-input-N ids are session-ordered — NEVER hardcode them.** Locate by
  the `mat-label` text inside the closest `mat-form-field`.
- Validation: `input.ng-invalid, mat-select.ng-invalid` lists what's missing;
  `mat-error` elements carry the message.

## The flow (Step 1/4 … 4/4)

1. `/submitted-requests` → "New Service Request". (A **Reuse** button exists
   on past requests — unexplored shortcut.)
2. **Business Information step1 + step2** — everything pre-filled from the
   portal profile (company, tax id, addresses, Adam's contact). Continue ×2.
3. **Service Address** (`/service-request/service-address`):
   - Zoning of Structure → `Residential` · Type of Structure → `Single Family`
   - Service Address / City / State (`Florida`) / Zip ← payload
   - Total Square Feet ← payload.sqft · Lot ← payload.lot
   - County ← payload.county · **Subdivision — MAX 25 CHARS** (trim; put the
     full name in Directions)
   - **Nearest Cross Street — REQUIRED** ← payload.crossStreet
   - Directions textarea (300 max) ← payload.directions
   - "Onsite contact same as submitter" checkbox → check.
4. **Request Type** (`/service-type/step1`): tile `Permanent - Overhead`
   (payload.serviceEntrance; Underground → `Permanent - Underground`).
5. **Request Information** (`/request-information/permanent-power-overhead`):
   - "OH lines attached to a Duke pole adjacent?" ← payload.ohLinesAdjacent
     (default `Unsure`; flag for Adam at review)
   - "Type of service required?" → `200 Amp` (payload.mainAmps)
   - Permit Number ← payload.permitNumber
   - "Electrician" is a click-to-expand SPAN → reveals First/Last/Phone →
     Dale / Nadboralski / (352) 492-3470 (payload.electrician).
6. **Structure information**: mat-selects Heat → `Electric`, A/C →
   `Central A/C (not Heat Pump)`, Water Heater → `Electric`, Cooking/Dryer →
   `Electric`; EVCC → `No`. Picking A/C + WH reveals REQUIRED **A/C Tonnage**
   (payload.acTons) and **Gallons** (payload.waterHeaterGallons).
7. **Summary** → verify Directions/tonnage/permit/electrician render, report
   to Adam with the judgment calls (cross street, OH-lines answer, heat type),
   Adam checks the attestation box and clicks **Submit**.

Editing from the summary walks FORWARD through the remaining steps — all
values are retained; just Continue back to the summary.
