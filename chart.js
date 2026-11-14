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
    chooseMonth, setPeriod, investigate, toast, view, MONTHS, MONTH_SHORT, MIN_YEARS, MERRA, CERES, REDUCED, whenLabel;
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
    var wet = vr.topic === 'water' || vr.topic === 'soil';
    return wet ? { lo: 'var(--div-dry)', hi: 'var(--div-wet)', loName: 'brown', hiName: 'teal' }
      : { lo: 'var(--div-lo)', hi: 'var(--div-hi)', loName: 'blue', hiName: 'red' };
  }

  // ---- main chart ----------------------------------------------------------

  function drawChart(res, animate) {
    var host = $('chart');
    host.innerHTML = '';
    host.classList.toggle('anim', !!animate && !REDUCED);
    var vr = res.variable, yrs = res.years, ols = res.stats.ols;
    var base = view.anom ? S.mean(res.values) : 0;
    var vals = res.values.map(function (v) { return v - base; });
    var cmp = A.compareData && A.compareData.v === vr.id ? A.compareData : null;
    var cbase = cmp && view.anom ? S.mean(cmp.values) : 0;
    var cvals = cmp ? cmp.values.map(function (v) { return v - cbase; }) : [];
    var cols = cmp ? cmp.stats.ols : null;
    var monthly = res.step === 'month', dx = monthly ? 1 / 12 : 1;   // spacing of the points, in years
    var smooth = view.smooth ? runningMean(vals, monthly ? 61 : 5) : null;   // five years either way

    var W = Math.max(300, host.clientWidth), narrow = W < 560, H = narrow ? 300 : 380;
    var STRIPE = 14;
    var m = { l: 56, r: narrow ? 16 : 118, t: 14, b: 34 + STRIPE + 8 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    function trendAt(x) { return ols.intercept + ols.slope * x - base; }
    function ctrendAt(x) { return cols.intercept + cols.slope * x - cbase; }
    function half(x) {   // bandScale widens the band when the tests were corrected for autocorrelation
      return ols.tCrit * ols.residualSE * (ols.bandScale || 1) * Math.sqrt(1 / ols.n + Math.pow(x - ols.meanX, 2) / ols.sxx);
    }
    var a0 = yrs[0], a1 = yrs[yrs.length - 1];
    var FUT = view.future ? 10 : 0, f1 = a1 + FUT;
    var x0 = a0, x1 = f1;
    if (cmp) { x0 = Math.min(x0, cmp.years[0]); x1 = Math.max(x1, cmp.years[cmp.years.length - 1]); }

    var all = vals.concat(cvals);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    [a0, a1, f1].forEach(function (x) {
      lo = Math.min(lo, trendAt(x) - half(x)); hi = Math.max(hi, trendAt(x) + half(x));
    });
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
      svg.appendChild(svgEl('text', { x: sx(y), y: H - 10, 'text-anchor': 'middle', class: 'tick' }, y));
    }

    // climate stripes: one per year, coloured by difference from the period mean
    var mean = S.mean(res.values), maxAbs = 0;
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

    function pathOf(xs, ys) {
      var d = '', pen = false;
      for (var k = 0; k < xs.length; k++) {
        if (ys[k] === null) { pen = false; continue; }
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
    svg.appendChild(svgEl('line', { x1: sx(a0), y1: sy(trendAt(a0)), x2: sx(a1), y2: sy(trendAt(a1)), class: 'trend' }));

    // "If the trend continues": the same straight line carried 10 years past the data
    if (FUT) {
      var fu = [], fd = [];
      for (var fi = 0; fi <= 20; fi++) {
        var fx = a1 + FUT * fi / 20;
        fu.push(sx(fx).toFixed(1) + ',' + sy(trendAt(fx) + half(fx)).toFixed(1));
        fd.unshift(sx(fx).toFixed(1) + ',' + sy(trendAt(fx) - half(fx)).toFixed(1));
      }
      svg.appendChild(svgEl('polygon', { points: fu.concat(fd).join(' '), class: 'band future-band' }));
      svg.appendChild(svgEl('line', { x1: sx(a1), y1: sy(trendAt(a1)), x2: sx(f1), y2: sy(trendAt(f1)), class: 'future' }));
      svg.appendChild(svgEl('line', { x1: sx(a1), x2: sx(a1), y1: m.t, y2: m.t + ih, class: 'nowline' }));
      var fl = svgEl('text', { x: sx(f1) - 4, y: sy(trendAt(f1)) + (ols.slope >= 0 ? 18 : -10), 'text-anchor': 'end', class: 'future-label' },
        T('If the trend continues'));
      svg.appendChild(fl);
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
        for (var s = smooth.length - 1; s >= 0; s--) if (smooth[s] !== null) { labels.push({ y: sy(smooth[s]), t: '5-year average', c: 'endlabel' }); break; }
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
    function yearAt(px) { return clamp(Math.round(x0 + (px - m.l) / iw * (x1 - x0)), x0, x1); }

    var kb = yrs.length - 1;
    function showIdx(k) {
      kb = k;
      var yy = yrs[k], cx = sx(yy), cy = sy(vals[k]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      var html = '<strong>' + esc(whenLabel(yy)) + '</strong><span><i class="key key-series"></i>' +
        (cmp ? esc(res.short) + ': ' : '') +
        esc(view.anom ? fmtAnom(vals[k], vr) + ' vs average' : fmtValue(vals[k], vr)) +
        (view.anom ? ' <em>(' + esc(fmtValue(res.values[k], vr)) + ')</em>' : '') + '</span>';
      html += '<span><i class="key key-trend"></i>' + esc(view.anom ? fmtAnom(trendAt(yy), vr) : fmtValue(trendAt(yy), vr)) + ' on the trend line</span>';
      if (smooth && smooth[k] !== null) html += '<span><i class="key key-smooth"></i>' + esc(view.anom ? fmtAnom(smooth[k], vr) : fmtValue(smooth[k], vr)) + ' 5-year average</span>';
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
          var a = clamp(Math.min(drag.x, px), m.l, m.l + iw), b = clamp(Math.max(drag.x, px), m.l, m.l + iw);
          sel.setAttribute('x', a); sel.setAttribute('width', b - a); sel.setAttribute('visibility', 'visible');
          var ya = yearAt(a), yb = yearAt(b), n = yb - ya + 1;
          cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); cdot.setAttribute('visibility', 'hidden');
          tip.show('<strong>' + ya + '–' + yb + '</strong><span>' + n + ' years. ' +
            (n >= MIN_YEARS ? 'Let go to test this period.' : 'Pick at least ' + MIN_YEARS + ' years.') + '</span>', (a + b) / 2, m.t + 30, svg, W);
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
      else toast('Pick at least ' + MIN_YEARS + ' years to test a trend.');
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
    var lg = '<span><i class="key key-series"></i>' + esc(cmp ? res.short : T(monthly ? 'Each month minus its normal' : 'Yearly value')) + '</span>' +
      '<span><i class="key key-trend"></i>Trend line</span><span><i class="key key-band"></i>95% confidence band</span>';
    if (smooth) lg += '<span><i class="key key-smooth"></i>' + T('5-year average') + '</span>';
    if (FUT) lg += '<span><i class="key key-future"></i>' + T('If the trend continues') + '</span>';
    if (cmp) lg += '<span><i class="key key-cmp"></i>' + esc(cmp.short) + '</span>';
    $('legend').innerHTML = lg;
    $('chart-hint').textContent = 'Drag across the chart to test only those years. Stripes: ' + sc.loName +
      ' years were below the average, ' + sc.hiName + ' years above.';
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
      $('season-note').textContent = 'There is not enough monthly data here to test each month.';
      return;
    }
    var sigs = valid.filter(function (r) { return r.st.verdict === 'significant'; });
    if (sigs.length) {
      sigs.sort(function (a, b) { return Math.abs(b.st.sen.slope) - Math.abs(a.st.sen.slope); });
      var top = sigs[0];
      $('season-note').innerHTML = '<strong>' + sigs.length + ' of ' + valid.length + '</strong> months show a significant trend. The biggest is <strong>' +
        MONTHS[top.m] + '</strong>, ' + (top.st.direction === 'up' ? 'rising' : 'falling') + ' by about ' + esc(ratePhrase(top.st, vr)) + '.';
    } else {
      $('season-note').textContent = 'No single month shows a statistically significant trend here.';
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
        narrow ? MONTH_SHORT[i].charAt(0) : MONTH_SHORT[i]));
      function showTip() {
        var html = '<strong>' + MONTHS[r.m] + '</strong>' + (r.st
          ? '<span>' + esc(ratePhrase(r.st, vr)) + '</span><span>' + verdictLabel(r.st.verdict) + ', ' + esc(pEquals(r.st.mk.p)) + '</span>'
          : '<span>Not enough data</span>') + '<span><em>' + (on ? 'Click to go back to the whole year' : 'Click to investigate this month') + '</em></span>';
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
    function line(z, cls) {
      return svgEl('path', { d: ys.map(function (yy, i) { return (i ? 'L' : 'M') + sx(yy).toFixed(1) + ' ' + sy(z[i]).toFixed(1); }).join(' '), class: cls });
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
    var W = +svg.getAttribute('width'), H = +svg.getAttribute('height'), scale = 2, top = 64, bottom = 34;
    var cs = getComputedStyle(document.querySelector('.chart-card'));
    var bg = cs.backgroundColor, ink = getComputedStyle(document.body).color;
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = (W + 40) * scale; c.height = (H + top + bottom) * scale;
      var x = c.getContext('2d');
      x.scale(scale, scale);
      x.fillStyle = bg; x.fillRect(0, 0, W + 40, H + top + bottom);
      x.fillStyle = ink; x.font = '600 17px -apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif';
      x.fillText($('chart-title').textContent, 20, 30);
      x.globalAlpha = 0.65; x.font = '13px -apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif';
      x.fillText($('verdict-head').textContent, 20, 50);
      x.globalAlpha = 1;
      x.drawImage(img, 20, top, W, H);
      x.globalAlpha = 0.55; x.font = '11px -apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif';
      x.fillText(T('Data: NASA POWER (MERRA-2, CERES). Made with Trend Detective, a student project not endorsed by NASA.'), 20, H + top + 22);
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
      yearlySeries = api.yearlySeries; chooseMonth = api.chooseMonth; setPeriod = api.setPeriod; investigate = api.investigate;
      toast = api.toast; view = api.view; MONTHS = api.MONTHS; MONTH_SHORT = api.MONTH_SHORT; MIN_YEARS = api.MIN_YEARS; whenLabel = api.whenLabel;
      MERRA = api.MERRA; CERES = api.CERES; REDUCED = api.REDUCED;
    },
    drawChart: drawChart, drawSeason: drawSeason, drawPair: drawPair, savePng: savePng
  };
})();
