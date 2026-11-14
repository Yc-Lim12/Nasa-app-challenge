/*
 * Our trend statistics (Sunway to the Moon, NASA Space Apps 2026).
 * Works in the browser (window.TDStats) and in Node (module.exports).
 *
 * Checked against the Python answer key (answer_key.py) by running:  python compare.py
 */
(function (root) {
  'use strict';

  // ---- p-value helpers (copied from the example; tested against scipy) ----
  // You do not need to change anything in this section.

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

  /** Round to the nearest whole number, halves to the even one (like numpy). */
  function roundHalfEven(v) {
    var r = Math.round(v);
    if (Math.abs(v % 1) === 0.5 && r % 2 !== 0) r -= 1;
    return r;
  }

  // ---- our functions -----------------------------------------------------

  var FILL = -990;  // NASA uses -999 for "no data"

  /**
   * Drop missing values.
   * Returns { years: [...], values: [...] } with only the good pairs.
   */
  function clean(years, values) {
    var outYears = [], outValues = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      // Check null first: JavaScript treats null as 0, so null > FILL is true.
      if (v === null || v === undefined || !isFinite(v) || v <= FILL) continue;
      outYears.push(years[i]);
      outValues.push(v);
    }
    return { years: outYears, values: outValues };
  }

  /**
   * Mann-Kendall test: is there a steady rise or fall?
   * Compares every year with every later year. Returns { n, S, varS, z, p, tau }.
   * If nEff (effective number of years, from linearRegression) is given, also
   * returns the memory-adjusted { varSAdj, zAdj, pAdj }: the variance of S is
   * multiplied by n / nEff, the same effective-sample-size idea as for the line.
   */
  function mannKendall(y, nEff) {
    // Round to 10 significant digits so that values which differ only by
    // computer rounding (e.g. 0.1 + 0.2 vs 0.3) count as ties, not as a rise.
    y = y.map(function (v) { return Number(v.toPrecision(10)); });
    var n = y.length, S = 0, i, j;
    // +1 for each pair that goes up, -1 for each pair that goes down
    for (i = 0; i < n - 1; i++) {
      for (j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
    }
    // Tie correction: groups of equal values make S less variable
    var counts = {};
    for (i = 0; i < n; i++) counts[y[i]] = (counts[y[i]] || 0) + 1;
    var ties = 0;
    for (var k in counts) {
      var c = counts[k];
      ties += c * (c - 1) * (2 * c + 5);
    }
    var varS = (n * (n - 1) * (2 * n + 5) - ties) / 18;
    // z score with the continuity correction (move S one step towards 0)
    var z = 0;
    if (S > 0) z = (S - 1) / Math.sqrt(varS);
    else if (S < 0) z = (S + 1) / Math.sqrt(varS);
    var out = { n: n, S: S, varS: varS, z: z, p: normPValue(z), tau: S / (n * (n - 1) / 2) };
    if (nEff !== undefined) {
      out.varSAdj = varS * n / nEff;
      out.zAdj = 0;
      if (S > 0) out.zAdj = (S - 1) / Math.sqrt(out.varSAdj);
      else if (S < 0) out.zAdj = (S + 1) / Math.sqrt(out.varSAdj);
      out.pAdj = normPValue(out.zAdj);
    }
    return out;
  }

  /**
   * Sen's slope: how fast is it changing?
   * The median of the slopes between every pair of points, so one odd year
   * cannot drag it. Returns { slope, intercept }.
   * If varS (the Mann-Kendall variance) is given, also returns a 95% range
   * { ciLow, ciHigh }, picked from the sorted slopes (Sen 1968, as in scipy).
   */
  function senSlope(x, y, varS) {
    var slopes = [];
    for (var i = 0; i < x.length - 1; i++) {
      for (var j = i + 1; j < x.length; j++) {
        if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]));
      }
    }
    var slope = median(slopes);
    // Same intercept formula as scipy.stats.theilslopes
    var out = { slope: slope, intercept: median(y) - slope * median(x) };
    if (varS !== undefined) {
      var sorted = slopes.slice().sort(function (p, q) { return p - q; });
      var N = sorted.length;
      var half = 1.959963984540054 * Math.sqrt(varS);   // 95%: z = 1.96
      out.ciLow = sorted[Math.max(roundHalfEven((N - half) / 2) - 1, 0)];
      out.ciHigh = sorted[Math.min(roundHalfEven((N + half) / 2), N - 1)];
    }
    return out;
  }

  /**
   * Straight-line fit (least squares) with a t-test, plus a version of the
   * test adjusted for year-to-year memory (lag-1 autocorrelation).
   * The 95% range (ciLow, ciHigh) and tCrit use the memory-adjusted numbers,
   * so the range excludes zero exactly when pAdj < 0.05.
   * lag1 is the measured memory; lag1Adj is the value actually used (see below).
   */
  function linearRegression(x, y) {
    var n = x.length, mx = mean(x), my = mean(y), sxx = 0, sxy = 0, syy = 0, i;
    for (i = 0; i < n; i++) {
      sxx += (x[i] - mx) * (x[i] - mx);
      sxy += (x[i] - mx) * (y[i] - my);
      syy += (y[i] - my) * (y[i] - my);
    }
    var slope = sxy / sxx;
    var intercept = my - slope * mx;

    // Residuals: how far each year is from the line
    var resid = [], sse = 0;
    for (i = 0; i < n; i++) {
      var e = y[i] - (intercept + slope * x[i]);
      resid.push(e);
      sse += e * e;
    }
    var df = n - 2;
    var residualSE = Math.sqrt(sse / df);     // typical distance from the line
    var se = residualSE / Math.sqrt(sxx);     // standard error of the slope
    // A perfectly straight series (e.g. snow depth that is 0 every year) has se = 0:
    // then t is 0 for a flat line (p = 1) and infinite for a sloped one (p = 0), not 0/0.
    var t = se === 0 ? (slope === 0 ? 0 : Infinity) : slope / se;
    var p = se === 0 && slope === 0 ? 1 : tPValue(t, df);
    var r2 = syy === 0 ? 0 : 1 - sse / syy;   // share of the variation the line explains

    // Memory: correlation between each residual and the next one
    var a = resid.slice(0, -1), b = resid.slice(1);
    var ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0;
    for (i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) * (a[i] - ma);
      sbb += (b[i] - mb) * (b[i] - mb);
    }
    var lag1 = saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;

    // With few years the measured lag1 comes out too low on average, so add
    // the usual small-sample bias correction (1 + 4 * lag1) / n. Negative
    // memory counts as none, and 0.95 caps it so nEff stays above zero.
    var r = Math.min(Math.max(lag1 + (1 + 4 * lag1) / n, 0), 0.95);
    // Effective sample size: memory means fewer truly independent years
    var nEff = n * (1 - r) / (1 + r);
    var dfAdj = Math.max(nEff - 2, 1);
    var seAdj = se * Math.sqrt(df / dfAdj);
    var pAdj = se === 0 ? p : tPValue(slope / seAdj, dfAdj);

    // 95% range of the slope, from the memory-adjusted uncertainty.
    // tCrit is scaled so that tCrit * se = (critical t) * seAdj.
    // seAdj / se is just sqrt(df / dfAdj); written that way it stays finite when se = 0
    var tCrit = tCritical(0.95, dfAdj) * Math.sqrt(df / dfAdj);

    // Added for the chart's diagnostics (does not change any result above):
    // the plain critical t for n - 2, used for the prediction interval of single years,
    // and the Durbin-Watson statistic of the residuals.
    var dsq = 0;
    for (i = 1; i < n; i++) dsq += (resid[i] - resid[i - 1]) * (resid[i] - resid[i - 1]);
    return {
      n: n, slope: slope, intercept: intercept, se: se, t: t, df: df, p: p, r2: r2,
      residualSE: residualSE, meanX: mx, sxx: sxx,
      resid: resid, dw: sse === 0 ? null : dsq / sse, tCritPlain: tCritical(0.95, df),
      lag1: lag1, lag1Adj: r, nEff: nEff, dfAdj: dfAdj, seAdj: seAdj, pAdj: pAdj,
      tCrit: tCrit, ciLow: slope - tCrit * se, ciHigh: slope + tCrit * se
    };
  }

  /**
   * Benjamini-Hochberg false discovery rate, for maps with many cells.
   * Returns an array of true (still significant) / false, in the input order.
   * Cells without a p-value (no data) are false and are not counted.
   */
  function fdr(pvals, q) {
    if (q === undefined) q = 0.05;
    // Positions of the cells that have a real p-value
    var order = [];
    for (var i = 0; i < pvals.length; i++) {
      if (typeof pvals[i] === 'number' && isFinite(pvals[i])) order.push(i);
    }
    var n = order.length;
    // Sorted from smallest p to largest
    order.sort(function (a, b) { return pvals[a] - pvals[b]; });
    // Largest rank whose p-value is under its threshold q * rank / n
    var k = -1;
    for (var rank = 0; rank < n; rank++) {
      if (pvals[order[rank]] <= q * (rank + 1) / n) k = rank;
    }
    var sig = pvals.map(function () { return false; });
    for (rank = 0; rank <= k; rank++) sig[order[rank]] = true;
    return sig;
  }

  // ---- extra diagnostics for the chart (added by step 4; they do not change the verdict) ----

  var Z975 = 1.959963984540054;   // standard normal quantile for a two-sided 95% interval

  /** Ranks 1..n, tied values sharing their average rank. */
  function ranks(a) {
    var idx = [], i;
    for (i = 0; i < a.length; i++) idx.push(i);
    idx.sort(function (p, q) { return a[p] - a[q]; });
    var r = new Array(a.length);
    i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
      for (var k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }

  /**
   * Mann-Kendall with the Hamed and Rao (1998) variance correction for autocorrelation,
   * shown as a second opinion next to the memory-adjusted p used for the verdict.
   * The series is detrended with Sen's slope and ranked; every lag whose autocorrelation of
   * the ranks is outside ±1.96/√n inflates Var(S). Matches pymannkendall's
   * hamed_rao_modification_test. p is null if the correction makes the variance non-positive.
   */
  function hamedRao(x, y, mk, slope) {
    var n = y.length, k;
    // years counted from the first one (1, 2, 3 …): the same detrending, without rounding
    // that can swap two nearly equal values when ranked
    var r = ranks(y.map(function (v, idx) { return v - slope * (x[idx] - x[0] + 1); }));
    var m = mean(r), d = r.map(function (v) { return v - m; });
    var acov = function (lag) { var s = 0; for (var t = 0; t + lag < n; t++) s += d[t] * d[t + lag]; return s / n; };
    var c0 = acov(0), bound = Z975 / Math.sqrt(n), sum = 0, lags = [];
    for (k = 1; k < n; k++) {
      var rk = acov(k) / c0;
      if (rk > bound || rk < -bound) { sum += (n - k) * (n - k - 1) * (n - k - 2) * rk; lags.push(k); }
    }
    var factor = 1 + 2 / (n * (n - 1) * (n - 2)) * sum;
    var varS = mk.varS * factor;
    if (!(varS > 0)) return { factor: factor, varS: varS, z: null, p: null, lags: lags };
    var z = mk.S > 0 ? (mk.S - 1) / Math.sqrt(varS) : (mk.S < 0 ? (mk.S + 1) / Math.sqrt(varS) : 0);
    return { factor: factor, varS: varS, z: z, p: normPValue(z), lags: lags };
  }

  /**
   * Pettitt (1979) change-point test: is there one point where the values shift up or down?
   * With ranks r, U_t = 2(r_1 + … + r_t) − t(n + 1) for t = 1 … n−1, and K = max |U_t|.
   * The shift comes after the first `at` values. p ≈ 2 exp(−6K² / (n³ + n²)), capped at 1.
   * A steady trend also gives a large K, so read it alongside the trend tests.
   */
  function pettitt(y) {
    var n = y.length, r = ranks(y), sum = 0, K = 0, at = 0;
    for (var t = 1; t < n; t++) {
      sum += r[t - 1];
      var U = Math.abs(2 * sum - t * (n + 1));
      if (U > K) { K = U; at = t; }
    }
    var p = Math.min(1, 2 * Math.exp(-6 * K * K / (n * n * n + n * n)));
    return { K: K, at: at, p: p,
      meanBefore: at ? mean(y.slice(0, at)) : null, meanAfter: at ? mean(y.slice(at)) : null };
  }

  /**
   * Everything for one place and one variable.
   * verdict: 'significant' (p < 0.05), 'borderline' (p < 0.10), 'none',
   * or 'insufficient' (fewer than 10 years). The app turns these codes into words.
   * p is the memory-adjusted Mann-Kendall p-value. It belongs to the same family
   * as Sen's slope (the rate shown), resists freak years, and in our tests kept
   * false alarms lowest; see maths/accuracy_test.py.
   */
  function analyze(years, values) {
    var c = clean(years, values);
    var n = c.values.length;
    if (n < 10) return { n: n, verdict: 'insufficient' };
    var ols = linearRegression(c.years, c.values);
    var mk = mannKendall(c.values, ols.nEff);
    var sen = senSlope(c.years, c.values, mk.varSAdj);
    var p = mk.pAdj;
    var verdict = p < 0.05 ? 'significant' : (p < 0.10 ? 'borderline' : 'none');
    return {
      n: n, slopePerDecade: sen.slope * 10, p: p, verdict: verdict,
      direction: sen.slope > 0 ? 'up' : (sen.slope < 0 ? 'down' : 'flat'),
      years: c.years, values: c.values, mk: mk, sen: sen, ols: ols,
      // extra diagnostics for the chart; they do not change the verdict
      hr: hamedRao(c.years, c.values, mk, sen.slope), cp: pettitt(c.values)
    };
  }

  var api = {
    tPValue: tPValue, tCritical: tCritical, normPValue: normPValue, mean: mean, median: median,
    clean: clean, mannKendall: mannKendall, senSlope: senSlope,
    linearRegression: linearRegression, fdr: fdr, analyze: analyze,
    ranks: ranks, hamedRao: hamedRao, pettitt: pettitt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TDStats = api;
})(typeof window !== 'undefined' ? window : this);
