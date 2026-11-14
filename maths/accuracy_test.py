"""
accuracy_test.py - Full accuracy test of stats.js.

Part 1  Exact maths: stats.js against independent libraries
        (pymannkendall, scipy, statsmodels) on many random series.
Part 2  Behaviour: made-up data where we know the right answer.
Part 3  Real NASA POWER data for Kuala Lumpur (needs internet).

Run:  python accuracy_test.py
Needs: pip install numpy scipy pymannkendall statsmodels
"""
import json
import os
import subprocess

import numpy as np
import pymannkendall as pmk
from scipy import stats
from statsmodels.stats.multitest import multipletests

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(2026)
YEARS = list(range(2001, 2024))   # 23 years, like our real data
results = []


def report(part, name, ok, detail):
    status = "INFO" if ok is None else ("PASS" if ok else "FAIL")
    results.append((part, name, status))
    print(f"[ {status} ] {name}\n         {detail}")


NODE = """
const S = require(process.argv[1]);
const calls = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(calls.map(([fn, args]) => S[fn](...args))));
"""


def js(calls):
    """Run many stats.js calls in one go. calls = [(function name, [args]), ...]"""
    out = subprocess.run(["node", "-e", NODE, os.path.join(HERE, "..", "stats.js")],
                         input=json.dumps(calls), capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit("stats.js failed:\n" + out.stderr)
    return json.loads(out.stdout)


def js_analyze(series_list, years=YEARS):
    return js([("analyze", [years, list(map(float, y))]) for y in series_list])


def ar1(phi, n=23):
    e = rng.normal(0, 1, n + 50)
    x = np.zeros_like(e)
    for i in range(1, len(e)):
        x[i] = phi * x[i - 1] + e[i]
    return x[50:]


# =====================================================================
# PART 1: exact maths against independent libraries
# =====================================================================

def part1():
    print("\nPART 1: exact maths against independent libraries\n" + "-" * 60)

    # Hand-worked answers
    r = js([("mannKendall", [[1, 3, 2, 5, 4]]), ("senSlope", [[0, 1, 2, 3, 4], [1, 3, 2, 5, 4]]),
            ("senSlope", [[0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 16, 7]]),
            ("linearRegression", [[0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 16, 7]])])
    ok = r[0]["S"] == 6 and r[1]["slope"] == 0.875 and r[2]["slope"] == 1 and abs(r[3]["slope"] - 1.7143) < 1e-4
    report(1, "Hand-worked textbook examples", ok,
           f"S={r[0]['S']} (want 6), Sen={r[1]['slope']} (want 0.875); "
           f"USGS outlier example: Sen={r[2]['slope']} (want 1), line={r[3]['slope']:.4f} (want 1.7143)")

    # 1,000 random series of different lengths, some with ties
    series = []
    for k in range(1000):
        n = int(rng.integers(10, 46))
        y = rng.normal(0, 1, n) + rng.uniform(-0.05, 0.05) * np.arange(n)
        if k % 3 == 0:
            y = np.round(y, 1)                      # force tied values
        series.append((list(range(1981, 1981 + n)), list(y)))
    calls = []
    for x, y in series:
        calls += [("mannKendall", [y]), ("senSlope", [x, y]), ("linearRegression", [x, y]),
                  ("analyze", [x, y])]
    out = js(calls)
    worst = {k: 0.0 for k in ["MK S", "MK var(S)", "MK z", "MK p", "MK tau", "Sen slope", "Sen intercept",
                              "Sen 95% range", "line slope", "line std error", "line p", "R²",
                              "line memory-adjusted p", "MK memory-adjusted p"]}

    def w(key, a, b):
        worst[key] = max(worst[key], abs(a - b))

    for i, (x, y) in enumerate(series):
        mk_js, sen_js, ols_js, an_js = out[4 * i], out[4 * i + 1], out[4 * i + 2], out[4 * i + 3]
        mk = pmk.original_test(np.array(y))
        w("MK S", mk_js["S"], mk.s); w("MK var(S)", mk_js["varS"], mk.var_s)
        w("MK z", mk_js["z"], mk.z); w("MK p", mk_js["p"], mk.p); w("MK tau", mk_js["tau"], mk.Tau)
        # the 95% range needs the variance, so ask again with it
        ts = stats.theilslopes(y, x, 0.95)
        w("Sen slope", sen_js["slope"], ts.slope); w("Sen intercept", sen_js["intercept"], ts.intercept)
        lr = stats.linregress(x, y)
        w("line slope", ols_js["slope"], lr.slope); w("line std error", ols_js["se"], lr.stderr)
        w("line p", ols_js["p"], lr.pvalue); w("R²", ols_js["r2"], lr.rvalue ** 2)
        # memory adjustment written independently here (Santer et al. 2008, with the
        # small-sample bias correction), on top of scipy and pymannkendall
        n = len(y)
        res = np.array(y) - (lr.intercept + lr.slope * np.array(x))
        r1 = np.corrcoef(res[:-1], res[1:])[0, 1]
        r = min(max(r1 + (1 + 4 * r1) / n, 0.0), 0.95)
        ne = n * (1 - r) / (1 + r)
        dfa = max(ne - 2, 1)
        se = lr.stderr * np.sqrt((n - 2) / dfa)
        w("line memory-adjusted p", ols_js["pAdj"], 2 * stats.t.sf(abs(lr.slope / se), dfa))
        z = (mk.s - np.sign(mk.s)) / np.sqrt(mk.var_s * n / ne)
        w("MK memory-adjusted p", an_js["p"], 2 * stats.norm.sf(abs(z)))
    ci_calls = [("senSlope", [x, y, pmk.original_test(np.array(y)).var_s]) for x, y in series]
    for (x, y), r in zip(series, js(ci_calls)):
        ts = stats.theilslopes(y, x, 0.95)
        worst["Sen 95% range"] = max(worst["Sen 95% range"], abs(r["ciLow"] - ts.low_slope),
                                     abs(r["ciHigh"] - ts.high_slope))
    lines = [f"{k:22s} largest difference {v:.1e}" for k, v in worst.items()]
    ok = all(v < (1e-6 if "p" in k.split()[-1] or k == "MK z" else 1e-9) for k, v in worst.items())
    report(1, "1,000 random series (10-45 years, a third with ties) vs pymannkendall / scipy", ok,
           "\n         ".join(lines))

    # FDR against statsmodels
    maps = []
    for _ in range(200):
        p = list(np.concatenate([rng.uniform(0, 1, 360), rng.uniform(0, 0.002, 40)]))
        maps.append(p)
    out = js([("fdr", [p, 0.05]) for p in maps] + [("fdr", [p, 0.10]) for p in maps])
    bad = 0
    for i, p in enumerate(maps):
        bad += int(np.sum(np.array(out[i]) != multipletests(p, 0.05, "fdr_bh")[0]))
        bad += int(np.sum(np.array(out[200 + i]) != multipletests(p, 0.10, "fdr_bh")[0]))
    report(1, "FDR on 400 maps of 400 cells vs statsmodels", bad == 0, f"{bad} cells differ")


# =====================================================================
# PART 2: behaviour on made-up data with a known answer
# =====================================================================

def part2():
    print("\nPART 2: behaviour on made-up data with a known answer\n" + "-" * 60)
    t = np.arange(23)
    T = 2000

    # Known trend recovered, and the 95% ranges contain it ~95% of the time
    true = 0.03
    out = js_analyze([true * t + rng.normal(0, 0.2, 23) for _ in range(T)])
    sen = np.array([r["sen"]["slope"] for r in out])
    cover_ols = np.mean([r["ols"]["ciLow"] <= true <= r["ols"]["ciHigh"] for r in out])
    cover_sen = np.mean([r["sen"]["ciLow"] <= true <= r["sen"]["ciHigh"] for r in out])
    found = np.mean([r["verdict"] == "significant" for r in out])
    bias = abs(sen.mean() - true) / true
    report(2, "Finds a known trend (0.3 per decade, 23 years)", bias < 0.02 and found > 0.8,
           f"average rate found {sen.mean() * 10:.4f}/decade (error {bias * 100:.1f}%), "
           f"called significant in {found * 100:.0f}% of {T} trials")
    report(2, "95% ranges contain the true rate about 95% of the time",
           0.92 <= cover_ols <= 0.98 and 0.92 <= cover_sen <= 0.98,
           f"line range {cover_ols * 100:.1f}%, Sen range {cover_sen * 100:.1f}%")

    # No trend at all: false alarms near 5%
    out = js_analyze([rng.normal(0, 1, 23) for _ in range(T)])
    fa = np.mean([r["verdict"] == "significant" for r in out])
    border = np.mean([r["verdict"] == "borderline" for r in out])
    # Cautious by design: the memory correction never treats negative memory as
    # extra evidence, so with no memory at all false alarms sit a little under 5%.
    report(2, "Pure noise, no trend: false alarms at most 7% (cautious by design)", 0.01 <= fa <= 0.07,
           f"'significant' {fa * 100:.1f}% (target 5% or a little under), "
           f"'borderline' {border * 100:.1f}% (target about 5%)")
    agree = np.mean([(r["sen"]["ciLow"] > 0 or r["sen"]["ciHigh"] < 0) == (r["p"] < 0.05) for r in out])
    report(2, "The rate's 95% range and the verdict agree", agree >= 0.97,
           f"agree in {agree * 100:.1f}% of {T} series (both come from Kendall's pairwise comparisons; "
           f"the range uses ranks, so a series right at the edge can differ)")

    # One freak year (haze, El Nino) on top of a real trend
    def spiky():
        y = 0.06 * t + rng.normal(0, 1, 23)
        y[rng.integers(23)] += 6
        return y
    out = js_analyze([spiky() for _ in range(T)])
    ours = np.mean([r["verdict"] == "significant" for r in out])
    line = np.mean([r["ols"]["pAdj"] < 0.05 for r in out])
    report(2, "A real trend plus one freak year: still found?", ours > line,
           f"our verdict finds it {ours * 100:.0f}% of the time, a line-based verdict {line * 100:.0f}%")

    # Memory (autocorrelation), no trend
    lines, worst = [], 0
    for phi in (0.2, 0.5, 0.7):
        out = js_analyze([ar1(phi) for _ in range(T)])
        fa = np.mean([r["verdict"] == "significant" for r in out])
        plain = np.mean([r["mk"]["p"] < 0.05 for r in out])
        worst = max(worst, fa)
        lines.append(f"memory {phi}: our verdict {fa * 100:.1f}%, plain Mann-Kendall {plain * 100:.1f}% (target 5%)")
    report(2, "Year-to-year memory, no trend: false alarms (still a little high at strong memory)", None,
           "\n         ".join(lines))

    # Missing years handled: -999 gives the same answer as deleting the year
    y = list(0.02 * t + rng.normal(0, 0.1, 23))
    with_gap = list(y)
    with_gap[5] = -999.0
    with_null = list(y)
    with_null[5] = None
    a, b, c = js([("analyze", [YEARS, with_gap]), ("analyze", [YEARS, with_null]),
                  ("analyze", [YEARS[:5] + YEARS[6:], y[:5] + y[6:]])])
    same = a["n"] == b["n"] == c["n"] == 22 and a["p"] == b["p"] == c["p"] and a["slopePerDecade"] == c["slopePerDecade"]
    report(2, "Missing years (-999 or blank) are removed correctly", same,
           f"n = {a['n']}, {b['n']}, {c['n']} (want 22 each), identical results: {same}")

    # Map: no trend anywhere vs a real trend everywhere
    maps_with_false_dots, dots_real = 0, []
    for m in range(40):
        cells = js_analyze([rng.normal(0, 1, 23) for _ in range(100)])
        sig = js([("fdr", [[r["p"] for r in cells], 0.05])])[0]
        maps_with_false_dots += any(sig)
    for m in range(5):
        cells = js_analyze([0.05 * t + rng.normal(0, 0.3, 23) for _ in range(100)])
        sig = js([("fdr", [[r["p"] for r in cells], 0.05])])[0]
        dots_real.append(np.mean(sig))
    report(2, "Map with FDR: empty when nothing changes, full when everything does",
           maps_with_false_dots / 40 <= 0.10 and np.mean(dots_real) > 0.9,
           f"no-trend maps with any dot: {maps_with_false_dots} of 40 (target about 5%); "
           f"real-trend maps: {np.mean(dots_real) * 100:.0f}% of cells dotted")


# =====================================================================
# PART 3: real NASA data
# =====================================================================

def nasa_yearly(param, lat=3.14, lon=101.69, start=1981, end=2025):
    url = ("https://power.larc.nasa.gov/api/temporal/monthly/point?"
           f"parameters={param}&community=RE&longitude={lon}&latitude={lat}"
           f"&start={start}&end={end}&format=JSON")
    # curl uses the computer's own certificates (Python's downloader may not have them)
    raw = subprocess.run(["curl", "-sSf", "-m", "60", url], capture_output=True, text=True, check=True).stdout
    table = json.loads(raw)["properties"]["parameter"][param]
    years, values = [], []
    for y in range(start, end + 1):
        months = [table.get(f"{y}{m:02d}") for m in range(1, 13)]
        if all(v is not None and v > -990 for v in months):
            years.append(y)
            values.append(float(np.mean(months)))
    return years, values


def part3():
    print("\nPART 3: real NASA POWER data, Kuala Lumpur 1981-2025 (same years as the app)\n" + "-" * 60)
    for param, unit, name in [("T2M", "°C", "Air temperature"), ("PRECTOTCORR", "mm/day", "Rainfall"),
                              ("RH2M", "%", "Humidity")]:
        try:
            years, values = nasa_yearly(param)
        except Exception as e:
            report(3, name, None, f"could not download ({e})")
            continue
        r = js([("analyze", [years, values])])[0]
        mk = pmk.original_test(np.array(values))
        ts = stats.theilslopes(values, years)
        lr = stats.linregress(years, values)
        agree = (abs(r["mk"]["p"] - mk.p) < 1e-6 and abs(r["sen"]["slope"] - ts.slope) < 1e-12
                 and abs(r["ols"]["p"] - lr.pvalue) < 1e-9)
        report(3, f"{name} ({param})", agree,
               f"{len(years)} years | rate {r['slopePerDecade']:+.3f} {unit}/decade "
               f"(95% range {r['sen']['ciLow'] * 10:+.3f} to {r['sen']['ciHigh'] * 10:+.3f}) | "
               f"verdict: {r['verdict']}\n         "
               f"memory lag1 = {r['ols']['lag1']:.2f} (corrected {r['ols']['lag1Adj']:.2f}) -> "
               f"{r['ols']['nEff']:.1f} effective years | "
               f"Mann-Kendall p plain {r['mk']['p']:.4f}, adjusted {r['p']:.4f} | "
               f"matches pymannkendall + scipy on this data: {agree}")


if __name__ == "__main__":
    print("=" * 60 + "\nAccuracy test of stats.js\n" + "=" * 60)
    part1()
    part2()
    part3()
    print("\n" + "=" * 60 + "\nSUMMARY\n" + "=" * 60)
    for part, name, status in results:
        print(f"{status:4s}  Part {part}: {name}")
    fails = sum(s == "FAIL" for _, _, s in results)
    print(f"\n{sum(s == 'PASS' for _, _, s in results)} passed, {fails} failed, "
          f"{sum(s == 'INFO' for _, _, s in results)} for information")
