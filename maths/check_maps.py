"""
check_maps.py - Checks every cell the website draws on the trend map and timelapse.

Input: a JSON list recorded in the browser: for each map, the cells the globe was
given (bounds, colour, dot) and, for the timelapse, the colour of every cell in one
month. This script works out independently what each cell should look like:

- "This area": downloads the same NASA POWER box the site used.
- "Whole globe": reads data/global/ (checked against NASA by check_global.py).
- Trends: answer_key.py (Sen's slope, memory-adjusted Mann-Kendall), false discovery
  rate with statsmodels, colour scale = 95th percentile of |rate|.
- Timelapse: each cell's normal for each calendar month over the chosen period, the
  difference from normal, scale = 97th percentile of |difference| (every 4th frame).
- Colours: d3's RdBu colour ramp, rewritten here in Python.

Run from the maths folder:  python check_maps.py recorded.json
"""
import calendar
import json
import math
import os
import subprocess
import sys

import numpy as np
from statsmodels.stats.multitest import multipletests

import answer_key as key

HERE = os.path.dirname(os.path.abspath(__file__))
SPLICED_FROM = {"ALLSKY_SFC_SW_DWN": 2001, "CLOUD_AMT": 2001}
SEASONS = {13: [6, 7, 8], 14: [9, 10, 11], 15: [-12, 1, 2], 16: [3, 4, 5]}

# ---- d3.interpolateRdBu (d3-scale-chromatic): a B-spline through 11 colours --------
RDBU = "67001fb2182bd6604df4a582fddbc7f7f7f7d1e5f092c5de4393c32166ac053061"
RAMP = [tuple(int(RDBU[i + j:i + j + 2], 16) for j in (0, 2, 4)) for i in range(0, len(RDBU), 6)]


def _basis(t1, v0, v1, v2, v3):
    t2, t3 = t1 * t1, t1 * t1 * t1
    return ((1 - 3 * t1 + 3 * t2 - t3) * v0 + (4 - 6 * t2 + 3 * t3) * v1 +
            (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2 + t3 * v3) / 6


def rdbu(t):
    n = len(RAMP) - 1
    if t <= 0:
        t, i = 0.0, 0
    elif t >= 1:
        t, i = 1.0, n - 1
    else:
        i = math.floor(t * n)
    out = []
    for ch in range(3):
        v = [c[ch] for c in RAMP]
        v1, v2 = v[i], v[i + 1]
        v0 = v[i - 1] if i > 0 else 2 * v1 - v2
        v3 = v[i + 2] if i < n - 1 else 2 * v2 - v1
        out.append(max(0, min(255, math.floor(_basis((t - i / n) * n, v0, v1, v2, v3) + 0.5))))
    return tuple(out)


def parse_rgb(s):
    return tuple(int(x) for x in s[s.index("(") + 1:s.index(")")].split(","))


def close(a, b):
    return all(abs(x - y) <= 1 for x, y in zip(a, b))


def percentile(arr, q):
    s = np.sort(np.asarray(arr))
    return s[min(len(s) - 1, max(0, int(np.floor(q * (len(s) - 1)))))] if len(s) else 0


# ---- data -------------------------------------------------------------------------
def nasa_box(url):
    raw = subprocess.run(["curl", "-sSf", "-m", "180", url], capture_output=True, text=True, check=True).stdout
    return json.loads(raw)["features"]


def yearly(table, y0, y1, month, first=None):
    months = [0] and (list(range(1, 13)) if not month else SEASONS.get(month, [month]))
    years, values = [], []
    for y in range(max(y0, first or y0), y1 + 1):
        s = d = 0.0
        ok = True
        for m in months:
            yy, mm = (y - 1, -m) if m < 0 else (y, m)
            v = table.get(f"{yy}{mm:02d}")
            if v is None or v < -900:
                ok = False
                break
            days = calendar.monthrange(yy, mm)[1]
            s += v * days
            d += days
        if ok:
            years.append(y)
            values.append(s / d)
    return years, values


def frames_for(st):
    keep = list(range(1, 13)) if not st["month"] else [abs(m) for m in SEASONS.get(st["month"], [st["month"]])]
    return [f"{y}{m:02d}" for y in range(st["y0"], st["y1"] + 1) for m in range(1, 13) if m in keep]


def globe_monthly(param):
    h = json.load(open(os.path.join(HERE, "..", "data", "global", param + "_monthly.json")))
    a = np.fromfile(os.path.join(HERE, "..", "data", "global", param + "_monthly.bin"), dtype="<i2")
    cells = []
    for row in range(h["nlat"]):
        for col in range(h["nlon"]):
            base = (row * h["nlon"] + col) * h["months"]
            if (a[base:base + h["months"]] != h["missing"]).any():
                cells.append(base)

    def get(j, k):
        mi = (int(k[:4]) - h["start"]) * 12 + int(k[4:]) - 1
        if mi < 0 or mi >= h["months"]:
            return math.nan
        v = a[cells[j] + mi]
        return math.nan if v == h["missing"] else v / h["scale"]
    return len(cells), get


# ---- checks -----------------------------------------------------------------------
def check_trend(r):
    st = r["state"]
    if r["scope"] == "globe":
        d = json.load(open(os.path.join(HERE, "..", "data", "global", r["param"] + ".json")))
        F = {f: i for i, f in enumerate(d["fields"])}
        rates = [c[F["ratePerDecade"]] for c in d["cells"]]
        dots = [bool(c[F["significant"]]) for c in d["cells"]]
        bounds = [(c[F["lon0"]], c[F["lat0"]]) for c in d["cells"]]
    else:
        rates, ps, bounds = [], [], []
        for f in nasa_box(r["url"]):
            lon, lat = f["geometry"]["coordinates"][:2]
            ys, vs = yearly(f["properties"]["parameter"][r["param"]], st["y0"], st["y1"], st["month"], SPLICED_FROM.get(r["param"]))
            if len(ys) < 10:
                continue
            a = key.analyze(ys, vs)
            rates.append(a["slope_per_decade"]); ps.append(a["p"]); bounds.append((lon, lat))
        dots = list(multipletests(np.array(ps), 0.05, "fdr_bh")[0])
    lim = percentile(np.abs(rates), 0.95) or 1
    drawn = r["list"]
    bad_place = bad_dot = bad_col = 0
    for c, rate, dot, (lo, la) in zip(drawn, rates, dots, bounds):
        if r["scope"] == "globe":
            bad_place += not (abs(c["lon0"] - lo) < 1e-9 and abs(c["lat0"] - la) < 1e-9)
        else:
            bad_place += not (abs((c["lon0"] + c["lon1"]) / 2 - lo) < 1e-6 and abs((c["lat0"] + c["lat1"]) / 2 - la) < 1e-6)
        bad_dot += c["dot"] != bool(dot)
        t = max(-1, min(1, rate / lim))
        bad_col += not close(parse_rgb(c["fill"]), rdbu(0.5 - t / 2))
    ok = len(drawn) == len(rates) and bad_place == bad_dot == bad_col == 0
    return ok, (f"{len(drawn)} cells drawn, {len(rates)} expected | wrong place {bad_place}, "
                f"wrong dot {bad_dot}, wrong colour {bad_col} | {sum(dots)} dots")


def check_lapse(r):
    st = r["state"]
    frames = frames_for(st)
    if r["scope"] == "globe":
        n, get = globe_monthly(r["param"])
    else:
        feats = nasa_box(r["url"])
        tables = []
        for f in feats:
            t = f["properties"]["parameter"][r["param"]]
            first = SPLICED_FROM.get(r["param"])
            tables.append({k: v for k, v in t.items() if not first or int(k[:4]) >= first})
        n = len(tables)

        def get(j, k):
            v = tables[j].get(k)
            return math.nan if v is None or v < -900 else v
    normal = []
    for j in range(n):
        s, c = {}, {}
        for k in frames:
            v = get(j, k)
            if not math.isnan(v):
                s[k[4:]] = s.get(k[4:], 0) + v; c[k[4:]] = c.get(k[4:], 0) + 1
        normal.append({m: s[m] / c[m] for m in s})
    anom = []
    for i in range(0, len(frames), max(1, len(frames) // 120)):
        for j in range(n):
            v = get(j, frames[i])
            if not math.isnan(v):
                anom.append(abs(v - normal[j][frames[i][4:]]))
    alim = percentile(anom, 0.97) or 1
    k = r["frame"]
    bad = 0
    for j, col in enumerate(r["frameColours"]):
        v = get(j, k)
        if math.isnan(v):
            bad += col != "transparent"
            continue
        t = max(-1, min(1, (v - normal[j][k[4:]]) / alim))
        bad += col == "transparent" or not close(parse_rgb(col), rdbu(0.5 - t / 2))
    ok = len(r["frameColours"]) == n and r["slider"] == len(frames) and bad == 0
    return ok, (f"{len(r['frameColours'])} cells, {n} expected | {r['slider']} months on the slider, "
                f"{len(frames)} expected | showing {r['when']} | wrong colour {bad} | colour scale ±{alim:.3g}")


def main():
    recorded = json.load(open(sys.argv[1]))
    all_ok = True
    for r in recorded:
        ok, msg = (check_trend if r["layer"] == "trend" else check_lapse)(r)
        all_ok &= ok
        print(f"[{'PASS' if ok else 'FAIL'}] {r['name']}\n         {msg}")
    print("\nALL PASS" if all_ok else "\nSOME FAILED")


if __name__ == "__main__":
    main()
