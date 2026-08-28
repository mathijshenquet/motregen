# Track T2c — ruimer grid + humidity/bewolking (gpt-5.6-terra)

Read first: `AGENTS.md`, MIP-4 changelog (ronde-4-amendement),
`docs/contract.md` (nieuwe velden `rel_humidity`, `cloud_frac`),
`docs/grid.md`, `docs/arome.md`, `docs/fields.md`,
`.dev/tracks/t2b-fields/LOG.md` (volg exact de daar gevestigde patronen).
Your LOG: `.dev/tracks/t2c-grid-en-velden/LOG.md` — append-only,
timestamped, COMMITTED met je werk (projectconventie; overrulet de globale
nooit-committen-regel). Branch: `track/t2c-grid-en-velden`. Keys in `.env`.

Dit is bewust een strak, patroon-volgend track: T1/T2/T2b hebben alle
ontwerpkeuzes al gemaakt. Wijk niet af van die patronen; twijfel = WALL in
je LOG in plaats van improviseren.

## Taken

1. **Gedeeld grid ruimer.** PO: het huidige grid knipt te strak om NL.
   Bepaal uit de radar-composietmetadata welk deel van het 700×765-brongrid
   nu buiten ons gedeelde grid valt, en vergroot het gedeelde grid zó dat
   alle bruikbare radardata (incl. kust/Noordzee/randen BE-DE) meekomt met
   een bescheiden extra marge. Documenteer oude vs nieuwe extent en de
   bytes-impact per chunktype in `docs/grid.md`. De frontend leest alles uit
   headers/manifest — geen web-wijzigingen nodig. Regenereer de
   reprojectie-indexmaps; de bestaande grid-invarianttests (hoekcoördinaten,
   nul buiten-bereik) moeten mee-migreren en green blijven.
2. **Veld `rel_humidity`.** 2m relatieve vochtigheid uit AROME (T2b noteerde
   de beschikbare vocht-parameters in docs/arome.md — gebruik die; als er
   alleen dauwpunt is: standaard Magnus-conversie, formule + bron in
   docs/fields.md). Kwantisatie 0–100% lineair; gereduceerde resolutie zoals
   de andere uurvelden.
3. **Veld `cloud_frac`.** Totale bewolkingsgraad (%) uit AROME; zelfde
   cadans/resolutie. LET OP contract/MIP-4: dit veld is uitsluitend
   input voor pictogram-afleiding in de frontend — geen andere semantiek
   toevoegen.
4. **Python-cross-checks** voor beide nieuwe velden (spot_check-patroon van
   T2b), elementgewijs binnen één kwantisatiestap, en de manifestvalidator
   uitbreiden met de twee velden.
5. **E2e-receipt**: daemon-run die het VERGROTE grid en alle negen velden
   publiceert; `mrf inspect` per nieuw veld; manifest-validatie exit 0.

## Out of scope

Frontend (`web/`), kaartframe (T3e), pictogram-afleiding zelf, deploy.
`docs/contract.md` niet wijzigen.

## Gates & receipts

Workspace `cargo fmt --check` / `clippy --all-targets -- -D warnings` /
`cargo test` green; receipts SYNCHROON (pipefail) met repro's in je LOG;
onafhankelijke re-run volgt voor merge. Detached/stille output telt niet
als receipt.
