"""
check_wind.py - Independent check of the Wind layer against NASA POWER.

Input: a JSON list recorded in the browser: for each Wind view, the NASA request the
site used (with X in place of the parameter), every cell it drew (place, colour, dot,
value), the wind vector the streaks follow at each cell, and the panel text.

For each view this script downloads U10M, V10M and WS10M itself and recomputes:
- "Average wind": each cell's mean speed (WS10M) and mean vector (U10M, V10M) for the
  chosen month, the box average speed and the share blowing in one steady direction.
- "Change": each cell's WS10M trend (yearly values weighted by days, answer_key.py:
  Sen's slope and memory-adjusted Mann-Kendall), the false discovery rate dots
  (statsmodels) and the colours (d3's RdBu, from check_maps.py).

Run from the maths folder:  python check_wind.py recorded.json
"""
import calendar
import json
import re
import subprocess
import sys

import numpy as np
from statsmodels.stats.multitest import multipletests

import answer_key as key
from check_maps import close, parse_rgb, percentile, rdbu

Y0, Y1 = 1981, 2025


def nasa(url, param):
    raw = subprocess.run(["curl", "-sSf", "-m", "180", url.replace("parameters=X", "parameters=" + param)],
                         capture_output=True, text=True, check=True).stdout
    return {(round(f["geometry"]["coordinates"][0], 3), round(f["geometry"]["coordinates"][1], 3)): f["properties"]["parameter"][param]
            for f in json.loads(raw)["features"]}


def month_mean(table, month):
    vals = [v for k, v in table.items()
            if 1 <= int(k[4:]) <= 12 and Y0 <= int(k[:4]) <= Y1 and (not month or int(k[4:]) == month) and v is not None and v > -900]
    return np.mean(vals) if vals else None


def yearly(table, month):
    years, values = [], []
    for y in range(Y0, Y1 + 1):
        ms = [month] if month else range(1, 13)
        vals = [table.get(f"{y}{m:02d}") for m in ms]
        if any(v is None or v < -900 for v in vals):
            continue
        days = [calendar.monthrange(y, m)[1] for m in ms]
        years.append(y)
        values.append(np.dot(vals, days) / sum(days))
    return years, values


def main():
    recorded = json.load(open(sys.argv[1]))
    cache, all_ok = {}, True
    for r in recorded:
        if r["url"] not in cache:
            cache[r["url"]] = {p: nasa(r["url"], p) for p in ("U10M", "V10M", "WS10M")}
        U, V, W = (cache[r["url"]][p] for p in ("U10M", "V10M", "WS10M"))
        m = r["month"]
        problems = []
        centres = [(round((c["lon0"] + c["lon1"]) / 2, 3), round((c["lat0"] + c["lat1"]) / 2, 3)) for c in r["list"]]
        missing = [p for p in centres if p not in W]
        if missing:
            problems.append(f"{len(missing)} cells drawn where NASA has no cell")
        if r["mode"] == "mean":
            worst_speed = worst_vec = 0.0
            speeds, steady = [], []
            for c, p, vec in zip(r["list"], centres, r["vectors"]):
                sp = month_mean(W[p], m)
                u, v = month_mean(U[p], m), month_mean(V[p], m)
                worst_speed = max(worst_speed, abs(sp - c["value"]))
                worst_vec = max(worst_vec, abs(u - vec[0]), abs(v - vec[1]))
                speeds.append(sp)
                steady.append(np.hypot(u, v) / sp)
            shown = re.search(r"in this box: ([\d.]+) m/s\. On average (\d+)%", r["panel"])
            if worst_speed > 1e-9 or worst_vec > 1e-9:
                problems.append(f"speed off by {worst_speed:.1e}, direction off by {worst_vec:.1e}")
            if not shown or float(shown[1]) != round(np.mean(speeds), 1) or int(shown[2]) != round(100 * np.mean(steady)):
                problems.append(f"panel says {shown[1] if shown else '?'} m/s, {shown[2] if shown else '?'}%; "
                                f"expected {np.mean(speeds):.1f} m/s, {100 * np.mean(steady):.0f}%")
            us = [month_mean(U[p], m) for p in centres]
            vs = [month_mean(V[p], m) for p in centres]
            detail = (f"{len(r['list'])} cells: speed and direction match NASA exactly | box average {np.mean(speeds):.2f} m/s, "
                      f"{100 * np.mean(steady):.0f}% steady | wind blows toward the {'south' if np.mean(vs) < 0 else 'north'}-"
                      f"{'west' if np.mean(us) < 0 else 'east'} on average")
        else:
            rates, ps = [], []
            for p in centres:
                ys, vals = yearly(W[p], m)
                a = key.analyze(ys, vals)
                rates.append(a["slope_per_decade"]); ps.append(a["p"])
            dots = multipletests(np.array(ps), 0.05, "fdr_bh")[0]
            lim = percentile(np.abs(rates), 0.95) or 0.01
            bad_val = sum(abs(c["value"] - rt) > 1e-9 for c, rt in zip(r["list"], rates))
            bad_dot = sum(c["dot"] != bool(d) for c, d in zip(r["list"], dots))
            bad_col = sum(not close(parse_rgb(c["fill"]), rdbu(0.5 - max(-1, min(1, rt / lim)) / 2)) for c, rt in zip(r["list"], rates))
            if bad_val or bad_dot or bad_col:
                problems.append(f"wrong trend {bad_val}, wrong dot {bad_dot}, wrong colour {bad_col}")
            up = int((dots & (np.array(rates) > 0)).sum()); dn = int((dots & (np.array(rates) < 0)).sum())
            shown = re.search(r"(\d+) of (\d+) grid cells show a significant change in wind speed: (\d+) windier, (\d+) calmer", r["panel"])
            if not shown or (int(shown[1]), int(shown[3]), int(shown[4])) != (up + dn, up, dn):
                problems.append(f"panel counts {shown.groups() if shown else '?'}; expected {up + dn} ({up} windier, {dn} calmer)")
            detail = (f"{len(r['list'])} cells: every trend, dot and colour matches | {up + dn} significant "
                      f"({up} windier, {dn} calmer), average {np.mean(rates):+.3f} m/s per decade")
        ok = not problems
        all_ok &= ok
        print(f"[{'PASS' if ok else 'FAIL'}] {r['name']}\n         {detail if ok else '; '.join(problems)}")
    print("\nALL PASS" if all_ok else "\nSOME FAILED")


if __name__ == "__main__":
    main()
