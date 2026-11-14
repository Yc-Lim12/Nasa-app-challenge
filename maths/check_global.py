"""
check_global.py - Independent check of data/global/<PARAM>.json (the whole-globe trend map).

For 4 fixed and 8 random 5° areas it downloads NASA POWER directly, builds the yearly
area average itself (months weighted by days, cells weighted by cos(latitude)) and
computes the trend with scipy and pymannkendall, then compares with the pre-built
file. It also checks random months of the timelapse file (<PARAM>_monthly.bin) for
the same areas, and recomputes every "significant" flag with statsmodels.

Run from the maths folder:  python check_global.py T2M
"""
import calendar
import json
import os
import subprocess
import sys

import numpy as np
from statsmodels.stats.multitest import multipletests
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


def area_month(features, param, lat0, lon0, key):
    s = w = 0.0
    for f in features:
        lon, lat = f["geometry"]["coordinates"][:2]
        v = f["properties"]["parameter"][param].get(key)
        if lat0 <= lat < lat0 + 5 and lon0 <= lon < lon0 + 5 and v is not None and v > -900:
            s += v * np.cos(np.radians(lat)); w += np.cos(np.radians(lat))
    return s / w if w else None


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
    # every significance flag, recomputed from the file's p-values
    p = np.array([c[F["p"]] for c in built["cells"]])
    flags = np.array([c[F["significant"]] for c in built["cells"]], bool)
    fdr_bad = int((multipletests(p, 0.05, "fdr_bh")[0] != flags).sum())
    print(f"  false discovery rate flags vs statsmodels: {fdr_bad} of {len(p)} differ")
    head = json.load(open(os.path.join(HERE, "..", "data", "global", PARAM + "_monthly.json")))
    monthly = np.fromfile(os.path.join(HERE, "..", "data", "global", PARAM + "_monthly.bin"), dtype="<i2")
    rng = np.random.default_rng(2026)
    areas = list(AREAS) + [(int(rng.integers(-18, 18)) * 5, int(rng.integers(-36, 36)) * 5, "random") for _ in range(8)]
    worst = month_worst = 0
    for lat0, lon0, name in areas:
        if (lat0, lon0) not in cells:
            continue
        feats = nasa(PARAM, lat0, lon0)
        x, y = area_series(feats, PARAM, lat0, lon0)
        name = name if name != "random" else f"random area {lat0}..{lat0 + 5}°, {lon0}..{lon0 + 5}°"
        base = ((lat0 + 90) // 5 * head["nlon"] + (lon0 + 180) // 5) * head["months"]
        for mi in rng.integers(0, head["months"], 3):
            k = f"{1981 + mi // 12}{mi % 12 + 1:02d}"
            ref = area_month(feats, PARAM, lat0, lon0, k)
            if ref is not None and monthly[base + mi] != head["missing"]:
                month_worst = max(month_worst, abs(ref - monthly[base + mi] / head["scale"]))
        sen = stats.theilslopes(y, x).slope * 10
        mk = pmk.original_test(y)
        c = cells[(lat0, lon0)]
        diff = abs(sen - c[F["ratePerDecade"]])
        worst = max(worst, diff / max(abs(sen), 1e-9))
        print(f"  {name}: scipy Sen {sen:+.4f}/decade, file {c[F['ratePerDecade']]:+.4f} | "
              f"plain MK p {mk.p:.4f}, file (memory-adjusted) p {c[F['p']]:.4f}, significant {bool(c[F['significant']])}")
    print(f"  timelapse months vs NASA: largest difference {month_worst:.4f} (2 decimals stored)")
    ok = worst < 1e-3 and fdr_bad == 0 and month_worst <= 0.006
    print("PASS" if ok else "FAIL", f"(largest relative difference in the rate {worst:.1e})")


if __name__ == "__main__":
    main()
