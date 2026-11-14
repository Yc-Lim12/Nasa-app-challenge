"""
Check the website's statistics (stats.js) against SciPy and textbook formulas.

    pip install -r tools/requirements.txt
    python tools/validate_stats.py

Every number the website reports is recomputed independently here and compared:
the plain tests against SciPy, and the year-to-year memory adjustment against the
formulas in the Methods section. Exit code 0 means every check passed.
"""
import sys

import numpy as np
from scipy import stats

from common import run_js

TOL = 1e-6          # relative tolerance for values
P_TOL = 1e-6        # absolute tolerance for p-values


# ---- independent reference implementations ------------------------------------

def mann_kendall(y):
    """Textbook Mann-Kendall: S, tie-corrected variance, continuity-corrected z, two-sided p."""
    y = np.asarray(y, float)
    n = len(y)
    s = sum(np.sign(y[j] - y[i]) for i in range(n - 1) for j in range(i + 1, n))
    _, counts = np.unique(y, return_counts=True)
    ties = sum(c * (c - 1) * (2 * c + 5) for c in counts if c > 1)
    var = (n * (n - 1) * (2 * n + 5) - ties) / 18
    return s, var


def z_of(s, var):
    return 0.0 if s == 0 else (s - np.sign(s)) / np.sqrt(var)


def reference(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    n = len(x)
    lr = stats.linregress(x, y)
    resid = y - (lr.intercept + lr.slope * x)
    # memory: Pearson correlation of each residual with the next, plus the
    # small-sample bias correction, kept between 0 and 0.95
    lag1 = np.corrcoef(resid[:-1], resid[1:])[0, 1]
    r = min(max(lag1 + (1 + 4 * lag1) / n, 0.0), 0.95)
    n_eff = n * (1 - r) / (1 + r)
    df, df_adj = n - 2, max(n_eff - 2, 1)
    se_adj = lr.stderr * np.sqrt(df / df_adj)
    p_adj = 2 * stats.t.sf(abs(lr.slope / se_adj), df_adj)
    half = stats.t.ppf(0.975, df_adj) * se_adj
    s, var = mann_kendall(y)
    z = z_of(s, var)
    var_adj = var * n / n_eff
    z_adj = z_of(s, var_adj)
    ts = stats.theilslopes(y, x)       # median of pairwise slopes; intercept median(y) - slope * median(x)
    # Sen's 95% range from the sorted pairwise slopes and the adjusted MK variance (Sen 1968)
    slopes = np.sort([(y[j] - y[i]) / (x[j] - x[i]) for i in range(n - 1) for j in range(i + 1, n) if x[j] != x[i]])
    N, w = len(slopes), 1.959963984540054 * np.sqrt(var_adj)
    lo = slopes[max(int(np.round((N - w) / 2)) - 1, 0)]
    hi = slopes[min(int(np.round((N + w) / 2)), N - 1)]
    return {
        "ols.slope": lr.slope, "ols.intercept": lr.intercept, "ols.se": lr.stderr, "ols.p": lr.pvalue,
        "ols.r2": lr.rvalue ** 2, "ols.lag1": lag1, "ols.lag1Adj": r, "ols.nEff": n_eff,
        "ols.seAdj": se_adj, "ols.pAdj": p_adj, "ols.ciLow": lr.slope - half, "ols.ciHigh": lr.slope + half,
        "mk.S": s, "mk.varS": var, "mk.z": z, "mk.p": 2 * stats.norm.sf(abs(z)), "mk.tau": s / (n * (n - 1) / 2),
        "mk.varSAdj": var_adj, "mk.zAdj": z_adj, "mk.pAdj": 2 * stats.norm.sf(abs(z_adj)),
        "sen.slope": ts.slope, "sen.intercept": ts.intercept, "sen.ciLow": lo, "sen.ciHigh": hi,
    }


# ---- test series --------------------------------------------------------------

def ar1(rng, n, phi):
    e = np.zeros(n)
    for k in range(1, n):
        e[k] = phi * e[k - 1] + rng.normal()
    return e


def make_cases():
    rng = np.random.default_rng(2026)
    cases = []
    years = np.arange(1981, 2026)
    for i in range(12):                                   # yearly, with and without a trend
        slope = [0, 0.01, 0.02, -0.03][i % 4]
        cases.append(("yearly white noise #%d" % i, years, 26 + slope * (years - 1981) + rng.normal(0, 0.3, len(years))))
    for i, phi in enumerate([0.3, 0.6]):                  # yearly with year-to-year memory
        cases.append(("yearly AR(1) phi=%.1f" % phi, years, 0.01 * (years - 1981) + 0.3 * ar1(rng, len(years), phi)))
    for i in range(4):                                    # ties: values rounded to one decimal
        cases.append(("yearly with ties #%d" % i, years, np.round(5 + 0.01 * (years - 1981) + rng.normal(0, 0.2, len(years)), 1)))
    short = np.arange(2010, 2020)                         # the shortest record the app accepts
    cases.append(("10 years only", short, 1 + 0.05 * (short - 2010) + rng.normal(0, 0.1, 10)))
    t = 1981 + (np.arange(540) + 0.5) / 12                # monthly, seasonal cycle removed
    for phi in [0.0, 0.3, 0.6, 0.8]:
        cases.append(("monthly AR(1) phi=%.1f" % phi, t, 0.015 * (t - 1981) + ar1(rng, 540, phi)))
    return cases


def main():
    cases = make_cases()
    js = run_js([{"x": x, "y": y} for _, x, y in cases])
    failures, checks = [], 0
    for (name, x, y), got in zip(cases, js):
        for key, want in reference(x, y).items():
            part, field = key.split(".")
            have = got[part][field]
            checks += 1
            if key.endswith(".p") or key.endswith("pAdj"):
                ok = abs(have - want) <= P_TOL
            else:
                ok = abs(have - want) <= TOL * max(1.0, abs(want))
            if not ok:
                failures.append("%-28s %-14s stats.js=%.10g reference=%.10g" % (name, key, have, want))
    print("Checked %d numbers on %d series against SciPy %s." % (checks, len(cases), __import__("scipy").__version__))
    if failures:
        print("%d MISMATCHES:" % len(failures))
        print("\n".join(failures))
        return 1
    print("All match (values to 1e-6 relative, p-values to 1e-6 absolute).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
