import math

import pytest

from analyse import cohen_kappa, fit_tree, predict_tree, ranks, spearman
from grade import estimate_cost, validate_answers


def test_kappa_and_spearman_detect_perfect_agreement() -> None:
    assert cohen_kappa(["blauw", "grijs", "blauw"], ["blauw", "grijs", "blauw"]) == 1
    assert spearman([1, 3, 2], [4, 9, 7]) == pytest.approx(1)


def test_tied_ranks_are_averaged() -> None:
    assert ranks([10, 20, 20, 30]) == [1, 2.5, 2.5, 4]
    assert math.isnan(spearman([1], [1]))


def test_small_tree_finds_cloud_fraction_split() -> None:
    rows = [
        {"cloud_low_pct": value, "cloud_mid_pct": 0, "cloud_high_pct": 0, "cloud_frac_pct": value, "cmf": 1 - value / 100}
        for value in (0, 10, 80, 90)
    ]
    tree = fit_tree(rows, [9, 8, 2, 1], depth=2)
    assert predict_tree(tree, rows[0]) > predict_tree(tree, rows[-1])


def test_decisions_cost_uses_current_luna_token_rates() -> None:
    usage: dict[str, object] = {
        "input_tokens": 1_000,
        "output_tokens": 200,
        "input_tokens_details": {"cached_tokens": 100, "cache_write_tokens": 100},
    }
    assert estimate_cost(usage) == pytest.approx(0.0001935)


def test_decisions_answers_are_checked_before_persisting() -> None:
    result: dict[str, object] = {
        "answers": [
            {"type": "choice", "name": "klasse", "choice": "melkachtig"},
            {"type": "score", "name": "prettigheid", "score": 6},
            {"type": "predicate", "name": "zon_zichtbaar", "probability": 0.4},
        ]
    }
    validate_answers(result)
    result["answers"] = [
        {"type": "choice", "name": "klasse", "choice": "mist"},
        {"type": "score", "name": "prettigheid", "score": 6},
        {"type": "predicate", "name": "zon_zichtbaar", "probability": 0.4},
    ]
    with pytest.raises(RuntimeError, match="luchtklasse"):
        validate_answers(result)
