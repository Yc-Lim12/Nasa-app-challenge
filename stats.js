/*
 * Trend Detective statistics.
 * Linear regression with a t-test, the Mann-Kendall trend test and Sen's slope.
 * No dependencies. Works in the browser (window.TDStats) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---- special functions -------------------------------------------------

  function lgamma(x) {
    // Lanczos approximation (g = 7, n = 9)
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    }
    x -= 1;
    var a = c[0];
    var t = x + 7.5;
    for (var i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  function betacf(a, b, x) {
    // Continued fraction for the incomplete beta function (modified Lentz).
    var MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function ibeta(a, b, x) {
    // Regularised incomplete beta function I_x(a, b).
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) +
      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /** Two-sided p-value for a t statistic with df degrees of freedom. */
  function tPValue(t, df) {
    if (!isFinite(t)) return 0;
    return ibeta(df / 2, 0.5, df / (df + t * t));
  }

  /** Critical t value for a two-sided interval, e.g. conf = 0.95. */
  function tCritical(conf, df) {
    var target = 1 - conf, lo = 0, hi = 1000;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tPValue(mid, df) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function erfc(x) {
    // Numerical Recipes erfcc, fractional error below 1.2e-7 everywhere.
    var z = Math.abs(x);
    var t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 +
      t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
      t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  /** Two-sided p-value for a standard normal z score. */
  function normPValue(z) {
    return erfc(Math.abs(z) / Math.SQRT2);
  }

  // ---- helpers -----------------------------------------------------------

  function mean(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }

  function median(a) {
    var s = a.slice().sort(function (p, q) { return p - q; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ---- tests -------------------------------------------------------------

  /**
   * Ordinary least squares y = intercept + slope * x, with a t-test on the slope.
   */
  function linearRegression(x, y) {
    var n = x.length;
    var mx = mean(x), my = mean(y);
    var sxx = 0, sxy = 0, syy = 0, i;
    for (i = 0; i < n; i++) {
      sxx += (x[i] - mx) * (x[i] - mx);
      sxy += (x[i] - mx) * (y[i] - my);
      syy += (y[i] - my) * (y[i] - my);
    }
    var slope = sxy / sxx;
    var intercept = my - slope * mx;
    var sse = 0;
    var resid = [];
    for (i = 0; i < n; i++) {
      var e = y[i] - (intercept + slope * x[i]);
      resid.push(e);
      sse += e * e;
    }
    var df = n - 2;
    var s = Math.sqrt(sse / df);            // residual standard error
    var se = s / Math.sqrt(sxx);            // standard error of the slope
    var t = se === 0 ? (slope === 0 ? 0 : Infinity) : slope / se;
    var p = syy === 0 ? 1 : tPValue(t, df);
    var tc = tCritical(0.95, df);
    // lag-1 autocorrelation of the residuals
    var num = 0, den = 0;
    for (i = 0; i < n; i++) {
      den += resid[i] * resid[i];
      if (i > 0) num += resid[i] * resid[i - 1];
    }
    return {
      n: n, slope: slope, intercept: intercept, se: se, t: t, df: df, p: p,
      ciLow: slope - tc * se, ciHigh: slope + tc * se,
      r2: syy === 0 ? 0 : 1 - sse / syy,
      residualSE: s, tCrit: tc, meanX: mx, sxx: sxx,
      lag1: den === 0 ? 0 : num / den
    };
  }

  /**
   * Mann-Kendall trend test (values must be in time order).
   * Uses the tie-corrected variance and the usual continuity correction.
   */
  function mannKendall(y) {
    var n = y.length, S = 0, i, j;
    for (i = 0; i < n - 1; i++) {
      for (j = i + 1; j < n; j++) {
        var d = y[j] - y[i];
        S += d > 0 ? 1 : (d < 0 ? -1 : 0);
      }
    }
    var counts = {};
    for (i = 0; i < n; i++) counts[y[i]] = (counts[y[i]] || 0) + 1;
    var tie = 0;
    for (var k in counts) {
      var c = counts[k];
      if (c > 1) tie += c * (c - 1) * (2 * c + 5);
    }
    var varS = (n * (n - 1) * (2 * n + 5) - tie) / 18;
    var z = 0;
    if (varS > 0) {
      if (S > 0) z = (S - 1) / Math.sqrt(varS);
      else if (S < 0) z = (S + 1) / Math.sqrt(varS);
    }
    return { n: n, S: S, varS: varS, z: z, p: normPValue(z), tau: S / (n * (n - 1) / 2) };
  }

  /** Sen's slope: the median of the slopes between every pair of points. */
  function senSlope(x, y) {
    var slopes = [], n = x.length, i, j;
    for (i = 0; i < n - 1; i++) {
      for (j = i + 1; j < n; j++) {
        if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]));
      }
    }
    var slope = median(slopes);
    var inter = [];
    for (i = 0; i < n; i++) inter.push(y[i] - slope * x[i]);
    return { slope: slope, intercept: median(inter) };
  }

  /**
   * Variance inflation for positively autocorrelated (AR(1)) data:
   * n / n* = 1 + 2 * sum_{k=1}^{n-1} (1 - k/n) * r1^k
   * (Matalas & Langbein 1962; Yue & Wang 2004). Returns 1 when r1 <= 0.
   */
  function ar1Factor(r1, n) {
    if (!(r1 > 0)) return 1;
    var f = 1, rk = 1;
    for (var k = 1; k < n; k++) {
      rk *= r1;
      if (rk < 1e-12) break;
      f += 2 * (1 - k / n) * rk;
    }
    return f;
  }

  /**
   * Correct both tests for lag-1 autocorrelation of the trend residuals, by
   * treating the series as having n* = n / f independent points: the
   * Mann-Kendall variance and the slope's standard error are inflated by f,
   * and the t-test uses n* - 2 degrees of freedom.
   */
  function adjustAR1(ols, mk) {
    var n = ols.n, r1 = Math.min(0.95, ols.lag1), f = ar1Factor(r1, n);
    if (f === 1) return { r1: r1, f: 1, nEff: n };
    var nEff = n / f;
    var varS = mk.varS * f, z = 0;
    if (varS > 0) {
      if (mk.S > 0) z = (mk.S - 1) / Math.sqrt(varS);
      else if (mk.S < 0) z = (mk.S + 1) / Math.sqrt(varS);
    }
    mk.varS = varS; mk.z = z; mk.p = normPValue(z);
    var df = Math.max(2, Math.round(nEff) - 2), se = ols.se * Math.sqrt(f);
    var t = se === 0 ? (ols.slope === 0 ? 0 : Infinity) : ols.slope / se, tc = tCritical(0.95, df);
    ols.se = se; ols.t = t; ols.df = df; ols.p = ols.r2 === 0 && ols.slope === 0 ? 1 : tPValue(t, df);
    ols.tCrit = tc; ols.ciLow = ols.slope - tc * se; ols.ciHigh = ols.slope + tc * se;
    ols.bandScale = Math.sqrt(f);      // widens the confidence band on the chart to match
    return { r1: r1, f: f, nEff: nEff };
  }

  /**
   * Run every test on one series and decide a verdict.
   * Verdict uses the Mann-Kendall p-value: < 0.05 significant, < 0.10 borderline.
   * opts.ar1: correct for autocorrelation (used for monthly data, where
   * neighbouring months are alike and the plain tests would be overconfident).
   */
  function analyze(x, y, opts) {
    var ols = linearRegression(x, y);
    var mk = mannKendall(y);
    var sen = senSlope(x, y);
    var adj = opts && opts.ar1 ? adjustAR1(ols, mk) : null;
    var verdict = mk.p < 0.05 ? 'significant' : (mk.p < 0.10 ? 'borderline' : 'none');
    var direction = sen.slope > 0 ? 'up' : (sen.slope < 0 ? 'down' : 'flat');
    return { ols: ols, mk: mk, sen: sen, verdict: verdict, direction: direction, adj: adj };
  }

  var api = {
    lgamma: lgamma, ibeta: ibeta, tPValue: tPValue, tCritical: tCritical,
    normPValue: normPValue, mean: mean, median: median,
    linearRegression: linearRegression, mannKendall: mannKendall,
    senSlope: senSlope, analyze: analyze, ar1Factor: ar1Factor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TDStats = api;
})(typeof window !== 'undefined' ? window : this);
