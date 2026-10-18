"""Zonneschijnduur uit ICON-D2 (U99, MIP-39): S1 op de globale straling tegen schatters op de directe straling.

Invoer: data/icon-d2.csv (fetch_icon_d2.py), de KNMI-uren en de HARMONIE-set van evaluate.py. Schrijft
results-icon-d2.md naast dit script en print hetzelfde.

ICON-D2 heeft in de DWD-open-data geen `DURSUN`, wel directe straling (`ASWDIR_S`). "Native" is hier dus de directe
straling: (a) Open-Meteo's omrekening, een drempel op de DNI van het uurgemiddelde, en (b) een S1-achtige overgang op
de directe-stralingsindex `B/B_c` (uurgemiddelde directe horizontale straling gedeeld door die bij heldere hemel,
Haurwitz + Erbs). Vrije parameters fitten op de even dagen en meten op de oneven, zoals in evaluate.py.

De DWD-bestanden hebben straling per kwartier (data/icon-d2-kwartier.csv). Q1/Q2 rekenen dezelfde overgang per kwartier
en tellen de vier kwartieren op: dichter bij hoe ICON-CH de zon per modeltijdstap rekent.
"""

import sys

import numpy as np
import pandas as pd

from evaluate import (
    CLIMATOLOGY_YEARS,
    DATA,
    HERE,
    SOLAR_CONSTANT,
    SUBSTEPS,
    Estimators,
    add_geometry,
    climatology,
    erbs_diffuse_fraction,
    fit_sun_threshold,
    grid_fit,
    load_harmonie,
    load_observations,
    load_stations,
    mae,
    prepare,
    ramp_estimate,
    score_table,
    season,
    segment_table,
    solar_elevation_sin,
)

LEADS = {"kort": "korte termijn (+0…+3 u)", "dag1": "een dag vooruit (≈ +24…+27 u)"}
QUARTER_SUBSTEPS = 6


class Quarters:
    """Kwartierwaarden per uurrij van een frame: index (straling / heldere hemel) en het deel met zon mogelijk."""

    def __init__(self, frame: pd.DataFrame, sun_threshold: float):
        quarters = pd.read_csv(DATA / "icon-d2-kwartier.csv")
        quarters["quarter_end"] = pd.to_datetime(quarters["quarter_end_utc"], format="%Y-%m-%dT%H:%M")
        quarters["hour_end"] = quarters["quarter_end"].dt.ceil("h")
        quarters["slot"] = ((quarters["quarter_end"] - quarters["hour_end"]).dt.total_seconds() / 900 + 3).astype(int)
        rows = frame[["station", "hour_end", "lon", "lat"]].reset_index().rename(columns={"index": "row"})
        quarters = quarters.merge(rows, on=["station", "hour_end"], how="inner")
        quarter_end = (quarters["quarter_end"] - pd.Timestamp("1970-01-01")).dt.total_seconds().to_numpy()
        offsets = (np.arange(QUARTER_SUBSTEPS) + 0.5) / QUARTER_SUBSTEPS * 900 - 900
        mu = solar_elevation_sin(quarter_end[:, None] + offsets[None, :], quarters["lon"].to_numpy()[:, None], quarters["lat"].to_numpy()[:, None])
        day_of_year = quarters["quarter_end"].dt.dayofyear.to_numpy()[:, None]
        extraterrestrial = SOLAR_CONSTANT * (1 + 0.033 * np.cos(2 * np.pi * day_of_year / 365))
        sun_up = mu > 0
        safe_mu = np.where(sun_up, mu, 1.0)
        clear_global = np.where(sun_up, 1098 * safe_mu * np.exp(-0.057 / safe_mu), 0.0)
        clearness = np.where(sun_up, clear_global / (extraterrestrial * safe_mu), 0.0)
        clear_direct = np.where(sun_up, clear_global * (1 - erbs_diffuse_fraction(clearness)), 0.0)
        self.rows = quarters["row"].to_numpy()
        self.row_count = len(frame)
        self.possible = (mu > np.sin(np.radians(sun_threshold))).mean(axis=1)
        self.index = {}
        for lead in LEADS:
            for kind, clear in [("global", clear_global.mean(axis=1)), ("direct", clear_direct.mean(axis=1))]:
                values = quarters[f"{lead}_{kind}_wm2"].to_numpy(dtype=float)
                self.index[(lead, kind)] = np.where(clear > 1, np.clip(values / np.maximum(clear, 1), 0, 1.5), 0.0)
        self.complete = np.bincount(self.rows, minlength=self.row_count) == 4

    def minutes(self, lead: str, kind: str, low: float, high: float) -> np.ndarray:
        share = np.clip((self.index[(lead, kind)] - low) / max(high - low, 1e-6), 0, 1)
        return 15 * np.bincount(self.rows, weights=share * self.possible, minlength=self.row_count)


def add_clear_direct(frame: pd.DataFrame) -> pd.DataFrame:
    """Uurgemiddelde directe horizontale straling bij heldere hemel (Haurwitz + Erbs), op dezelfde substappen."""
    hour_end = (frame["hour_end"] - pd.Timestamp("1970-01-01")).dt.total_seconds().to_numpy()
    offsets = (np.arange(SUBSTEPS) + 0.5) / SUBSTEPS * 3600 - 3600
    mu = solar_elevation_sin(hour_end[:, None] + offsets[None, :], frame["lon"].to_numpy()[:, None], frame["lat"].to_numpy()[:, None])
    day_of_year = frame["hour_end"].dt.dayofyear.to_numpy()[:, None]
    extraterrestrial = SOLAR_CONSTANT * (1 + 0.033 * np.cos(2 * np.pi * day_of_year / 365))
    sun_up = mu > 0
    safe_mu = np.where(sun_up, mu, 1.0)
    clear_global = np.where(sun_up, 1098 * safe_mu * np.exp(-0.057 / safe_mu), 0.0)
    clearness = np.where(sun_up, clear_global / (extraterrestrial * safe_mu), 0.0)
    frame = frame.copy()
    frame["clear_direct"] = np.where(sun_up, clear_global * (1 - erbs_diffuse_fraction(clearness)), 0.0).mean(axis=1)
    return frame


def direct_ramp_estimate(frame: pd.DataFrame, direct: np.ndarray, low: float, high: float) -> np.ndarray:
    clear = frame["clear_direct"].to_numpy()
    index = np.where(clear > 1, np.clip(direct / np.maximum(clear, 1), 0, 1.5), 0.0)
    return 60 * frame["possible"].to_numpy() * np.clip((index - low) / max(high - low, 1e-6), 0, 1)


def load_icon_d2(stations: pd.DataFrame, observations: pd.DataFrame, normals: pd.DataFrame, sun_threshold: float) -> pd.DataFrame:
    icon = pd.read_csv(DATA / "icon-d2.csv")
    icon["hour_end"] = pd.to_datetime(icon["hour_end_utc"], format="%Y-%m-%dT%H")
    frame = icon.drop(columns="hour_end_utc").merge(observations, on=["station", "hour_end"], how="inner")
    frame = frame.merge(stations[["station", "lon", "lat"]], on="station")
    frame["month"] = frame["hour_end"].dt.month
    frame["hour"] = frame["hour_end"].dt.hour
    frame = frame.merge(normals, on=["station", "month", "hour"], how="inner")
    frame = add_geometry(frame, sun_threshold)
    frame = add_clear_direct(frame)
    columns = [f"{lead}_{kind}" for lead in LEADS for kind in ["global_wm2", "direct_wm2", "openmeteo_min"]]
    frame = frame[frame["mu_max"] > 0].dropna(subset=columns).reset_index(drop=True)
    # score_table telt dagsommen per (station, run_day); hier is dat de UTC-dag van het uur.
    frame["run_day"] = frame["hour_end"].dt.normalize()
    return frame


class IconEstimators:
    """Fit per lead op de trainingsdagen: S1 opnieuw op ICON-D2, de directe overgang en een menging van de twee."""

    def __init__(self, train: pd.DataFrame, lead: str, harmonie: Estimators):
        truth = train["sunshine_min"].to_numpy()
        global_radiation = train[f"{lead}_global_wm2"].to_numpy(dtype=float)
        direct = train[f"{lead}_direct_wm2"].to_numpy(dtype=float)
        self.lead = lead
        self.harmonie = harmonie
        self.global_ramp = grid_fit(
            lambda p: mae(ramp_estimate(train, global_radiation, p[0], p[1]), truth) if p[1] > p[0] else np.inf,
            np.arange(0.0, 0.91, 0.02), np.arange(0.3, 1.21, 0.02),
        )
        self.direct_ramp = grid_fit(
            lambda p: mae(direct_ramp_estimate(train, direct, p[0], p[1]), truth) if p[1] > p[0] else np.inf,
            np.arange(0.0, 0.81, 0.02), np.arange(0.1, 1.31, 0.02),
        )
        ramp = ramp_estimate(train, global_radiation, *self.global_ramp)
        direct_estimate = direct_ramp_estimate(train, direct, *self.direct_ramp)
        weights = np.linspace(0, 1, 101)
        self.blend = float(weights[np.argmin([mae(w * ramp + (1 - w) * direct_estimate, truth) for w in weights])])

    def parameters(self) -> list[str]:
        return [
            f"S1 opnieuw gefit op ICON-D2 ({self.lead}): k_laag = {self.global_ramp[0]:.3f}, k_hoog = {self.global_ramp[1]:.3f}",
            f"D1 directe overgang ({self.lead}): b_laag = {self.direct_ramp[0]:.3f}, b_hoog = {self.direct_ramp[1]:.3f}",
            f"D2 menging ({self.lead}): {self.blend:.2f} × S1 (ICON-D2-fit) + {1 - self.blend:.2f} × D1",
        ]

    def apply(self, frame: pd.DataFrame) -> dict[str, np.ndarray]:
        global_radiation = frame[f"{self.lead}_global_wm2"].to_numpy(dtype=float)
        direct = frame[f"{self.lead}_direct_wm2"].to_numpy(dtype=float)
        refit = ramp_estimate(frame, global_radiation, *self.global_ramp)
        direct_estimate = direct_ramp_estimate(frame, direct, *self.direct_ramp)
        return {
            "S1 op ICON-D2-globaal, HARMONIE-parameters": self.harmonie.s1(frame, global_radiation),
            "S1 op ICON-D2-globaal, opnieuw gefit": refit,
            "D1 directe overgang (gefit)": direct_estimate,
            "D2 menging S1/D1 (gefit)": self.blend * refit + (1 - self.blend) * direct_estimate,
            "Open-Meteo icon_d2 (DNI-drempel)": frame[f"{self.lead}_openmeteo_min"].to_numpy(dtype=float),
            "B1 klimatologie": frame["climatology"].to_numpy(),
        }


def harmonie_reference(observations: pd.DataFrame, stations: pd.DataFrame, normals: pd.DataFrame, sun_threshold: float, icon: pd.DataFrame, harmonie_estimators: Estimators) -> list[str]:
    """Dezelfde stationsuren naast elkaar: HARMONIE 00 UTC (+4…+21) en ICON-D2 op beide leads."""
    harmonie = prepare(load_harmonie(DATA / "harmonie", "block"), observations, stations, normals, sun_threshold)
    keys = ["station", "hour_end"]
    joined = harmonie.merge(icon[[*keys, *[f"{lead}_{kind}" for lead in LEADS for kind in ["global_wm2", "direct_wm2", "openmeteo_min"]], "clear_direct"]], on=keys, how="inner")
    joined = joined.reset_index(drop=True)
    estimates = {
        "S1 op HARMONIE (+4…+21 u, nu in de app)": harmonie_estimators.apply(joined)["S1 k-overgang (gefit)"],
    }
    for lead, description in LEADS.items():
        estimates[f"S1 op ICON-D2, {description}"] = harmonie_estimators.s1(joined, joined[f"{lead}_global_wm2"].to_numpy(dtype=float))
    estimates["B1 klimatologie"] = joined["climatology"].to_numpy()
    return [
        "## Zelfde uren als de HARMONIE-meting (00 UTC-runs om de dag, alle dagen)",
        "",
        f"{len(joined)} stationsuren. S1 overal met de HARMONIE-parameters uit evaluate.py. HARMONIE heeft hier lead "
        "+4…+21; de ICON-D2-kolom 'een dag vooruit' heeft dus een langere lead dan HARMONIE.",
        "",
        *score_table(joined, estimates),
        "",
        "Per seizoen (MAE / bias, min/u):",
        "",
        *segment_table(joined, estimates, pd.Series(season(joined)), list(estimates)),
        "",
    ]


def main() -> int:
    stations = load_stations()
    observations = load_observations(range(CLIMATOLOGY_YEARS.start, 2027))
    normals = climatology(observations)
    sun_threshold = fit_sun_threshold(observations, stations)
    observations_2026 = observations[observations["hour_end"].dt.year == 2026]

    # Dezelfde S1-parameters als in de app: gefit op de HARMONIE-trainingsdagen van evaluate.py.
    harmonie = prepare(load_harmonie(DATA / "harmonie", "block"), observations_2026, stations, normals, sun_threshold)
    day_number = (harmonie["run_day"] - harmonie["run_day"].min()).dt.days
    harmonie_train = harmonie[((day_number // 2) % 2 == 0).to_numpy()].reset_index(drop=True)
    harmonie_estimators = Estimators(harmonie_train)

    icon = load_icon_d2(stations, observations_2026, normals, sun_threshold)
    icon = icon[Quarters(icon, sun_threshold).complete].reset_index(drop=True)
    quarters = Quarters(icon, sun_threshold)
    day_number = (icon["run_day"] - icon["run_day"].min()).dt.days
    train_mask = (day_number % 2 == 0).to_numpy()
    train, test = icon[train_mask].reset_index(drop=True), icon[~train_mask].reset_index(drop=True)

    out = [
        "# U99 zonneschijnduur uit ICON-D2 — meetresultaten",
        "",
        f"ICON-D2 via de Open-Meteo previous-runs-API, {icon['hour_end'].min():%Y-%m-%d} t/m {icon['hour_end'].max():%Y-%m-%d}, "
        f"{icon['station'].nunique()} KNMI-stations met SQ, uren met zon boven de horizon. Puntwaarden (dichtstbijzijnde "
        "2 km-cel). Fit op de even dagen, meting op de oneven dagen.",
        f"Trainingsset {len(train)}, testset {len(test)} stationsuren (alleen uren met alle vier kwartieren). "
        f"Zon mogelijk boven {sun_threshold:.1f}°.",
        "",
        "## Gefitte parameters",
        "",
        *[f"- {line}" for line in harmonie_estimators.parameters()[:1]],
    ]
    sections = []
    truth = icon["sunshine_min"].to_numpy()
    for lead, description in LEADS.items():
        estimators = IconEstimators(train, lead, harmonie_estimators)
        out += [f"- {line}" for line in estimators.parameters()]
        estimates = estimators.apply(test)
        for kind, name, axes in [
            ("global", "Q1 S1 per kwartier op globaal (gefit)", (np.arange(0.0, 0.91, 0.02), np.arange(0.3, 1.21, 0.02))),
            ("direct", "Q2 directe overgang per kwartier (gefit)", (np.arange(0.0, 0.81, 0.02), np.arange(0.1, 1.31, 0.02))),
        ]:
            parameters = grid_fit(
                lambda p: mae(quarters.minutes(lead, kind, p[0], p[1])[train_mask], truth[train_mask]) if p[1] > p[0] else np.inf,
                *axes,
            )
            out.append(f"- {name.split(' (')[0]} ({lead}): laag = {parameters[0]:.3f}, hoog = {parameters[1]:.3f}")
            estimates[name] = quarters.minutes(lead, kind, *parameters)[~train_mask]
        estimates["B1 klimatologie"] = estimates.pop("B1 klimatologie")
        sections += [
            f"## Testset, {description}",
            "",
            *score_table(test, estimates),
            "",
            "Per seizoen (MAE / bias, min/u):",
            "",
            *segment_table(test, estimates, pd.Series(season(test)), list(estimates)),
            "",
        ]
    out += ["", *sections]
    out += harmonie_reference(observations_2026, stations, normals, sun_threshold, icon, harmonie_estimators)
    out += [
        "Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, "
        f"{CLIMATOLOGY_YEARS.start}–{CLIMATOLOGY_YEARS.stop - 1}.",
        "",
    ]
    text = "\n".join(out) + "\n"
    (HERE / "results-icon-d2.md").write_text(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
