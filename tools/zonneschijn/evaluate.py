"""Zonneschijnduur per uur uit HARMONIE: schatters fitten en valideren tegen KNMI-stationsuren.

Invoer (zie fetch_*.py): data/stations.csv, data/obs-<jaar>.csv, data/harmonie/, data/harmonie-kort/,
data/openmeteo.csv; voor Zwitserland (U95c) data/stations-ch.csv, data/obs-ch.csv, data/openmeteo-ch.csv en
meteoswiss-app/. Schrijft results.md naast dit script en print hetzelfde.

Waarheid is KNMI-SQ per uurvak (0,1 u resolutie, door KNMI berekend uit 10-minuten globale straling).
Een uur telt mee als de zon er ergens in boven de horizon staat. Fit op de even rundagen, meet op de oneven.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
DATA = HERE / "data"
SUBSTEPS = 30
SOLAR_CONSTANT = 1361.0
DNI_THRESHOLD = 120.0
CLIMATOLOGY_YEARS = range(2016, 2026)
SWISS_APP_CANDIDATES = ["icon_eu", "icon_global", "ecmwf_ifs", "ecmwf_ifs025"]
SWISS_MODELS = ["meteoswiss_icon_ch1", "meteoswiss_icon_ch2", "icon_d2", "icon_eu"]
SWISS_REGIONS = ["Plateau", "Berg", "Zuid"]


# --- zonnestand (zelfde formules als web/src/core/solar.ts) ---------------------------------------------

def solar_elevation_sin(epoch_seconds: np.ndarray, longitude: np.ndarray, latitude: np.ndarray) -> np.ndarray:
    radians = np.pi / 180
    days = epoch_seconds / 86400 + 2_440_587.5 - 2_451_545
    mean_longitude = np.mod((280.460 + 0.9856474 * days) * radians, 2 * np.pi)
    mean_anomaly = np.mod((357.528 + 0.9856003 * days) * radians, 2 * np.pi)
    ecliptic_longitude = (
        mean_longitude + 1.915 * radians * np.sin(mean_anomaly) + 0.020 * radians * np.sin(2 * mean_anomaly)
    )
    obliquity = (23.439 - 0.0000004 * days) * radians
    right_ascension = np.arctan2(np.cos(obliquity) * np.sin(ecliptic_longitude), np.cos(ecliptic_longitude))
    declination = np.arcsin(np.sin(obliquity) * np.sin(ecliptic_longitude))
    sidereal_time = np.mod((280.46061837 + 360.98564736629 * days) * radians, 2 * np.pi)
    subsolar_longitude = right_ascension - sidereal_time
    hour_angle = longitude * radians - subsolar_longitude
    lat = latitude * radians
    return np.sin(lat) * np.sin(declination) + np.cos(lat) * np.cos(declination) * np.cos(hour_angle)


def erbs_diffuse_fraction(clearness: np.ndarray) -> np.ndarray:
    k = np.clip(clearness, 0, None)
    middle = 0.9511 - 0.1604 * k + 4.388 * k**2 - 16.638 * k**3 + 12.336 * k**4
    return np.where(k <= 0.22, 1 - 0.09 * k, np.where(k <= 0.80, middle, 0.165))


def add_geometry(frame: pd.DataFrame, sun_threshold_degrees: float, substeps: int = SUBSTEPS) -> pd.DataFrame:
    """Zongeometrie over het uur [T−1 u, T] in `substeps` stappen (standaard middens van 2 minuten)."""
    hour_end = (frame["hour_end"] - pd.Timestamp("1970-01-01")).dt.total_seconds().to_numpy()
    offsets = (np.arange(substeps) + 0.5) / substeps * 3600 - 3600
    epochs = hour_end[:, None] + offsets[None, :]
    mu = solar_elevation_sin(epochs, frame["lon"].to_numpy()[:, None], frame["lat"].to_numpy()[:, None])
    day_of_year = frame["hour_end"].dt.dayofyear.to_numpy()[:, None]
    extraterrestrial = SOLAR_CONSTANT * (1 + 0.033 * np.cos(2 * np.pi * day_of_year / 365))
    sun_up = mu > 0
    safe_mu = np.where(sun_up, mu, 1.0)
    # Haurwitz, zoals de UV-schatting in docs/fields.md.
    clear_global = np.where(sun_up, 1098 * safe_mu * np.exp(-0.057 / safe_mu), 0.0)
    clear_clearness = np.where(sun_up, clear_global / (extraterrestrial * safe_mu), 0.0)
    clear_direct_normal = np.where(
        sun_up, clear_global * (1 - erbs_diffuse_fraction(clear_clearness)) / safe_mu, 0.0
    )
    frame = frame.copy()
    frame["mu_max"] = mu.max(axis=1)
    frame["elevation_mean"] = np.degrees(np.arcsin(np.clip(np.where(sun_up, mu, 0).mean(axis=1), -1, 1)))
    frame["clear_global"] = clear_global.mean(axis=1)
    frame["extraterrestrial_horizontal"] = (extraterrestrial * np.where(sun_up, mu, 0)).mean(axis=1)
    frame["mu_mean_up"] = np.where(sun_up.any(axis=1), np.where(sun_up, mu, 0).sum(axis=1) / np.maximum(sun_up.sum(axis=1), 1), 0)
    frame["clear_direct_normal"] = clear_direct_normal.mean(axis=1)
    frame["up_fraction"] = sun_up.mean(axis=1)
    # Fractie van het uur waarin KNMI bij heldere hemel zon telt: het maximum aan zon in dat uur.
    frame["possible"] = (mu > np.sin(np.radians(sun_threshold_degrees))).mean(axis=1)
    return frame


# --- data ------------------------------------------------------------------------------------------------

def load_stations() -> pd.DataFrame:
    return pd.read_csv(DATA / "stations.csv")


def load_observations(years: range) -> pd.DataFrame:
    frames = [pd.read_csv(DATA / f"obs-{year}.csv") for year in years if (DATA / f"obs-{year}.csv").exists()]
    observations = pd.concat(frames, ignore_index=True)
    observations["hour_end"] = pd.to_datetime(observations["hour_end_utc"], format="%Y-%m-%dT%H")
    return observations.drop(columns="hour_end_utc")


def load_harmonie(directory: Path, variant: str) -> pd.DataFrame:
    """Per (run, lead, station) het uurgemiddelde van straling en bewolking over [lead−1, lead]."""
    frames = []
    for path in sorted(directory.glob("*.csv")):
        run = pd.read_csv(path)
        run = run.sort_values(["station", "lead"])
        previous = run.groupby("station").shift(1)
        consecutive = run["lead"] - previous["lead"] == 1
        hourly = pd.DataFrame({
            "run": run["run"],
            "lead": run["lead"],
            "station": run["station"],
            "radiation": (run[f"radiation_acc_{variant}"] - previous[f"radiation_acc_{variant}"]) / 3600,
        })
        for layer in ["total", "low", "mid", "high"]:
            column = f"cloud_{layer}_{variant}"
            hourly[f"cloud_{layer}"] = (run[column] + previous[column]) / 2
        frames.append(hourly[consecutive])
    harmonie = pd.concat(frames, ignore_index=True)
    run_time = pd.to_datetime(harmonie["run"].astype(str), format="%Y%m%d%H")
    harmonie["hour_end"] = run_time + pd.to_timedelta(harmonie["lead"], unit="h")
    harmonie["run_day"] = run_time.dt.normalize()
    harmonie["radiation"] = harmonie["radiation"].clip(lower=0)
    return harmonie


def fit_sun_threshold(observations: pd.DataFrame, stations: pd.DataFrame) -> float:
    """Zonshoogte waarboven KNMI-SQ zon telt, uit heldere uren rond zonsopkomst en -ondergang (alleen waarnemingen).

    Heldere hemel volgens Haurwitz bereikt de WMO-drempel (DNI > 120 W/m²) pas bij ~5°; de KNMI-afleiding uit
    globale straling telt eerder. Daarom fitten we de grens op het label zelf.
    """
    frame = observations[observations["hour_end"].dt.year == 2025].merge(stations[["station", "lon", "lat"]], on="station")
    frame = add_geometry(frame, 0.0)
    clear_index = frame["radiation_wm2"] / frame["clear_global"].clip(lower=1)
    low_sun = (frame["mu_max"] > 0) & (frame["mu_max"] < np.sin(np.radians(12)))
    edge = frame[low_sun & (clear_index > 0.85) & (frame["clear_global"] > 5)].reset_index(drop=True)
    thresholds = np.round(np.arange(2.0, 6.01, 0.1), 1)
    errors = [mae(60 * add_geometry(edge, threshold)["possible"].to_numpy(), edge["sunshine_min"].to_numpy()) for threshold in thresholds]
    return float(thresholds[int(np.argmin(errors))])


def climatology(observations: pd.DataFrame) -> pd.DataFrame:
    history = observations[observations["hour_end"].dt.year.isin(list(CLIMATOLOGY_YEARS))]
    keys = [history["station"], history["hour_end"].dt.month.rename("month"), history["hour_end"].dt.hour.rename("hour")]
    return history.groupby(keys)["sunshine_min"].mean().rename("climatology").reset_index()


# --- schatters -------------------------------------------------------------------------------------------

def clear_sky_index(radiation: np.ndarray, clear_global: np.ndarray) -> np.ndarray:
    return np.where(clear_global > 1, np.clip(radiation / np.maximum(clear_global, 1), 0, 1.5), 0.0)


def ramp_estimate(frame: pd.DataFrame, radiation: np.ndarray, low: float, high: float) -> np.ndarray:
    index = clear_sky_index(radiation, frame["clear_global"].to_numpy())
    return 60 * frame["possible"].to_numpy() * np.clip((index - low) / max(high - low, 1e-6), 0, 1)


def threshold_estimate(frame: pd.DataFrame, radiation: np.ndarray, threshold: float) -> np.ndarray:
    index = clear_sky_index(radiation, frame["clear_global"].to_numpy())
    return 60 * frame["possible"].to_numpy() * (index > threshold)


def direct_beam_hour_mean(frame: pd.DataFrame, radiation: np.ndarray) -> np.ndarray:
    """Uurgemiddelde DNI (nul gerekend waar de zon onder is) via Erbs-decompositie van het uurgemiddelde."""
    horizontal = frame["extraterrestrial_horizontal"].to_numpy()
    clearness = np.where(horizontal > 1, radiation / np.maximum(horizontal, 1), 0)
    mu = np.maximum(frame["mu_mean_up"].to_numpy(), 0.02)
    return radiation * (1 - erbs_diffuse_fraction(clearness)) / mu


def beam_ratio_estimate(frame: pd.DataFrame, radiation: np.ndarray) -> np.ndarray:
    clear = frame["clear_direct_normal"].to_numpy()
    ratio = np.where(clear > 1, direct_beam_hour_mean(frame, radiation) / np.maximum(clear, 1), 0)
    return 60 * frame["possible"].to_numpy() * np.clip(ratio, 0, 1)


def beam_threshold_estimate(frame: pd.DataFrame, radiation: np.ndarray) -> np.ndarray:
    """Zoals Open-Meteo: alles-of-niets op de DNI van het uurgemiddelde, per minuut dat de zon op is."""
    up_fraction = np.maximum(frame["up_fraction"].to_numpy(), 1 / SUBSTEPS)
    beam = direct_beam_hour_mean(frame, radiation) / up_fraction
    return 60 * frame["possible"].to_numpy() * (beam > DNI_THRESHOLD)


def total_cloud_estimate(frame: pd.DataFrame) -> np.ndarray:
    return 60 * frame["possible"].to_numpy() * (1 - frame["cloud_total"].clip(0, 1).to_numpy())


def layered_cloud_estimate(frame: pd.DataFrame, high_weight: float, exponent: float) -> np.ndarray:
    low = frame["cloud_low"].clip(0, 1).to_numpy()
    mid = frame["cloud_mid"].clip(0, 1).to_numpy()
    high = frame["cloud_high"].clip(0, 1).to_numpy()
    open_line_of_sight = (1 - low) * (1 - mid) * (1 - np.clip(high_weight, 0, 1) * high)
    return 60 * frame["possible"].to_numpy() * open_line_of_sight ** max(exponent, 0.05)


def grid_fit(loss_of_parameters, first_axis: np.ndarray, second_axis: np.ndarray) -> np.ndarray:
    """MAE is stuksgewijs vlak; een rooster vindt het globale minimum waar Nelder-Mead blijft hangen."""
    best, best_loss = None, np.inf
    for first in first_axis:
        for second in second_axis:
            loss = loss_of_parameters((first, second))
            if loss < best_loss:
                best, best_loss = (first, second), loss
    return np.array(best)


def mae(estimate: np.ndarray, truth: np.ndarray) -> float:
    return float(np.mean(np.abs(estimate - truth)))


class Estimators:
    """Fit de vrije parameters op een trainingsframe; past alles toe op een willekeurig frame."""

    def __init__(self, train: pd.DataFrame):
        truth = train["sunshine_min"].to_numpy()
        radiation = train["radiation"].to_numpy()
        self.ramp = grid_fit(
            lambda p: mae(ramp_estimate(train, radiation, p[0], p[1]), truth) if p[1] > p[0] else np.inf,
            np.arange(0.0, 0.91, 0.02), np.arange(0.3, 1.21, 0.02),
        )
        thresholds = np.linspace(0.2, 1.0, 81)
        self.threshold = float(thresholds[np.argmin([mae(threshold_estimate(train, radiation, t), truth) for t in thresholds])])
        self.layered = grid_fit(
            lambda p: mae(layered_cloud_estimate(train, p[0], p[1]), truth),
            np.arange(0.0, 1.01, 0.05), np.arange(0.2, 3.01, 0.05),
        )
        ramp = ramp_estimate(train, radiation, *self.ramp)
        layered = layered_cloud_estimate(train, *self.layered)
        weights = np.linspace(0, 1, 101)
        self.blend = float(weights[np.argmin([mae(w * ramp + (1 - w) * layered, truth) for w in weights])])

    def parameters(self) -> list[str]:
        return [
            f"S1 k-overgang: k_laag = {self.ramp[0]:.3f}, k_hoog = {self.ramp[1]:.3f}",
            f"B2 k-drempel: k > {self.threshold:.3f}",
            f"S4 wolkenlagen: gewicht hoge bewolking = {np.clip(self.layered[0], 0, 1):.3f}, exponent = {self.layered[1]:.3f}",
            f"S5 combinatie: {self.blend:.2f} × S1 + {1 - self.blend:.2f} × S4",
        ]

    def s1(self, frame: pd.DataFrame, radiation: np.ndarray) -> np.ndarray:
        """Alleen S1, voor frames zonder bewolkingsvelden (Zwitserland)."""
        return ramp_estimate(frame, radiation, *self.ramp)

    def apply(self, frame: pd.DataFrame, radiation: np.ndarray | None = None) -> dict[str, np.ndarray]:
        radiation = frame["radiation"].to_numpy() if radiation is None else radiation
        ramp = ramp_estimate(frame, radiation, *self.ramp)
        layered = layered_cloud_estimate(frame, *self.layered)
        return {
            "S1 k-overgang (gefit)": ramp,
            "S2 DNI-verhouding (Erbs, vrij)": beam_ratio_estimate(frame, radiation),
            "S2b DNI > 120 op uurgemiddelde": beam_threshold_estimate(frame, radiation),
            "S3 1 − totale bewolking (vrij)": total_cloud_estimate(frame),
            "S4 wolkenlagen (gefit)": layered,
            "S5 combinatie S1/S4 (gefit)": self.blend * ramp + (1 - self.blend) * layered,
            "B1 klimatologie": frame["climatology"].to_numpy(),
            "B2 k-drempel (gefit)": threshold_estimate(frame, radiation, self.threshold),
        }


# --- rapportage ------------------------------------------------------------------------------------------

def score_table(frame: pd.DataFrame, estimates: dict[str, np.ndarray]) -> list[str]:
    truth = frame["sunshine_min"].to_numpy()
    climatology_mae = mae(estimates["B1 klimatologie"], truth)
    daily = frame[["station", "run_day"]].copy()
    daily["truth"] = truth
    lines = [
        "| schatter | MAE (min/u) | bias (min/u) | vaardigheid t.o.v. B1 | MAE dagsom (u) | bias dagsom (u) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for name, estimate in estimates.items():
        daily["estimate"] = estimate
        sums = daily.groupby(["station", "run_day"])[["truth", "estimate"]].sum() / 60
        lines.append(
            f"| {name} | {mae(estimate, truth):.1f} | {np.mean(estimate - truth):+.1f} | "
            f"{1 - mae(estimate, truth) / climatology_mae:+.2f} | "
            f"{np.mean(np.abs(sums['estimate'] - sums['truth'])):.2f} | {np.mean(sums['estimate'] - sums['truth']):+.2f} |"
        )
    return lines


def segment_table(frame: pd.DataFrame, estimates: dict[str, np.ndarray], segment: pd.Series, names: list[str]) -> list[str]:
    truth = frame["sunshine_min"].to_numpy()
    groups = [group for group in segment.cat.categories if (segment == group).any()]
    lines = [
        "| schatter | " + " | ".join(f"{group} (n={int((segment == group).sum())})" for group in groups) + " |",
        "| --- |" + " ---: |" * len(groups),
    ]
    for name in names:
        cells = []
        for group in groups:
            mask = (segment == group).to_numpy()
            cells.append(f"{mae(estimates[name][mask], truth[mask]):.1f} / {np.mean(estimates[name][mask] - truth[mask]):+.1f}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return lines


def season(frame: pd.DataFrame) -> pd.Series:
    labels = {1: "winter", 2: "winter", 3: "lente", 4: "lente", 5: "lente", 6: "zomer", 7: "zomer", 8: "zomer", 9: "herfst", 10: "herfst"}
    return pd.Categorical(frame["hour_end"].dt.month.map(labels), categories=["winter", "lente", "zomer", "herfst"])


def elevation_band(frame: pd.DataFrame) -> pd.Series:
    return pd.cut(frame["elevation_mean"], [-90, 10, 25, 40, 90], labels=["< 10°", "10–25°", "25–40°", "> 40°"])


def lead_band(frame: pd.DataFrame) -> pd.Series:
    return pd.cut(frame["lead"], [0, 9, 15, 21], labels=["+4…+9", "+10…+15", "+16…+21"])


def prepare(harmonie: pd.DataFrame, observations: pd.DataFrame, stations: pd.DataFrame, normals: pd.DataFrame, sun_threshold: float) -> pd.DataFrame:
    frame = harmonie.merge(observations, on=["station", "hour_end"], how="inner")
    frame = frame.merge(stations[["station", "lon", "lat"]], on="station")
    frame["month"] = frame["hour_end"].dt.month
    frame["hour"] = frame["hour_end"].dt.hour
    frame = frame.merge(normals, on=["station", "month", "hour"], how="inner")
    frame = add_geometry(frame, sun_threshold)
    frame = frame[frame["mu_max"] > 0].dropna(subset=["radiation", "cloud_total"]).reset_index(drop=True)
    return frame


def main() -> int:
    stations = load_stations()
    observations = load_observations(range(CLIMATOLOGY_YEARS.start, 2027))
    normals = climatology(observations)
    sun_threshold = fit_sun_threshold(observations, stations)
    observations_2026 = observations[observations["hour_end"].dt.year == 2026]
    sunshine_stations = set(observations_2026["station"].unique())
    out = ["# U95 zonneschijnduur — meetresultaten", ""]

    frames = {}
    for variant in ["block", "point"]:
        harmonie = load_harmonie(DATA / "harmonie", variant)
        frames[variant] = prepare(harmonie, observations_2026, stations, normals, sun_threshold)
    frame = frames["block"]
    day_number = (frame["run_day"] - frame["run_day"].min()).dt.days
    train_mask = ((day_number // 2) % 2 == 0).to_numpy()
    train, test = frame[train_mask].reset_index(drop=True), frame[~train_mask].reset_index(drop=True)
    estimators = Estimators(train)
    estimates = estimators.apply(test)

    out += [
        "Dataset: HARMONIE-AROME P1, 00 UTC-runs om de dag van "
        f"{frame['run_day'].min():%Y-%m-%d} t/m {frame['run_day'].max():%Y-%m-%d}, leads +4…+21, "
        f"{len(sunshine_stations)} KNMI-stations met SQ, uren met zon boven de horizon.",
        f"Fit op {train['run_day'].nunique()} rundagen ({len(train)} stationsuren), "
        f"meting op {test['run_day'].nunique()} andere rundagen ({len(test)} stationsuren).",
        "Straling: blokgemiddelde ≈ 8 km, bewolking ≈ 16 km rond het station (zoals de app-velden).",
        "",
        "## Gefitte parameters",
        "",
        f"- zon mogelijk boven zonshoogte {sun_threshold:.1f}° (gefit op heldere randuren 2025, alleen waarnemingen)",
        *[f"- {line}" for line in estimators.parameters()],
        "",
        "## Testset, alle leads",
        "",
        *score_table(test, estimates),
        "",
        "Vaardigheid = 1 − MAE/MAE(klimatologie). Klimatologie = gemiddelde SQ per station, maand en uur, "
        f"{CLIMATOLOGY_YEARS.start}–{CLIMATOLOGY_YEARS.stop - 1}.",
        "",
    ]

    shown = ["S1 k-overgang (gefit)", "S2 DNI-verhouding (Erbs, vrij)", "S4 wolkenlagen (gefit)", "S5 combinatie S1/S4 (gefit)", "B1 klimatologie", "B2 k-drempel (gefit)"]
    out += ["## Per seizoen (MAE / bias, min/u)", "", *segment_table(test, estimates, pd.Series(season(test)), shown), ""]
    out += ["## Per zonshoogte (uurgemiddelde)", "", *segment_table(test, estimates, elevation_band(test), shown), ""]
    out += ["## Per lead", "", *segment_table(test, estimates, lead_band(test), shown), ""]

    point = frames["point"]
    point_test = point[point.set_index(["run", "lead", "station"]).index.isin(test.set_index(["run", "lead", "station"]).index)].reset_index(drop=True)
    point_estimates = estimators.apply(point_test)
    out += [
        "## Resolutie: dichtstbijzijnde 2 km-cel in plaats van blokgemiddelde (zelfde parameters)",
        "",
        *score_table(point_test, {name: point_estimates[name] for name in ["S1 k-overgang (gefit)", "S4 wolkenlagen (gefit)", "S5 combinatie S1/S4 (gefit)", "B1 klimatologie"]}),
        "",
    ]

    coarse = add_geometry(test, sun_threshold, substeps=6)
    coarse_estimates = estimators.apply(coarse)
    out += [
        "## Gevoeligheid: 6 substappen van 10 minuten in plaats van 30 van 2 minuten (zelfde parameters)",
        "",
        *score_table(coarse, {name: coarse_estimates[name] for name in ["S1 k-overgang (gefit)", "S4 wolkenlagen (gefit)", "B1 klimatologie"]}),
        "",
    ]

    observed_estimates = estimators.apply(test, test["radiation_wm2"].to_numpy())
    out += [
        "## Plafond: dezelfde schatters op de gemeten stationsstraling Q",
        "",
        "Zonder modelfout: wat er overblijft is de omrekening van een uurgemiddelde naar minuten zon.",
        "",
        *score_table(test, {name: observed_estimates[name] for name in ["S1 k-overgang (gefit)", "S2 DNI-verhouding (Erbs, vrij)", "S2b DNI > 120 op uurgemiddelde", "B2 k-drempel (gefit)", "B1 klimatologie"]}),
        "",
    ]

    openmeteo_lines, netherlands_short = openmeteo_section(estimators, observations_2026, stations, normals, sun_threshold)
    out += openmeteo_lines
    out += swiss_section(estimators, sun_threshold, netherlands_short)
    text = "\n".join(out) + "\n"
    (HERE / "results.md").write_text(text)
    print(text)
    return 0


def openmeteo_section(
    estimators: Estimators, observations: pd.DataFrame, stations: pd.DataFrame, normals: pd.DataFrame, sun_threshold: float
) -> tuple[list[str], tuple[pd.DataFrame, dict[str, np.ndarray]]]:
    """Geeft naast de tekst de korte HARMONIE-set terug (frame en schattingen) voor de naast-elkaar-tabel van U95c."""
    openmeteo = pd.read_csv(DATA / "openmeteo.csv")
    openmeteo["hour_end"] = pd.to_datetime(openmeteo["hour_end_utc"], format="%Y-%m-%dT%H")
    models = [column.removesuffix("_sunshine_min") for column in openmeteo.columns if column.endswith("_sunshine_min")]
    lines = ["## Extern: Open-Meteo (historical-forecast, korte termijn)", ""]
    for directory, description in [
        ("harmonie-kort", "HARMONIE-runs 03/06/09/12/15/18 UTC om de 4 dagen, leads +1…+3 (zelfde korte termijn als Open-Meteo)"),
        ("harmonie", "00 UTC-runs, leads +4…+21, alle dagen (fit + test)"),
    ]:
        frame = prepare(load_harmonie(DATA / directory, "block"), observations, stations, normals, sun_threshold)
        frame = frame.merge(openmeteo.drop(columns="hour_end_utc"), on=["station", "hour_end"], how="inner")
        frame = frame.dropna(subset=[f"{model}_sunshine_min" for model in models]).reset_index(drop=True)
        estimates = estimators.apply(frame)
        if directory == "harmonie-kort":
            short = (frame, {
                "B1 klimatologie": estimates["B1 klimatologie"],
                "S1 op landsmodel": estimates["S1 k-overgang (gefit)"],
                "landsmodel via Open-Meteo": frame["knmi_seamless_sunshine_min"].to_numpy(),
                "icon_d2 via Open-Meteo": frame["icon_d2_sunshine_min"].to_numpy(),
                "S1 op icon_d2": estimators.apply(frame, frame["icon_d2_radiation_wm2"].to_numpy(dtype=float))["S1 k-overgang (gefit)"],
            })
        selected = {name: estimates[name] for name in ["S1 k-overgang (gefit)", "S4 wolkenlagen (gefit)", "S5 combinatie S1/S4 (gefit)", "B1 klimatologie"]}
        for model in models:
            selected[f"Open-Meteo {model}"] = frame[f"{model}_sunshine_min"].to_numpy()
        lines += [f"### {description}", "", f"{len(frame)} stationsuren.", "", *score_table(frame, selected), ""]
        lines += ["Per seizoen (MAE / bias, min/u):", "", *segment_table(frame, selected, pd.Series(season(frame)), list(selected)), ""]
        candidates = {name: selected[name] for name in ["S1 k-overgang (gefit)", "B1 klimatologie"]}
        for model in [*SWISS_APP_CANDIDATES, "icon_d2"]:
            candidates[f"Open-Meteo {model}"] = selected[f"Open-Meteo {model}"]
            radiation = frame[f"{model}_radiation_wm2"].to_numpy(dtype=float)
            candidates[f"S1 op straling {model}"] = estimators.apply(frame, radiation)["S1 k-overgang (gefit)"]
        lines += [
            "Kandidaten voor de MeteoSwiss-app buiten het ICON-CH-gebied, plus icon_d2 (U95c): hun eigen zonneschijnduur (Open-Meteo) "
            "naast S1 op hun eigen uurstraling, met dezelfde parameters als op HARMONIE.",
            "",
            *score_table(frame, candidates),
            "",
        ]
    lines += [
        "Open-Meteo-cijfers gelden voor hun eigen korte-termijnreeks; bij de 00 UTC-rij hebben zij dus een kortere "
        "lead dan HARMONIE. Fit-dagen tellen in deze sectie mee; de parameters hebben 1–2 vrijheidsgraden per schatter.",
        "",
    ]
    return lines, short


# --- Zwitserland (U95c) ----------------------------------------------------------------------------------

def load_swiss() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """SwissMetNet-stations, -uren en klimatologie."""
    stations = pd.read_csv(DATA / "stations-ch.csv")
    observations = pd.read_csv(DATA / "obs-ch.csv")
    observations["hour_end"] = pd.to_datetime(observations["hour_end_utc"], format="%Y-%m-%dT%H")
    observations = observations.drop(columns="hour_end_utc")
    normals = climatology(observations)
    return stations, observations, normals


def swiss_frame(frame: pd.DataFrame, stations: pd.DataFrame, normals: pd.DataFrame, sun_threshold: float) -> pd.DataFrame:
    frame = frame.merge(stations[["station", "lon", "lat", "region"]], on="station")
    frame["month"] = frame["hour_end"].dt.month
    frame["hour"] = frame["hour_end"].dt.hour
    frame = frame.merge(normals, on=["station", "month", "hour"], how="inner")
    frame = add_geometry(frame, sun_threshold)
    return frame[frame["mu_max"] > 0].reset_index(drop=True)


def region_table(frame: pd.DataFrame, estimates: dict[str, np.ndarray], names: list[str]) -> list[str]:
    """MAE / vaardigheid per regio; vaardigheid t.o.v. de klimatologie van dezelfde uren."""
    truth = frame["sunshine_min"].to_numpy()
    masks = {"Zwitserland": np.ones(len(frame), bool), **{region: (frame["region"] == region).to_numpy() for region in SWISS_REGIONS}}
    lines = [
        "| schatter | " + " | ".join(f"{name} (n={int(mask.sum())})" for name, mask in masks.items()) + " |",
        "| --- |" + " ---: |" * len(masks),
    ]
    for name in names:
        cells = []
        for mask in masks.values():
            error = mae(estimates[name][mask], truth[mask])
            reference = mae(estimates["B1 klimatologie"][mask], truth[mask])
            cells.append(f"{error:.1f} / {np.mean(estimates[name][mask] - truth[mask]):+.1f} / {1 - error / reference:+.2f}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return lines


def swiss_section(estimators: Estimators, sun_threshold: float, netherlands_short: tuple[pd.DataFrame, dict[str, np.ndarray]]) -> list[str]:
    stations, observations, normals = load_swiss()
    openmeteo = pd.read_csv(DATA / "openmeteo-ch.csv")
    openmeteo["hour_end"] = pd.to_datetime(openmeteo["hour_end_utc"], format="%Y-%m-%dT%H")
    openmeteo = openmeteo.drop(columns="hour_end_utc")
    period = (observations["hour_end"] > "2026-01-09") & (observations["hour_end"] <= "2026-10-16")
    frame = observations[period].merge(openmeteo, on=["station", "hour_end"], how="inner")
    frame = frame.dropna(subset=[f"{model}_{kind}" for model in SWISS_MODELS for kind in ["sunshine_min", "radiation_wm2"]])
    frame = swiss_frame(frame, stations, normals, sun_threshold)
    frame["run_day"] = frame["hour_end"].dt.normalize()

    estimates = {"B1 klimatologie": frame["climatology"].to_numpy()}
    for model in SWISS_MODELS:
        estimates[f"Open-Meteo {model}"] = frame[f"{model}_sunshine_min"].to_numpy()
        radiation = frame[f"{model}_radiation_wm2"].to_numpy(dtype=float)
        estimates[f"S1 op straling {model}"] = estimators.s1(frame, radiation)
    estimates["S1 op gemeten straling (plafond)"] = estimators.s1(frame, frame["radiation_wm2"].to_numpy(dtype=float))
    names = list(estimates)

    lines = [
        "## Zwitserland: SwissMetNet tegen ICON-CH (U95c)",
        "",
        f"{frame['station'].nunique()} SwissMetNet-stations, uur-einde {frame['hour_end'].min():%Y-%m-%d} t/m "
        f"{frame['hour_end'].max():%Y-%m-%d}, zon boven de horizon; {len(frame)} stationsuren. Regio's: "
        + "; ".join(f"{region} " + ", ".join(stations.loc[stations['region'] == region, 'station']) for region in SWISS_REGIONS) + ".",
        "Waarheid: sre000h0 (zonneschijnsensor, WMO-drempel op directe straling), niet afgeleid uit globale straling zoals "
        "KNMI-SQ. Modellen: Open-Meteo historical-forecast (korte termijn, zoals in de NL-sectie hierboven). S1 met de "
        "NL-parameters (k-grenzen en 4,2°-grens), zonder terreinhorizon.",
        "",
        "Cellen: MAE / bias / vaardigheid t.o.v. klimatologie (min/u). Klimatologie = gemiddelde sre000h0 per station, "
        f"maand en uur, {CLIMATOLOGY_YEARS.start}–{CLIMATOLOGY_YEARS.stop - 1}.",
        "",
        *region_table(frame, estimates, names),
        "",
        "Dagsommen (alle Zwitserse stations):",
        "",
        *score_table(frame, estimates),
        "",
        "Per seizoen, Plateau (MAE / bias, min/u):",
        "",
    ]
    plateau = (frame["region"] == "Plateau").to_numpy()
    plateau_frame = frame[plateau].reset_index(drop=True)
    plateau_estimates = {name: estimate[plateau] for name, estimate in estimates.items()}
    lines += [*segment_table(plateau_frame, plateau_estimates, pd.Series(season(plateau_frame)), names), ""]

    lines += refit_lines(frame, sun_threshold)
    lines += side_by_side(frame, estimates, netherlands_short)
    lines += app_section(estimators, stations, observations, normals, openmeteo, sun_threshold)
    return lines


def refit_lines(frame: pd.DataFrame, sun_threshold: float) -> list[str]:
    """Hoeveel kost het dat S1 op KNMI-SQ is gefit? k-grenzen opnieuw op even Zwitserse dagen, gemeten op oneven."""
    day_number = (frame["run_day"] - frame["run_day"].min()).dt.days
    train_mask = (day_number % 2 == 0).to_numpy()
    train, test = frame[train_mask].reset_index(drop=True), frame[~train_mask].reset_index(drop=True)
    radiation = train["meteoswiss_icon_ch1_radiation_wm2"].to_numpy(dtype=float)
    truth = train["sunshine_min"].to_numpy()
    low, high = grid_fit(
        lambda p: mae(ramp_estimate(train, radiation, p[0], p[1]), truth) if p[1] > p[0] else np.inf,
        np.arange(0.0, 0.91, 0.02), np.arange(0.3, 1.21, 0.02),
    )
    test_radiation = test["meteoswiss_icon_ch1_radiation_wm2"].to_numpy(dtype=float)
    estimates = {
        "B1 klimatologie": test["climatology"].to_numpy(),
        "Open-Meteo meteoswiss_icon_ch1": test["meteoswiss_icon_ch1_sunshine_min"].to_numpy(),
        "S1 op straling meteoswiss_icon_ch1, k-grenzen hergefit op CH": ramp_estimate(test, test_radiation, low, high),
    }
    return [
        f"Hergefit op Zwitserse even dagen: k_laag = {low:.2f}, k_hoog = {high:.2f}. Meting op de oneven dagen:",
        "",
        *region_table(test, estimates, list(estimates)),
        "",
    ]


def side_by_side(frame: pd.DataFrame, estimates: dict[str, np.ndarray], netherlands_short: tuple[pd.DataFrame, dict[str, np.ndarray]]) -> list[str]:
    """Elk land met zijn eigen landsmodel: HARMONIE/knmi_seamless in NL, ICON-CH1 in CH; icon_d2 als zelfde model in beide."""
    netherlands_frame, netherlands = netherlands_short
    rows = {
        "landsmodel via Open-Meteo (knmi_seamless / meteoswiss_icon_ch1)": ("landsmodel via Open-Meteo", "Open-Meteo meteoswiss_icon_ch1"),
        "S1 op straling landsmodel (HARMONIE / ICON-CH1)": ("S1 op landsmodel", "S1 op straling meteoswiss_icon_ch1"),
        "Open-Meteo icon_d2 (zelfde model)": ("icon_d2 via Open-Meteo", "Open-Meteo icon_d2"),
        "S1 op straling icon_d2": ("S1 op icon_d2", "S1 op straling icon_d2"),
        "B1 klimatologie": ("B1 klimatologie", "B1 klimatologie"),
    }
    columns = {"Nederland": (netherlands_frame, netherlands, None)}
    columns["Zwitserland"] = (frame, estimates, np.ones(len(frame), bool))
    for region in SWISS_REGIONS:
        columns[region] = (frame, estimates, (frame["region"] == region).to_numpy())
    lines = [
        "### Naast elkaar: Nederland en Zwitserland (MAE / vaardigheid t.o.v. klimatologie)",
        "",
        "Nederland = de korte HARMONIE-set (+1…+3) hierboven; Zwitserland = alle dagen van dezelfde periode.",
        "",
        "| schatter | " + " | ".join(f"{name} (n={len(data[0]) if mask is None else int(mask.sum())})" for name, data in columns.items() for mask in [data[2]]) + " |",
        "| --- |" + " ---: |" * len(columns),
    ]
    for label, (netherlands_name, swiss_name) in rows.items():
        cells = []
        for country, (data, country_estimates, mask) in columns.items():
            name = netherlands_name if country == "Nederland" else swiss_name
            mask = np.ones(len(data), bool) if mask is None else mask
            truth = data["sunshine_min"].to_numpy()[mask]
            error = mae(country_estimates[name][mask], truth)
            reference = mae(country_estimates["B1 klimatologie"][mask], truth)
            cells.append(f"{error:.1f}" if label == "B1 klimatologie" else f"{error:.1f} / {1 - error / reference:+.2f}")
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    return lines + [""]


def app_section(
    estimators: Estimators, stations: pd.DataFrame, observations: pd.DataFrame, normals: pd.DataFrame,
    openmeteo: pd.DataFrame, sun_threshold: float,
) -> list[str]:
    """Steekproef van wat de app echt toonde (MeteoSwiss bewaart ~2 dagen; zie fetch_app.py)."""
    paths = sorted((HERE / "meteoswiss-app").glob("*.csv.gz"))
    if not paths:
        return []
    app = pd.concat([pd.read_csv(path, dtype={"run": str}) for path in paths], ignore_index=True)
    app["hour_end"] = pd.to_datetime(app["hour_end_utc"], format="%Y-%m-%dT%H")
    app["run_time"] = pd.to_datetime(app["run"], format="%Y%m%d%H")
    app["lead"] = (app["hour_end"] - app["run_time"]).dt.total_seconds() / 3600
    app = app[app["lead"] >= 1].rename(columns={"sunshine_min": "app_sunshine_min", "radiation_wm2": "app_radiation_wm2"})
    frame = app.drop(columns="hour_end_utc").merge(observations, on=["station", "hour_end"], how="inner")
    frame = frame.merge(openmeteo, on=["station", "hour_end"], how="left")
    frame = swiss_frame(frame, stations, normals, sun_threshold)
    frame = frame.dropna(subset=["meteoswiss_icon_ch1_sunshine_min", "meteoswiss_icon_ch1_radiation_wm2"]).reset_index(drop=True)
    if frame.empty:
        return []
    frame["run_day"] = frame["run"] + frame["hour_end"].dt.strftime("%Y%m%d")
    estimates = {
        "MeteoSwiss-app (sre000h0)": frame["app_sunshine_min"].to_numpy(dtype=float),
        "S1 op app-straling (gre000h0)": estimators.s1(frame, frame["app_radiation_wm2"].to_numpy(dtype=float)),
        "Open-Meteo meteoswiss_icon_ch1 (zelfde uren)": frame["meteoswiss_icon_ch1_sunshine_min"].to_numpy(),
        "S1 op straling meteoswiss_icon_ch1 (zelfde uren)": estimators.s1(frame, frame["meteoswiss_icon_ch1_radiation_wm2"].to_numpy(dtype=float)),
        "B1 klimatologie": frame["climatology"].to_numpy(),
    }
    leads = pd.cut(frame["lead"], [0, 12, 24, 48, 200], labels=["+1…+12", "+13…+24", "+25…+48", "> +48"])
    return [
        "### De MeteoSwiss-app zelf (steekproef)",
        "",
        f"{frame['run'].nunique()} app-runs ({frame['run'].min()}…{frame['run'].max()} UTC), uur-einde "
        f"{frame['hour_end'].min():%Y-%m-%d %H} t/m {frame['hour_end'].max():%Y-%m-%d %H} UTC, {frame['station'].nunique()} stations, "
        f"{len(frame)} run×stationsuren met zon boven de horizon. Uren vóór de runtijd zijn weggelaten. Elke valid-uur telt "
        "per run mee, dus de uren zijn sterk gecorreleerd: dit is een steekproef van een paar dagen, geen klimatologie. "
        "Open-Meteo is hier steeds hun korte-termijnreeks, dus bij lange app-leads geen eerlijke tegenhanger.",
        "",
        *region_table(frame, estimates, list(estimates)),
        "",
        "Per lead (alle stations, MAE / bias):",
        "",
        *segment_table(frame, estimates, leads, list(estimates)),
        "",
    ]


if __name__ == "__main__":
    sys.exit(main())
