# Het data-contract: manifest v0 + mrf v0

Status: v0, vastgepind 2026-08-28 door de orchestrator zodat T1/T2 (ingest) en
T3 (frontend) parallel kunnen bouwen. Wijzigingen alleen via de orchestrator
(en bij materiële wijziging: changelog-regel in MIP-2). De frontend hardcodet
níéts van het grid of de kwantisatie — alles reist mee in manifest en header.

## Manifest (`data/manifest.json`)

Het enige bestand dat de client pollt. JSON:

```jsonc
{
  "version": 0,
  "generated": "2026-08-28T14:20:00Z",   // wanneer de ingest dit schreef
  "now": "2026-08-28T14:20:00Z",         // scheidslijn gemeten/voorspeld
  "chunks": [
    {
      "url": "chunks/rtcor-20260828T1200.mrf",  // relatief aan het manifest
      "source": "rtcor",                  // "rtcor" | "nowcast" | "seamless" | "harmonie" | "uv"
      "field": "rain_rate",               // optioneel; ontbreekt ⇒ "rain_rate". Zie veldenlijst onderaan
      "run": "2026-08-28T12:00:00Z",      // run-/referentietijd van de bron
      "header_len": 1342,                 // totale headerlengte in bytes (magic t/m JSON)
      "times": ["2026-08-28T12:00:00Z", "2026-08-28T12:05:00Z"]  // geldigheidstijden, volgorde = frame-volgorde in de chunk
    }
  ]
}
```

Tijdlijncompositie (client): per veld; verzamel alle frames uit alle chunks
van dat veld, sorteer op tijd; bij meerdere frames voor dezelfde tijd wint regime-prioriteit
`rtcor > nowcast > seamless > harmonie` (gemeten verslaat voorspeld, blend
verslaat ruw model), daarbinnen de recentste run. Voor t < nu tonen clients
uitsluitend observaties (MIP-4 ronde 4). `header_len` bestaat zodat de client de chunk-header met één
exacte Range-request kan halen.

## mrf-chunk (binair, little-endian)

```text
offset  grootte  veld
0       4        magic: ASCII "mrf0"
4       4        u32 LE: lengte H van de JSON-header die volgt
8       H        JSON-header (UTF-8)
8+H     …        payload: aaneengesloten frames, elk een onafhankelijk zstd-member
```

JSON-header:

```jsonc
{
  "version": 0,
  "field": "rain_rate",     // optioneel; ontbreekt ⇒ "rain_rate". Ook: "radiation" (W/m²)
  "grid": {
    "crs": "EPSG:3857",
    "x0": 364958.0,       // web-mercator x van de WESTrand (linkerrand cel 0)
    "y0": 7045000.0,      // web-mercator y van de NOORDrand (bovenrand rij 0)
    "dx": 1000.0,         // celgrootte in m, oostwaarts
    "dy": -1000.0,        // celgrootte in m, negatief = rijen lopen naar het zuiden
    "width": 700,
    "height": 765
  },
  "quant": [0.0, 0.01, /* … 256 entries … */, null],
  "source": "rtcor",
  "run": "2026-08-28T12:00:00Z",
  "frames": [
    { "time": "2026-08-28T12:00:00Z", "offset": 0,    "len": 18234 },
    { "time": "2026-08-28T12:05:00Z", "offset": 18234, "len": 17102,
      "motion": { "offset": 35336, "len": 812 } }   // optioneel (MIP-5)
  ],
  "motion_grid": { "bw": 21, "bh": 22 },  // optioneel; blokgrid van de motion-annexen
  "dict": null              // gereserveerd: per-chunk zstd-dictionary (MIP-2 §5); v0 altijd null
}
```

- Velden zijn row-major, rij 0 = noordrand, kolom 0 = westrand.
- Elk frame decomprimeert naar exact `width × height` bytes.
- `quant` is de byte→waarde-tabel in de eenheid van het veld: 256 entries;
  index 255 is altijd `null` (no-data-masker). Voor `rain_rate` en
  `radiation` is index 0 altijd `0.0` (droog resp. donker); voor velden met
  een signed bereik (temperatuur, wind) is index 0 gewoon de onderkant van
  het bereik en mag de tabel negatieve waarden bevatten. Clients en encoders
  valideren dus per veld, niet generiek `quant[0] == 0`. De client rekent
  uitsluitend via deze tabel (intensity meter én colormap-input), nooit via
  een eigen schaal. Exacte productiecurve volgt in T2 (MIP-2: stuksgewijs-log,
  vloer 0,01 mm/u); synthetische data mag elke geldige tabel gebruiken.
- `frames[].offset` is relatief aan het begin van de payload (byte `8+H`);
  `manifest.header_len == 8+H`.
- Progressief laden: frames zijn onafhankelijk; een client mag met
  Range-requests willekeurige subsets halen en decodeert per frame zodra de
  bytes binnen zijn.
- **Motion-annex (MIP-5, optioneel).** Een frame mag een `motion`-verwijzing
  dragen (offset/len relatief aan de payload-start, eigen onafhankelijk
  zstd-member): het bewegingsveld van het VORIGE frame in de chunk naar dit
  frame, op het `motion_grid`-blokgrid (row-major, zelfde oriëntatie als het
  veld). Payload na decompressie: `bw × bh` i8-paren (u,v) in stappen van
  0,1 gridcel per minuut (+u = oostwaarts, +v = zuidwaarts, conform dy<0);
  −128 = no-data. Clients zonder motion-support of frames zonder annex
  vallen terug op crossfade — de annex is puur een visuele verrijking.

## Wat de v0-onzekerheden zijn

Het exacte gedeelde grid (afmetingen/extent) wordt in T1/T2 bepaald; clients
mogen dus geen afmetingen aannemen. De kwantisatietabel idem. Het contract
zelf (layout, semantiek) is bevroren op versie 0; versiebump = nieuwe magic
niet nodig, `version`-veld leidt.

## Velden

| field | eenheid | betekenis |
| --- | --- | --- |
| `rain_rate` | mm/u | neerslagintensiteit (default; kaart + scrubber) |
| `radiation` | W/m² | globale straling (uurtabel/zon) |
| `temp_c` | °C | 2m-temperatuur |
| `feels_like_c` | °C | gevoelstemperatuur (serverside afgeleid) |
| `wind_u_ms` | m/s | 10m-wind, oostwaartse component |
| `wind_v_ms` | m/s | 10m-wind, noordwaartse component |
| `uv` | UV-index | zonkracht (cloud-modified) |
| `rel_humidity` | % | 2m relatieve luchtvochtigheid |
| `cloud_frac` | % | totale bewolkingsgraad (alleen voor pictogram-afleiding; nooit als kaartlaag — MIP-4 ronde 3) |

`wind_u_ms`/`wind_v_ms` worden altijd als paar gepubliceerd met identiek
grid, identieke tijden en gelijke frame-volgorde, zodat een client ze per
frame kan zippen tot vectoren.

## Changelog

- 2026-08-28: v0 vastgepind.
- 2026-08-28: additief amendement (PO-verzoek zonactiviteit): optionele
  `field`-sleutel op manifest-chunk en mrf-header, default `"rain_rate"`;
  tweede veld `"radiation"` (W/m²) voor de per-uur zon/forecast-tabel.
  Bestaande implementaties zonder `field` blijven geldig.
- 2026-08-28: `source` "seamless" toegevoegd (PO: KNMI's seamless
  nowcast⊕NWP-blend tot +6 u vult de naad tussen nowcast en model);
  regime-prioriteit uitgebreid en verleden=alleen-observaties-regel
  gecontractualiseerd.
- 2026-08-28: motion-annex + `motion_grid` toegevoegd (MIP-5 accepted):
  optioneel bewegingsveld per frame (i8-paren, 0,1 cel/min) voor
  flow-tweening; crossfade blijft de fallback. Additief.
- 2026-08-28: velden `rel_humidity` en `cloud_frac` toegevoegd (MIP-4
  ronde 4: rijkere uurtabel met pictogram). Additief.
- 2026-08-28: `source`-enum uitgebreid met `"uv"` (cloud-modified UV
  index-dataset) — lost de T2b-WALL "contract mist UV-source" op; de door
  T2b gebruikte waarde is hiermee gelegitimeerd. NB (T2b-observatie): de
  live UV-file eindigt om 20:45 UTC waar de catalogus 21:45 zegt.
- 2026-08-28: veldenlijst uitgebreid (PO: wind-particles, temp op kaart, UV):
  `temp_c`, `feels_like_c`, `wind_u_ms`/`wind_v_ms` (paar-regel), `uv`.
  Quant-regel versoepeld: alleen index 255 = null is universeel; `quant[0]
  == 0.0` geldt alleen voor rain_rate/radiation (signed velden toegestaan).
  Bestaande rain/radiation-chunks blijven byte-identiek geldig.
