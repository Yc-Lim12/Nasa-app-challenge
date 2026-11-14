"""
check_area.py - Independent check of the live "This area" trend map.

Input: a JSON list of what the website showed, one entry per map, each with the NASA
POWER request URL the site used, the parameter, and the panel text. For each map this
script downloads the same box from NASA itself, recomputes every grid cell (yearly
means weighted by days, then answer_key.py: Sen's slope and the memory-adjusted
Mann-Kendall p), applies the false discovery rate with statsmodels, and compares the
counts and colour scale with the website.

Run from the maths folder:  python check_area.py recorded.json
"""
import calendar
import json
import re
import subprocess
import sys

import numpy as np
import pymannkendall as pmk
from scipy import stats
from statsmodels.stats.multitest import multipletests

import answer_key as key

SPLICED_FROM = {"ALLSKY_SFC_SW_DWN": 2001, "CLOUD_AMT": 2001}


def yearly(table, start=1981, end=2025, first=None):
    years, values = [], []
    for y in range(max(start, first or start), end + 1):
        vals = [table.get(f"{y}{m:02d}") for m in range(1, 13)]
        if any(v is None or v < -900 for v in vals):
            continue
        days = [calendar.monthrange(y, m)[1] for m in range(1, 13)]
        years.append(y)
        values.append(np.dot(vals, days) / sum(days))
    return years, values


def numbers(panel):
    m = re.search(r"(\d+) of (\d+) grid cells show a significant trend: (\d+) rising, (\d+) falling", panel)
    raw = re.search(r"(\d+) pass p < 0\.05 on their own", panel)
    lim = re.search(r"\+([\d.]+)\s?(?:°C|mm/day|%|MJ)", panel)
    return {"significant": int(m[1]), "cells": int(m[2]), "rising": int(m[3]), "falling": int(m[4]),
            "raw": int(raw[1]) if raw else None, "scale": float(lim[1]) if lim else None}


def main():
    recorded = json.load(open(sys.argv[1]))
    all_ok = True
    for r in recorded:
        raw = subprocess.run(["curl", "-sSf", "-m", "180", r["url"]], capture_output=True, text=True, check=True).stdout
        feats = json.loads(raw)["features"]
        rates, ps, sen_diff, mk_ok = [], [], 0.0, 0
        for f in feats:
            years, values = yearly(f["properties"]["parameter"][r["param"]], first=SPLICED_FROM.get(r["param"]))
            if len(years) < 10:
                continue
            a = key.analyze(years, values)
            rates.append(a["slope_per_decade"])
            ps.append(a["p"])
            # cross-check the rate with scipy and the plain test with pymannkendall
            sen_diff = max(sen_diff, abs(stats.theilslopes(values, years).slope * 10 - a["slope_per_decade"]))
            mk_ok += abs(pmk.original_test(np.array(values)).p - a["mk"]["p"]) < 1e-6
        ps, rates = np.array(ps), np.array(rates)
        sig = multipletests(ps, 0.05, "fdr_bh")[0]
        s = np.sort(np.abs(rates))
        scale = s[min(len(s) - 1, int(np.floor(0.95 * (len(s) - 1))))]
        mine = {"significant": int(sig.sum()), "cells": len(ps), "rising": int((sig & (rates > 0)).sum()),
                "falling": int((sig & (rates < 0)).sum()), "raw": int((ps < 0.05).sum()), "scale": scale}
        site = numbers(r["panel"])
        same = all(site[k] == mine[k] for k in ["significant", "cells", "rising", "falling", "raw"])
        same = same and abs(float(f"{scale:.2g}") - site["scale"]) < 1e-9
        all_ok &= same
        print(f"[{'PASS' if same else 'FAIL'}] {r['name']}")
        print(f"   website: {site['cells']} cells, {site['raw']} with p < 0.05, {site['significant']} after FDR "
              f"({site['rising']} rising, {site['falling']} falling), colour scale ±{site['scale']}")
        print(f"   NASA + Python: {mine['cells']} cells, {mine['raw']} with p < 0.05, {mine['significant']} after FDR "
              f"({mine['rising']} rising, {mine['falling']} falling), colour scale ±{scale:.2g}")
        print(f"   every cell: Sen's slope vs scipy differs by at most {sen_diff:.1e}; "
              f"plain Mann-Kendall p matches pymannkendall in {mk_ok} of {len(ps)} cells")
    print("\nALL PASS" if all_ok else "\nSOME FAILED")


if __name__ == "__main__":
    main()
