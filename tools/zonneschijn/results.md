# U95 zonneschijnduur — meetresultaten

Dataset: HARMONIE-AROME P1, 00 UTC-runs om de dag van 2026-01-09 t/m 2026-10-14, leads +4…+21, 32 KNMI-stations met SQ, uren met zon boven de horizon.
Fit op 70 rundagen (32638 stationsuren), meting op 70 andere rundagen (32094 stationsuren).
Straling: blokgemiddelde ≈ 8 km, bewolking ≈ 16 km rond het station (zoals de app-velden).

## Gefitte parameters

- zon mogelijk boven zonshoogte 4.2° (gefit op heldere randuren 2025, alleen waarnemingen)
- S1 k-overgang: k_laag = 0.280, k_hoog = 0.920
- B2 k-drempel: k > 0.640
- S4 wolkenlagen: gewicht hoge bewolking = 0.150, exponent = 0.650
- S5 combinatie: 0.62 × S1 + 0.38 × S4

## Testset, alle leads

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.4 | +0.8 | +0.47 | 1.36 | +0.19 |
| S2 DNI-verhouding (Erbs, vrij) | 11.9 | -7.1 | +0.40 | 2.09 | -1.70 |
| S2b DNI > 120 op uurgemiddelde | 12.0 | -0.2 | +0.39 | 1.56 | -0.05 |
| S3 1 − totale bewolking (vrij) | 13.0 | -9.7 | +0.34 | 2.51 | -2.32 |
| S4 wolkenlagen (gefit) | 10.9 | +1.2 | +0.45 | 1.58 | +0.29 |
| S5 combinatie S1/S4 (gefit) | 10.3 | +1.0 | +0.48 | 1.40 | +0.23 |
| B1 klimatologie | 19.7 | +0.7 | +0.00 | 3.43 | +0.16 |
| B2 k-drempel (gefit) | 11.8 | -0.4 | +0.40 | 1.63 | -0.09 |

Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, 2016–2025.

## Per seizoen (MAE / bias, min/u)

| schatter | winter (n=4229) | lente (n=11287) | zomer (n=12068) | herfst (n=4510) |
| --- | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 9.6 / +4.1 | 10.9 / +1.6 | 10.2 / -0.2 | 10.6 / -1.5 |
| S2 DNI-verhouding (Erbs, vrij) | 7.9 / -1.7 | 12.5 / -6.8 | 12.2 / -8.1 | 13.3 / -10.5 |
| S4 wolkenlagen (gefit) | 9.1 / +2.4 | 11.4 / +0.1 | 10.7 / +2.6 | 11.5 / -0.5 |
| S5 combinatie S1/S4 (gefit) | 9.3 / +3.5 | 10.8 / +1.0 | 10.1 / +0.9 | 10.7 / -1.1 |
| B1 klimatologie | 16.6 / +6.7 | 20.1 / -2.1 | 20.2 / +1.3 | 20.1 / +0.2 |
| B2 k-drempel (gefit) | 9.4 / +1.5 | 12.5 / +0.2 | 11.6 / -0.6 | 13.0 / -2.9 |

## Per zonshoogte (uurgemiddelde)

| schatter | < 10° (n=7591) | 10–25° (n=8744) | 25–40° (n=7970) | > 40° (n=7789) |
| --- | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 7.0 / +1.0 | 12.5 / +1.2 | 11.6 / -0.6 | 10.2 / +1.6 |
| S2 DNI-verhouding (Erbs, vrij) | 7.2 / -3.0 | 14.4 / -9.4 | 14.5 / -10.0 | 10.9 / -5.6 |
| S4 wolkenlagen (gefit) | 7.2 / +1.3 | 13.0 / +3.0 | 12.3 / -0.6 | 10.6 / +1.1 |
| S5 combinatie S1/S4 (gefit) | 7.0 / +1.1 | 12.4 / +1.9 | 11.5 / -0.6 | 10.0 / +1.4 |
| B1 klimatologie | 11.1 / +0.4 | 22.4 / +1.0 | 22.5 / -0.6 | 22.2 / +1.9 |
| B2 k-drempel (gefit) | 7.2 / +0.3 | 13.2 / -0.4 | 13.8 / -1.8 | 12.7 / +0.4 |

## Per lead

| schatter | +4…+9 (n=10017) | +10…+15 (n=13632) | +16…+21 (n=8445) |
| --- | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 9.7 / +2.2 | 11.3 / +1.8 | 9.7 / -2.4 |
| S2 DNI-verhouding (Erbs, vrij) | 10.4 / -5.7 | 12.3 / -6.5 | 13.0 / -9.9 |
| S4 wolkenlagen (gefit) | 10.6 / +3.5 | 11.7 / +0.5 | 9.8 / -0.3 |
| S5 combinatie S1/S4 (gefit) | 9.9 / +2.7 | 11.1 / +1.3 | 9.6 / -1.6 |
| B1 klimatologie | 18.2 / +1.7 | 22.0 / +0.7 | 17.8 / -0.6 |
| B2 k-drempel (gefit) | 10.4 / +1.3 | 13.5 / +0.0 | 10.7 / -3.0 |

## Resolutie: dichtstbijzijnde 2 km-cel in plaats van blokgemiddelde (zelfde parameters)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.5 | +0.9 | +0.46 | 1.36 | +0.21 |
| S4 wolkenlagen (gefit) | 11.4 | +0.7 | +0.42 | 1.66 | +0.16 |
| S5 combinatie S1/S4 (gefit) | 10.5 | +0.8 | +0.47 | 1.42 | +0.19 |
| B1 klimatologie | 19.7 | +0.7 | +0.00 | 3.43 | +0.16 |

## Gevoeligheid: 6 substappen van 10 minuten in plaats van 30 van 2 minuten (zelfde parameters)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.4 | +0.8 | +0.47 | 1.36 | +0.19 |
| S4 wolkenlagen (gefit) | 10.9 | +1.2 | +0.45 | 1.58 | +0.29 |
| B1 klimatologie | 19.7 | +0.7 | +0.00 | 3.43 | +0.16 |

## Plafond: dezelfde schatters op de gemeten stationsstraling Q

Zonder modelfout: wat er overblijft is de omrekening van een uurgemiddelde naar minuten zon.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 5.4 | +2.9 | +0.73 | 0.82 | +0.68 |
| S2 DNI-verhouding (Erbs, vrij) | 7.0 | -6.1 | +0.64 | 1.48 | -1.45 |
| S2b DNI > 120 op uurgemiddelde | 8.0 | +1.3 | +0.59 | 0.85 | +0.31 |
| B2 k-drempel (gefit) | 7.1 | +0.9 | +0.64 | 0.79 | +0.22 |
| B1 klimatologie | 19.7 | +0.7 | +0.00 | 3.43 | +0.16 |

## Extern: Open-Meteo (historical-forecast, korte termijn)

### HARMONIE-runs 03/06/09/12/15/18 UTC om de 4 dagen, leads +1…+3 (zelfde korte termijn als Open-Meteo)

32446 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.5 | +1.8 | +0.48 | 1.31 | +0.44 |
| S4 wolkenlagen (gefit) | 10.8 | +2.1 | +0.46 | 1.53 | +0.51 |
| S5 combinatie S1/S4 (gefit) | 10.3 | +1.9 | +0.48 | 1.34 | +0.47 |
| B1 klimatologie | 20.0 | -3.1 | +0.00 | 3.64 | -0.74 |
| Open-Meteo knmi_seamless | 12.8 | +6.2 | +0.36 | 1.80 | +1.49 |
| Open-Meteo icon_d2 | 10.7 | +5.9 | +0.46 | 1.70 | +1.42 |
| Open-Meteo icon_eu | 12.4 | +6.8 | +0.38 | 2.05 | +1.63 |
| Open-Meteo icon_global | 12.9 | +7.8 | +0.36 | 2.22 | +1.88 |
| Open-Meteo ecmwf_ifs | 14.9 | +12.7 | +0.26 | 3.14 | +3.06 |
| Open-Meteo ecmwf_ifs025 | 15.0 | +13.2 | +0.25 | 3.25 | +3.19 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=4185) | lente (n=11160) | zomer (n=12526) | herfst (n=4575) |
| --- | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 8.5 / +3.4 | 9.0 / +0.6 | 11.4 / +3.0 | 13.4 / +0.2 |
| S4 wolkenlagen (gefit) | 7.8 / +0.8 | 9.7 / -0.2 | 11.4 / +4.8 | 14.8 / +1.8 |
| S5 combinatie S1/S4 (gefit) | 8.1 / +2.4 | 9.0 / +0.3 | 11.1 / +3.7 | 13.5 / +0.8 |
| B1 klimatologie | 18.9 / +0.4 | 20.7 / -5.4 | 19.8 / -2.2 | 19.8 / -2.9 |
| Open-Meteo knmi_seamless | 10.6 / +5.8 | 11.1 / +4.8 | 13.8 / +7.7 | 16.0 / +5.5 |
| Open-Meteo icon_d2 | 7.2 / +1.2 | 9.0 / +4.2 | 12.4 / +8.2 | 13.7 / +8.0 |
| Open-Meteo icon_eu | 7.5 / +0.4 | 10.5 / +4.9 | 14.5 / +9.1 | 16.0 / +10.6 |
| Open-Meteo icon_global | 8.1 / +1.3 | 10.9 / +5.9 | 15.1 / +10.3 | 16.3 / +11.6 |
| Open-Meteo ecmwf_ifs | 8.5 / +5.3 | 12.4 / +10.0 | 18.0 / +16.4 | 18.0 / +15.7 |
| Open-Meteo ecmwf_ifs025 | 9.3 / +7.0 | 12.9 / +11.0 | 17.6 / +15.9 | 18.5 / +16.9 |

Kandidaten voor de MeteoSwiss-app buiten het ICON-CH-gebied: hun eigen zonneschijnduur (Open-Meteo) naast S1 op hun eigen uurstraling, met dezelfde parameters als op HARMONIE.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.5 | +1.8 | +0.48 | 1.31 | +0.44 |
| B1 klimatologie | 20.0 | -3.1 | +0.00 | 3.64 | -0.74 |
| Open-Meteo icon_eu | 12.4 | +6.8 | +0.38 | 2.05 | +1.63 |
| S1 op straling icon_eu | 9.8 | +0.2 | +0.51 | 1.06 | +0.05 |
| Open-Meteo icon_global | 12.9 | +7.8 | +0.36 | 2.22 | +1.88 |
| S1 op straling icon_global | 10.0 | +0.8 | +0.50 | 1.11 | +0.20 |
| Open-Meteo ecmwf_ifs | 14.9 | +12.7 | +0.26 | 3.14 | +3.06 |
| S1 op straling ecmwf_ifs | 10.9 | +6.7 | +0.45 | 1.82 | +1.63 |
| Open-Meteo ecmwf_ifs025 | 15.0 | +13.2 | +0.25 | 3.25 | +3.19 |
| S1 op straling ecmwf_ifs025 | 11.0 | +7.2 | +0.45 | 1.90 | +1.74 |

### 00 UTC-runs, leads +4…+21, alle dagen (fit + test)

64732 stationsuren.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.4 | +0.7 | +0.48 | 1.35 | +0.16 |
| S4 wolkenlagen (gefit) | 10.8 | +0.9 | +0.46 | 1.54 | +0.21 |
| S5 combinatie S1/S4 (gefit) | 10.3 | +0.7 | +0.48 | 1.37 | +0.18 |
| B1 klimatologie | 19.9 | -1.2 | +0.00 | 3.55 | -0.29 |
| Open-Meteo knmi_seamless | 12.7 | +6.3 | +0.36 | 1.87 | +1.51 |
| Open-Meteo icon_d2 | 10.7 | +5.3 | +0.46 | 1.65 | +1.27 |
| Open-Meteo icon_eu | 12.4 | +6.7 | +0.38 | 2.08 | +1.62 |
| Open-Meteo icon_global | 12.9 | +7.7 | +0.35 | 2.23 | +1.86 |
| Open-Meteo ecmwf_ifs | 15.5 | +13.4 | +0.22 | 3.30 | +3.23 |
| Open-Meteo ecmwf_ifs025 | 15.9 | +14.1 | +0.20 | 3.45 | +3.39 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=8414) | lente (n=22543) | zomer (n=24690) | herfst (n=9085) |
| --- | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 9.2 / +3.3 | 10.0 / +0.6 | 10.7 / +0.7 | 11.8 / -1.5 |
| S4 wolkenlagen (gefit) | 8.6 / +1.0 | 10.4 / -0.7 | 11.1 / +2.8 | 12.8 / -0.6 |
| S5 combinatie S1/S4 (gefit) | 8.9 / +2.4 | 9.9 / +0.1 | 10.5 / +1.5 | 11.9 / -1.2 |
| B1 klimatologie | 17.8 / +3.6 | 20.4 / -3.6 | 20.0 / -0.5 | 19.9 / -1.4 |
| Open-Meteo knmi_seamless | 11.8 / +7.4 | 12.1 / +6.2 | 13.0 / +6.4 | 14.4 / +4.9 |
| Open-Meteo icon_d2 | 7.6 / +0.6 | 9.9 / +4.7 | 11.8 / +7.0 | 12.4 / +6.0 |
| Open-Meteo icon_eu | 8.7 / +1.1 | 10.9 / +4.9 | 14.3 / +9.4 | 14.2 / +9.2 |
| Open-Meteo icon_global | 9.5 / +2.4 | 11.2 / +5.8 | 14.9 / +10.3 | 14.6 / +10.3 |
| Open-Meteo ecmwf_ifs | 12.4 / +9.2 | 13.4 / +11.0 | 17.8 / +16.3 | 17.4 / +15.7 |
| Open-Meteo ecmwf_ifs025 | 13.0 / +10.7 | 14.2 / +12.3 | 17.7 / +16.0 | 17.8 / +16.4 |

Kandidaten voor de MeteoSwiss-app buiten het ICON-CH-gebied: hun eigen zonneschijnduur (Open-Meteo) naast S1 op hun eigen uurstraling, met dezelfde parameters als op HARMONIE.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 k-overgang (gefit) | 10.4 | +0.7 | +0.48 | 1.35 | +0.16 |
| B1 klimatologie | 19.9 | -1.2 | +0.00 | 3.55 | -0.29 |
| Open-Meteo icon_eu | 12.4 | +6.7 | +0.38 | 2.08 | +1.62 |
| S1 op straling icon_eu | 9.8 | +0.5 | +0.51 | 1.14 | +0.11 |
| Open-Meteo icon_global | 12.9 | +7.7 | +0.35 | 2.23 | +1.86 |
| S1 op straling icon_global | 10.1 | +1.0 | +0.49 | 1.20 | +0.25 |
| Open-Meteo ecmwf_ifs | 15.5 | +13.4 | +0.22 | 3.30 | +3.23 |
| S1 op straling ecmwf_ifs | 11.6 | +7.6 | +0.42 | 1.99 | +1.82 |
| Open-Meteo ecmwf_ifs025 | 15.9 | +14.1 | +0.20 | 3.45 | +3.39 |
| S1 op straling ecmwf_ifs025 | 11.6 | +8.0 | +0.42 | 2.06 | +1.92 |

Open-Meteo-cijfers gelden voor hun eigen korte-termijnreeks; bij de 00 UTC-rij hebben zij dus een kortere lead dan HARMONIE. Fit-dagen tellen in deze sectie mee; de parameters hebben 1–2 vrijheidsgraden per schatter.

