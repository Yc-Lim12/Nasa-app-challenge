"""
Check the website's statistics (stats.js) against SciPy and textbook formulas.

    pip install -r tools/requirements.txt
    python tools/validate_stats.py

Every number the website reports is recomputed independently here and compared.
Exit code 0 means every check passed.
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
    z = 0.0 if s == 0 else (s - np.sign(s)) / np.sqrt(var)
    return s, var, z, 2 * stats.norm.sf(abs(z))


def ar1_factor(r1, n):
    """n / n* for AR(1) data (Matalas & Langbein 1962; Yue & Wang 2004)."""
    if r1 <= 0:
        return 1.0
    k = np.arange(1, n)
    return 1 + 2 * np.sum((1 - k / n) * r1 ** k)


def reference(x, y, ar1=False):
    x, y = np.asarray(x, float), np.asarray(y, float)
    n = len(x)
    lr = stats.linregress(x, y)
    resid = y - (lr.intercept + lr.slope * x)
    lag1 = np.sum(resid[1:] * resid[:-1]) / np.sum(resid ** 2)
    s, var, z, p_mk = mann_kendall(y)
    se, df, p_t = lr.stderr, n - 2, lr.pvalue
    if ar1:
        f = ar1_factor(min(0.95, lag1), n)
        if f > 1:
            var *= f
            z = 0.0 if s == 0 else (s - np.sign(s)) / np.sqrt(var)
            p_mk = 2 * stats.norm.sf(abs(z))
            se = lr.stderr * np.sqrt(f)
            df = max(2, round(n / f) - 2)
            p_t = 2 * stats.t.sf(abs(lr.slope / se), df)
    tc = stats.t.ppf(0.975, df)
    ts = stats.theilslopes(y, x)
    return {
        "ols.slope": lr.slope, "ols.intercept": lr.intercept, "ols.se": se, "ols.p": p_t,
        "ols.ciLow": lr.slope - tc * se, "ols.ciHigh": lr.slope + tc * se, "ols.r2": lr.rvalue ** 2,
        "ols.lag1": lag1,
        "mk.S": s, "mk.varS": var, "mk.z": z, "mk.p": p_mk, "mk.tau": s / (n * (n - 1) / 2),
        # Sen's slope: SciPy's theilslopes is the median of pairwise slopes, the same definition.
        # (SciPy's intercept uses a different convention, so the intercept is checked directly.)
        "sen.slope": ts.slope, "sen.intercept": np.median(y - ts.slope * x),
    }


# ---- test series --------------------------------------------------------------

def make_cases():
    rng = np.random.default_rng(2026)
    cases = []
    years = np.arange(1981, 2026)
    for i in range(12):                                   # yearly, white noise, with and without a trend
        slope = [0, 0.01, 0.02, -0.03][i % 4]
        cases.append(("yearly white noise #%d" % i, years, 26 + slope * (years - 1981) + rng.normal(0, 0.3, len(years)), False))
    for i in range(4):                                    # ties: values rounded to one decimal
        cases.append(("yearly with ties #%d" % i, years, np.round(5 + 0.01 * (years - 1981) + rng.normal(0, 0.2, len(years)), 1), False))
    short = np.arange(2010, 2020)                         # the shortest record the app accepts
    cases.append(("10 years only", short, 1 + 0.05 * (short - 2010) + rng.normal(0, 0.1, 10), False))
    t = 1981 + (np.arange(540) + 0.5) / 12                # monthly, AR(1) noise, autocorrelation-corrected
    for i, phi in enumerate([0.0, 0.3, 0.6, 0.8]):
        e = np.zeros(540)
        for k in range(1, 540):
            e[k] = phi * e[k - 1] + rng.normal()
        cases.append(("monthly AR(1) phi=%.1f, corrected" % phi, t, 0.015 * (t - 1981) + e, True))
    return cases


def main():
    cases = make_cases()
    js = run_js([{"x": x, "y": y, "opts": {"ar1": True} if ar1 else None} for _, x, y, ar1 in cases])
    failures, checks = [], 0
    for (name, x, y, ar1), got in zip(cases, js):
        ref = reference(x, y, ar1)
        for key, want in ref.items():
            part, field = key.split(".")
            have = got[part][field]
            checks += 1
            if key.endswith(".p"):
                ok = abs(have - want) <= P_TOL
            else:
                ok = abs(have - want) <= TOL * max(1.0, abs(want))
            if not ok:
                failures.append("%-38s %-14s stats.js=%.10g reference=%.10g" % (name, key, have, want))
    print("Checked %d numbers on %d series against SciPy %s." % (checks, len(cases), __import__("scipy").__version__))
    if failures:
        print("%d MISMATCHES:" % len(failures))
        print("\n".join(failures))
        return 1
    print("All match (values to 1e-6 relative, p-values to 1e-6 absolute).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
