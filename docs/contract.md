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
      "source": "rtcor",                  // "rtcor" | "nowcast" | "harmonie"
      "run": "2026-08-28T12:00:00Z",      // run-/referentietijd van de bron
      "header_len": 1342,                 // totale headerlengte in bytes (magic t/m JSON)
      "times": ["2026-08-28T12:00:00Z", "2026-08-28T12:05:00Z"]  // geldigheidstijden, volgorde = frame-volgorde in de chunk
    }
  ]
}
```

Tijdlijncompositie (client): verzamel alle frames uit alle chunks, sorteer op
tijd; bij meerdere frames voor dezelfde tijd wint regime-prioriteit
`rtcor > nowcast > harmonie` (gemeten verslaat voorspeld), daarbinnen de
recentste run. `header_len` bestaat zodat de client de chunk-header met één
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
    { "time": "2026-08-28T12:05:00Z", "offset": 18234, "len": 17102 }
  ],
  "dict": null              // gereserveerd: per-chunk zstd-dictionary (MIP-2 §5); v0 altijd null
}
```

- Velden zijn row-major, rij 0 = noordrand, kolom 0 = westrand.
- Elk frame decomprimeert naar exact `width × height` bytes.
- `quant` is de byte→mm/u-tabel: 256 entries; index 0 is altijd `0.0`
  (droog), index 255 is altijd `null` (no-data-masker). De client rekent
  uitsluitend via deze tabel (intensity meter én colormap-input), nooit via
  een eigen schaal. Exacte productiecurve volgt in T2 (MIP-2: stuksgewijs-log,
  vloer 0,01 mm/u); synthetische data mag elke geldige tabel gebruiken.
- `frames[].offset` is relatief aan het begin van de payload (byte `8+H`);
  `manifest.header_len == 8+H`.
- Progressief laden: frames zijn onafhankelijk; een client mag met
  Range-requests willekeurige subsets halen en decodeert per frame zodra de
  bytes binnen zijn.

## Wat de v0-onzekerheden zijn

Het exacte gedeelde grid (afmetingen/extent) wordt in T1/T2 bepaald; clients
mogen dus geen afmetingen aannemen. De kwantisatietabel idem. Het contract
zelf (layout, semantiek) is bevroren op versie 0; versiebump = nieuwe magic
niet nodig, `version`-veld leidt.
