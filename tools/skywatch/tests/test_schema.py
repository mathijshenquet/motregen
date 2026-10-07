import csv
from pathlib import Path

import pytest

from skywatch.schema import CSV_COLUMNS, append_sample


def complete_row() -> dict[str, object]:
    return dict.fromkeys(CSV_COLUMNS, "")


def test_appends_header_once_and_preserves_column_order(tmp_path: Path) -> None:
    path = tmp_path / "samples.csv"
    row = complete_row()
    row["sample_id"] = "first"
    append_sample(path, row)
    row["sample_id"] = "second"
    append_sample(path, row)

    with path.open(encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source))
    assert list(rows[0]) == list(CSV_COLUMNS)
    assert [row["sample_id"] for row in rows] == ["first", "second"]


def test_rejects_schema_drift(tmp_path: Path) -> None:
    row = complete_row()
    row.pop("observed_cmf")
    with pytest.raises(ValueError, match="ontbreekt"):
        append_sample(tmp_path / "samples.csv", row)
