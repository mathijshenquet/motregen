# U95 zonneschijnduur — meetresultaten

Dataset: HARMONIE-AROME P1, 00 UTC-runs om de dag van 2026-01-09 t/m 2026-04-13, leads +4…+21, 32 KNMI-stations met SQ, uren met zon boven de horizon.
Fit op 24 rundagen (8796 stationsuren), meting op 24 andere rundagen (9328 stationsuren).
Straling: blokgemiddelde ≈ 8 km, bewolking ≈ 16 km rond het station (zoals de app-velden).

## Gefitte parameters

- zon mogelijk boven zonshoogte 4.2° (gefit op heldere randuren 2025, alleen waarnemingen)
- S1 k-overgang: k_laag = 0.340, k_hoog = 0.900
- B2 k-drempel: k > 0.690
- S4 wolkenlagen: gewicht hoge bewolking = 0.000, exponent = 0.600
- S5 combinatie: 0.39 × S1 + 0.61 × S4

## Testset, alle leads

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 11.0 | +2.5 | +0.41 | 1.46 | +0.52 |
| S2 DNI-verhouding (Erbs, vrij) | 11.1 | -4.1 | +0.41 | 1.58 | -0.84 |
| S2b DNI > 120 op uurgemiddelde | 11.5 | +0.4 | +0.38 | 1.49 | +0.09 |
| S3 1 − totale bewolking (vrij) | 12.8 | -9.4 | +0.32 | 2.18 | -1.89 |
| S4 wolkenlagen (gefit) | 11.7 | +2.7 | +0.37 | 1.67 | +0.55 |
| S5 combinatie S1/S4 (gefit) | 11.2 | +2.7 | +0.40 | 1.55 | +0.54 |
| B1 klimatologie | 18.7 | +2.3 | +0.00 | 2.82 | +0.47 |
| B2 k-drempel (gefit) | 11.4 | -0.5 | +0.39 | 1.55 | -0.11 |

Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, 2016–2025.

## Per seizoen (MAE / bias, min/u)

| schatter | winter (n=4229) | lente (n=5099) |
| --- | ---: | ---: |
| S1 k-overgang (gefit) | 9.2 / +3.1 | 12.5 / +2.1 |
| S2 DNI-verhouding (Erbs, vrij) | 7.9 / -1.7 | 13.7 / -6.2 |
| S4 wolkenlagen (gefit) | 9.6 / +3.6 | 13.4 / +2.0 |
| S5 combinatie S1/S4 (gefit) | 9.3 / +3.4 | 12.8 / +2.0 |
| B1 klimatologie | 16.6 / +6.7 | 20.5 / -1.3 |
| B2 k-drempel (gefit) | 8.9 / +0.2 | 13.5 / -1.1 |

## Per zonshoogte (uurgemiddelde)

| schatter | < 10° (n=2774) | 10–25° (n=3750) | 25–40° (n=2261) | > 40° (n=543) |
| --- | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 7.2 / +1.8 | 12.4 / +3.0 | 12.4 / +1.2 | 14.8 / +9.0 |
| S2 DNI-verhouding (Erbs, vrij) | 6.6 / -1.5 | 12.2 / -5.1 | 14.2 / -7.0 | 13.2 / +0.9 |
| S4 wolkenlagen (gefit) | 7.5 / +1.8 | 13.8 / +4.8 | 12.8 / +0.0 | 14.6 / +4.5 |
| S5 combinatie S1/S4 (gefit) | 7.3 / +1.8 | 13.0 / +4.1 | 12.3 / +0.5 | 14.2 / +6.2 |
| B1 klimatologie | 10.3 / +2.2 | 21.9 / +4.1 | 23.0 / -0.7 | 22.0 / +3.4 |
| B2 k-drempel (gefit) | 7.0 / +0.0 | 12.5 / -0.9 | 14.3 / -1.8 | 15.2 / +3.9 |

## Per lead

| schatter | +4…+9 (n=2422) | +10…+15 (n=4800) | +16…+21 (n=2106) |
| --- | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.1 / +2.5 | 12.4 / +3.5 | 8.8 / +0.4 |
| S2 DNI-verhouding (Erbs, vrij) | 9.1 / -3.7 | 12.5 / -4.2 | 10.0 / -4.6 |
| S4 wolkenlagen (gefit) | 11.5 / +3.3 | 12.8 / +2.9 | 9.4 / +1.7 |
| S5 combinatie S1/S4 (gefit) | 10.8 / +3.0 | 12.4 / +3.1 | 9.0 / +1.2 |
| B1 klimatologie | 15.8 / +4.6 | 21.7 / +1.5 | 15.1 / +1.7 |
| B2 k-drempel (gefit) | 9.3 / -0.7 | 13.3 / -0.1 | 9.6 / -1.4 |

## Resolutie: dichtstbijzijnde 2 km-cel in plaats van blokgemiddelde (zelfde parameters)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 11.1 | +2.6 | +0.41 | 1.46 | +0.52 |
| S4 wolkenlagen (gefit) | 12.1 | +2.0 | +0.36 | 1.72 | +0.40 |
| S5 combinatie S1/S4 (gefit) | 11.4 | +2.2 | +0.39 | 1.57 | +0.45 |
| B1 klimatologie | 18.7 | +2.3 | +0.00 | 2.82 | +0.47 |

## Plafond: dezelfde schatters op de gemeten stationsstraling Q

Zonder modelfout: wat er overblijft is de omrekening van een uurgemiddelde naar minuten zon.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 4.8 | +2.3 | +0.74 | 0.59 | +0.47 |
| S2 DNI-verhouding (Erbs, vrij) | 6.1 | -4.9 | +0.67 | 1.04 | -0.99 |
| S2b DNI > 120 op uurgemiddelde | 6.5 | -0.2 | +0.65 | 0.67 | -0.05 |
| B2 k-drempel (gefit) | 5.8 | -1.1 | +0.69 | 0.58 | -0.23 |
| B1 klimatologie | 18.7 | +2.3 | +0.00 | 2.82 | +0.47 |

## Extern: Open-Meteo (historical-forecast, korte termijn)

### HARMONIE-runs 03/06/09/12/15/18 UTC om de 4 dagen, leads +1…+3 (zelfde korte termijn als Open-Meteo)

12373 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 8.4 | +1.1 | +0.59 | 1.07 | +0.22 |
| S4 wolkenlagen (gefit) | 8.3 | +1.6 | +0.59 | 1.15 | +0.33 |
| S5 combinatie S1/S4 (gefit) | 8.1 | +1.4 | +0.60 | 1.07 | +0.29 |
| B1 klimatologie | 20.3 | -4.9 | +0.00 | 3.48 | -1.02 |
| Open-Meteo knmi_seamless | 10.3 | +4.9 | +0.49 | 1.35 | +1.03 |
| Open-Meteo icon_d2 | 8.0 | +3.1 | +0.61 | 1.03 | +0.65 |
| Open-Meteo ecmwf_ifs025 | 10.4 | +8.7 | +0.49 | 1.89 | +1.80 |

### 00 UTC-runs, leads +4…+21, alle dagen (fit + test)

18124 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 9.9 | +1.1 | +0.49 | 1.28 | +0.22 |
| S4 wolkenlagen (gefit) | 10.2 | +1.0 | +0.48 | 1.39 | +0.21 |
| S5 combinatie S1/S4 (gefit) | 9.9 | +1.1 | +0.49 | 1.31 | +0.21 |
| B1 klimatologie | 19.5 | -0.1 | +0.00 | 3.06 | -0.02 |
| Open-Meteo knmi_seamless | 12.0 | +6.7 | +0.38 | 1.61 | +1.32 |
| Open-Meteo icon_d2 | 8.8 | +3.0 | +0.55 | 1.10 | +0.59 |
| Open-Meteo ecmwf_ifs025 | 14.0 | +12.3 | +0.28 | 2.52 | +2.42 |

Open-Meteo-cijfers gelden voor hun eigen korte-termijnreeks; bij de 00 UTC-rij hebben zij dus een kortere lead dan HARMONIE. Fit-dagen tellen in deze sectie mee; de parameters hebben 1–2 vrijheidsgraden per schatter.

