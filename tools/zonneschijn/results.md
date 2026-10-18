# U95 zonneschijnduur — meetresultaten

Dataset: HARMONIE-AROME P1, 00 UTC-runs om de dag van 2026-01-09 t/m 2026-03-20, leads +4…+21, 32 KNMI-stations met SQ, uren met zon boven de horizon.
Fit op 18 rundagen (6114 stationsuren), meting op 18 andere rundagen (6183 stationsuren).
Straling: blokgemiddelde ≈ 8 km, bewolking ≈ 16 km rond het station (zoals de app-velden).

## Gefitte parameters

- S1 k-overgang: k_laag = 0.560, k_hoog = 0.824
- B2 k-drempel: k > 0.690
- S4 wolkenlagen: gewicht hoge bewolking = 0.000, exponent = 0.949
- S5 combinatie: 0.19 × S1 + 0.81 × S4

## Testset, alle leads

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.0 | -1.6 | +0.44 | 1.29 | -0.29 |
| S2 DNI-verhouding (Erbs, vrij) | 10.7 | -5.2 | +0.41 | 1.49 | -0.93 |
| S2b DNI > 120 op uurgemiddelde | 10.5 | -1.3 | +0.42 | 1.29 | -0.23 |
| S3 1 − totale bewolking (vrij) | 13.1 | -10.1 | +0.28 | 2.06 | -1.81 |
| S4 wolkenlagen (gefit) | 10.1 | -1.7 | +0.44 | 1.33 | -0.31 |
| S5 combinatie S1/S4 (gefit) | 9.9 | -1.7 | +0.45 | 1.30 | -0.30 |
| B1 klimatologie | 18.1 | +0.2 | +0.00 | 2.55 | +0.04 |
| B2 k-drempel (gefit) | 10.5 | -1.5 | +0.42 | 1.35 | -0.27 |

Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, 2016–2025.

## Per seizoen (MAE / bias, min/u)

| schatter | winter (n=4211) | lente (n=1972) |
| --- | ---: | ---: |
| S1 k-overgang (gefit) | 8.4 / -0.3 | 13.6 / -4.4 |
| S2 DNI-verhouding (Erbs, vrij) | 7.8 / -2.2 | 16.9 / -11.6 |
| S4 wolkenlagen (gefit) | 8.6 / +0.7 | 13.1 / -7.0 |
| S5 combinatie S1/S4 (gefit) | 8.5 / +0.5 | 13.0 / -6.5 |
| B1 klimatologie | 16.7 / +6.7 | 21.0 / -13.7 |
| B2 k-drempel (gefit) | 8.8 / -0.4 | 14.2 / -3.9 |

## Per zonshoogte (uurgemiddelde)

| schatter | < 10° (n=2032) | 10–25° (n=2963) | 25–40° (n=1188) |
| --- | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 6.7 / -2.0 | 11.8 / -0.9 | 11.3 / -2.6 |
| S2 DNI-verhouding (Erbs, vrij) | 6.8 / -3.5 | 12.2 / -5.1 | 13.5 / -8.3 |
| S4 wolkenlagen (gefit) | 6.7 / -2.3 | 11.8 / +0.4 | 11.4 / -6.0 |
| S5 combinatie S1/S4 (gefit) | 6.7 / -2.2 | 11.7 / +0.1 | 11.0 / -5.4 |
| B1 klimatologie | 10.3 / +0.5 | 21.4 / +2.4 | 23.0 / -5.8 |
| B2 k-drempel (gefit) | 6.9 / -2.1 | 12.3 / -0.9 | 12.3 / -2.3 |

## Per lead

| schatter | +4…+9 (n=1473) | +10…+15 (n=3456) | +16…+21 (n=1254) |
| --- | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 9.0 / -2.5 | 11.4 / -0.5 | 7.4 / -3.7 |
| S2 DNI-verhouding (Erbs, vrij) | 9.7 / -5.5 | 11.8 / -4.6 | 8.9 / -6.3 |
| S4 wolkenlagen (gefit) | 9.1 / -3.0 | 11.7 / -0.5 | 6.7 / -3.7 |
| S5 combinatie S1/S4 (gefit) | 9.0 / -2.9 | 11.4 / -0.5 | 6.8 / -3.7 |
| B1 klimatologie | 13.7 / -0.3 | 21.5 / +0.9 | 13.6 / -1.2 |
| B2 k-drempel (gefit) | 9.3 / -2.5 | 12.2 / -0.4 | 7.4 / -3.5 |

## Resolutie: dichtstbijzijnde 2 km-cel in plaats van blokgemiddelde (zelfde parameters)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.1 | -1.6 | +0.44 | 1.28 | -0.28 |
| S4 wolkenlagen (gefit) | 10.4 | -2.0 | +0.42 | 1.40 | -0.36 |
| S5 combinatie S1/S4 (gefit) | 10.2 | -1.9 | +0.44 | 1.36 | -0.35 |
| B1 klimatologie | 18.1 | +0.2 | +0.00 | 2.55 | +0.04 |

## Plafond: dezelfde schatters op de gemeten stationsstraling Q

Zonder modelfout: wat er overblijft is de omrekening van een uurgemiddelde naar minuten zon.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 3.9 | -1.8 | +0.78 | 0.42 | -0.33 |
| S2 DNI-verhouding (Erbs, vrij) | 6.3 | -5.6 | +0.65 | 1.03 | -1.01 |
| S2b DNI > 120 op uurgemiddelde | 5.8 | -1.7 | +0.68 | 0.56 | -0.30 |
| B2 k-drempel (gefit) | 5.1 | -1.7 | +0.72 | 0.51 | -0.31 |
| B1 klimatologie | 18.1 | +0.2 | +0.00 | 2.55 | +0.04 |

## Extern: Open-Meteo (historical-forecast, korte termijn)

### HARMONIE-runs 03/06/09/12/15/18 UTC om de 4 dagen, leads +1…+3 (zelfde korte termijn als Open-Meteo)

7318 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 8.9 | -2.1 | +0.55 | 1.04 | -0.36 |
| S4 wolkenlagen (gefit) | 8.8 | -2.7 | +0.56 | 1.12 | -0.46 |
| S5 combinatie S1/S4 (gefit) | 8.7 | -2.6 | +0.56 | 1.09 | -0.44 |
| B1 klimatologie | 19.9 | -4.8 | +0.00 | 2.88 | -0.82 |
| Open-Meteo knmi_seamless | 10.4 | +4.7 | +0.48 | 1.15 | +0.81 |
| Open-Meteo icon_d2 | 7.5 | +2.2 | +0.62 | 0.82 | +0.39 |
| Open-Meteo ecmwf_ifs025 | 10.1 | +8.3 | +0.49 | 1.53 | +1.43 |

### 00 UTC-runs, leads +4…+21, alle dagen (fit + test)

12297 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 8.9 | -1.4 | +0.53 | 1.14 | -0.25 |
| S4 wolkenlagen (gefit) | 8.8 | -1.7 | +0.54 | 1.09 | -0.31 |
| S5 combinatie S1/S4 (gefit) | 8.7 | -1.7 | +0.54 | 1.08 | -0.30 |
| B1 klimatologie | 19.0 | -0.8 | +0.00 | 2.73 | -0.14 |
| Open-Meteo knmi_seamless | 11.4 | +6.5 | +0.40 | 1.42 | +1.16 |
| Open-Meteo icon_d2 | 7.8 | +1.5 | +0.59 | 0.87 | +0.27 |
| Open-Meteo ecmwf_ifs025 | 12.8 | +10.9 | +0.33 | 2.06 | +1.94 |

Open-Meteo-cijfers gelden voor hun eigen korte-termijnreeks; bij de 00 UTC-rij hebben zij dus een kortere lead dan HARMONIE. Fit-dagen tellen in deze sectie mee; de parameters hebben 1–2 vrijheidsgraden per schatter.

