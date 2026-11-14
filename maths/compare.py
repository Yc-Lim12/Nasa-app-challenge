"""
compare.py - Checks our stats.js against the Python answer key (answer_key.py).

Run from the maths folder:  python compare.py   (tests ../stats.js, the file the website loads)
Each function prints PASS, FAIL (with the first wrong example) or "not written yet".
"""
import json
import os
import subprocess

import numpy as np
from scipy import stats

import answer_key as key

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)
years = list(range(2001, 2024))


def series(n=23, ties=False):
    y = 0.02 * np.arange(n) + rng.normal(0, 0.2, n)
    return list(np.round(y, 1) if ties else y)


# ---- test cases -----------------------------------------------------------

cases = {"clean": [], "mannKendall": [], "senSlope": [], "linearRegression": [],
         "fdr": [], "analyze": []}

cases["clean"] = [
    [[2001, 2002, 2003], [5.0, -999.0, 7.0]],
    [[2001, 2002, 2003, 2004], [1.5, None, -999.0, 2.5]],   # None = missing in the data
    [[2001, 2002], [-0.5, -12.0]],                           # negative but real values
    [years, series()],
]
cases["mannKendall"] = [[[1, 3, 2, 5, 4]], [[1, 1, 2, 2, 3]], [[5, 4, 3, 2, 1]]]
cases["mannKendall"] += [[series(ties=k % 2 == 0)] for k in range(40)]
cases["mannKendall"] += [[series(ties=k % 2 == 0), 23 * (1 - k / 50)] for k in range(40)]   # with nEff
cases["mannKendall"] += [[[0.1 + 0.2, 0.3, 0.5, 0.4]]]          # rounding-noise tie
cases["senSlope"] = [[[0, 1, 2, 3, 4], [1, 3, 2, 5, 4]]]
cases["senSlope"] += [[years, series(ties=k % 2 == 0)] for k in range(40)]
# with the Mann-Kendall variance, so the 95% range is checked too
for k in range(40):
    y = series(ties=k % 2 == 0)
    cases["senSlope"].append([years, y, float(key.mann_kendall(y)["var_S"]) * (1 + k / 20)])
cases["linearRegression"] = [[years, series()] for _ in range(40)]
cases["fdr"] = [[list(np.concatenate([rng.uniform(0, 1, 90), rng.uniform(0, 0.001, 10)])), 0.05]
                for _ in range(20)]
cases["fdr"] += [[[0.5, 0.6, 0.9], 0.05], [[0.001, 0.02, 0.03, 0.2], 0.05]]
cases["fdr"] += [[[0.001, None, 0.02, 0.03, None, 0.2], 0.05]]     # None = cell with no data
cases["analyze"] = [[years, series()] for _ in range(20)]
cases["analyze"] += [[years[:8], series(8)], [years, [v if i != 5 else -999.0 for i, v in enumerate(series())]]]


def expected(name, args):
    if name == "clean":
        x, y = key.clean(*args)
        return {"years": list(x), "values": list(y)}
    if name == "mannKendall":
        r = key.mann_kendall(*args)
        out = {"n": r["n"], "S": r["S"], "varS": r["var_S"], "z": r["z"], "p": r["p"], "tau": r["tau"]}
        if len(args) == 2:
            out.update(varSAdj=r["var_S_adj"], zAdj=r["z_adj"], pAdj=r["p_adj"])
        return out
    if name == "senSlope":
        if len(args) == 3:
            s, i, lo, hi = key.sen_slope(*args)
            return {"slope": s, "intercept": i, "ciLow": lo, "ciHigh": hi}
        s, i = key.sen_slope(*args)
        return {"slope": s, "intercept": i}
    if name == "linearRegression":
        r = key.ols_trend(*args)
        names = {"n": "n", "slope": "slope", "intercept": "intercept", "se": "se", "t": "t",
                 "df": "df", "p": "p", "r2": "r2", "residualSE": "residual_se", "meanX": "mean_x",
                 "sxx": "sxx", "lag1": "lag1", "lag1Adj": "lag1_adj", "nEff": "n_eff", "dfAdj": "df_adj",
                 "seAdj": "se_adj", "pAdj": "p_adj", "tCrit": "t_crit",
                 "ciLow": "ci_low", "ciHigh": "ci_high"}
        return {js: r[py] for js, py in names.items()}
    if name == "fdr":
        return [bool(v) for v in key.fdr(*args)]
    if name == "analyze":
        r = key.analyze(*args)
        out = {"n": r["n"], "verdict": r["verdict"]}
        if "p" in r:
            out.update(slopePerDecade=r["slope_per_decade"], p=r["p"],
                       sen={"ciLow": r["sen_ci_low"], "ciHigh": r["sen_ci_high"]})
        return out


# p-values from the JS helpers agree with scipy to about 1e-7, everything else to 1e-9
TOL = {"p": 1e-6, "z": 1e-6, "zAdj": 1e-6, "pAdj": 1e-6, "tCrit": 1e-6, "ciLow": 1e-6, "ciHigh": 1e-6}


def differs(want, got, path=""):
    """Returns a description of the first difference, or None."""
    if isinstance(want, dict):
        if not isinstance(got, dict):
            return f"{path or 'result'} should be an object {{...}}, got {json.dumps(got)}"
        for k, v in want.items():
            if k not in got:
                return f"missing field '{k}'"
            d = differs(v, got[k], k)
            if d:
                return d
        return None
    if isinstance(want, list):
        if not isinstance(got, list) or len(got) != len(want):
            return f"{path} should be {json.dumps(want)}, got {json.dumps(got)}"
        for i, (a, b) in enumerate(zip(want, got)):
            d = differs(a, b, f"{path}[{i}]")
            if d:
                return d
        return None
    if isinstance(want, (bool, str)):
        return None if want == got else f"{path} should be {want!r}, got {got!r}"
    if not isinstance(got, (int, float)) or isinstance(got, bool):
        return f"{path} should be a number, got {got!r}"
    tol = TOL.get(path.split("[")[0], 1e-9)
    if abs(float(want) - got) > tol * max(1.0, abs(float(want))):
        return f"{path} should be {float(want):.10g}, got {got:.10g}"
    return None


NODE = """
const S = require(process.argv[1]);
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = {};
for (const name of Object.keys(cases)) {
  out[name] = cases[name].map(args => {
    try { const r = S[name](...args); return r === undefined ? {__todo: true} : r; }
    catch (e) { return {__error: String(e)}; }
  });
}
console.log(JSON.stringify(out));
"""


def check_answer_key():
    """The answer key itself must agree with scipy before we trust it."""
    worst = 0.0
    for _ in range(100):
        y = np.array(series())
        x = np.array(years, dtype=float)
        s, i, lo, hi = key.sen_slope(x, y, key.mann_kendall(y)["var_S"])
        ref = stats.theilslopes(y, x, 0.95)
        lr = stats.linregress(x, y)
        r = key.ols_trend(x, y)
        tc = stats.t.ppf(0.975, len(x) - 2)
        worst = max(worst, abs(s - ref[0]), abs(i - ref[1]), abs(lo - ref[2]), abs(hi - ref[3]),
                    abs(r["slope"] - lr.slope), abs(r["p"] - lr.pvalue), abs(r["r2"] - lr.rvalue ** 2))
        if r["lag1_adj"] == 0:   # no memory: the range must be the ordinary one
            worst = max(worst, abs(r["ci_low"] - (lr.slope - tc * lr.stderr)))
    status = "PASS" if worst < 1e-9 else "FAIL"
    print(f"[ {status} ] answer key vs scipy (largest difference {worst:.1e})")


def main():
    check_answer_key()
    js = subprocess.run(["node", "-e", NODE, os.path.join(HERE, "..", "stats.js")],
                        input=json.dumps(cases, allow_nan=False), capture_output=True, text=True)
    if js.returncode != 0:
        print("stats.js could not be loaded. Error from Node:\n")
        print(js.stderr.strip())
        return
    got_all = json.loads(js.stdout)
    for name, arglist in cases.items():
        got = got_all[name]
        if all(isinstance(g, dict) and g.get("__todo") for g in got):
            print(f"[ ---- ] {name}: not written yet")
            continue
        problem = None
        for args, g in zip(arglist, got):
            if isinstance(g, dict) and "__error" in g:
                problem = f"crashed: {g['__error']}"
            else:
                d = differs(expected(name, args), g)
                if d:
                    problem = d
            if problem:
                shown = json.dumps(args)
                print(f"[ FAIL ] {name}\n         input: {shown[:160]}{'...' if len(shown) > 160 else ''}\n         {problem}")
                break
        if not problem:
            print(f"[ PASS ] {name} ({len(arglist)} examples)")


if __name__ == "__main__":
    main()
