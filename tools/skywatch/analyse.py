from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

CLASSES = ("strakblauw", "mooie wolkenlucht", "melkachtig", "grijs", "Mordor")
FEATURES = ("cloud_low_pct", "cloud_mid_pct", "cloud_high_pct", "cloud_frac_pct", "cmf")


@dataclass(frozen=True)
class TreeNode:
    prediction: float
    count: int
    feature: str | None = None
    threshold: float | None = None
    left: TreeNode | None = None
    right: TreeNode | None = None


def _arguments() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Maak een lichtgewicht skywatch-analyserapport")
    parser.add_argument("--csv", type=Path, default=root / "tools/skywatch/data/samples.csv")
    parser.add_argument("--grades", type=Path, default=root / "tools/skywatch/data/grades.jsonl")
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    arguments = _arguments()
    output = arguments.output or Path(__file__).resolve().parent / "reports" / f"rooktest-{datetime.now(UTC):%Y%m%dT%H%M%SZ}.md"
    report = build_report(arguments.csv, arguments.grades)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8")
    print(output)


def build_report(samples_path: Path, grades_path: Path) -> str:
    with samples_path.open(encoding="utf-8", newline="") as source:
        samples = {row["sample_id"]: row for row in csv.DictReader(source)}
    grades = [cast(dict[str, Any], json.loads(line)) for line in grades_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    grouped: dict[str, dict[str, dict[str, Any]]] = {}
    for grade in grades:
        grouped.setdefault(str(grade["sample_id"]), {})[str(grade["source"])] = grade
    pairs = [(sample_id, sources["webcam"], sources["grafiek"]) for sample_id, sources in grouped.items() if sample_id in samples and {"webcam", "grafiek"} <= set(sources)]
    webcam_classes = [str(webcam["klasse"]) for _, webcam, _ in pairs]
    graph_classes = [str(graph["klasse"]) for _, _, graph in pairs]
    webcam_scores = [float(webcam["score"]) for _, webcam, _ in pairs]
    graph_scores = [float(graph["score"]) for _, _, graph in pairs]
    matrix_rows = ("helder", "laag", "midden", "hoog", "gemengd")
    matrix = {row: {column: 0 for column in CLASSES} for row in matrix_rows}
    features: list[dict[str, float]] = []
    targets: list[float] = []
    for sample_id, webcam, _ in pairs:
        sample = samples[sample_id]
        matrix[dominant_layer(sample)][str(webcam["klasse"])] += 1
        feature_row = {feature: float(sample[f"model_h0_{feature}"]) for feature in FEATURES if sample[f"model_h0_{feature}"]}
        if len(feature_row) == len(FEATURES):
            features.append(feature_row)
            targets.append(float(webcam["score"]))
    tree = fit_tree(features, targets, depth=2) if features else None
    baseline_rmse = rmse(targets, [statistics.mean(targets)] * len(targets)) if targets else math.nan
    tree_rmse = rmse(targets, [predict_tree(tree, row) for row in features]) if tree else math.nan
    lines = [
        "# Skywatch-rooktestanalyse",
        "",
        f"Gegenereerd: {datetime.now(UTC).isoformat(timespec='seconds').replace('+00:00', 'Z')}",
        "",
        f"Gepaarde beelden: **{len(pairs)}**",
        "",
        "## Overeenstemming webcam ↔ grafiek",
        "",
        f"- Cohen's kappa (vijf klassen): **{format_metric(cohen_kappa(webcam_classes, graph_classes))}**",
        f"- Spearman-rangcorrelatie (score 0–10): **{format_metric(spearman(webcam_scores, graph_scores))}**",
        "",
        "## Model-laag × webcamklasse",
        "",
        "| dominante modeltoestand | " + " | ".join(CLASSES) + " |",
        "| --- | " + " | ".join("---:" for _ in CLASSES) + " |",
    ]
    lines.extend(f"| {row} | " + " | ".join(str(matrix[row][column]) for column in CLASSES) + " |" for row in matrix_rows)
    lines.extend([
        "",
        "De modeltoestand is `helder` onder 10% totale bewolking, anders de grootste van laag/midden/hoog; bij een verschil <10 procentpunt tussen de twee grootste lagen is hij `gemengd`.",
        "",
        "## Simpele regressieboom voor webcam-score",
        "",
        f"Trainings-RMSE boom: **{format_metric(tree_rmse)}**; constant gemiddelde: **{format_metric(baseline_rmse)}**. Dit is alleen een rooktest op dezelfde data, geen generalisatieschatting.",
        "",
        "```text",
        *(tree_lines(tree) if tree else ["geen complete rijen"]),
        "```",
        "",
    ])
    return "\n".join(lines)


def cohen_kappa(left: list[str], right: list[str]) -> float:
    if len(left) != len(right) or not left:
        return math.nan
    observed = sum(a == b for a, b in zip(left, right, strict=True)) / len(left)
    expected = sum(left.count(label) * right.count(label) for label in set(left) | set(right)) / len(left) ** 2
    return (observed - expected) / (1 - expected) if expected < 1 else 1.0


def spearman(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or len(left) < 2:
        return math.nan
    return pearson(ranks(left), ranks(right))


def ranks(values: list[float]) -> list[float]:
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[start]]:
            end += 1
        rank = (start + 1 + end) / 2
        for index in ordered[start:end]:
            result[index] = rank
        start = end
    return result


def pearson(left: list[float], right: list[float]) -> float:
    left_mean = statistics.mean(left)
    right_mean = statistics.mean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right, strict=True))
    denominator = math.sqrt(sum((a - left_mean) ** 2 for a in left) * sum((b - right_mean) ** 2 for b in right))
    return numerator / denominator if denominator else math.nan


def dominant_layer(sample: dict[str, str]) -> str:
    total = float(sample["model_h0_cloud_frac_pct"] or 0)
    if total < 10:
        return "helder"
    layers = sorted(((float(sample[f"model_h0_cloud_{layer}_pct"] or 0), label) for layer, label in (("low", "laag"), ("mid", "midden"), ("high", "hoog"))), reverse=True)
    return "gemengd" if layers[0][0] - layers[1][0] < 10 else layers[0][1]


def fit_tree(rows: list[dict[str, float]], targets: list[float], depth: int) -> TreeNode:
    prediction = statistics.mean(targets)
    node = TreeNode(prediction=prediction, count=len(targets))
    if depth == 0 or len(rows) < 4 or len(set(targets)) == 1:
        return node
    best: tuple[float, str, float, list[int], list[int]] | None = None
    for feature in FEATURES:
        values = sorted(set(row[feature] for row in rows))
        for left_value, right_value in zip(values, values[1:]):
            threshold = (left_value + right_value) / 2
            left_indexes = [index for index, row in enumerate(rows) if row[feature] <= threshold]
            right_indexes = [index for index, row in enumerate(rows) if row[feature] > threshold]
            if len(left_indexes) < 2 or len(right_indexes) < 2:
                continue
            loss = sum_squared_error([targets[index] for index in left_indexes]) + sum_squared_error([targets[index] for index in right_indexes])
            if best is None or loss < best[0]:
                best = (loss, feature, threshold, left_indexes, right_indexes)
    if best is None:
        return node
    _, feature, threshold, left_indexes, right_indexes = best
    return TreeNode(
        prediction=prediction,
        count=len(targets),
        feature=feature,
        threshold=threshold,
        left=fit_tree([rows[index] for index in left_indexes], [targets[index] for index in left_indexes], depth - 1),
        right=fit_tree([rows[index] for index in right_indexes], [targets[index] for index in right_indexes], depth - 1),
    )


def predict_tree(node: TreeNode, row: dict[str, float]) -> float:
    if node.feature is None or node.threshold is None or node.left is None or node.right is None:
        return node.prediction
    return predict_tree(node.left if row[node.feature] <= node.threshold else node.right, row)


def sum_squared_error(values: list[float]) -> float:
    mean = statistics.mean(values)
    return sum((value - mean) ** 2 for value in values)


def rmse(actual: list[float], predicted: list[float]) -> float:
    return math.sqrt(sum((actual_value - predicted_value) ** 2 for actual_value, predicted_value in zip(actual, predicted, strict=True)) / len(actual)) if actual else math.nan


def tree_lines(node: TreeNode | None, prefix: str = "") -> list[str]:
    if node is None:
        return [f"{prefix}geen boom"]
    if node.feature is None or node.threshold is None or node.left is None or node.right is None:
        return [f"{prefix}score ≈ {node.prediction:.2f} (n={node.count})"]
    return [
        f"{prefix}als {node.feature} ≤ {node.threshold:.3f}:",
        *tree_lines(node.left, prefix + "  "),
        f"{prefix}anders:",
        *tree_lines(node.right, prefix + "  "),
    ]


def format_metric(value: float) -> str:
    return "n.v.t." if not math.isfinite(value) else f"{value:.3f}"


if __name__ == "__main__":
    main()
