# KNMI-radarproducten in HDF5

Waargenomen op 28 augustus 2026 met
`RAD_NL25_RAC_RT_202608281540.h5` en
`RAD_NL25_RAC_FM_202608281540.h5`.

## Gemeenschappelijke structuur

- `geographic` beschrijft een 700 × 765-raster, pixels van `(1,−1) km`,
  `geo_pixel_def=LU` en de stereografische projectie uit `docs/grid.md`.
- `overview` bevat begin/einde in `DD-MMM-JJJJ;uu:mm:ss.sss`, het aantal
  `imageN`-groepen en de productnaam.
- Een neerslagbeeld staat in `imageN/image_data`: row-major `uint16`,
  display-origin `UL`, vorm `(765,700)`.
- `imageN/calibration` publiceert
  `GEO=0.010000*PV+0.000000`, missing `65534` en outside `65535`.
  `PV` is een accumulatie over vijf minuten in mm. Productiewaarden worden
  daarom `(0,01 × PV) × 12` mm/u; beide maskers worden no-data.

## RTCOR (`nl_rdr_data_rtcor_5m` 1.0)

Een bestand bevat drie beeldgroepen, hoewel maar één daarvan regen is:

| groep | `image_geo_parameter` | datatype |
| --- | --- | --- |
| `image1` | `PRECIP_[MM]` | `uint16` |
| `image2` | `QUALITY_[-]` | `uint8` |
| `image3` | `ADJUSTMENT_FACTOR_[DB]` | `uint8` |

De decoder selecteert dus op parameter en niet alleen op
`number_image_groups`. De geldigheidstijd is `overview/product_datetime_end`;
start en einde liggen vijf minuten uiteen. Buiten het radarcomposiet staat
in het regenbeeld waarde `65535`.

## Nowcast (`radar_forecast` 2.0)

Een bestand bevat 25 neerslaggroepen `image1`…`image25`, geldig op +0, +5,
… +120 minuten. Iedere groep heeft `image_datetime_valid`; de run is
`overview/product_datetime_start`. De calibratie en eenheid zijn identiek
aan RTCOR. In het waargenomen bestand gebruikt pySTEPS nul buiten de
geëxtrapoleerde neerslag en kwamen de twee maskercodes niet voor.

## Uitvoerbare referentie en fixtures

`spec/radar_reference.py export` decodeert hetzelfde pad onafhankelijk met
h5py. De Rust-integratietests vergelijken metadata, tijden en iedere
float32-celwaarde, inclusief NaN-maskers. `rtcor-mini.h5` en
`nowcast-mini.h5` zijn 4 × 5-crops van de genoemde live bestanden; ze houden
de echte groepen, attributentypen en alle 25 nowcasttijden vast, maar zijn
klein genoeg voor de repository.

Reproduceren:

```sh
uv run --project spec spec/radar_reference.py export rtcor \
  crates/knmi-hdf5/tests/fixtures/rtcor-mini.h5 /tmp/rtcor.json
uv run --project spec spec/radar_reference.py export nowcast \
  crates/knmi-hdf5/tests/fixtures/nowcast-mini.h5 /tmp/nowcast.json
cargo test -p knmi-hdf5
```
