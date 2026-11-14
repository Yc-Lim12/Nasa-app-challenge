"""Trend statistics for our Space Apps project."""
import numpy as np
from scipy import stats

FILL = -990  # NASA POWER uses -999 for "no data"


def clean(years, values):
    """Drop missing values. Returns two numpy arrays."""
    years = np.asarray(years, dtype=float)
    values = np.asarray(values, dtype=float)
    ok = np.isfinite(values) & (values > FILL)
    return years[ok], values[ok]


def mann_kendall(y, n_eff=None):
    """Mann-Kendall trend test. y must be in time order.
    With n_eff, also the memory-adjusted p (variance of S times n / n_eff)."""
    # 10 significant digits, so computer-rounding differences count as ties
    y = np.array([float(f"{v:.10g}") for v in np.asarray(y, dtype=float)])
    n = len(y)
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            s += np.sign(y[j] - y[i])
    # tie correction: groups of equal values reduce the variance
    _, counts = np.unique(y, return_counts=True)
    ties = np.sum(counts * (counts - 1) * (2 * counts + 5))
    var_s = (n * (n - 1) * (2 * n + 5) - ties) / 18
    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0
    p = 2 * stats.norm.sf(abs(z))
    tau = s / (n * (n - 1) / 2)
    out = {"n": n, "S": s, "var_S": var_s, "z": z, "p": p, "tau": tau}
    if n_eff is not None:
        v = var_s * n / n_eff
        z_adj = (s - np.sign(s)) / np.sqrt(v)
        out.update(var_S_adj=v, z_adj=z_adj, p_adj=2 * stats.norm.sf(abs(z_adj)))
    return out


def sen_slope(x, y, var_s=None):
    """Median of the slopes between every pair of points.
    With var_s, also a 95% range picked from the sorted slopes (as in scipy)."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    slopes = []
    for i in range(len(x) - 1):
        for j in range(i + 1, len(x)):
            if x[j] != x[i]:
                slopes.append((y[j] - y[i]) / (x[j] - x[i]))
    slope = np.median(slopes)
    intercept = np.median(y) - slope * np.median(x)
    if var_s is None:
        return slope, intercept
    s = np.sort(slopes)
    n = len(s)
    half = stats.norm.ppf(0.975) * np.sqrt(var_s)
    lo = s[max(int(np.round((n - half) / 2)) - 1, 0)]
    hi = s[min(int(np.round((n + half) / 2)), n - 1)]
    return slope, intercept, lo, hi


def ols_trend(x, y):
    """Straight-line fit with a t-test, adjusted for year-to-year memory."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    n = len(x)
    sxx = np.sum((x - x.mean()) ** 2)
    syy = np.sum((y - y.mean()) ** 2)
    slope = np.sum((x - x.mean()) * (y - y.mean())) / sxx
    intercept = y.mean() - slope * x.mean()
    resid = y - (intercept + slope * x)
    df = n - 2
    residual_se = np.sqrt(np.sum(resid ** 2) / df)
    se = residual_se / np.sqrt(sxx)
    t = slope / se
    p = 2 * stats.t.sf(abs(t), df)
    r2 = 0.0 if syy == 0 else 1 - np.sum(resid ** 2) / syy

    # lag-1 autocorrelation of the residuals ("memory")
    a, b = resid[:-1], resid[1:]
    r1 = 0.0 if a.std() == 0 or b.std() == 0 else np.corrcoef(a, b)[0, 1]
    # effective sample size: memory means fewer independent years
    r = min(max(r1 + (1 + 4 * r1) / n, 0), 0.95)   # small-sample bias correction
    n_eff = n * (1 - r) / (1 + r)
    df_adj = max(n_eff - 2, 1)
    se_adj = se * np.sqrt(df / df_adj)
    p_adj = 2 * stats.t.sf(abs(slope / se_adj), df_adj)
    t_crit = stats.t.ppf(0.975, df_adj) * se_adj / se
    return {"n": n, "slope": slope, "intercept": intercept, "se": se, "t": t, "df": df,
            "p": p, "r2": r2, "residual_se": residual_se, "mean_x": x.mean(), "sxx": sxx,
            "lag1": r1, "lag1_adj": r, "n_eff": n_eff, "df_adj": df_adj, "se_adj": se_adj, "p_adj": p_adj,
            "t_crit": t_crit, "ci_low": slope - t_crit * se, "ci_high": slope + t_crit * se}


def fdr(pvals, q=0.05):
    """Benjamini-Hochberg: True where a map cell stays significant.
    Cells without a p-value (NaN) are False and not counted."""
    p = np.asarray(pvals, dtype=float).ravel()
    sig = np.zeros(p.size, dtype=bool)
    idx = np.nonzero(np.isfinite(p))[0]
    n = idx.size
    order = idx[np.argsort(p[idx], kind="stable")]
    passed = p[order] <= q * np.arange(1, n + 1) / n
    if passed.any():
        k = np.max(np.nonzero(passed)[0])
        sig[order[: k + 1]] = True
    return sig.reshape(np.shape(pvals))


def analyze(years, values):
    """Everything for one place and one variable."""
    x, y = clean(years, values)
    if len(y) < 10:
        return {"verdict": "insufficient", "n": len(y)}
    ols = ols_trend(x, y)
    mk = mann_kendall(y, ols["n_eff"])
    slope, intercept, lo, hi = sen_slope(x, y, mk["var_S_adj"])
    p = mk["p_adj"]
    if p < 0.05:
        verdict = "significant"
    elif p < 0.10:
        verdict = "borderline"
    else:
        verdict = "none"
    return {"n": len(y), "slope_per_decade": slope * 10, "p": p, "verdict": verdict,
            "sen_ci_low": lo, "sen_ci_high": hi, "mk": mk, "ols": ols}
