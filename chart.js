/*
 * Trend Detective: drawing the results.
 * The main time-series chart, the months panel, the two-variable chart and
 * "Save chart as image". app.js owns the data and state and hands this file the
 * helpers it needs through TDChart.init(); nothing here fetches data.
 */
(function () {
  'use strict';

  var A;   // the app's helpers and state, from TDChart.init()
  var S, T, esc, clamp, fmtValue, fmtAnom, pEquals, ratePhrase, verdictLabel, runningMean, yearlySeries,
    chooseMonth, setPeriod, toast, view, MONTHS, MONTH_SHORT, MIN_YEARS, REDUCED, whenLabel;
  function $(id) { return document.getElementById(id); }

  // ---- chart helpers -------------------------------------------------------

  function niceTicks(lo, hi, count) {
    var span = hi - lo || 1;
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var ticks = [];
    for (var t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
      ticks.push(Number(t.toPrecision(12)));
    }
    return { ticks: ticks, step: step };
  }

  function svgEl(name, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Push labels apart vertically so they never overlap. */
  function spread(items, gap, lo, hi) {
    items.sort(function (a, b) { return a.y - b.y; });
    for (var pass = 0; pass < 30; pass++) {
      var moved = false;
      for (var i = 1; i < items.length; i++) {
        var d = items[i].y - items[i - 1].y;
        if (d < gap) { var s = (gap - d) / 2; items[i - 1].y -= s; items[i].y += s; moved = true; }
      }
      if (items.length) {
        if (items[0].y < lo) { var up = lo - items[0].y; items.forEach(function (it) { it.y += up; }); }
        var last = items[items.length - 1];
        if (last.y > hi) { var dn = last.y - hi; items.forEach(function (it) { it.y -= dn; }); }
      }
      if (!moved) break;
    }
  }

  /** A floating tooltip inside a chart host. */
  function makeTip(host) {
    var tip = document.createElement('div');
    tip.className = 'tip'; tip.hidden = true;
    host.appendChild(tip);
    return {
      show: function (html, x, y, svg, W) {
        var rect = svg.getBoundingClientRect(), scale = rect.width / W;
        tip.innerHTML = html; tip.hidden = false;
        var left = x * scale + 12;
        if (left + tip.offsetWidth > rect.width) left = x * scale - tip.offsetWidth - 12;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, y * scale - tip.offsetHeight - 10) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  function stripeColours(vr) {
    // dry/wet colours for water and soil, but any temperature (e.g. sea surface temperature,
    // filed under Water) keeps the usual cold/warm blue and red
    var wet = (vr.topic === 'water' || vr.topic === 'soil') && vr.unit !== '°C';
    return wet ? { lo: 'var(--div-dry)', hi: 'var(--div-wet)', loName: 'brown', hiName: 'teal' }
      : { lo: 'var(--div-lo)', hi: 'var(--div-hi)', loName: 'blue', hiName: 'red' };
  }

  // ---- reference period ------------------------------------------------------
  // "Difference from average" and the stripes use the WMO climate normal 1991–2020,
  // so they do not shift when a different period is chosen.
  var NORMAL_FROM = 1991, NORMAL_TO = 2020, NORMAL_MIN = 24;   // WMO: at least 80% of the 30 years

  /**
   * The value differences are measured from: the 1991–2020 mean of the same place and part
   * of the year, or, when fewer than 24 of those years have data, the mean of the years shown.
   */
  function baselineOf(d, month, monthly) {
    // Month-by-month values are already differences from each calendar month's average over
    // the chosen years (see monthlyAnomalies in app.js), so their reference is zero.
    if (monthly) {
      return { value: 0, label: T('average of each calendar month, {a}–{b}', { a: Math.floor(d.years[0]), b: Math.floor(d.years[d.years.length - 1]) }),
        normal: false, monthly: true, n: d.years.length };
    }
    if (d.table) {
      var ser = yearlySeries(d.table, NORMAL_FROM, NORMAL_TO, month || 0);
      if (ser.years.length >= NORMAL_MIN) {
        return { value: S.mean(ser.values), label: T('{a}–{b} average', { a: NORMAL_FROM, b: NORMAL_TO }), normal: true, n: ser.years.length };
      }
    }
    return { value: S.mean(d.values), label: T('average of {a}–{b}', { a: d.years[0], b: d.years[d.years.length - 1] }), normal: false, n: d.years.length };
  }

  // ---- main chart ----------------------------------------------------------

  function drawChart(res, animate) {
    var host = $('chart');
    host.innerHTML = '';
    host.classList.toggle('anim', !!animate && !REDUCED);
    var vr = res.variable, yrs = res.years, ols = res.stats.ols;
    var ref = baselineOf(res, res.month, res.step === 'month');
    var base = view.anom ? ref.value : 0;
    var vals = res.values.map(function (v) { return v - base; });
    var cmp = A.compareData && A.compareData.v === vr.id ? A.compareData : null;
    var cbase = cmp && view.anom ? baselineOf(cmp, res.month, res.step === 'month').value : 0;
    var cvals = cmp ? cmp.values.map(function (v) { return v - cbase; }) : [];
    var cols = cmp ? cmp.stats.ols : null;
    var monthly = res.step === 'month', dx = monthly ? 1 / 12 : 1;   // spacing of the points, in years
    var smooth = view.smooth ? runningMean(yrs, vals, monthly ? 61 : 5, dx) : null;   // five years either way

    var W = Math.max(300, host.clientWidth), narrow = W < 560, H = (narrow ? 300 : 380) + 14;
    var STRIPE = 14;
    var m = { l: 68, r: narrow ? 16 : 118, t: 14, b: 34 + STRIPE + 8 + 14 };   // +14 for the "Year" axis title
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var sen = res.stats.sen;

    function trendAt(x) { return ols.intercept + ols.slope * x - base; }
    function senAt(x) { return sen.intercept + sen.slope * x - base; }
    function ctrendAt(x) { return cols.intercept + cols.slope * x - cbase; }
    // Half-width of the 95% confidence band: where the true trend line probably is.
    //   t * s * sqrt(1/n + (x - mean x)^2 / Sxx). stats.js scales tCrit so the band is
    // already adjusted for year-to-year memory (lag-1 autocorrelation).
    function half(x) {
      return ols.tCrit * ols.residualSE * Math.sqrt(1 / ols.n + Math.pow(x - ols.meanX, 2) / ols.sxx);
    }
    // Half-width of the 95% prediction band: where a single future year would probably land.
    // Same formula with an extra 1 under the root for the year-to-year scatter.
    // It uses the plain critical t (n − 2): the memory adjustment is about the slope, not about
    // how far a single value scatters from the line.
    function predHalf(x) {
      return ols.tCritPlain * ols.residualSE * Math.sqrt(1 + 1 / ols.n + Math.pow(x - ols.meanX, 2) / ols.sxx);
    }
    var a0 = yrs[0], a1 = yrs[yrs.length - 1];
    var FUT = view.future ? 10 : 0, f1 = a1 + FUT;
    var x0 = a0, x1 = f1;
    if (cmp) { x0 = Math.min(x0, cmp.years[0]); x1 = Math.max(x1, cmp.years[cmp.years.length - 1]); }

    var all = vals.concat(cvals);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    // keep the whole prediction interval on the chart (it is wider than the confidence band)
    [a0, a1].forEach(function (x) {
      lo = Math.min(lo, trendAt(x) - predHalf(x)); hi = Math.max(hi, trendAt(x) + predHalf(x));
    });
    if (FUT) { lo = Math.min(lo, trendAt(f1) - predHalf(f1)); hi = Math.max(hi, trendAt(f1) + predHalf(f1)); }
    if (cmp) [cmp.years[0], cmp.years[cmp.years.length - 1]].forEach(function (x) {
      lo = Math.min(lo, ctrendAt(x)); hi = Math.max(hi, ctrendAt(x));
    });
    var pad = (hi - lo || 1) * 0.08;
    lo -= pad; hi += pad;
    var yt = niceTicks(lo, hi, 5);
    function sx(x) { return m.l + (x1 === x0 ? iw / 2 : (x - x0) / (x1 - x0) * iw); }
    function sy(y) { return m.t + (hi - y) / (hi - lo) * ih; }
    var tickDp = Math.max(0, -Math.floor(Math.log10(yt.step) + 1e-9));

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: 0,
      'aria-label': vr.name + ' by year with its linear trend line. Use the left and right arrow keys to step through the years, or the table below the chart for exact values.' });

    yt.ticks.forEach(function (t) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), class: 'grid' }));
      var lab = view.anom && t > 0 ? '+' + t.toFixed(tickDp) : (t < 0 ? '−' + Math.abs(t).toFixed(tickDp) : t.toFixed(tickDp));
      svg.appendChild(svgEl('text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' }, lab));
    });
    if (view.anom && lo < 0 && hi > 0) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(0), y2: sy(0), class: 'zero' }));
    }
    var span = x1 - x0, every = span > 30 ? 10 : (span > 12 ? 5 : (span > 6 ? 2 : 1));
    for (var y = Math.ceil(x0 / every) * every; y <= x1; y += every) {
      svg.appendChild(svgEl('text', { x: sx(y), y: H - 24, 'text-anchor': 'middle', class: 'tick' }, y));
    }

    // axis titles, with units
    svg.appendChild(svgEl('text', { x: m.l + iw / 2, y: H - 5, 'text-anchor': 'middle', class: 'axis-title' }, T('Year')));
    var yTitle = (view.anom ? T('Difference from the {ref}', { ref: ref.label }) : T(vr.name)) + (vr.unit ? ' (' + vr.unit + ')' : '');
    svg.appendChild(svgEl('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'axis-title',
      transform: 'translate(13 ' + (m.t + ih / 2) + ') rotate(-90)' }, yTitle));

    // climate stripes: one per year, coloured by difference from the reference average
    var mean = ref.value, maxAbs = 0;
    res.values.forEach(function (v) { maxAbs = Math.max(maxAbs, Math.abs(v - mean)); });
    var sc = stripeColours(vr), yw = x1 === x0 ? iw : iw * dx / (x1 - x0);
    var sTop = m.t + ih + 6;
    yrs.forEach(function (yy, k) {
      var d = res.values[k] - mean, pct = maxAbs ? Math.round(Math.abs(d) / maxAbs * 100) : 0;
      var xa = Math.max(m.l, sx(yy) - yw / 2), xb = Math.min(m.l + iw, sx(yy) + yw / 2);
      var r = svgEl('rect', { x: xa.toFixed(2), y: sTop, width: Math.max(0.5, xb - xa + 0.4).toFixed(2), height: STRIPE, class: 'stripe',
        style: 'fill: color-mix(in oklab, ' + (d >= 0 ? sc.hi : sc.lo) + ' ' + pct + '%, var(--div-mid)); --i:' + k });
      svg.appendChild(r);
    });

    // 95% confidence band of the trend line
    var up = [], dn = [];
    for (var i = 0; i <= 40; i++) {
      var x = a0 + (a1 - a0) * i / 40;
      up.push(sx(x).toFixed(1) + ',' + sy(trendAt(x) + half(x)).toFixed(1));
      dn.unshift(sx(x).toFixed(1) + ',' + sy(trendAt(x) - half(x)).toFixed(1));
    }
    svg.appendChild(svgEl('polygon', { points: up.concat(dn).join(' '), class: 'band' }));

    // 95% prediction interval over the observed years: where single years are expected to fall.
    // About 1 year in 20 should land outside it if the linear model fits.
    var pu = '', pd = '';
    for (var pi = 0; pi <= 40; pi++) {
      var px = a0 + (a1 - a0) * pi / 40;
      pu += (pi ? 'L' : 'M') + sx(px).toFixed(1) + ' ' + sy(trendAt(px) + predHalf(px)).toFixed(1);
      pd += (pi ? 'L' : 'M') + sx(px).toFixed(1) + ' ' + sy(trendAt(px) - predHalf(px)).toFixed(1);
    }
    svg.appendChild(svgEl('path', { d: pu + pd, class: 'pi' }));

    // Lift the pen at missing values and at skipped years, so a gap shows as a gap.
    function pathOf(xs, ys) {
      var d = '', pen = false;
      for (var k = 0; k < xs.length; k++) {
        if (ys[k] === null) { pen = false; continue; }
        if (k > 0 && xs[k] - xs[k - 1] > dx * 1.5) pen = false;
        d += (pen ? 'L' : 'M') + sx(xs[k]).toFixed(1) + ' ' + sy(ys[k]).toFixed(1);
        pen = true;
      }
      return d;
    }

    if (cmp) {
      svg.appendChild(svgEl('path', { d: pathOf(cmp.years, cvals), class: 'cmp' }));
      svg.appendChild(svgEl('line', { x1: sx(cmp.years[0]), y1: sy(ctrendAt(cmp.years[0])),
        x2: sx(cmp.years[cmp.years.length - 1]), y2: sy(ctrendAt(cmp.years[cmp.years.length - 1])), class: 'cmp-trend' }));
    }
    var series = svgEl('path', { d: pathOf(yrs, vals), class: 'series' + (smooth ? ' faint' : '') });
    svg.appendChild(series);
    if (!smooth && yrs.length <= 60) {
      yrs.forEach(function (yy, k) { svg.appendChild(svgEl('circle', { cx: sx(yy), cy: sy(vals[k]), r: 2.4, class: 'pt' })); });
    }
    var smoothPath = null;
    if (smooth) { smoothPath = svgEl('path', { d: pathOf(yrs, smooth), class: 'smooth' }); svg.appendChild(smoothPath); }
    svg.appendChild(svgEl('line', { x1: sx(a0), y1: sy(senAt(a0)), x2: sx(a1), y2: sy(senAt(a1)), class: 'sen' }));
    svg.appendChild(svgEl('line', { x1: sx(a0), y1: sy(trendAt(a0)), x2: sx(a1), y2: sy(trendAt(a1)), class: 'trend' }));

    // "If the trend continues": the same straight line carried 10 years past the data.
    // The band here is the prediction band, because a future year scatters like past years did.
    if (FUT) {
      var fu = [], fd = [];
      for (var fi = 0; fi <= 20; fi++) {
        var fx = a1 + FUT * fi / 20;
        fu.push(sx(fx).toFixed(1) + ',' + sy(trendAt(fx) + predHalf(fx)).toFixed(1));
        fd.unshift(sx(fx).toFixed(1) + ',' + sy(trendAt(fx) - predHalf(fx)).toFixed(1));
      }
      svg.appendChild(svgEl('polygon', { points: fu.concat(fd).join(' '), class: 'band future-band' }));
      svg.appendChild(svgEl('line', { x1: sx(a1), y1: sy(trendAt(a1)), x2: sx(f1), y2: sy(trendAt(f1)), class: 'future' }));
      svg.appendChild(svgEl('line', { x1: sx(a1), x2: sx(a1), y1: m.t, y2: m.t + ih, class: 'nowline' }));
      // No text label inside the chart: it covered data points on small screens.
      // The legend says "If the trend continues" and wide screens also get "Trend, extended" in the margin.
    }

    // Pettitt change point, drawn only when significant: where the shift is, and the mean
    // before and after it.
    var cp = res.stats.cp, showCp = cp && cp.at > 0 && cp.p < 0.05;
    if (showCp) {
      var xc = (sx(yrs[cp.at - 1]) + sx(yrs[cp.at])) / 2, right = xc > m.l + iw * 0.6;
      svg.appendChild(svgEl('line', { x1: xc, x2: xc, y1: m.t, y2: m.t + ih, class: 'cp-line' }));
      svg.appendChild(svgEl('line', { x1: sx(a0), x2: xc, y1: sy(cp.meanBefore - base), y2: sy(cp.meanBefore - base), class: 'cp-mean' }));
      svg.appendChild(svgEl('line', { x1: xc, x2: sx(a1), y1: sy(cp.meanAfter - base), y2: sy(cp.meanAfter - base), class: 'cp-mean' }));
      svg.appendChild(svgEl('text', { x: right ? xc - 5 : xc + 5, y: m.t + 11, 'text-anchor': right ? 'end' : 'start', class: 'cp-label' },
        T('Shift after {y} (Pettitt {p})', { y: whenLabel(yrs[cp.at - 1]), p: pEquals(cp.p) })));
    }

    // one-off spikes, ringed and labelled
    (res.spikes || []).forEach(function (sp) {
      var cx = sx(sp.year), cy = sy(vals[sp.i]);
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 8, class: 'spike' }));
      svg.appendChild(svgEl('text', { x: cx, y: cy + (sp.z > 0 ? -14 : 22), 'text-anchor': 'middle', class: 'spike-label' }, sp.year));
    });

    if (!narrow) {
      var labels = [
        { y: sy(vals[vals.length - 1]), t: cmp ? res.short : T(monthly ? 'Monthly value' : 'Yearly value'), c: 'endlabel' },
        { y: sy(trendAt(f1)), t: T(FUT ? 'Trend, extended' : 'Trend line'), c: 'endlabel' }
      ];
      if (smooth) {
        for (var s = smooth.length - 1; s >= 0; s--) if (smooth[s] !== null) { labels.push({ y: sy(smooth[s]), t: T('5-year average'), c: 'endlabel' }); break; }
      }
      if (cmp) labels.push({ y: sy(cvals[cvals.length - 1]), t: cmp.short, c: 'endlabel l-cmp' });
      spread(labels, 15, m.t + 4, m.t + ih);
      labels.forEach(function (lb) {
        var t = lb.t.length > 16 ? lb.t.slice(0, 15) + '…' : lb.t;
        svg.appendChild(svgEl('text', { x: m.l + iw + 10, y: lb.y + 4, class: lb.c }, t));
      });
    }

    var sel = svgEl('rect', { y: m.t, height: ih, class: 'brush', visibility: 'hidden' });
    var cross = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'cross', visibility: 'hidden' });
    var dot = svgEl('circle', { r: 5, class: 'dot', visibility: 'hidden' });
    var cdot = svgEl('circle', { r: 5, class: 'dot-cmp', visibility: 'hidden' });
    svg.appendChild(sel); svg.appendChild(cross); svg.appendChild(cdot); svg.appendChild(dot);
    var hit = svgEl('rect', { x: m.l, y: m.t, width: iw, height: ih + STRIPE + 6, fill: 'transparent', class: 'hit' });
    svg.appendChild(hit);
    host.appendChild(svg);
    var tip = makeTip(host);

    // draw-in animation for the yearly line
    if (animate && !REDUCED) {
      [series, smoothPath].forEach(function (p) {
        if (!p) return;
        var len = p.getTotalLength();
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
        p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)';
        p.style.strokeDashoffset = '0';
        p.addEventListener('transitionend', function () { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.transition = ''; }, { once: true });
      });
    }

    function pxOf(evt) { var r = svg.getBoundingClientRect(); return (evt.clientX - r.left) * (W / r.width); }
    function nearest(px) {
      var best = 0;
      for (var k = 1; k < yrs.length; k++) if (Math.abs(sx(yrs[k]) - px) < Math.abs(sx(yrs[best]) - px)) best = k;
      return best;
    }
    // Only years that have data can be selected. The axis can run past them
    // ("If the trend continues", or a longer comparison series).
    function yearAt(px) { return clamp(Math.round(x0 + (px - m.l) / iw * (x1 - x0)), a0, a1); }

    var kb = yrs.length - 1;
    function showIdx(k) {
      kb = k;
      var yy = yrs[k], cx = sx(yy), cy = sy(vals[k]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      var html = '<strong>' + esc(whenLabel(yy)) + '</strong><span><i class="key key-series"></i>' +
        (cmp ? esc(res.short) + ': ' : '') +
        esc(view.anom ? T('{v} vs the {ref}', { v: fmtAnom(vals[k], vr), ref: ref.label }) : fmtValue(vals[k], vr)) +
        (view.anom ? ' <em>(' + esc(fmtValue(res.values[k], vr)) + ')</em>' : '') + '</span>';
      var show = function (v) { return view.anom ? fmtAnom(v, vr) : fmtValue(v, vr); };
      html += '<span><i class="key key-trend"></i>' + esc(T('{v} on the trend line', { v: show(trendAt(yy)) })) + '</span>';
      html += '<span><i class="key key-band"></i>' + esc(T('95% band: {a} to {b}', { a: show(trendAt(yy) - half(yy)), b: show(trendAt(yy) + half(yy)) })) + '</span>';
      html += '<span><i class="key key-sen"></i>' + esc(T('{v} on the Sen line', { v: show(senAt(yy)) })) + '</span>';
      html += '<span>' + esc(T('Residual: {v}', { v: fmtAnom(ols.resid[k], vr) })) + '</span>';
      if (smooth && smooth[k] !== null) html += '<span><i class="key key-smooth"></i>' + esc(T('{v} 5-year average', { v: show(smooth[k]) })) + '</span>';
      var ci = cmp ? cmp.years.indexOf(yy) : -1;
      if (ci >= 0) {
        cdot.setAttribute('cx', cx); cdot.setAttribute('cy', sy(cvals[ci])); cdot.setAttribute('visibility', 'visible');
        html += '<span><i class="key key-cmp"></i>' + esc(cmp.short) + ': ' + esc(view.anom ? fmtAnom(cvals[ci], vr) : fmtValue(cvals[ci], vr)) + '</span>';
      } else cdot.setAttribute('visibility', 'hidden');
      tip.show(html, cx, Math.min(cy, ci >= 0 ? sy(cvals[ci]) : cy), svg, W);
    }
    function hide() {
      cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden');
      cdot.setAttribute('visibility', 'hidden'); tip.hide();
    }

    // Hover shows a year. Dragging selects a period and re-runs the test on it.
    var drag = null;
    hit.addEventListener('pointerdown', function (e) {
      drag = { x: pxOf(e), moved: false };
      try { hit.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      showIdx(nearest(drag.x));
    });
    hit.addEventListener('pointermove', function (e) {
      var px = pxOf(e);
      if (drag) {
        if (Math.abs(px - drag.x) > 8) drag.moved = true;
        if (drag.moved) {
          var a = clamp(Math.min(drag.x, px), sx(a0), sx(a1)), b = clamp(Math.max(drag.x, px), sx(a0), sx(a1));
          sel.setAttribute('x', a); sel.setAttribute('width', b - a); sel.setAttribute('visibility', 'visible');
          var ya = yearAt(a), yb = yearAt(b), n = yb - ya + 1;
          cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); cdot.setAttribute('visibility', 'hidden');
          tip.show('<strong>' + ya + '–' + yb + '</strong><span>' + esc(T('{n} years.', { n: n }) + ' ' +
            (n >= MIN_YEARS ? T('Let go to test this period.') : T('Pick at least {n} years.', { n: MIN_YEARS }))) + '</span>', (a + b) / 2, m.t + 30, svg, W);
          return;
        }
      }
      showIdx(nearest(px));
    });
    function endDrag(e, cancelled) {
      if (!drag) return;
      var d = drag; drag = null;
      sel.setAttribute('visibility', 'hidden');
      if (!d.moved || cancelled) return;
      var px = pxOf(e);
      var ya = yearAt(Math.min(d.x, px)), yb = yearAt(Math.max(d.x, px));
      hide();
      if (yb - ya + 1 >= MIN_YEARS) setPeriod(ya, yb);
      else toast(T('Pick at least {n} years to test a trend.', { n: MIN_YEARS }));
    }
    hit.addEventListener('pointerup', function (e) { endDrag(e, false); });
    hit.addEventListener('pointercancel', function (e) { endDrag(e, true); hide(); });
    hit.addEventListener('pointerleave', function () { if (!drag) hide(); });

    svg.addEventListener('focus', function () { showIdx(kb); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', function (e) {
      var k = kb;
      if (e.key === 'ArrowLeft') k = Math.max(0, kb - 1);
      else if (e.key === 'ArrowRight') k = Math.min(yrs.length - 1, kb + 1);
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = yrs.length - 1;
      else return;
      e.preventDefault(); showIdx(k);
    });

    // legend and hint
    // one legend entry: coloured key, name, and an explanation shown on hover
    function key(cls, name, help) {
      return '<span' + (help ? ' title="' + esc(T(help)) + '"' : '') + '><i class="key ' + cls + '"></i>' + esc(name) + '</span>';
    }
    var lg = key('key-series', cmp ? res.short : T(monthly ? 'Each month minus its normal' : 'Yearly value')) +
      key('key-trend', T('Trend line'), 'Straight line fitted by least squares') +
      key('key-band', T('95% confidence band'), 'Where the true trend line probably lies (95% confidence, allowing for year-to-year memory). Single values scatter much more widely, so most dots sit outside it.') +
      key('key-pi', T('95% prediction interval'), 'Where single years are expected to fall (95% prediction interval). About 1 year in 20 should land outside it.') +
      key('key-sen', T('Sen’s slope'), 'Theil–Sen line: the median of the slopes between every pair of years. Robust to outliers; pairs with the Mann–Kendall test.');
    if (showCp) lg += key('key-cp', T('Change point'), 'Pettitt (1979) test: the most likely point where the values shift, with the mean before and after. A steady trend can also trigger it.');
    if (smooth) lg += key('key-smooth', T('5-year average'));
    if (FUT) lg += key('key-future', T('If the trend continues'), 'The trend line carried 10 years on. The shaded area is where a single year would probably land (95% prediction band), if nothing about the trend changes. It is not a forecast.');
    if (cmp) lg += key('key-cmp', cmp.short);
    $('legend').innerHTML = lg;
    $('chart-hint').textContent = T('Drag across the chart to test only those years. Stripes: {lo} years were below the {ref}, {hi} years above.',
      { lo: T(sc.loName), hi: T(sc.hiName), ref: ref.label });

    drawResiduals(res, { W: W, m: m, x0: x0, x1: x1, narrow: narrow });
    drawSensitivity(res, { W: W, m: m, narrow: narrow });
    drawSummary(res);
  }

  // ---- trend vs start year -----------------------------------------------------
  // The trend from every possible start year to the last year, with its 95% confidence
  // interval. If the answer holds for most start years, it does not depend on where the
  // record happens to begin.

  function drawSensitivity(res, g) {
    var host = $('sens');
    if (!host) return;
    host.innerHTML = '';
    var yrs = res.years, vals = res.values, vr = res.variable, last = yrs[yrs.length - 1], pts = [], i;
    // one start per calendar year (in monthly mode, the first month of that year); each needs
    // at least MIN_YEARS calendar years of data up to the end
    last = Math.floor(last);
    for (i = 0; i < yrs.length; i++) {
      var from = Math.floor(yrs[i]);
      if (i > 0 && Math.floor(yrs[i - 1]) === from) continue;
      if (last - from + 1 < MIN_YEARS) break;
      var o = S.linearRegression(yrs.slice(i), vals.slice(i));
      pts.push({ from: from, n: last - from + 1, slope: o.slope * 10, lo: o.ciLow * 10, hi: o.ciHigh * 10 });
    }
    // With a short period (e.g. 2016–2025) only one start year can give the 10 years a trend
    // needs. Say so instead of leaving an empty space, and offer the way back.
    if (pts.length < 2) {
      host.innerHTML = '<p class="sens-empty">' + esc(T('Trend from each start year: with {a}–{b} there is only one possible start year, because a trend needs at least {n} years.',
        { a: Math.floor(yrs[0]), b: last, n: MIN_YEARS })) + ' <button type="button" class="link" data-sens-reset>' + esc(T('Back to the full record')) + '</button></p>';
      host.querySelector('[data-sens-reset]').addEventListener('click', function () { var r = $('reset-years'); if (r) r.click(); });
      return;
    }

    var W = g.W, H = 204, m = { l: g.m.l, r: g.narrow ? 16 : 30, t: 42, b: 36 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, f0 = pts[0].from, f1 = pts[pts.length - 1].from;
    var lo = Math.min(0, Math.min.apply(null, pts.map(function (p) { return p.lo; })));
    var hi = Math.max(0, Math.max.apply(null, pts.map(function (p) { return p.hi; })));
    var pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    function sx(x) { return m.l + (x - f0) / (f1 - f0) * iw; }
    function sy(v) { return m.t + (hi - v) / (hi - lo) * ih; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': 'Trend per decade for each start year up to ' + last + ', with 95% confidence intervals' });
    var yt = niceTicks(lo, hi, 4), dp = Math.max(0, -Math.floor(Math.log10(yt.step) + 1e-9));
    yt.ticks.forEach(function (t) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' },
        (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t).toFixed(dp)));
    });
    svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(0), y2: sy(0), class: 'zero-solid' }));
    // A label every 5 years (2 for short records), plus the first and last start year so
    // the axis shows exactly where the dots begin and end. A 5-year label too close to
    // either end on screen (less than a label's width, ~34 px) is left out so labels never overlap.
    var every = f1 - f0 > 12 ? 5 : 2, ticks = [f0], gap = 34;
    for (var y = Math.ceil(f0 / every) * every; y <= f1; y += every) {
      if (sx(y) - sx(f0) >= gap && sx(f1) - sx(y) >= gap) ticks.push(y);
    }
    if (f1 !== f0) ticks.push(f1);
    ticks.forEach(function (t) {
      svg.appendChild(svgEl('text', { x: sx(t), y: H - 18, 'text-anchor': 'middle', class: 'tick' }, t));
    });
    svg.appendChild(svgEl('text', { x: m.l + iw / 2, y: H - 3, 'text-anchor': 'middle', class: 'axis-title' }, T('Start year')));

    // one error bar per start year; filled when the 95% interval excludes zero. Click to test that period.
    var slot = iw / Math.max(1, f1 - f0);
    pts.forEach(function (p) {
      var sig = p.lo > 0 || p.hi < 0, cls = sig ? ' sig' : '';
      var gEl = svgEl('g', { class: 'sens-pt-group', tabindex: 0, role: 'button',
        'aria-label': 'From ' + p.from + ': ' + signedNum(p.slope) + ' per decade, 95% CI ' + signedNum(p.lo) + ' to ' + signedNum(p.hi) + '. Test this period.' });
      gEl.appendChild(svgEl('title', {}, T('From {a} to {b} ({n} years): {s} {u}per decade, 95% CI [{lo}, {hi}]. Click to test this period.',
        { a: p.from, b: last, n: p.n, s: signedNum(p.slope), u: vr.unit ? vr.unit + ' ' : '', lo: signedNum(p.lo), hi: signedNum(p.hi) })));
      gEl.appendChild(svgEl('rect', { x: sx(p.from) - slot / 2, y: m.t, width: slot, height: ih, class: 'sens-hit' }));
      gEl.appendChild(svgEl('line', { x1: sx(p.from), x2: sx(p.from), y1: sy(p.lo), y2: sy(p.hi), class: 'sens-bar' + cls }));
      gEl.appendChild(svgEl('circle', { cx: sx(p.from), cy: sy(p.slope), r: 3, class: 'sens-pt' + cls }));
      // test that period, then bring the answer (verdict and chart) into view
      // (scroll once the new result is drawn; scrolling straight away is undone by the redraw)
      var go = function () {
        document.addEventListener('td:result', function () {
          var r = $('result'); if (r) r.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
        }, { once: true });
        setPeriod(p.from, last);
      };
      gEl.addEventListener('click', go);
      gEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      svg.appendChild(gEl);
    });

    // title on the first line, the count on the second (they would collide side by side on mid-size screens)
    var nSig = pts.filter(function (p) { return p.lo > 0 || p.hi < 0; }).length;
    svg.appendChild(svgEl('text', { x: 0, y: 14, class: 'panel-title' },
      T('Trend from each start year to {y}', { y: last }) + ' (' + (vr.unit ? vr.unit + ' ' : '') + T('per decade') + ')'));
    svg.appendChild(svgEl('text', { x: 0, y: 30, class: 'tick' },
      T('{s} of {n} start years give a 95% interval that excludes zero. Click a bar to test that period.', { s: nSig, n: pts.length })));
    host.appendChild(svg);
  }

  // ---- residuals panel -------------------------------------------------------
  // Observed minus the least-squares line, on the same year axis as the main chart.
  // A straight-line fit is reasonable when these scatter evenly around zero with no pattern.

  function drawResiduals(res, g) {
    var host = $('resid');
    if (!host) return;
    host.innerHTML = '';
    var ols = res.stats.ols, e = ols.resid, yrs = res.years, vr = res.variable, monthly = res.step === 'month';
    // the title and the statistics take two lines (side by side they collide on mid-size screens)
    var H = 164, m = { l: g.m.l, r: g.m.r, t: 42, b: 22 };
    var iw = g.W - m.l - m.r, ih = H - m.t - m.b;
    var band = 1.96 * ols.residualSE;
    var lim = Math.max(band, Math.max.apply(null, e.map(Math.abs))) * 1.15 || 1;
    function sx(x) { return m.l + (g.x1 === g.x0 ? iw / 2 : (x - g.x0) / (g.x1 - g.x0) * iw); }
    function sy(v) { return m.t + (lim - v) / (2 * lim) * ih; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + g.W + ' ' + H, width: g.W, height: H, role: 'img',
      'aria-label': 'Residuals from the linear trend, by year' });
    var yt = niceTicks(-lim, lim, 3), dp = Math.max(0, -Math.floor(Math.log10(yt.step) + 1e-9));
    yt.ticks.forEach(function (t) {
      if (Math.abs(t) > lim) return;
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' },
        (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t).toFixed(dp)));
    });
    svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(0), y2: sy(0), class: 'zero-solid' }));
    [band, -band].forEach(function (b) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(b), y2: sy(b), class: 'resid-sd' }));
    });
    if (!g.narrow) svg.appendChild(svgEl('text', { x: m.l + iw + 8, y: sy(band) + 4, class: 'endlabel' }, '±1.96 s'));

    yrs.forEach(function (yy, k) {
      var out = Math.abs(e[k]) > band;
      svg.appendChild(svgEl('line', { x1: sx(yy), x2: sx(yy), y1: sy(0), y2: sy(e[k]), class: 'resid-stem' + (out ? ' out' : '') }));
      svg.appendChild(svgEl('circle', { cx: sx(yy), cy: sy(e[k]), r: monthly ? 1.2 : 2.4, class: 'resid-pt' + (out ? ' out' : '') }));
    });

    svg.appendChild(svgEl('text', { x: 0, y: 14, class: 'panel-title' }, T('Residuals: observed minus trend line') + (vr.unit ? ' (' + vr.unit + ')' : '')));
    svg.appendChild(svgEl('text', { x: 0, y: 30, class: 'tick' },
      'lag-1 r = ' + ols.lag1.toFixed(2) + (ols.dw === null ? '' : ' · Durbin–Watson = ' + ols.dw.toFixed(2))));
    host.appendChild(svg);
  }

  // ---- statistical summary ---------------------------------------------------

  /** A number to n significant figures; scientific notation when very small or large. */
  function num(v, n) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    if (v === 0) return '0';
    var a = Math.abs(v), s = a >= 1e-3 && a < 1e6 ? String(Number(v.toPrecision(n || 3))) : v.toExponential((n || 3) - 1);
    return s.replace('-', '−');
  }
  function signedNum(v, n) { return v > 0 ? '+' + num(v, n) : num(v, n); }
  function pText(p) { return p === null || p === undefined ? '–' : p < 1e-3 ? num(p, 2) : p.toFixed(3); }

  function drawSummary(res) {
    var host = $('stats-summary');
    if (!host) return;
    var st = res.stats, o = st.ols, mk = st.mk, sen = st.sen, hr = st.hr, cp = st.cp, vr = res.variable;
    var ref = baselineOf(res, res.month, res.step === 'month');
    var unit = vr.unit ? vr.unit + ' ' : '', perDec = unit + T('per decade');
    var dec = function (v) { return signedNum(v * 10); };              // per year → per decade
    var range = function (a, b) { return '[' + dec(a) + ', ' + dec(b) + '] ' + perDec; };
    var n = res.years.length, monthly = res.step === 'month', skipped = (res.skipped || []).length;
    var lat = res.lat.toFixed(2), lon = res.lon.toFixed(2);
    var where = res.size ? T('{s}° box centred on {lat}°, {lon}° (area-weighted mean of {c} grid cells)', { s: res.size, lat: lat, lon: lon, c: res.cells })
      : T('single grid cell at {lat}°, {lon}°', { lat: lat, lon: lon });
    var part = monthly ? T('each month minus its calendar-month average') + (res.month ? ' (' + T(MONTHS[res.month]) + ')' : '')
      : res.month ? T('{month} mean', { month: T(MONTHS[res.month]) }) : T('annual mean (months weighted by days)');
    var plainLo = o.slope - o.tCritPlain * o.se, plainHi = o.slope + o.tCritPlain * o.se;

    // Row labels are translated when the table is built (see below); values are built here.
    var rows = [
      ['Linear regression (ordinary least squares)'],
      ['Slope ± standard error', dec(o.slope) + ' ± ' + num(o.se * 10) + ' ' + perDec],
      ['95% confidence interval', range(plainLo, plainHi)],
      ['t-test on the slope', 't = ' + num(o.t) + ', df = ' + o.df + ', p = ' + pText(o.p)],
      ['R² · residual standard deviation', num(o.r2) + ' · ' + num(o.residualSE) + (vr.unit ? ' ' + vr.unit : '')],

      ['Autocorrelation of the residuals'],
      ['Lag-1 autocorrelation r₁ · Durbin–Watson d', num(o.lag1) + ' · ' + num(o.dw)],
      ['Lag-1 r used, with small-sample correction', num(o.lag1Adj)],
      ['Effective sample size n_eff', T('{a} of {n} values', { a: num(o.nEff), n: n })],
      ['Slope 95% CI, adjusted (drawn as the band)', range(o.ciLow, o.ciHigh)],
      ['t-test p, adjusted', pText(o.pAdj)],

      ['Mann–Kendall trend test'],
      ['S · Var(S) · Z', num(mk.S, 4) + ' · ' + num(mk.varS, 4) + ' · ' + num(mk.z)],
      ['Kendall’s τ · p', num(mk.tau) + ' · ' + pText(mk.p)],
      ['p adjusted for year-to-year memory (used for the verdict)', pText(mk.pAdj)],
      ['Hamed–Rao modified p (autocorrelation)', hr.p === null ? '– (' + T('corrected variance not positive') + ')' :
        pText(hr.p) + ' (Var(S) × ' + num(hr.factor) + ', ' + (hr.lags.length ? T('lags {l}', { l: hr.lags.join(', ') }) : T('no significant lags')) + ')'],

      ['Theil–Sen estimator'],
      ['Sen’s slope', dec(sen.slope) + ' ' + perDec],
      ['95% confidence interval (Sen 1968)', range(sen.ciLow, sen.ciHigh)],

      ['Change point (Pettitt 1979)'],
      ['Most likely shift', cp.at ? T('between {a} and {b}', { a: whenLabel(res.years[cp.at - 1]), b: whenLabel(res.years[cp.at]) }) : T('none (all values equal)')],
      ['K · p', num(cp.K, 4) + ' · ' + pText(cp.p) + ' (' + T(cp.p < 0.05 ? 'significant, drawn on the chart' : 'not significant') + ')'],
      ['Mean before · after the shift', cp.at ? num(cp.meanBefore, 4) + ' · ' + num(cp.meanAfter, 4) + (vr.unit ? ' ' + vr.unit : '') : '–'],

      ['Data'],
      ['Reference for differences and stripes', ref.normal ? T('{ref} (WMO climate normal; {n} of 30 years with data)', { ref: ref.label, n: ref.n })
        : T('{ref} (fewer than {m} of the 1991–2020 years have data)', { ref: ref.label, m: NORMAL_MIN })],
      ['Series', T('NASA POWER monthly {p}, {part}', { p: vr.param || vr.id, part: part })],
      ['Location', where],
      ['Period · values used', whenLabel(res.years[0]) + '–' + whenLabel(res.years[n - 1]) + ' · n = ' + n +
        (skipped ? ' (' + T(monthly ? '{k} years with missing months' : '{k} skipped: incomplete months', { k: skipped }) + ')' : '')],
      ['Source', vr.source]
    ];

    host.innerHTML = '<h4>' + esc(T('Statistical summary')) + '</h4><div class="table-scroll"><table class="stats-table"><tbody>' +
      rows.map(function (r) {
        return r.length === 1 ? '<tr class="group"><th colspan="2" scope="colgroup">' + esc(T(r[0])) + '</th></tr>'
          : '<tr><th scope="row">' + esc(T(r[0])) + '</th><td>' + esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="hint">' + esc(T('Two-sided tests, α = 0.05. Per-decade values are the per-year slope × 10. The verdict above uses the ' +
        'Mann–Kendall p-value adjusted for year-to-year memory. A steady trend can also make the Pettitt test significant, so a change point is most convincing when ' +
        'the residuals jump at that year too.')) + ' ' + esc(T('References:') + ' Mann (1945); Kendall (1975); Pettitt (1979); Sen (1968); ' +
        'Hamed & Rao (1998); Santer et al. (2000); WMO (2017).') + '</p>';
  }

  // ---- months panel --------------------------------------------------------

  function drawSeason(res) {
    var host = $('season');
    host.innerHTML = '';
    var vr = res.variable, rows = [], maxAbs = 0;
    for (var mo = 1; mo <= 12; mo++) {
      var ser = yearlySeries(res.table, res.y0, res.y1, mo);
      var st = ser.years.length >= MIN_YEARS ? S.analyze(ser.years, ser.values) : null;
      if (st) maxAbs = Math.max(maxAbs, Math.abs(st.sen.slope * 10));
      rows.push({ m: mo, st: st });
    }
    var valid = rows.filter(function (r) { return r.st; });
    if (!valid.length) {
      $('season-note').textContent = T('There is not enough monthly data here to test each month.');
      return;
    }
    var sigs = valid.filter(function (r) { return r.st.verdict === 'significant'; });
    if (sigs.length) {
      sigs.sort(function (a, b) { return Math.abs(b.st.sen.slope) - Math.abs(a.st.sen.slope); });
      var top = sigs[0];
      // placeholders hold already-escaped HTML, so the sentence itself can be translated
      $('season-note').innerHTML = T(top.st.direction === 'up'
        ? '{s} months show a significant trend. The biggest is {m}, rising by about {rate}.'
        : '{s} months show a significant trend. The biggest is {m}, falling by about {rate}.',
        { s: '<strong>' + esc(T('{a} of {b}', { a: sigs.length, b: valid.length })) + '</strong>',
          m: '<strong>' + esc(T(MONTHS[top.m])) + '</strong>', rate: esc(ratePhrase(top.st, vr)) });
    } else {
      $('season-note').textContent = T('No single month shows a statistically significant trend here.');
    }

    if (!maxAbs) maxAbs = 1;
    var W = Math.max(300, host.clientWidth), narrow = W < 560, H = narrow ? 180 : 210;
    var mg = { l: 56, r: 8, t: 12, b: 26 }, iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
    var lim = maxAbs * 1.15, yt = niceTicks(-lim, lim, 4);
    var tickDp = Math.max(0, -Math.floor(Math.log10(yt.step) + 1e-9));
    function sy(v) { return mg.t + (lim - v) / (2 * lim) * ih; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
      'aria-label': 'Trend per decade for each month of the year' });
    yt.ticks.forEach(function (t) {
      if (Math.abs(t) > lim) return;
      svg.appendChild(svgEl('line', { x1: mg.l, x2: mg.l + iw, y1: sy(t), y2: sy(t), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: mg.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' },
        (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t).toFixed(tickDp)));
    });
    svg.appendChild(svgEl('line', { x1: mg.l, x2: mg.l + iw, y1: sy(0), y2: sy(0), class: 'zero-solid' }));

    var bw = iw / 12;
    host.appendChild(svg);
    var tip = makeTip(host);
    rows.forEach(function (r, i) {
      var cx = mg.l + bw * (i + 0.5), on = res.month === r.m;
      var label = MONTHS[r.m] + ': ' + (r.st ? ratePhrase(r.st, vr) + ', ' + verdictLabel(r.st.verdict).toLowerCase() : 'not enough data');
      var g = svgEl('g', { class: 'mgroup' + (on ? ' on' : ''), tabindex: 0, role: 'button', 'aria-label': label, 'aria-pressed': on ? 'true' : 'false' });
      g.appendChild(svgEl('rect', { x: mg.l + bw * i + 1, y: mg.t, width: bw - 2, height: ih, rx: 6, class: 'mcol' }));
      var barTop = mg.t + ih / 2;
      if (r.st) {
        var v = r.st.sen.slope * 10, y = sy(Math.max(v, 0)), h = Math.max(1.5, Math.abs(sy(v) - sy(0)));
        barTop = y;
        g.appendChild(svgEl('rect', { x: cx - bw * 0.3, y: y, width: bw * 0.6, height: h, rx: 3,
          class: 'mbar mbar-' + r.st.verdict + (v < 0 ? ' mbar-neg' : ''), style: '--i:' + i }));
      }
      g.appendChild(svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' + (on ? ' tick-on' : '') },
        narrow ? T(MONTH_SHORT[i]).charAt(0) : T(MONTH_SHORT[i])));
      function showTip() {
        var html = '<strong>' + esc(T(MONTHS[r.m])) + '</strong>' + (r.st
          ? '<span>' + esc(ratePhrase(r.st, vr)) + '</span><span>' + esc(T(verdictLabel(r.st.verdict))) + ', ' + esc(pEquals(r.st.mk.pAdj)) + '</span>'
          : '<span>' + esc(T('Not enough data')) + '</span>') +
          '<span><em>' + esc(T(on ? 'Click to go back to the whole year' : 'Click to investigate this month')) + '</em></span>';
        tip.show(html, cx, barTop, svg, W);
      }
      g.addEventListener('pointerenter', showTip);
      g.addEventListener('focus', showTip);
      g.addEventListener('pointerleave', tip.hide);
      g.addEventListener('blur', tip.hide);
      g.addEventListener('click', function () { chooseMonth(r.m); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseMonth(r.m); }
      });
      svg.appendChild(g);
    });
  }

  function drawPair(host, ys, za, zb, la, lb) {
    host.innerHTML = '';
    var W = Math.max(300, host.clientWidth), H = 230, m = { l: 40, r: 12, t: 12, b: 28 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b, x0 = ys[0], x1 = ys[ys.length - 1];
    var lim = Math.max(2.5, Math.max.apply(null, za.concat(zb).map(Math.abs)) * 1.1);
    function sx(x) { return m.l + (x - x0) / (x1 - x0 || 1) * iw; }
    function sy(v) { return m.t + (lim - v) / (2 * lim) * ih; }
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': T('{a} and {b} on a common scale', { a: la, b: lb }) });
    [-2, -1, 0, 1, 2].forEach(function (t) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), class: t ? 'grid' : 'zero' }));
      svg.appendChild(svgEl('text', { x: m.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'tick' }, (t > 0 ? '+' : t < 0 ? '−' : '') + Math.abs(t)));
    });
    var every = x1 - x0 > 30 ? 10 : 5;
    for (var y = Math.ceil(x0 / every) * every; y <= x1; y += every) svg.appendChild(svgEl('text', { x: sx(y), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, y));
    // A skipped year starts a new piece of line instead of joining across the gap.
    function line(z, cls) {
      return svgEl('path', { d: ys.map(function (yy, i) {
        return (i && yy - ys[i - 1] === 1 ? 'L' : 'M') + sx(yy).toFixed(1) + ' ' + sy(z[i]).toFixed(1);
      }).join(' '), class: cls });
    }
    svg.appendChild(line(za, 'series'));
    svg.appendChild(line(zb, 'cmp'));
    host.appendChild(svg);
    $('var2-legend').innerHTML = '<span><i class="key key-series"></i>' + esc(la) + '</span><span><i class="key key-cmp"></i>' + esc(lb) + '</span>' +
      '<span>' + esc(T('Both shown as standard scores: 0 is each one’s average, ±1 a typical year’s swing.')) + '</span>';
  }

  // ---- save the chart as an image -------------------------------------------

  var STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
    'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'visibility', 'display'];
  function inlineStyles(src, dst) {
    var cs = getComputedStyle(src);
    STYLE_PROPS.forEach(function (p) { dst.style.setProperty(p, cs.getPropertyValue(p)); });
    for (var i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
  }
  function savePng() {
    var svg = $('chart').querySelector('svg');
    if (!svg || !A.current) return;
    var clone = svg.cloneNode(true);
    inlineStyles(svg, clone);
    Array.prototype.forEach.call(clone.querySelectorAll('.hit, .brush, .cross, .dot, .dot-cmp'), function (n) { n.remove(); });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var W = +svg.getAttribute('width'), H = +svg.getAttribute('height'), scale = 2, top = 86, bottom = 48;
    var cs = getComputedStyle(document.querySelector('.chart-card'));
    var bg = cs.backgroundColor, ink = getComputedStyle(document.body).color;
    var FONT = '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif';

    // The legend goes into the image too, so the lines and the band still make sense on their own.
    var legend = Array.prototype.map.call(document.querySelectorAll('#legend > span'), function (s) {
      var key = s.querySelector('.key'), kc = key ? getComputedStyle(key) : null;
      var colour = !kc ? null : (kc.backgroundColor !== 'rgba(0, 0, 0, 0)' ? kc.backgroundColor : kc.borderTopColor);
      return { text: s.textContent.trim(), colour: colour, opacity: kc ? +kc.opacity : 1 };
    });
    // Place the legend items in rows that fit the width, and make room for them above the chart.
    var meas = document.createElement('canvas').getContext('2d');
    meas.font = '12px ' + FONT;
    var lx = 20, row = 0;
    legend.forEach(function (it) {
      var w = (it.colour ? 20 : 0) + meas.measureText(it.text).width;
      if (lx > 20 && lx + w > W + 20) { lx = 20; row++; }
      it.x = lx; it.row = row;
      lx += w + 16;
    });
    top += row * 18;

    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = (W + 40) * scale; c.height = (H + top + bottom) * scale;
      var x = c.getContext('2d');
      x.scale(scale, scale);
      x.fillStyle = bg; x.fillRect(0, 0, W + 40, H + top + bottom);
      x.fillStyle = ink; x.font = '600 17px ' + FONT;
      x.fillText($('chart-title').textContent, 20, 30);
      x.globalAlpha = 0.65; x.font = '13px ' + FONT;
      x.fillText($('verdict-head').textContent, 20, 50);

      // legend: a coloured key, then its name, in the rows worked out above
      x.font = '12px ' + FONT;
      legend.forEach(function (it) {
        var ty = 73 + it.row * 18, tx = it.x;
        if (it.colour) {
          x.globalAlpha = Math.max(it.opacity, 0.35); x.fillStyle = it.colour; x.fillRect(tx, ty - 6, 14, 4);
          tx += 20;
        }
        x.globalAlpha = 0.8; x.fillStyle = ink; x.fillText(it.text, tx, ty);
      });
      x.globalAlpha = 1;
      x.drawImage(img, 20, top, W, H);

      // source line, wrapped so it is never cut off on a narrow chart
      x.globalAlpha = 0.55; x.fillStyle = ink; x.font = '11px ' + FONT;
      var words = T('Data: NASA POWER (MERRA-2, CERES). Made with Trend Detective, a student project not endorsed by NASA.').split(' ');
      var lineText = '', ly = H + top + 20;
      words.forEach(function (w) {
        var tryText = lineText ? lineText + ' ' + w : w;
        if (x.measureText(tryText).width > W && lineText) { x.fillText(lineText, 20, ly); lineText = w; ly += 15; }
        else lineText = tryText;
      });
      x.fillText(lineText, 20, ly);
      URL.revokeObjectURL(url);
      c.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'trend-detective-' + A.current.variable.id + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        toast(T('Chart saved as an image.'));
      });
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(T('This browser could not save the chart.')); };
    img.src = url;
  }

  window.TDChart = {
    init: function (api) {
      A = api;
      S = api.S; T = api.T; esc = api.esc; clamp = api.clamp; fmtValue = api.fmtValue; fmtAnom = api.fmtAnom;
      pEquals = api.pEquals; ratePhrase = api.ratePhrase; verdictLabel = api.verdictLabel; runningMean = api.runningMean;
      yearlySeries = api.yearlySeries; chooseMonth = api.chooseMonth; setPeriod = api.setPeriod;
      toast = api.toast; view = api.view; MONTHS = api.MONTHS; MONTH_SHORT = api.MONTH_SHORT; MIN_YEARS = api.MIN_YEARS; whenLabel = api.whenLabel;
      REDUCED = api.REDUCED;
    },
    drawChart: drawChart, drawSeason: drawSeason, drawPair: drawPair, savePng: savePng
  };
})();
