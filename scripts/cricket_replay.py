"""
Export one held-out T20 match, ball by ball, with the cricstate B3 model's
calibrated win probability — for Fig. 1 of /cricstate.

Run from a copy of the cricstate repository (src/, uv.lock, data/v1/,
artifacts/t2/t20/B3_gbm/), with its own locked environment:

    uv run python /path/to/scripts/cricket_replay.py > content/data/cricket-final.json

Nothing is fitted on the test split. The model is the cached, train-only
leaderboard pickle; the isotonic map is fit on validation predictions exactly
as evalkit/run.py does. Before exporting a single ball, the script recomputes
the whole T2/T20 test cell and asserts it reproduces the leaderboard's NLL.

The match is chosen by a rule fixed before any prediction was looked at: the
final of the ICC Men's T20 World Cup 2026, the last match of that competition
in the test period.
"""

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import polars as pl

from evalkit.calibrate import fit_isotonic
from evalkit.datasets import DataBundle, assemble_t2
from evalkit.features import build_features
from evalkit.labels import first_batting_teams
from evalkit.models.base import to_y

ROOT = Path.cwd()
MODEL = ROOT / "artifacts/t2/t20/B3_gbm/model.pkl"
LEADERBOARD_TEST_NLL = 0.49036

b = DataBundle()
model = pickle.loads(MODEL.read_bytes())

val = assemble_t2(b.deliveries, b.matches, "t20", "val")
iso = fit_isotonic(model.predict_proba(val), to_y(val))

test = assemble_t2(b.deliveries, b.matches, "t20", "test")
p_test = iso.apply(model.predict_proba(test))
y_test = to_y(test)
nll = float(-np.mean(y_test * np.log(p_test) + (1 - y_test) * np.log(1 - p_test)))
assert abs(nll - LEADERBOARD_TEST_NLL) < 5e-5, f"test NLL {nll:.5f} does not reproduce the leaderboard"

final = (
    b.matches.filter(
        (pl.col("competition") == "ICC Men's T20 World Cup")
        & (pl.col("temporal_split") == "test")
        & (pl.col("fmt") == "t20")
    )
    .sort("start_date")
    .tail(1)
)
row = final.row(0, named=True)
assert not row["dls_applied"] and not row["has_super_over"] and not row["no_result"]
mid = row["match_id"]

balls = b.deliveries.filter((pl.col("match_id") == mid) & (pl.col("innings_idx") <= 2))
p = iso.apply(model.predict_proba(build_features(balls)))
first = first_batting_teams(b.deliveries).filter(pl.col("match_id") == mid).row(0, named=True)

series = []
for r, prob in zip(balls.iter_rows(named=True), p):
    series.append(
        {
            "inn": r["innings_idx"],
            "over": r["over_number"],
            "ball": r["ball_in_over"],
            "bat": r["batting_team"],
            "runs": r["runs"],
            "wkts": r["wickets"],
            "legal": r["legal_balls"],
            "max": r["max_balls"],
            "target": r["target"],
            "outRuns": r["outcome_runs_total"],
            "outWkts": r["outcome_n_wickets"],
            "p": round(float(prob), 4),
        }
    )

commit = (ROOT / "SOURCE_COMMIT").read_text().strip() if (ROOT / "SOURCE_COMMIT").exists() else "unknown"
fingerprint = json.loads((MODEL.parent / "fingerprint.json").read_text())
out = {
    "provenance": {
        "repo": f"github.com/dudailia/cricstate @{commit[:7]}",
        "model": "artifacts/t2/t20/B3_gbm/model.pkl — train-only, 27 whitelisted state features",
        "calibration": "isotonic, fit on validation predictions only (evalkit.calibrate.fit_isotonic)",
        "corpus_hash": fingerprint["corpus_hash"],
        "test_nll_reproduced": round(nll, 5),
        "selection": "final of the ICC Men's T20 World Cup 2026: last match of the competition in the test split, chosen before any prediction was viewed",
        "p_is": "probability that the side batting first wins",
        "script": "scripts/cricket_replay.py (iliaduda-site)",
    },
    "match": {
        "id": mid,
        "date": str(row["start_date"]),
        "competition": row["competition"],
        "teams": [row["team1"], row["team2"]],
        "battingFirst": first["first_batting_team"],
        "winner": row["outcome_winner"],
        "result": row["outcome_result"],
    },
    "balls": series,
}
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
