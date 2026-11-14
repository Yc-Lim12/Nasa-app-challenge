"""
check_global.py - Independent check of data/global/<PARAM>.json (the whole-globe trend map).

For a few 5° areas it downloads NASA POWER directly, builds the yearly area average
itself (months weighted by days, cells weighted by cos(latitude)) and computes the
trend with scipy and pymannkendall, then compares with the pre-built file.

Run from the maths folder:  python check_global.py T2M
"""
import calendar
import json
import os
import subprocess
import sys

import numpy as np
import pymannkendall as pmk
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
PARAM = sys.argv[1] if len(sys.argv) > 1 else "T2M"
AREAS = [(0, 100, "Peninsular Malaysia (0-5N, 100-105E)"), (65, -150, "Alaska (65-70N, 150-145W)"),
         (-60, -30, "Southern Ocean (60-55S, 30-25W)"), (40, -5, "Spain (40-45N, 5W-0)")]


def nasa(param, lat0, lon0, start=1981, end=2025):
    url = ("https://power.larc.nasa.gov/api/temporal/monthly/regional?parameters=" + param +
           f"&community=AG&latitude-min={lat0}&latitude-max={lat0 + 5}&longitude-min={lon0}&longitude-max={lon0 + 5}"
           f"&start={start}&end={end}&format=JSON")
    raw = subprocess.run(["curl", "-sSf", "-m", "120", url], capture_output=True, text=True, check=True).stdout
    return json.loads(raw)["features"]


def area_series(features, param, lat0, lon0):
    sums, weights = {}, {}
    for f in features:
        lon, lat = f["geometry"]["coordinates"][:2]
        if not (lat0 <= lat < lat0 + 5 and lon0 <= lon < lon0 + 5):
            continue
        table, w = f["properties"]["parameter"][param], np.cos(np.radians(lat))
        for y in range(1981, 2026):
            vals = [table.get(f"{y}{m:02d}") for m in range(1, 13)]
            if any(v is None or v < -900 for v in vals):
                continue
            days = [calendar.monthrange(y, m)[1] for m in range(1, 13)]
            sums[y] = sums.get(y, 0) + w * np.dot(vals, days) / sum(days)
            weights[y] = weights.get(y, 0) + w
    wmax = max(weights.values())
    years = [y for y in sorted(sums) if weights[y] >= 0.9 * wmax]
    return np.array(years, float), np.array([sums[y] / weights[y] for y in years])


def main():
    built = json.load(open(os.path.join(HERE, "..", "data", "global", PARAM + ".json")))
    F = {k: i for i, k in enumerate(built["fields"])}
    cells = {(c[F["lat0"]], c[F["lon0"]]): c for c in built["cells"]}
    print(f"{PARAM}: {len(built['cells'])} areas in the file")
    worst = 0
    for lat0, lon0, name in AREAS:
        x, y = area_series(nasa(PARAM, lat0, lon0), PARAM, lat0, lon0)
        sen = stats.theilslopes(y, x).slope * 10
        mk = pmk.original_test(y)
        c = cells[(lat0, lon0)]
        diff = abs(sen - c[F["ratePerDecade"]])
        worst = max(worst, diff / max(abs(sen), 1e-9))
        print(f"  {name}: scipy Sen {sen:+.4f}/decade, file {c[F['ratePerDecade']]:+.4f} | "
              f"plain MK p {mk.p:.4f}, file (memory-adjusted) p {c[F['p']]:.4f}, significant {bool(c[F['significant']])}")
    print("PASS" if worst < 1e-3 else "FAIL", f"(largest relative difference in the rate {worst:.1e})")


if __name__ == "__main__":
    main()
