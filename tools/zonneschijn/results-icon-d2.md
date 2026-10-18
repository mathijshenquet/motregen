# U99 zonneschijnduur uit ICON-D2 — meetresultaten

ICON-D2 via de Open-Meteo previous-runs-API, 2026-01-09 t/m 2026-10-15, 32 KNMI-stations met SQ, uren met zon boven de horizon. Puntwaarden (dichtstbijzijnde 2 km-cel). Fit op de even dagen, meting op de oneven dagen.
Trainingsset 64732, testset 65969 stationsuren (alleen uren met alle vier kwartieren). Zon mogelijk boven 4.2°.

## Gefitte parameters

- S1 k-overgang: k_laag = 0.280, k_hoog = 0.920
- D1 app-grenzen (beide leads samen): b_laag = 0.020, b_hoog = 0.660
- S1 opnieuw gefit op ICON-D2 (kort): k_laag = 0.380, k_hoog = 0.840
- D1 directe overgang (kort): b_laag = 0.020, b_hoog = 0.620
- D2 menging (kort): 0.10 × S1 (ICON-D2-fit) + 0.90 × D1
- Q1 S1 per kwartier op globaal (kort): laag = 0.440, hoog = 0.800
- Q2 directe overgang per kwartier (kort): laag = 0.040, hoog = 0.580
- S1 opnieuw gefit op ICON-D2 (dag1): k_laag = 0.400, k_hoog = 0.860
- D1 directe overgang (dag1): b_laag = 0.020, b_hoog = 0.700
- D2 menging (dag1): 0.00 × S1 (ICON-D2-fit) + 1.00 × D1
- Q1 S1 per kwartier op globaal (dag1): laag = 0.460, hoog = 0.820
- Q2 directe overgang per kwartier (dag1): laag = 0.040, hoog = 0.660

## Testset, korte termijn (+0…+3 u)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 8.8 | +0.1 | +0.55 | 1.04 | +0.03 |
| S1 op ICON-D2-globaal, opnieuw gefit | 8.3 | +0.5 | +0.58 | 1.03 | +0.12 |
| D1 directe overgang (gefit) | 8.2 | +0.4 | +0.59 | 1.02 | +0.09 |
| D2 menging S1/D1 (gefit) | 8.2 | +0.4 | +0.59 | 1.01 | +0.09 |
| D1 met de app-grenzen (beide leads samen gefit) | 8.2 | -0.4 | +0.58 | 1.01 | -0.11 |
| Open-Meteo icon_d2 (DNI-drempel) | 10.8 | +5.8 | +0.46 | 1.77 | +1.42 |
| Q1 S1 per kwartier op globaal (gefit) | 8.2 | +0.4 | +0.59 | 1.02 | +0.10 |
| Q2 directe overgang per kwartier (gefit) | 8.2 | +0.3 | +0.59 | 1.01 | +0.06 |
| B1 klimatologie | 19.8 | -3.6 | +0.00 | 3.52 | -0.89 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=8394) | lente (n=21906) | zomer (n=25293) | herfst (n=10376) |
| --- | ---: | ---: | ---: | ---: |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 8.8 / +0.7 | 8.2 / -0.1 | 9.4 / +0.8 | 8.8 / -1.5 |
| S1 op ICON-D2-globaal, opnieuw gefit | 7.7 / -0.0 | 7.5 / +0.4 | 9.1 / +1.4 | 8.7 / -1.2 |
| D1 directe overgang (gefit) | 7.7 / -1.1 | 7.4 / -0.2 | 9.0 / +2.1 | 8.6 / -1.5 |
| D2 menging S1/D1 (gefit) | 7.7 / -1.0 | 7.4 / -0.1 | 8.9 / +2.0 | 8.6 / -1.5 |
| D1 met de app-grenzen (beide leads samen gefit) | 7.7 / -1.6 | 7.5 / -0.9 | 8.9 / +1.2 | 8.8 / -2.5 |
| Open-Meteo icon_d2 (DNI-drempel) | 8.3 / +0.2 | 9.6 / +4.9 | 12.7 / +8.9 | 10.8 / +4.5 |
| Q1 S1 per kwartier op globaal (gefit) | 7.5 / -0.5 | 7.3 / +0.4 | 9.0 / +1.4 | 8.6 / -1.2 |
| Q2 directe overgang per kwartier (gefit) | 7.6 / -1.4 | 7.4 / -0.3 | 8.9 / +2.1 | 8.5 / -1.7 |
| B1 klimatologie | 19.6 / -0.0 | 20.6 / -4.5 | 19.6 / -4.6 | 19.0 / -2.3 |

## Testset, een dag vooruit (≈ +24…+27 u)

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 10.9 | +1.4 | +0.45 | 1.40 | +0.34 |
| S1 op ICON-D2-globaal, opnieuw gefit | 10.6 | +0.7 | +0.47 | 1.40 | +0.16 |
| D1 directe overgang (gefit) | 10.4 | +0.1 | +0.48 | 1.39 | +0.03 |
| D2 menging S1/D1 (gefit) | 10.4 | +0.1 | +0.48 | 1.39 | +0.03 |
| D1 met de app-grenzen (beide leads samen gefit) | 10.4 | +0.9 | +0.48 | 1.40 | +0.23 |
| Open-Meteo icon_d2 (DNI-drempel) | 12.9 | +7.1 | +0.35 | 2.20 | +1.75 |
| Q1 S1 per kwartier op globaal (gefit) | 10.4 | +0.6 | +0.47 | 1.40 | +0.15 |
| Q2 directe overgang per kwartier (gefit) | 10.4 | +0.1 | +0.48 | 1.39 | +0.03 |
| B1 klimatologie | 19.8 | -3.6 | +0.00 | 3.52 | -0.89 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=8394) | lente (n=21906) | zomer (n=25293) | herfst (n=10376) |
| --- | ---: | ---: | ---: | ---: |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 11.2 / +3.2 | 9.7 / +1.4 | 11.6 / +1.7 | 11.3 / -0.8 |
| S1 op ICON-D2-globaal, opnieuw gefit | 10.2 / +1.7 | 9.2 / +0.9 | 11.4 / +1.1 | 11.6 / -1.9 |
| D1 directe overgang (gefit) | 9.8 / +0.5 | 9.0 / +0.1 | 11.3 / +1.4 | 11.7 / -3.1 |
| D2 menging S1/D1 (gefit) | 9.8 / +0.5 | 9.0 / +0.1 | 11.3 / +1.4 | 11.7 / -3.1 |
| D1 met de app-grenzen (beide leads samen gefit) | 9.8 / +1.0 | 9.0 / +0.9 | 11.3 / +2.3 | 11.6 / -2.2 |
| Open-Meteo icon_d2 (DNI-drempel) | 11.0 / +3.3 | 11.5 / +6.5 | 14.7 / +10.1 | 13.1 / +4.2 |
| Q1 S1 per kwartier op globaal (gefit) | 9.8 / +1.3 | 9.1 / +0.9 | 11.4 / +1.3 | 11.5 / -2.0 |
| Q2 directe overgang per kwartier (gefit) | 9.7 / +0.2 | 9.0 / +0.1 | 11.3 / +1.5 | 11.6 / -3.1 |
| B1 klimatologie | 19.6 / -0.0 | 20.6 / -4.5 | 19.6 / -4.6 | 19.0 / -2.3 |

## Gelijke lead: HARMONIE naast ICON-D2 op dezelfde stationsuren

### korte termijn: HARMONIE +1…+3, ICON-D2 ≈ +0…+3

34454 stationsuren, 70 dagen.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (zoals nu in de app) | 10.2 | +1.9 | +0.49 | 1.37 | +0.50 |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 8.5 | +0.4 | +0.58 | 1.04 | +0.09 |
| D1 op ICON-D2-direct, app-grenzen | 7.9 | -0.2 | +0.61 | 1.04 | -0.06 |
| B1 klimatologie | 20.0 | -3.9 | +0.00 | 3.90 | -1.00 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=4185) | lente (n=12136) | zomer (n=13558) | herfst (n=4575) |
| --- | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (zoals nu in de app) | 8.5 / +3.4 | 8.3 / +0.5 | 11.3 / +3.4 | 13.4 / +0.2 |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 7.3 / +1.4 | 7.3 / -1.1 | 9.3 / +1.3 | 10.5 / +0.6 |
| D1 op ICON-D2-direct, app-grenzen | 6.6 / -0.8 | 6.6 / -1.7 | 8.7 / +1.4 | 10.1 / -0.5 |
| B1 klimatologie | 18.9 / +0.4 | 20.9 / -6.8 | 19.8 / -3.0 | 19.8 / -2.9 |

### een dag vooruit: HARMONIE +24…+26, ICON-D2 ≈ +24…+27

34327 stationsuren, 70 dagen.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (zoals nu in de app) | 10.7 | +1.4 | +0.46 | 1.51 | +0.35 |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 10.8 | +0.2 | +0.46 | 1.43 | +0.06 |
| D1 op ICON-D2-direct, app-grenzen | 10.5 | -0.2 | +0.47 | 1.51 | -0.04 |
| B1 klimatologie | 20.0 | -4.6 | +0.00 | 3.80 | -1.16 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=4208) | lente (n=10707) | zomer (n=13629) | herfst (n=5783) |
| --- | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (zoals nu in de app) | 11.0 / +2.8 | 10.7 / +1.6 | 10.9 / +1.8 | 10.3 / -1.2 |
| S1 op ICON-D2-globaal, HARMONIE-parameters | 10.3 / +1.7 | 10.2 / -0.2 | 11.4 / +0.9 | 11.1 / -1.8 |
| D1 op ICON-D2-direct, app-grenzen | 9.5 / +0.2 | 9.8 / -0.7 | 10.9 / +2.1 | 11.8 / -4.9 |
| B1 klimatologie | 20.2 / -1.7 | 19.8 / -7.3 | 20.8 / -6.2 | 18.4 / +2.5 |

## Zelfde uren als de HARMONIE-meting (00 UTC-runs om de dag, alle dagen)

67632 stationsuren. S1 overal met de HARMONIE-parameters uit evaluate.py. HARMONIE heeft hier lead +4…+21; de ICON-D2-kolom 'een dag vooruit' heeft dus een langere lead dan HARMONIE.

| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |
| --- | ---: | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (+4…+21 u, nu in de app) | 10.3 | +0.8 | +0.48 | 1.40 | +0.19 |
| S1 op ICON-D2, korte termijn (+0…+3 u) | 8.8 | +0.2 | +0.56 | 1.11 | +0.04 |
| S1 op ICON-D2, een dag vooruit (≈ +24…+27 u) | 11.0 | +1.2 | +0.45 | 1.48 | +0.31 |
| B1 klimatologie | 19.9 | -1.7 | +0.00 | 3.72 | -0.43 |

Per seizoen (MAE / bias, min/u):

| schatter | winter (n=8414) | lente (n=24411) | zomer (n=25722) | herfst (n=9085) |
| --- | ---: | ---: | ---: | ---: |
| S1 op HARMONIE (+4…+21 u, nu in de app) | 9.2 / +3.3 | 9.7 / +0.6 | 10.7 / +0.9 | 11.8 / -1.5 |
| S1 op ICON-D2, korte termijn (+0…+3 u) | 7.5 / +1.8 | 8.5 / -0.5 | 9.1 / +0.5 | 10.2 / -0.7 |
| S1 op ICON-D2, een dag vooruit (≈ +24…+27 u) | 10.5 / +2.4 | 9.9 / +0.3 | 11.8 / +1.7 | 12.0 / +1.3 |
| B1 klimatologie | 17.8 / +3.6 | 20.5 / -4.3 | 20.0 / -1.0 | 19.9 / -1.4 |

Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, 2016–2025.

