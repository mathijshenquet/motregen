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

Kandidaten voor de MeteoSwiss-app buiten het ICON-CH-gebied, plus icon_d2 (U95c): hun eigen zonneschijnduur (Open-Meteo) naast S1 op hun eigen uurstraling, met dezelfde parameters als op HARMONIE.

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
| Open-Meteo icon_d2 | 10.7 | +5.9 | +0.46 | 1.70 | +1.42 |
| S1 op straling icon_d2 | 8.7 | +0.3 | +0.57 | 0.99 | +0.07 |

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

Kandidaten voor de MeteoSwiss-app buiten het ICON-CH-gebied, plus icon_d2 (U95c): hun eigen zonneschijnduur (Open-Meteo) naast S1 op hun eigen uurstraling, met dezelfde parameters als op HARMONIE.

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
| Open-Meteo icon_d2 | 10.7 | +5.3 | +0.46 | 1.65 | +1.27 |
| S1 op straling icon_d2 | 8.9 | +0.2 | +0.55 | 1.07 | +0.04 |

Open-Meteo-cijfers gelden voor hun eigen korte-termijnreeks; bij de 00 UTC-rij hebben zij dus een kortere lead dan HARMONIE. Fit-dagen tellen in deze sectie mee; de parameters hebben 1–2 vrijheidsgraden per schatter.

## Zwitserland: SwissMetNet tegen ICON-CH (U95c)

12 SwissMetNet-stations, uur-einde 2026-01-09 t/m 2026-10-15, zon boven de horizon; 46866 stationsuren. Regio's: Plateau BAS, BER, GVE, LUZ, PAY, SMA; Berg DAV, JUN, SAE; Zuid LUG, MAG, OTL.
Waarheid: sre000h0 (zonneschijnsensor, WMO-drempel op directe straling), niet afgeleid uit globale straling zoals KNMI-SQ. Modellen: Open-Meteo historical-forecast (korte termijn, zoals in de NL-sectie hierboven). S1 met de NL-parameters (k-grenzen en 4,2°-grens), zonder terreinhorizon.

Cellen: MAE / bias / vaardigheid t.o.v. klimatologie (min/u). Klimatologie = gemiddelde sre000h0 per station, maand en uur, 2016–2025.

| schatter | Zwitserland (n=46866) | Plateau (n=23522) | Berg (n=11754) | Zuid (n=11590) |
| --- | ---: | ---: | ---: | ---: |
| B1 klimatologie | 20.0 / -4.2 / +0.00 | 20.3 / -5.1 / +0.00 | 20.0 / -3.6 / +0.00 | 19.1 / -3.1 / +0.00 |
| Open-Meteo meteoswiss_icon_ch1 | 8.8 / -1.3 / +0.56 | 8.7 / -2.7 / +0.57 | 10.0 / +3.0 / +0.50 | 7.8 / -2.8 / +0.59 |
| S1 op straling meteoswiss_icon_ch1 | 10.7 / +6.0 / +0.46 | 9.3 / +4.2 / +0.54 | 15.2 / +12.4 / +0.24 | 8.9 / +3.1 / +0.54 |
| Open-Meteo meteoswiss_icon_ch2 | 8.7 / -0.5 / +0.56 | 8.7 / -2.0 / +0.57 | 9.7 / +3.3 / +0.52 | 7.7 / -1.2 / +0.60 |
| S1 op straling meteoswiss_icon_ch2 | 10.7 / +6.4 / +0.46 | 9.6 / +4.9 / +0.53 | 14.4 / +11.7 / +0.28 | 9.3 / +4.2 / +0.51 |
| Open-Meteo icon_d2 | 11.9 / +10.6 / +0.40 | 10.2 / +8.5 / +0.50 | 16.4 / +15.5 / +0.18 | 10.6 / +9.9 / +0.44 |
| S1 op straling icon_d2 | 10.3 / +6.5 / +0.48 | 8.9 / +4.3 / +0.56 | 14.2 / +12.0 / +0.29 | 9.1 / +5.5 / +0.52 |
| Open-Meteo icon_eu | 12.6 / +10.9 / +0.37 | 11.3 / +9.1 / +0.45 | 17.3 / +15.8 / +0.13 | 10.7 / +9.5 / +0.44 |
| S1 op straling icon_eu | 10.8 / +5.7 / +0.46 | 9.4 / +3.6 / +0.54 | 14.7 / +11.5 / +0.26 | 9.7 / +4.3 / +0.49 |
| S1 op gemeten straling (plafond) | 6.1 / +5.0 / +0.69 | 5.5 / +4.5 / +0.73 | 9.0 / +7.8 / +0.55 | 4.4 / +3.1 / +0.77 |

Dagsommen (alle Zwitserse stations):

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 klimatologie | 20.0 | -4.2 | +0.00 | 3.59 | -0.98 |
| Open-Meteo meteoswiss_icon_ch1 | 8.8 | -1.3 | +0.56 | 1.32 | -0.30 |
| S1 op straling meteoswiss_icon_ch1 | 10.7 | +6.0 | +0.46 | 1.76 | +1.40 |
| Open-Meteo meteoswiss_icon_ch2 | 8.7 | -0.5 | +0.56 | 1.26 | -0.11 |
| S1 op straling meteoswiss_icon_ch2 | 10.7 | +6.4 | +0.46 | 1.80 | +1.50 |
| Open-Meteo icon_d2 | 11.9 | +10.6 | +0.40 | 2.53 | +2.47 |
| S1 op straling icon_d2 | 10.3 | +6.5 | +0.48 | 1.76 | +1.52 |
| Open-Meteo icon_eu | 12.6 | +10.9 | +0.37 | 2.64 | +2.53 |
| S1 op straling icon_eu | 10.8 | +5.7 | +0.46 | 1.73 | +1.34 |
| S1 op gemeten straling (plafond) | 6.1 | +5.0 | +0.69 | 1.22 | +1.16 |

Per seizoen, Plateau (MAE / bias, min/u):

| schatter | winter (n=3220) | lente (n=7918) | zomer (n=8905) | herfst (n=3479) |
| --- | ---: | ---: | ---: | ---: |
| B1 klimatologie | 17.9 / +2.5 | 22.1 / -6.4 | 19.2 / -5.5 | 21.5 / -8.0 |
| Open-Meteo meteoswiss_icon_ch1 | 7.5 / -1.4 | 8.4 / -1.9 | 9.1 / -3.4 | 9.3 / -3.7 |
| S1 op straling meteoswiss_icon_ch1 | 12.0 / +8.9 | 9.3 / +4.8 | 8.6 / +2.1 | 8.9 / +4.1 |
| Open-Meteo meteoswiss_icon_ch2 | 7.6 / -1.3 | 8.6 / -1.1 | 9.0 / -2.5 | 8.9 / -3.3 |
| S1 op straling meteoswiss_icon_ch2 | 12.5 / +9.4 | 9.6 / +5.6 | 8.8 / +2.9 | 8.9 / +4.5 |
| Open-Meteo icon_d2 | 11.2 / +8.8 | 10.9 / +9.2 | 9.7 / +8.4 | 9.2 / +7.0 |
| S1 op straling icon_d2 | 11.4 / +8.3 | 9.0 / +5.1 | 8.2 / +2.5 | 8.3 / +3.4 |
| Open-Meteo icon_eu | 14.0 / +10.9 | 11.1 / +9.2 | 10.9 / +9.1 | 10.1 / +7.1 |
| S1 op straling icon_eu | 12.2 / +7.8 | 8.9 / +4.1 | 9.1 / +2.1 | 8.9 / +2.2 |
| S1 op gemeten straling (plafond) | 8.1 / +7.8 | 5.6 / +4.7 | 4.6 / +3.2 | 5.2 / +4.1 |

Hergefit op Zwitserse even dagen: k_laag = 0.60, k_hoog = 0.84. Meting op de oneven dagen:

| schatter | Zwitserland (n=23414) | Plateau (n=11758) | Berg (n=5879) | Zuid (n=5777) |
| --- | ---: | ---: | ---: | ---: |
| B1 klimatologie | 19.7 / -3.9 / +0.00 | 20.0 / -4.7 / +0.00 | 19.7 / -2.8 / +0.00 | 18.9 / -3.6 / +0.00 |
| Open-Meteo meteoswiss_icon_ch1 | 9.2 / -1.2 / +0.53 | 9.1 / -2.7 / +0.54 | 10.6 / +3.5 / +0.46 | 8.1 / -3.0 / +0.57 |
| S1 op straling meteoswiss_icon_ch1, k-grenzen hergefit op CH | 10.0 / +2.1 / +0.49 | 8.8 / -0.1 / +0.56 | 13.7 / +8.9 / +0.31 | 8.6 / -0.4 / +0.55 |

### Naast elkaar: Nederland en Zwitserland (MAE / vaardigheid t.o.v. klimatologie)

Nederland = de korte HARMONIE-set (+1…+3) hierboven; Zwitserland = alle dagen van dezelfde periode.

| schatter | Nederland (n=32446) | Zwitserland (n=46866) | Plateau (n=23522) | Berg (n=11754) | Zuid (n=11590) |
| --- | ---: | ---: | ---: | ---: | ---: |
| landsmodel via Open-Meteo (knmi_seamless / meteoswiss_icon_ch1) | 12.8 / +0.36 | 8.8 / +0.56 | 8.7 / +0.57 | 10.0 / +0.50 | 7.8 / +0.59 |
| S1 op straling landsmodel (HARMONIE / ICON-CH1) | 10.5 / +0.48 | 10.7 / +0.46 | 9.3 / +0.54 | 15.2 / +0.24 | 8.9 / +0.54 |
| Open-Meteo icon_d2 (zelfde model) | 10.7 / +0.46 | 11.9 / +0.40 | 10.2 / +0.50 | 16.4 / +0.18 | 10.6 / +0.44 |
| S1 op straling icon_d2 | 8.7 / +0.57 | 10.3 / +0.48 | 8.9 / +0.56 | 14.2 / +0.29 | 9.1 / +0.52 |
| B1 klimatologie | 20.0 | 20.0 | 20.3 | 20.0 | 19.1 |

### De MeteoSwiss-app zelf (steekproef)

59 app-runs (2026101600…2026101810 UTC), uur-einde 2026-10-16 06 t/m 2026-10-18 11 UTC, 12 stations, 10698 run×stationsuren met zon boven de horizon. Uren vóór de runtijd zijn weggelaten. Elke valid-uur telt per run mee, dus de uren zijn sterk gecorreleerd: dit is een steekproef van een paar dagen, geen klimatologie. Open-Meteo is hier steeds hun korte-termijnreeks, dus bij lange app-leads geen eerlijke tegenhanger.

| schatter | Zwitserland (n=10698) | Plateau (n=5280) | Berg (n=2709) | Zuid (n=2709) |
| --- | ---: | ---: | ---: | ---: |
| MeteoSwiss-app (sre000h0) | 6.8 / -3.0 / +0.66 | 2.7 / -0.6 / +0.86 | 11.7 / -6.0 / +0.46 | 10.0 / -4.7 / +0.50 |
| S1 op app-straling (gre000h0) | 6.2 / +2.3 / +0.69 | 3.7 / +2.2 / +0.81 | 9.5 / +3.4 / +0.56 | 7.9 / +1.4 / +0.60 |
| Open-Meteo meteoswiss_icon_ch1 (zelfde uren) | 5.0 / -2.0 / +0.75 | 2.9 / -1.0 / +0.85 | 6.2 / -0.6 / +0.71 | 8.0 / -5.4 / +0.60 |
| S1 op straling meteoswiss_icon_ch1 (zelfde uren) | 7.0 / +3.9 / +0.65 | 4.6 / +3.0 / +0.76 | 10.9 / +8.3 / +0.49 | 7.6 / +1.4 / +0.62 |
| B1 klimatologie | 19.9 / +7.7 / +0.00 | 19.1 / +16.2 / +0.00 | 21.4 / -5.6 / +0.00 | 19.9 / +4.4 / +0.00 |

Per lead (alle stations, MAE / bias):

| schatter | +1…+12 (n=4032) | +13…+24 (n=2736) | +25…+48 (n=3330) | > +48 (n=600) |
| --- | ---: | ---: | ---: | ---: |
| MeteoSwiss-app (sre000h0) | 9.0 / -3.6 | 5.6 / -2.7 | 5.5 / -2.9 | 4.5 / -0.6 |
| S1 op app-straling (gre000h0) | 8.6 / +3.6 | 5.3 / +2.1 | 4.4 / +1.1 | 4.8 / +1.5 |
| Open-Meteo meteoswiss_icon_ch1 (zelfde uren) | 8.1 / -4.0 | 3.9 / -1.8 | 2.7 / -0.3 | 2.3 / +1.2 |
| S1 op straling meteoswiss_icon_ch1 (zelfde uren) | 9.5 / +5.0 | 5.7 / +2.8 | 5.1 / +3.3 | 5.9 / +5.4 |
| B1 klimatologie | 19.5 / +3.5 | 19.4 / +7.7 | 20.2 / +10.9 | 22.5 / +18.0 |

