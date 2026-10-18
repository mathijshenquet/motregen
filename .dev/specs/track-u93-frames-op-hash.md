# U93 — Frames hergebruiken op inhoudshash in plaats van chunk-URL

Eigenaar: worker `u93-frames-op-hash` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch `track/u93-frames-op-hash`
in deze worktree, vanaf origin/main. Track-LOG `.dev/tracks/u93-frames-op-hash/LOG.md` (lokaal, nooit committen;
append-only, tijd uit `date`, lokaal = UTC+2). Commit en push elke 15–20 minuten; open na de eerste samenhangende
commit een draft-PR. **Geen prod-acties.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom (gemeten door de orkestrator, 2026-10-18 04:26 UTC)

De radarchunk `rtcor-<tijd>-h3-g….mrf` bevat de laatste 3 uur (36 frames, nu 1,93 MB) en krijgt elke 5 minuten een
nieuwe naam. De client bewaart frames onder `url#index` (`web/src/core/mrf.ts`, `frameKey`; ook de motion-cache en
de IndexedDB-cache `range-byte-cache.ts` zijn op URL geordend). Elke verversing haalt dus alle 36 frames opnieuw op
en decodeert ze opnieuw, terwijl er maar één nieuw is: tussen de chunks van 04:15 en 04:10 waren 35/35 gedeelde
frames byte-gelijk (beeld), 34/35 motion-annexen ook (alleen het oudste frame verliest zijn annex); 04:15 tegen
04:00: 33/33. mrf is intra-only (elk frame een losse zstd-member, `docs/mrf.md`), dus een frame is los op te halen.

PO-besluit 2026-10-18: frames krijgen een inhoudshash in de header en de client bewaart ze onder die hash, in het
geheugen én in de lokale (IndexedDB-)cache. Doel: per radarverversing ±60 kB (header 6,4 kB + één frame ±52 kB +
motion ±1 kB) in plaats van de hele chunk; ook wie de app na een tijdje heropent haalt alleen de nieuwe frames op.

## Wat je bouwt

1. **Ingest/mrf**: elke frame-entry in de header krijgt `hash`: een hex-string van 128 bits over de gecomprimeerde
   member-bytes zoals ze in het bestand staan (dus wat over de lijn gaat). Een motion-member krijgt ook een eigen
   `hash`. Algoritme: BLAKE3 ingekort tot 128 bits, of motiveer in de LOG een betere keuze; geen eigen hashcode.
   Verhoog `CHUNK_FORMAT_GENERATION` in `crates/ingest/src/pipeline.rs` (de bytes veranderen; zie `docs/serving.md`).
   `mrf inspect` toont de hash. Lezers moeten headers zonder hash blijven accepteren.
2. **Client**: sleutel decoded frames, lopende decodes/fetches en motions op inhoud wanneer de header een hash heeft:
   `<generatiesuffix -g… uit de chunknaam>:<hash>` (het gedecodeerde resultaat hangt ook af van grid, kwantisatie en
   pred, en die zitten in die suffix). Zonder hash blijft `url#index` gelden. Bij het ophalen van een chunk met een
   nieuwe URL: lees de header, sla frames over waarvan de hash al in het geheugen of in IndexedDB staat, en vraag
   alleen de ontbrekende frames op (aaneengesloten ontbrekende frames mogen in één Range, zoals nu).
3. **IndexedDB**: bewaar gecomprimeerde member-bytes ook onder hun hash, zodat een koude start na heropenen de oude
   frames lokaal vindt. Houd de bestaande opruimregels/limieten van `range-byte-cache.ts` in stand; ruim op hash-
   entries op zoals nu op URL-entries.
4. **Documentatie**: `docs/mrf.md` (veld `hash`, wat erover gehasht wordt, compatibiliteit) en `docs/serving.md`
   (hergebruik over chunk-URL's heen).
5. **Changelog**: `changes/pending/<slug>.md`, kind `beter`, 1–2 zinnen voor gewone gebruikers (de app gebruikt veel
   minder data terwijl hij openstaat).

## Meten (verplicht, in de LOG met repro-commando)

Toon in Chromium (Playwright, netwerkverkeer via CDP of `PerformanceResourceTiming`) de overgedragen bytes voor één
manifestverversing waarin alleen de radarchunk een nieuwe naam krijgt met één nieuw frame, vóór (origin/main) en na
deze branch. Gebruik realistische frames: bijvoorbeeld twee opeenvolgende chunks die je met de ingest/encoder uit
dezelfde bronframes schrijft, of een kleine lokale dataserver naar het voorbeeld van `web/scripts/manifest-overlay.mjs`.
Meet ook een koude start na herladen (IndexedDB gevuld, nieuwe radar-URL). Verwachting: in de orde van 60 kB in plaats
van de hele chunk; wijk je duidelijk af, zoek uit waarom vóór je "klaar" meldt.

## Gate voor "klaar"

`cargo test -p mrf` en de ingest-crate, `cargo clippy --workspace -- -D warnings`, `cargo fmt --check`; web typecheck
en de unit-tests die je raakt (in elk geval mrf/frame-cache/range-byte-cache, plus een nieuwe test "een hernoemde chunk
hergebruikt frames op hash, ook uit IndexedDB"); de e2e-specs die je raakt alleen met `--project desktop` via
`pnpm e2e e2e/<naam>.spec.ts --project desktop`. Elk met een letterlijke exitstatus (`; echo "EXIT: $?"`, nooit achter
een pipe). De NixOS-VM-test alleen als je Nix raakt.

Meld daarna in één bericht: de branch-head, de PR-link, de gemeten bytes per verversing en bij koude start (vóór/na),
en wat open is voor de PO.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
