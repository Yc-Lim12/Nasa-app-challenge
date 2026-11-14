"""
Check every variable end to end on real NASA POWER data.

    pip install -r tools/requirements.txt
    python tools/check_variables.py

For each of the app's variables at six places chosen to hit the special cases
(tropics, desert, Arctic, ice sheet, snow, open ocean), it downloads the raw NASA
POWER monthly data once, then builds the yearly and June-August values two ways:

  1. here in Python, written independently from the rules in the Methods page
     (missing values, day-weighted means, sunlight and cloud from 2001, open-ocean
     topsoil wetness), with Ryan's maths/answer_key.py for the statistics;
  2. with the website's own app.js and stats.js (through tools/js_pipeline.mjs).

It compares the years, every value, Sen's slope, the memory-adjusted p-value and the
verdict, prints a summary and writes tools/VARIABLE_CHECK.md. Downloads are cached in
tools/.cache so a second run is offline. Exit code 0 means everything matched.
"""
import calendar
import datetime
import json
import os
import subprocess
import sys
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "maths"))
import answer_key as key  # noqa: E402  (Ryan's Python reference)

API = "https://power.larc.nasa.gov/api/temporal/monthly/point"
Y0, Y1 = 1981, datetime.date.today().year - 1
PLACES = [
    ("Klang Valley", 3.1, 101.6),
    ("Sahel (Niger)", 14.0, 8.0),
    ("Arctic Alaska", 70.5, -156.8),
    ("Central Greenland", 72.0, -40.0),
    ("Wisconsin", 44.5, -89.5),
    ("Open Pacific", 0.0, -140.0),
]
MODES = [("whole year", 0, list(range(1, 13))), ("June-August", 13, [6, 7, 8])]
FILL = -900                                   # NASA POWER uses -999 for missing
SPLICED_FROM = {"ALLSKY_SFC_SW_DWN": 2001, "CLOUD_AMT": 2001}
OCEAN_FILL = {"GWETTOP": 1.0}
TOL_VALUE, TOL_SLOPE, TOL_P = 1e-9, 1e-9, 1e-6


def run_js(payload):
    proc = subprocess.run(["node", os.path.join(HERE, "js_pipeline.mjs")], input=json.dumps(payload),
                          capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError("node failed:\n" + proc.stderr)
    return json.loads(proc.stdout)


def fetch(lat, lon, params):
    os.makedirs(os.path.join(HERE, ".cache"), exist_ok=True)
    path = os.path.join(HERE, ".cache", "power_%s_%s_%d_%d.json" % (lat, lon, Y0, Y1))
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    url = "%s?parameters=%s&community=AG&longitude=%s&latitude=%s&start=%d&end=%d&format=JSON" % (
        API, ",".join(params), lon, lat, Y0, Y1)
    try:
        with urllib.request.urlopen(url, timeout=180) as r:
            data = json.load(r)
    except Exception:                         # some Pythons lack certificates: fall back to curl
        data = json.loads(subprocess.run(["curl", "-s", "--max-time", "180", url], capture_output=True, text=True).stdout)
    with open(path, "w") as f:
        json.dump(data, f)
    return data


def python_series(table, param, months):
    """The app's rules, written again from the Methods page."""
    t = {k: v for k, v in table.items() if v is not None and v >= FILL}
    if param in SPLICED_FROM:
        t = {k: v for k, v in t.items() if int(k[:4]) >= SPLICED_FROM[param]}
    if param in OCEAN_FILL and t and all(abs(v - OCEAN_FILL[param]) <= 1e-6 for v in t.values()):
        return [], [], True
    years, values = [], []
    for y in range(Y0, Y1 + 1):
        got = [(t.get("%d%02d" % (y, m)), calendar.monthrange(y, m)[1]) for m in months]
        if any(v is None for v, _ in got):
            continue
        days = sum(d for _, d in got)
        years.append(y)
        values.append(sum(v * d for v, d in got) / days)
    return years, values, False


def main():
    variables = run_js({"vars": True})
    params = sorted({v["param"] for v in variables})
    cases, meta = [], []
    for place, lat, lon in PLACES:
        data = fetch(lat, lon, params)
        for v in variables:
            for mode, month, months in MODES:
                table = data["properties"]["parameter"].get(v["param"], {})
                cases.append({"json": data, "param": v["param"], "y0": Y0, "y1": Y1, "month": month})
                meta.append((place, v, mode, months, table))
    js = run_js({"cases": cases})

    rows, failures = [], []
    for (place, v, mode, months, table), got in zip(meta, js):
        yrs, vals, ocean = python_series(table, v["param"], months)
        problems = []
        if bool(got["ocean"]) != ocean:
            problems.append("ocean rule differs")
        if list(got["years"]) != yrs:
            problems.append("years differ (%d vs %d)" % (len(got["years"]), len(yrs)))
        elif yrs and max(abs(a - b) for a, b in zip(got["values"], vals)) > TOL_VALUE:
            problems.append("values differ")
        ref = key.analyze(np.array(yrs, float), np.array(vals, float)) if len(yrs) >= 10 else None
        verdict = ref["verdict"] if ref else "too-few"
        if ref and not problems:
            if abs(got["senPerDecade"] - ref["slope_per_decade"]) > TOL_SLOPE * max(1, abs(ref["slope_per_decade"])):
                problems.append("Sen's slope differs")
            if abs(got["p"] - ref["p"]) > TOL_P:
                problems.append("p differs")
        if got["verdict"] != verdict:
            problems.append("verdict %s vs %s" % (got["verdict"], verdict))
        status = "PASS" if not problems else "FAIL"
        if problems:
            failures.append("%s / %s / %s: %s" % (place, v["id"], mode, "; ".join(problems)))
        rows.append((place, v, mode, len(yrs), (yrs[0], yrs[-1]) if yrs else None,
                     ref["slope_per_decade"] if ref else None, ref["p"] if ref else None,
                     "ocean (no data)" if ocean else verdict, status))

    n = len(rows)
    print("Checked %d cases (%d variables x %d places x %d periods) against an independent Python pipeline."
          % (n, len(variables), len(PLACES), len(MODES)))
    print("%d passed, %d failed." % (n - len(failures), len(failures)))
    for f in failures:
        print("  FAIL", f)
    write_report(rows, variables, failures)
    return 1 if failures else 0


def write_report(rows, variables, failures):
    lines = [
        "# Every variable, end to end",
        "",
        "Generated by `tools/check_variables.py` on %s from real NASA POWER monthly data, %d-%d."
        % (datetime.date.today().isoformat(), Y0, Y1),
        "For each case the yearly (or June-August) values and the trend were built twice: by the website's own",
        "`app.js` and `stats.js`, and independently in Python (with `maths/answer_key.py`). They must agree on",
        "the years used, every value (to 1e-9), Sen's slope, the memory-adjusted p-value and the verdict.",
        "",
        "**Result: %d of %d cases agree.**" % (len(rows) - len(failures), len(rows)),
        "",
        "| Place | Variable | Period | Years | Sen's slope per decade | p | Verdict | Check |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for place, v, mode, n, span, slope, p, verdict, status in rows:
        lines.append("| %s | %s (%s) | %s | %s | %s | %s | %s | %s |" % (
            place, v["name"], v["id"], mode,
            "%d (%d-%d)" % (n, span[0], span[1]) if span else "0",
            "%+.3g %s" % (slope, v["unit"]) if slope is not None else "-",
            ("%.3g" % p) if p is not None else "-", verdict, status))
    if failures:
        lines += ["", "## Failures", ""] + ["- " + f for f in failures]
    lines.append("")
    with open(os.path.join(HERE, "VARIABLE_CHECK.md"), "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
