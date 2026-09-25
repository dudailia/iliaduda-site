"""
Reproduce the startup-segment ranking from the capstone notebook, then score it
three ways, for Fig. 1 of /startup-investments.

It does not reimplement the notebook. It executes the notebook's own code cells,
in order, up to and including the scoring cell (119), with plotting stubbed out,
and reads the frames that leaves behind. So variant A is the notebook's result
by construction, and B and C change exactly one thing each:

  A  as written: a segment whose 2014 funding did not rise is absent from
     growth_df, and the scoring cell gives it 0 growth and 0 CAGR.
  B  the lookup fixed: every segment gets its real 2014 change (negative where
     funding fell) and its CAGR from the notebook's own formula.
  C  B, plus CAGR measured from each segment's first year with funding, instead
     of from 2000 with a $0 start replaced by $1.

Usage:  python3 scripts/startup_ranking.py <path-to-notebook> > content/data/startup-ranking.json
"""

import hashlib
import io
import json
import subprocess
import sys
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

NB = Path(sys.argv[1])
SCORING_CELL = 119
WEIGHTS = {"growth_2014": 0.35, "cagr": 0.30, "total_funding": 0.20, "companies": 0.15}
DATA_URL = "https://code.s3.yandex.net/datasets/cb_investments.zip"

nb = json.loads(NB.read_text())
cells = nb["cells"]
assert "КОМПЛЕКСНАЯ ОЦЕНКА СЕГМЕНТОВ" in "".join(cells[SCORING_CELL]["source"]), "scoring cell moved"

ns: dict = {"display": lambda *a, **k: None}
sink = io.StringIO()
with redirect_stdout(sink):
    exec("import matplotlib.pyplot as plt\nplt.show = lambda *a, **k: None", ns)
    for i, cell in enumerate(cells[: SCORING_CELL + 1]):
        if cell["cell_type"] != "code":
            continue
        src = "".join(cell["source"])
        # IPython magics and shell escapes are not Python.
        src = "\n".join(line for line in src.splitlines() if not line.lstrip().startswith(("%", "!")))
        exec(compile(src, f"<cell {i}>", "exec"), ns)

eval_df = ns["eval_df"].copy()
pivot = ns["mass_segments_pivot"]
years = sorted(c for c in pivot.columns if isinstance(c, (int,)) or str(c).isdigit())
first_year, last_year = int(years[0]), int(years[-1])


def minmax(s):
    return (s - s.min()) / (s.max() - s.min()) * 100


def score(frame):
    total = sum(minmax(frame[k]) * w for k, w in WEIGHTS.items())
    return total


def cagr_notebook(row):
    start = row[first_year] if row[first_year] > 0 else 1
    return ((row[last_year] / start) ** (1 / (last_year - first_year)) - 1) * 100


def cagr_first_funded(row):
    funded = [y for y in years if row[y] > 0]
    if len(funded) < 2 or row[last_year] <= 0:
        return 0.0
    y0 = funded[0]
    return ((row[last_year] / row[y0]) ** (1 / (last_year - int(y0))) - 1) * 100


segments = list(eval_df["segment"])
a = eval_df.set_index("segment")
b = a.copy()
c = a.copy()
for seg in segments:
    row = pivot.loc[seg]
    growth = float(row[last_year] - row[last_year - 1])
    b.loc[seg, "growth_2014"] = growth
    c.loc[seg, "growth_2014"] = growth
    b.loc[seg, "cagr"] = cagr_notebook(row)
    c.loc[seg, "cagr"] = cagr_first_funded(row)

variants = {"a": score(a), "b": score(b), "c": score(c)}
# The notebook's own total_score must be what we call A.
assert (variants["a"] - a["total_score"]).abs().max() < 1e-9, "variant A does not reproduce the notebook"

ranks = {k: v.rank(ascending=False, method="first").astype(int) for k, v in variants.items()}

data = urllib.request.urlopen(DATA_URL).read()
commit = subprocess.run(["git", "-C", str(NB.parent), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()

out = {
    "provenance": {
        "notebook": f"startup-investment-analysis @{commit} — {NB.name}, cells 0–{SCORING_CELL} executed as written",
        "dataset": DATA_URL,
        "dataset_sha256": hashlib.sha256(data).hexdigest(),
        "script": "scripts/startup_ranking.py",
        "weights": WEIGHTS,
        "rows_scored": int(len(ns["df"])),
    },
    "segments": [
        {
            "name": seg,
            "funding": round(float(a.loc[seg, "total_funding"]), 0),
            "companies": int(a.loc[seg, "companies"]),
            "growth2014": round(float(b.loc[seg, "growth_2014"]), 0),
            "inGrowthTable": bool(float(a.loc[seg, "growth_2014"]) != 0 or float(a.loc[seg, "cagr"]) != 0),
            **{
                k: {"score": round(float(variants[k][seg]), 2), "rank": int(ranks[k][seg])}
                for k in variants
            },
        }
        for seg in segments
    ],
}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
