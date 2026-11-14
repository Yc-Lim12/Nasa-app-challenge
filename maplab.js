/*
 * Trend Detective map tools, drawn on the globe:
 *   Trend map      one Sen's slope + Mann-Kendall test per NASA POWER grid cell (red up, blue down)
 *   Significance   a dot on every cell still significant after the Benjamini–Hochberg
 *                  false discovery rate correction (5%) across all cells
 *   Opposite trends finds areas in the same box that go up and down, with a caption
 *   Timelapse      every month of the period, as values or as difference from normal
 *   Rain now       the last 12 hours of NASA GPM IMERG rain (images from NASA GIBS)
 *   Wind           particles following the average 10 m wind (MERRA-2 U10M / V10M)
 * Needs app.js (window.TD) and globe.js.
 */
(function () {
  'use strict';

  // Map area in degrees. The user picks 2–10 (10 is the biggest box NASA POWER serves
  // in one request); the globe zooms so the box always fills about the same space.
  var BOX = 10, BOX_MIN = 2, BOX_MAX = 10;
  try { var savedBox = parseInt(localStorage.getItem('td-mapbox'), 10); if (savedBox >= BOX_MIN && savedBox <= BOX_MAX) BOX = savedBox; } catch (err) { /* private mode */ }
  function zoomFor() { return 3.6 * 10 / BOX; }
  function boxLabel(b) { return b + '° × ' + b + '° (' + T('about {km} km', { km: Math.round(b * 111 / 10) * 10 }) + ')'; }
  function boxCtl() {
    return '<label class="lp-box"><span>' + esc(T('Map area')) + '</span>' +
      '<input type="range" id="lp-box" min="' + BOX_MIN + '" max="' + BOX_MAX + '" step="1" value="' + BOX + '" aria-label="' + esc(T('Map area')) + '">' +
      '<output id="lp-box-out">' + esc(boxLabel(BOX)) + '</output></label>';
  }
  // How grid cells look: 'crisp' squares at the data's real resolution, or 'smooth'
  // blending; and how see-through they are. Drawing only: the values never change.
  var CELLS = { mode: 'crisp', alpha: 0.75 };
  try {
    if (localStorage.getItem('td-cellmode') === 'smooth') CELLS.mode = 'smooth';
    var savedA = parseFloat(localStorage.getItem('td-cellalpha')); if (savedA >= 0.2 && savedA <= 1) CELLS.alpha = savedA;
  } catch (err) { /* private mode */ }
  function cellCtl() {
    return '<div class="lp-cells"><div class="lp-seg" id="lp-cellmode" role="group" aria-label="' + esc(T('How to draw the grid')) + '">' +
      '<button type="button" data-cm="crisp" aria-pressed="' + (CELLS.mode === 'crisp') + '">' + esc(T('Grid cells')) + '</button>' +
      '<button type="button" data-cm="smooth" aria-pressed="' + (CELLS.mode === 'smooth') + '">' + esc(T('Smooth')) + '</button></div>' +
      '<label class="lp-alpha"><span>' + esc(T('Opacity')) + '</span><input type="range" id="lp-alpha" min="20" max="100" step="5" value="' +
      Math.round(CELLS.alpha * 100) + '" aria-label="' + esc(T('Opacity')) + '"></label></div>';
  }
  // Trend map area: the live box around the place, or the whole globe. The globe can't be
  // asked for live (648 NASA POWER boxes, about 2 GB), so it is pre-built for a few
  // variables by tools/build_global_trends.mjs into data/global/<PARAM>.json.
  var GLOBAL_READY = { T2M: true, PRECTOTCORR: true };
  // The whole globe is the default; a viewer who picks "This area" keeps that choice.
  var SCOPE = 'globe', globalCache = {};
  try { if (localStorage.getItem('td-mapscope') === 'box') SCOPE = 'box'; } catch (err) { /* private mode */ }
  function globeReady() { return !!GLOBAL_READY[TD.prm(TD.variable(TD.state.v))]; }
  function scopeCtl() {
    return '<div class="lp-seg lp-scope" role="group" aria-label="' + esc(T('Map area')) + '">' +
      '<button type="button" data-scope="box" aria-pressed="' + (SCOPE === 'box') + '">' + esc(T('This area')) + '</button>' +
      '<button type="button" data-scope="globe" aria-pressed="' + (SCOPE === 'globe') + '">' + esc(T('Whole globe')) + '</button></div>';
  }
  function scopeKey() {
    var s = TD.state;
    return SCOPE === 'globe' && globeReady() ? ['globe', s.v, s.y0, s.y1, s.month].join('|') : gridKey();
  }
  var TD, panel, active = '', loadKey = '', token = 0;
  var grid = null;           // { key, cells, dlon, dlat, vr }
  var lapse = { timer: 0, i: 0, mode: 'anom', speed: 1 };
  var rain = { timer: 0, i: 0, frames: null };
  var windMonth = null;

  function $(id) { return document.getElementById(id); }
  function T(s, v) { return TD.T(s, v); }
  function esc(s) { return TD.esc(s); }

  function percentile(arr, q) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
  }
  function compass(dlat, dlon) {
    if (Math.abs(dlat) < 1 && Math.abs(dlon) < 1) return T('centre');
    var a = Math.atan2(dlat, dlon) * 180 / Math.PI;   // 0 = east, 90 = north
    var names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
    return T(names[(Math.round(a / 45) + 8) % 8]);
  }
  function monthLabel(key) {
    var y = key.slice(0, 4), m = +key.slice(4, 6);
    return T(TD.MONTHS[m]) + ' ' + y;
  }

  // ---- layer switching -------------------------------------------------------

  function setLayer(id, opts) {
    opts = opts || {};
    var g = TD.globe;
    if (!g) return;
    token++;
    clearInterval(lapse.timer); clearInterval(rain.timer); clearInterval(wind.timer); wind.timer = 0;
    g.setCells(null); g.setMarks(null); g.setRaster(null); g.setField(null);
    active = id || '';
    loadKey = '';
    Array.prototype.forEach.call(document.querySelectorAll('#layers button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-layer') === active ? 'true' : 'false');
    });
    document.querySelector('.stage').classList.toggle('layer-on', !!active);
    panel.hidden = !active;
    if (!active) { panel.innerHTML = ''; return; }
    g.spin(false);
    if (active === 'trend') showTrend();
    else if (active === 'lapse') showLapse(opts.frame);
    else if (active === 'rain') showRain();
    else if (active === 'wind') { if (opts.month !== undefined) windMonth = opts.month; showWind(); }
  }

  function busy(title, msg) {
    panel.innerHTML = '<div class="lp-head"><strong>' + esc(title) + '</strong></div><p class="lp-busy"><i class="spinner"></i>' + esc(msg) + '</p>';
  }
  function fail(title, msg) {
    panel.innerHTML = '<div class="lp-head"><strong>' + esc(title) + '</strong></div><p class="lp-note">' + esc(msg) + '</p>';
  }

  // ---- the grid (one regional request per variable) -------------------------

  function gridKey() {
    var s = TD.state;
    return [s.v, s.lat.toFixed(2), s.lon.toFixed(2), s.y0, s.y1, s.month, BOX].join('|');
  }

  function loadGrid() {
    var s = TD.state, vr = TD.variable(s.v), pm = TD.prm(vr), key = gridKey();
    if (grid && grid.key === key) return Promise.resolve(grid);
    return TD.fetchJson(TD.urlFor(pm, s.lat, s.lon, BOX)).then(function (json) {
      var feats = json.features || [];
      if (!feats.length) throw new Error(T('NASA POWER returned no grid cells for this area.'));
      var lons = [], lats = [];
      var cells = feats.map(function (f) {
        var lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        lons.push(lon); lats.push(lat);
        var table = TD.trimSpliced(pm, f.properties.parameter[pm] || {});
        // open-ocean cells of a land-only variable have no data (see isOceanFill in app.js)
        if (TD.isOceanFill(pm, table)) return { lon: lon, lat: lat, table: {}, stats: null };
        var ser = TD.yearlySeries(table, s.y0, s.y1, s.month);
        var st = ser.years.length >= TD.MIN_YEARS ? TD.S.analyze(ser.years, ser.values) : null;
        return { lon: lon, lat: lat, table: table, stats: st };
      });
      var step = function (a) {
        var u = a.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort(function (x, y) { return x - y; });
        return u.length > 1 ? u[1] - u[0] : 0.5;
      };
      grid = { key: key, cells: cells, dlon: step(lons), dlat: step(lats), vr: vr, lat: s.lat, lon: s.lon };
      return grid;
    });
  }

  function cellBounds(c) {
    return { lon0: c.lon - grid.dlon / 2, lon1: c.lon + grid.dlon / 2, lat0: c.lat - grid.dlat / 2, lat1: c.lat + grid.dlat / 2 };
  }

  // ---- trend map + significance dots + opposite trends ------------------------

  function loadGlobal(pm) {
    if (!globalCache[pm]) {
      globalCache[pm] = fetch('data/global/' + pm + '.json').then(function (r) {
        if (!r.ok) throw new Error(T('The whole-globe map could not be loaded.'));
        return r.json();
      });
      globalCache[pm].catch(function () { delete globalCache[pm]; });
    }
    return globalCache[pm];
  }

  /** The whole-globe trend map: pre-built 5° blocks, same tests as everywhere else. */
  function showGlobalTrend() {
    var my = token, vr = TD.variable(TD.state.v), pm = TD.prm(vr);
    TD.globe.flyTo(TD.state.lat, TD.state.lon, 180, 1300, 1);
    if (!GLOBAL_READY[pm]) {
      panel.innerHTML = '<div class="lp-head"><strong>' + esc(T('Trend map')) + '</strong><span>' + esc(TD.vname(vr)) + '</span></div>' + scopeCtl() +
        '<p class="lp-note">' + esc(T('The whole-globe map is ready for air temperature and rain. Choose one of those, or switch back to this area.')) + '</p>';
      return;
    }
    busy(T('Trend map'), T('Loading the whole-globe map…'));
    loadGlobal(pm).then(function (d) {
      if (my !== token) return;
      loadKey = scopeKey();
      var F = {}; d.fields.forEach(function (f, i) { F[f] = i; });
      var cells = d.cells;
      var lim = percentile(cells.map(function (c) { return Math.abs(c[F.ratePerDecade]); }), 0.95) || 1;
      var list = cells.map(function (c) {
        var t = Math.max(-1, Math.min(1, c[F.ratePerDecade] / lim));
        return { lon0: c[F.lon0], lon1: c[F.lon0] + d.block, lat0: c[F.lat0], lat1: c[F.lat0] + d.block,
          fill: d3.interpolateRdBu(0.5 - t / 2), opacity: 0.82, dot: !!c[F.significant] };
      });
      TD.globe.setCellStyle(CELLS.mode, CELLS.alpha);
      TD.globe.setCells(list);
      TD.globe.setMarks(null);
      var up = 0, dn = 0;
      cells.forEach(function (c) { if (c[F.significant]) { if (c[F.ratePerDecade] > 0) up++; else if (c[F.ratePerDecade] < 0) dn++; } });
      var s = TD.state;
      var html = '<div class="lp-head"><strong>' + esc(T('Trend map')) + '</strong><span>' + esc(TD.vname(vr)) + ', ' + d.start + '–' + d.end + '</span></div>';
      html += scopeCtl() + cellCtl();
      html += '<div class="lp-scale"><span>' + esc(TD.withUnit(TD.signed(-lim, 2), vr.unit)) + '</span><i class="lp-ramp lp-ramp-div"></i><span>' +
        esc(TD.withUnit(TD.signed(lim, 2), vr.unit)) + '</span></div>';
      html += '<p class="lp-key"><span class="lp-dot"></span>' + esc(T('Dot: significant after correcting for testing many cells at once (Benjamini–Hochberg false discovery rate, 5%). Red: going up, blue: going down, per decade.')) + '</p>';
      html += '<p class="lp-note">' + esc(T('{s} of {n} areas of {b}° × {b}° show a significant trend: {u} rising, {d} falling.',
        { s: up + dn, n: cells.length, b: d.block, u: up, d: dn })) + '</p>';
      html += '<p class="lp-note muted-light">' + esc(T('Pre-built from NASA POWER: every grid cell, yearly averages, grouped into {b}° areas and tested with the same statistics as the rest of the site. It always covers the whole year, {a}–{z}.', { b: d.block, a: d.start, z: d.end })) +
        ((s.y0 !== d.start || s.y1 !== d.end || s.month) ? ' ' + esc(T('Your chosen period or month applies to “This area” only.')) : '') + '</p>';
      html += '<p class="lp-hint">' + esc(T('Click anywhere on the globe to open that spot’s full chart.')) + '</p>';
      panel.innerHTML = html;
    }).catch(function (e) { if (my === token) fail(T('Trend map'), e.message); });
  }

  function showTrend() {
    // variables without a pre-built whole-globe map fall back to the live area
    if (SCOPE === 'globe' && globeReady()) return showGlobalTrend();
    var my = token, vr = TD.variable(TD.state.v);
    busy(T('Trend map'), T('Testing every grid cell in a {b}° box around this place…', { b: BOX }));
    TD.globe.flyTo(TD.state.lat, TD.state.lon, BOX, 1300, zoomFor());
    loadGrid().then(function (g) {
      if (my !== token) return;
      loadKey = g.key;
      var ok = g.cells.filter(function (c) { return c.stats; });
      if (!ok.length) { fail(T('Trend map'), T('There is not enough data here for this variable and period.')); return; }
      var rates = ok.map(function (c) { return c.stats.sen.slope * 10; });
      var lim = percentile(rates.map(Math.abs), 0.95) || Math.max.apply(null, rates.map(Math.abs)) || 1;
      // Each cell uses the memory-adjusted Mann-Kendall p-value, as in the main verdict.
      // Many cells are tested at once, so about 1 in 20 would pass p < 0.05 by chance alone:
      // dots use the Benjamini–Hochberg false discovery rate correction (5%) across all cells.
      var pass = TD.S.fdr(ok.map(function (c) { return c.stats.mk.pAdj; }), 0.05);
      ok.forEach(function (c, i) { c.fdr = pass[i]; });
      var rawSig = ok.filter(function (c) { return c.stats.mk.pAdj < 0.05; }).length;
      var list = ok.map(function (c) {
        var b = cellBounds(c), r = c.stats.sen.slope * 10, t = Math.max(-1, Math.min(1, r / lim));
        b.fill = d3.interpolateRdBu(0.5 - t / 2);
        b.opacity = 0.82;
        b.dot = c.fdr;
        return b;
      });
      TD.globe.setCellStyle(CELLS.mode, CELLS.alpha);
      TD.globe.setCells(list);

      var up = ok.filter(function (c) { return c.fdr && c.stats.sen.slope > 0; });
      var dn = ok.filter(function (c) { return c.fdr && c.stats.sen.slope < 0; });
      var html = '<div class="lp-head"><strong>' + esc(T('Trend map')) + '</strong><span>' + esc(TD.vname(vr)) + ', ' +
        TD.state.y0 + '–' + TD.state.y1 + (TD.state.month ? ', ' + esc(T(TD.MONTHS[TD.state.month])) : '') + '</span></div>';
      html += scopeCtl() + boxCtl() + cellCtl();
      if (SCOPE === 'globe') html += '<p class="lp-note muted-light">' + esc(T('The whole-globe map is ready for air temperature and rain, so this variable shows the area around the place.')) + '</p>';
      html += '<div class="lp-scale"><span>' + esc(TD.withUnit(TD.signed(-lim, 2), vr.unit)) + '</span><i class="lp-ramp lp-ramp-div"></i><span>' +
        esc(TD.withUnit(TD.signed(lim, 2), vr.unit)) + '</span></div>';
      html += '<p class="lp-key"><span class="lp-dot"></span>' + esc(T('Dot: significant after correcting for testing many cells at once (Benjamini–Hochberg false discovery rate, 5%). Red: going up, blue: going down, per decade.')) + '</p>';
      html += '<p class="lp-note">' + esc(T('{s} of {n} grid cells show a significant trend: {u} rising, {d} falling.',
        { s: up.length + dn.length, n: ok.length, u: up.length, d: dn.length })) + ' ' +
        esc(T('{r} pass p < 0.05 on their own; the correction keeps {s}.', { r: rawSig, s: up.length + dn.length })) + '</p>';

      // Opposite-trend finder
      var marks = [];
      if (up.length >= 3 && dn.length >= 3) {
        var cen = function (arr) {
          return { lat: TD.S.mean(arr.map(function (c) { return c.lat; })), lon: TD.S.mean(arr.map(function (c) { return c.lon; })) };
        };
        var cu = cen(up), cd = cen(dn);
        var whereU = compass(cu.lat - g.lat, cu.lon - g.lon), whereD = compass(cd.lat - g.lat, cd.lon - g.lon);
        html += '<div class="lp-opp"><strong>' + esc(T('Opposite trends found')) + '</strong><p>' +
          esc(T('{name} is rising in the {a} of this area but falling in the {b}. Same variable, same years, opposite directions.',
            { name: TD.capFirst(TD.vname(vr).toLowerCase()), a: whereU, b: whereD })) + '</p>' +
          '<button type="button" class="lp-btn" id="lp-opp-go">' + esc(T('Compare these two spots')) + '</button></div>';
        marks = [{ lon: cu.lon, lat: cu.lat, glyph: '↑', text: T('Rising'), cls: 'up' }, { lon: cd.lon, lat: cd.lat, glyph: '↓', text: T('Falling'), cls: 'down' }];
        panel.dataset.opp = JSON.stringify([cu, cd]);
      } else {
        html += '<p class="lp-note muted-light">' + esc(up.length + dn.length
          ? T('No opposite trends here: the significant cells all move the same way. Try rain or soil wetness, which often split.')
          : T('No cell has a significant trend. Try a longer period or another variable.')) + '</p>';
      }
      html += '<p class="lp-hint">' + esc(T('Click any cell to open its full chart.')) + '</p>';
      panel.innerHTML = html;
      TD.globe.setMarks(marks);
    }).catch(function (e) { if (my === token) fail(T('Trend map'), e.message); });
  }

  // ---- timelapse ---------------------------------------------------------------

  // Every block's average for every month, pre-built (see tools/build_global_trends.mjs)
  var monthlyCache = {};
  function loadGlobalMonthly(pm) {
    if (!monthlyCache[pm]) {
      var get = function (url, how) {
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error(T('The whole-globe map could not be loaded.'));
          return r[how]();
        });
      };
      monthlyCache[pm] = Promise.all([get('data/global/' + pm + '_monthly.json', 'json'), get('data/global/' + pm + '_monthly.bin', 'arrayBuffer')])
        .then(function (res) {
          var h = res[0], a = new Int16Array(res[1]), cells = [];
          for (var row = 0; row < h.nlat; row++) for (var col = 0; col < h.nlon; col++) {
            var base = (row * h.nlon + col) * h.months, any = false;
            for (var i = 0; i < h.months && !any; i++) any = a[base + i] !== h.missing;
            if (!any) continue;
            var lat0 = -90 + row * h.block, lon0 = -180 + col * h.block;
            cells.push({ lat0: lat0, lat1: lat0 + h.block, lon0: lon0, lon1: lon0 + h.block, base: base });
          }
          return { h: h, a: a, cells: cells };
        });
      monthlyCache[pm].catch(function () { delete monthlyCache[pm]; });
    }
    return monthlyCache[pm];
  }

  /**
   * What the timelapse plays: the whole globe (pre-built 5° areas) or the live box
   * around the place. Either way: cell outlines, and get(j, 'YYYYMM') = value or NaN.
   */
  function lapseSource() {
    var vr = TD.variable(TD.state.v), pm = TD.prm(vr);
    if (SCOPE === 'globe' && globeReady()) {
      return loadGlobalMonthly(pm).then(function (gm) {
        var h = gm.h;
        return { key: scopeKey(), vr: vr, globe: true, cells: gm.cells,
          get: function (j, k) {
            var mi = (+k.slice(0, 4) - h.start) * 12 + (+k.slice(4) - 1);
            if (mi < 0 || mi >= h.months) return NaN;
            var v = gm.a[gm.cells[j].base + mi];
            return v === h.missing ? NaN : v / h.scale;
          } };
      });
    }
    return loadGrid().then(function (g) {
      return { key: g.key, vr: g.vr, globe: false, cells: g.cells.map(function (c) { return cellBounds(c); }),
        get: function (j, k) {
          var v = g.cells[j].table[k];
          return v === undefined || v === null || v < -900 ? NaN : v;
        } };
    });
  }

  function showLapse(startFrame) {
    var my = token, wholeGlobe = SCOPE === 'globe' && globeReady();
    busy(T('Timelapse'), wholeGlobe ? T('Loading every month for the whole globe…') : T('Loading every month in a {b}° box around this place…', { b: BOX }));
    if (wholeGlobe) TD.globe.flyTo(TD.state.lat, TD.state.lon, 180, 1300, 1);
    else TD.globe.flyTo(TD.state.lat, TD.state.lon, BOX, 1300, zoomFor());
    lapseSource().then(function (src) {
      if (my !== token) return;
      loadKey = src.key;
      var s = TD.state, frames = [], n = src.cells.length, j;
      var keep = TD.partMonths(s.month);
      for (var y = s.y0; y <= s.y1; y++) for (var m = 1; m <= 12; m++) {
        if (keep.indexOf(m) < 0) continue;
        frames.push(y + (m < 10 ? '0' : '') + m);
      }
      // each cell's normal for every calendar month
      var normal = [];
      for (j = 0; j < n; j++) {
        var sum = {}, cnt = {};
        frames.forEach(function (k) {
          var v = src.get(j, k); if (isNaN(v)) return;
          var mm = k.slice(4); sum[mm] = (sum[mm] || 0) + v; cnt[mm] = (cnt[mm] || 0) + 1;
        });
        var nm = {};
        for (var mm in sum) nm[mm] = sum[mm] / cnt[mm];
        normal.push(nm);
      }
      var raw = [], anom = [];
      for (var i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 120))) {
        for (j = 0; j < n; j++) {
          var v = src.get(j, frames[i]);
          if (isNaN(v)) continue;
          raw.push(v); anom.push(Math.abs(v - normal[j][frames[i].slice(4)]));
        }
      }
      var rLo = percentile(raw, 0.02), rHi = percentile(raw, 0.98), aLim = percentile(anom, 0.97) || 1;
      var vr = src.vr, wet = vr.topic === 'water' || vr.topic === 'soil';
      var seq = wet ? d3.interpolateYlGnBu : (vr.topic === 'heat' ? function (t) { return d3.interpolateRdYlBu(1 - t); } : d3.interpolateViridis);

      TD.globe.setCellStyle(CELLS.mode, CELLS.alpha);
      TD.globe.setCells(src.cells.map(function (c) {
        return { lon0: c.lon0, lon1: c.lon1, lat0: c.lat0, lat1: c.lat1, fill: 'transparent', opacity: 0.85 };
      }));

      function paint(i) {
        lapse.i = i;
        var k = frames[i], mm = k.slice(4);
        TD.globe.recolorCells(function (b, j) {
          var v = src.get(j, k);
          if (isNaN(v)) return 'transparent';
          if (lapse.mode === 'anom') {
            var t = Math.max(-1, Math.min(1, (v - normal[j][mm]) / aLim));
            return d3.interpolateRdBu(0.5 - t / 2);
          }
          return seq(Math.max(0, Math.min(1, (v - rLo) / ((rHi - rLo) || 1))));
        });
        var lab = $('lp-when'), sl = $('lp-slider');
        if (lab) lab.textContent = monthLabel(k);
        if (sl && +sl.value !== i) sl.value = i;
      }
      function legend() {
        var u = vr.unit;
        return lapse.mode === 'anom'
          ? '<div class="lp-scale"><span>' + esc(TD.withUnit(TD.signed(-aLim, 2), u)) + '</span><i class="lp-ramp lp-ramp-div"></i><span>' + esc(TD.withUnit(TD.signed(aLim, 2), u)) + '</span></div>' +
            '<p class="lp-key">' + esc(T('Colour shows how unusual each month was for that spot: red above its normal, blue below.')) + '</p>'
          : '<div class="lp-scale"><span>' + esc(TD.withUnit(rLo.toFixed(vr.dp), u)) + '</span><i class="lp-ramp ' + (wet ? 'lp-ramp-wet' : vr.topic === 'heat' ? 'lp-ramp-heat' : 'lp-ramp-seq') + '"></i><span>' +
            esc(TD.withUnit(rHi.toFixed(vr.dp), u)) + '</span></div>';
      }
      function draw() {
        panel.innerHTML = '<div class="lp-head"><strong>' + esc(T('Timelapse')) + '</strong><span>' + esc(TD.vname(vr)) + '</span></div>' +
          scopeCtl() + (src.globe ? '' : boxCtl()) + cellCtl() +
          '<div class="lp-player"><button type="button" class="lp-play" id="lp-play" aria-label="' + esc(T('Play')) + '">' + (lapse.timer ? '❚❚' : '▶') + '</button>' +
          '<input type="range" id="lp-slider" min="0" max="' + (frames.length - 1) + '" value="' + lapse.i + '" aria-label="' + esc(T('Month')) + '">' +
          '<output id="lp-when" class="lp-when"></output></div>' +
          '<div class="lp-row"><div class="lp-seg" id="lp-mode"><button type="button" data-m="anom" aria-pressed="' + (lapse.mode === 'anom') + '">' + esc(T('Difference from normal')) + '</button>' +
          '<button type="button" data-m="raw" aria-pressed="' + (lapse.mode === 'raw') + '">' + esc(T('Monthly values')) + '</button></div>' +
          '<div class="lp-seg" id="lp-speed">' + [1, 2, 4].map(function (sp) { return '<button type="button" data-s="' + sp + '" aria-pressed="' + (lapse.speed === sp) + '">' + sp + '×</button>'; }).join('') + '</div></div>' +
          legend() +
          (src.globe ? '<p class="lp-note muted-light">' + esc(T('Whole globe: the average of every NASA POWER grid cell in each 5° area, month by month, pre-built for this site.')) + '</p>'
            : SCOPE === 'globe' ? '<p class="lp-note muted-light">' + esc(T('The whole-globe map is ready for air temperature and rain, so this variable shows the area around the place.')) + '</p>' : '');
        paint(lapse.i);
      }
      function play(on) {
        clearInterval(lapse.timer); lapse.timer = 0;
        if (on) {
          lapse.timer = setInterval(function () {
            if (my !== token) { clearInterval(lapse.timer); return; }
            paint((lapse.i + 1) % frames.length);
          }, 170 / lapse.speed);
        }
        var b = $('lp-play'); if (b) { b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', T(on ? 'Pause' : 'Play')); }
      }
      lapse.i = 0;
      if (startFrame && frames.indexOf(startFrame) >= 0) lapse.i = frames.indexOf(startFrame);
      draw();
      panel.onclick = function (e) {
        var t = e.target.closest('button'); if (!t) return;
        if (t.id === 'lp-play') play(!lapse.timer);
        else if (t.dataset.m) { lapse.mode = t.dataset.m; var on = !!lapse.timer; draw(); play(on); }
        else if (t.dataset.s) { lapse.speed = +t.dataset.s; var on2 = !!lapse.timer; draw(); play(on2); }
      };
      panel.oninput = function (e) { if (e.target.id === 'lp-slider') { play(false); paint(+e.target.value); } };
      if (!startFrame && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) play(true);
    }).catch(function (e) { if (my === token) fail(T('Timelapse'), e.message); });
  }

  // ---- rain now (NASA GPM IMERG via GIBS) ----------------------------------------

  var GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=IMERG_Precipitation_Rate_30min&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1440&HEIGHT=720&FORMAT=image/png&TRANSPARENT=true&TIME=';

  var RW = 1440, RH = 720;
  // smooth lookup in an equirectangular RGBA image (premultiplied, so rain edges fade softly)
  function rainAt(data, lon, lat) {
    var fx = (lon + 180) / 360 * RW - 0.5, fy = (90 - lat) / 180 * RH - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % RW) + RW) % RW; var x1 = (x0 + 1) % RW;
    y0 = Math.max(0, Math.min(RH - 1, y0)); var y1 = Math.min(RH - 1, y0 + 1);
    var o = [(y0 * RW + x0) * 4, (y0 * RW + x1) * 4, (y1 * RW + x0) * 4, (y1 * RW + x1) * 4];
    var w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    var r = 0, g = 0, b = 0, a = 0;
    for (var i = 0; i < 4; i++) {
      var al = data[o[i] + 3] * w[i];
      r += data[o[i]] * al; g += data[o[i] + 1] * al; b += data[o[i] + 2] * al; a += al;
    }
    if (a < 6) return null;
    return [r / a, g / a, b / a, Math.min(225, a)];
  }
  function iso(d) { return d.toISOString().slice(0, 17) + '00Z'; }
  function loadFrame(d) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = RW; c.height = RH;
        var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, RW, RH);
        var data = x.getImageData(0, 0, RW, RH).data, n = 0;
        for (var i = 3; i < data.length; i += 64) if (data[i]) n++;
        resolve({ time: d, data: data, filled: n });
      };
      img.onerror = function () { reject(new Error(T('Could not load rain images from NASA GIBS.'))); };
      img.src = GIBS + iso(d);
    });
  }

  function showRain() {
    var my = token;
    busy(T('Rain now'), T('Finding the latest NASA GPM rain image…'));
    var start = new Date(); start.setUTCSeconds(0, 0);
    start.setUTCMinutes(start.getUTCMinutes() < 30 ? 0 : 30);
    start = new Date(start.getTime() - 3.5 * 3600e3);
    var tries = 0;
    function probe(d) {
      return loadFrame(d).then(function (f) {
        if (f.filled > 20) return f;
        if (++tries > 14) throw new Error(T('No recent rain images are available right now. Try again later.'));
        return probe(new Date(d.getTime() - 1800e3));
      });
    }
    (rain.frames && rain.frames.length && Date.now() - rain.loaded < 20 * 60e3 ? Promise.resolve(rain.frames) :
      probe(start).then(function (latest) {
        if (my !== token) return null;
        panel.querySelector('.lp-busy').lastChild.textContent = T('Loading the last 12 hours…');
        var jobs = [];
        for (var h = 11; h >= 1; h--) jobs.push(loadFrame(new Date(latest.time.getTime() - h * 3600e3)).catch(function () { return null; }));
        return Promise.all(jobs).then(function (fs) {
          rain.frames = fs.filter(Boolean).concat([latest]);
          rain.loaded = Date.now();
          return rain.frames;
        });
      })
    ).then(function (frames) {
      if (!frames || my !== token) return;
      var g = TD.globe;
      function paint(i) {
        rain.i = i;
        var f = frames[i];
        g.setRaster({
          sample: function (lon, lat) { return rainAt(f.data, lon, lat); }
        });
        var t = f.time;
        var el = $('lp-when');
        if (el) el.textContent = t.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' +
          t.toISOString().slice(11, 16) + ' UTC';
        var sl = $('lp-slider'); if (sl) sl.value = i;
      }
      panel.innerHTML = '<div class="lp-head"><strong>' + esc(T('Rain now')) + '</strong><span>NASA GPM IMERG</span></div>' +
        '<div class="lp-player"><button type="button" class="lp-play" id="lp-play">❚❚</button>' +
        '<input type="range" id="lp-slider" min="0" max="' + (frames.length - 1) + '" value="' + (frames.length - 1) + '" aria-label="' + esc(T('Hour')) + '">' +
        '<output id="lp-when" class="lp-when"></output></div>' +
        '<div class="lp-scale"><span>' + esc(T('Light')) + '</span><i class="lp-ramp lp-ramp-rain"></i><span>' + esc(T('Heavy')) + '</span></div>' +
        '<p class="lp-key">' + esc(T('Satellite rain estimates for the last 12 hours, one frame per hour. Images: NASA GIBS. For viewing only, not used in the trend tests.')) + '</p>';
      function play(on) {
        clearInterval(rain.timer); rain.timer = 0;
        if (on) rain.timer = setInterval(function () { if (my !== token) { clearInterval(rain.timer); return; } paint((rain.i + 1) % frames.length); }, 650);
        $('lp-play').textContent = on ? '❚❚' : '▶';
      }
      paint(frames.length - 1);
      panel.onclick = function (e) { if (e.target.id === 'lp-play') play(!rain.timer); };
      panel.oninput = function (e) { if (e.target.id === 'lp-slider') { play(false); paint(+e.target.value); } };
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play(true); else $('lp-play').textContent = '▶';
    }).catch(function (e) { if (my === token) fail(T('Rain now'), e.message); });
  }

  // ---- wind particles -------------------------------------------------------------

  // ---- wind -----------------------------------------------------------------------
  // Streaks follow the average wind vector (MERRA-2 U10M, V10M). The colour shows the
  // average wind SPEED from NASA's own WS10M, which is the mean of the speed at every
  // hour. That differs from the speed of the average vector: winds that reverse with the
  // monsoon cancel out in the vector average but are still strong. "Change" colours each
  // cell by its WS10M trend (stats.js, same tests as everywhere), dots after the false
  // discovery rate correction.
  var wind = { data: null, key: '', mode: 'mean', timer: 0 };

  function loadWind() {
    var s = TD.state, key = gridKey();
    if (wind.data && wind.key === key) return Promise.resolve(wind.data);
    return Promise.all(['U10M', 'V10M', 'WS10M'].map(function (pm) { return TD.fetchJson(TD.urlFor(pm, s.lat, s.lon, BOX)); })).then(function (js) {
      var byPos = function (json, pm) {
        var o = {};
        (json.features || []).forEach(function (f) {
          o[f.geometry.coordinates[0].toFixed(3) + ',' + f.geometry.coordinates[1].toFixed(3)] = f.properties.parameter[pm] || {};
        });
        return o;
      };
      var U = byPos(js[0], 'U10M'), V = byPos(js[1], 'V10M'), W = byPos(js[2], 'WS10M');
      var cells = Object.keys(W).filter(function (k) { return U[k] && V[k]; }).map(function (k) {
        var p = k.split(',');
        return { lon: +p[0], lat: +p[1], u: U[k], v: V[k], ws: W[k] };
      });
      if (!cells.length) throw new Error(T('NASA POWER returned no grid cells for this area.'));
      var uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }).sort(function (x, y) { return x - y; }); };
      var lons = uniq(cells.map(function (c) { return c.lon; })), lats = uniq(cells.map(function (c) { return c.lat; }));
      wind.key = key;
      wind.data = { cells: cells, lons: lons, lats: lats,
        dlon: lons.length > 1 ? lons[1] - lons[0] : 0.625, dlat: lats.length > 1 ? lats[1] - lats[0] : 0.5 };
      return wind.data;
    });
  }

  /** Mean of a monthly table over the chosen years, for one calendar month (0 = every month). */
  function monthMean(table, y0, y1, month) {
    var sum = 0, n = 0;
    for (var k in table) {
      var y = +k.slice(0, 4), m = +k.slice(4, 6), v = table[k];
      if (m < 1 || m > 12 || y < y0 || y > y1 || (month && m !== month) || v === null || v < -900) continue;
      sum += v; n++;
    }
    return n ? sum / n : null;
  }

  function monsoonNote(lat, lon, m) {
    if (!(lat > -6 && lat < 12 && lon > 94 && lon < 122) || !m) return '';
    if (m === 11 || m === 12 || m <= 3) return T('Northeast monsoon (November to March): winds blow from the north-east across the South China Sea and bring heavy rain to the east coast.');
    if (m >= 5 && m <= 9) return T('Southwest monsoon (May to September): winds blow from the south-west, and the west coast is drier.');
    return T('Inter-monsoon month: light, changeable winds and afternoon thunderstorms.');
  }

  function showWind() {
    var my = token, s = TD.state;
    clearInterval(wind.timer); wind.timer = 0;
    // a season shows its middle month
    if (windMonth === null) windMonth = s.month > 12 ? { 13: 7, 14: 10, 15: 1, 16: 4 }[s.month] : s.month;
    busy(T('Wind'), T('Loading 10 m wind for a {b}° box around this place…', { b: BOX }));
    TD.globe.flyTo(s.lat, s.lon, BOX, 1300, zoomFor());
    loadWind().then(function (d) {
      if (my !== token) return;
      loadKey = gridKey();
      TD.globe.setCellStyle(CELLS.mode, CELLS.alpha);

      // trend of the wind speed in every cell, for the chosen month (or the whole year)
      function trends(month) {
        var out = d.cells.map(function (c) {
          var ser = TD.yearlySeries(c.ws, s.y0, s.y1, month);
          return ser.years.length >= TD.MIN_YEARS ? TD.S.analyze(ser.years, ser.values) : null;
        });
        var ok = out.filter(Boolean);
        var pass = TD.S.fdr(ok.map(function (a) { return a.mk.pAdj; }), 0.05), i = 0;
        out.forEach(function (a) { if (a) a.fdr = pass[i++]; });
        return out;
      }

      function render() {
        var m = windMonth || 0;
        var vecs = d.cells.map(function (c) {
          var u = monthMean(c.u, s.y0, s.y1, m), v = monthMean(c.v, s.y0, s.y1, m);
          return u === null || v === null ? null : [u, v];
        });
        var speeds = d.cells.map(function (c) { return monthMean(c.ws, s.y0, s.y1, m); });
        var pts = {};
        d.cells.forEach(function (c, i) { if (vecs[i]) pts[c.lon.toFixed(3) + ',' + c.lat.toFixed(3)] = vecs[i]; });
        var get = function (i, j) { return pts[d.lons[i].toFixed(3) + ',' + d.lats[j].toFixed(3)]; };
        var idx = function (arr, x) {
          for (var i = 0; i < arr.length - 1; i++) if (x <= arr[i + 1]) return i;
          return Math.max(0, arr.length - 2);
        };
        TD.globe.setField({
          bounds: { lonMin: d.lons[0], lonMax: d.lons[d.lons.length - 1], latMin: d.lats[0], latMax: d.lats[d.lats.length - 1] },
          count: 1100,
          speed: 0.0045 * BOX / 10,
          sample: function (lon, lat) {
            var i = idx(d.lons, lon), j = idx(d.lats, lat);
            var a = get(i, j), c = get(i + 1, j), e = get(i, j + 1), f = get(i + 1, j + 1);
            if (!a || !c || !e || !f) return a || null;
            var tx = (lon - d.lons[i]) / (d.lons[i + 1] - d.lons[i]), ty = (lat - d.lats[j]) / (d.lats[j + 1] - d.lats[j]);
            return [0, 1].map(function (q) {
              return (a[q] * (1 - tx) + c[q] * tx) * (1 - ty) + (e[q] * (1 - tx) + f[q] * tx) * ty;
            });
          }
        });

        var bounds = function (c) {
          return { lon0: c.lon - d.dlon / 2, lon1: c.lon + d.dlon / 2, lat0: c.lat - d.dlat / 2, lat1: c.lat + d.dlat / 2 };
        };
        var html = '<div class="lp-head"><strong>' + esc(T('Wind')) + '</strong><span>' + esc(T('At 10 m')) + ', ' + s.y0 + '–' + s.y1 + '</span></div>' +
          boxCtl() +
          '<div class="lp-seg lp-scope" id="lp-wmode"><button type="button" data-wmode="mean" aria-pressed="' + (wind.mode === 'mean') + '">' + esc(T('Average wind')) + '</button>' +
          '<button type="button" data-wmode="change" aria-pressed="' + (wind.mode === 'change') + '">' + esc(T('Change since {y}', { y: s.y0 })) + '</button></div>' +
          '<div class="lp-player"><button type="button" class="lp-play" id="lp-wplay" aria-label="' + esc(T(wind.timer ? 'Pause' : 'Play')) + '">' + (wind.timer ? '❚❚' : '▶') + '</button>' +
          '<input type="range" id="lp-wslider" min="0" max="12" value="' + m + '" aria-label="' + esc(T('Month')) + '">' +
          '<output class="lp-when">' + esc(m ? T(TD.MONTHS[m]) : T('Whole year')) + '</output></div>';

        var ok = speeds.filter(function (v) { return v !== null; });
        if (wind.mode === 'mean') {
          var lo = percentile(ok, 0.02), hi = percentile(ok, 0.98);
          var list = [];
          d.cells.forEach(function (c, i) {
            if (speeds[i] === null) return;
            var b = bounds(c), t = Math.max(0, Math.min(1, (speeds[i] - lo) / ((hi - lo) || 1)));
            b.fill = d3.interpolateYlGnBu(0.15 + 0.85 * t); b.opacity = 0.7; b.value = speeds[i];
            list.push(b);
          });
          TD.globe.setCells(list);
          // how much of the speed survives in the average direction (1 = always the same way)
          var steady = d.cells.map(function (c, i) {
            return vecs[i] && speeds[i] ? Math.sqrt(vecs[i][0] * vecs[i][0] + vecs[i][1] * vecs[i][1]) / speeds[i] : null;
          }).filter(function (v) { return v !== null; });
          html += '<div class="lp-scale"><span>' + esc(TD.withUnit(lo.toFixed(1), 'm/s')) + '</span><i class="lp-ramp lp-ramp-wet"></i><span>' +
            esc(TD.withUnit(hi.toFixed(1), 'm/s')) + '</span></div>' +
            '<p class="lp-key">' + esc(T('Colour: average wind speed (NASA WS10M). Streaks follow the average wind direction (U10M, V10M).')) + '</p>' +
            '<p class="lp-note">' + esc(T('Average speed in this box: {s} m/s. On average {p}% of that blows in one steady direction; the rest changes direction and cancels out.',
              { s: TD.S.mean(ok).toFixed(1), p: Math.round(100 * TD.S.mean(steady)) })) + '</p>';
        } else {
          var tr = trends(m), done = tr.filter(Boolean);
          var rates = done.map(function (a) { return a.slopePerDecade; });
          var lim = percentile(rates.map(Math.abs), 0.95) || 0.01;
          var list2 = [];
          d.cells.forEach(function (c, i) {
            if (!tr[i]) return;
            var b = bounds(c), t = Math.max(-1, Math.min(1, tr[i].slopePerDecade / lim));
            b.fill = d3.interpolateRdBu(0.5 - t / 2); b.opacity = 0.82; b.dot = tr[i].fdr; b.value = tr[i].slopePerDecade;
            list2.push(b);
          });
          TD.globe.setCells(list2);
          var up = done.filter(function (a) { return a.fdr && a.slopePerDecade > 0; }).length;
          var dn = done.filter(function (a) { return a.fdr && a.slopePerDecade < 0; }).length;
          html += '<div class="lp-scale"><span>' + esc(TD.withUnit(TD.signed(-lim, 2), 'm/s')) + '</span><i class="lp-ramp lp-ramp-div"></i><span>' +
            esc(TD.withUnit(TD.signed(lim, 2), 'm/s')) + '</span></div>' +
            '<p class="lp-key"><span class="lp-dot"></span>' + esc(T('Red: windier, blue: calmer, per decade (NASA WS10M). Dot: significant after allowing for year-to-year memory and testing many cells at once (false discovery rate 5%).')) + '</p>' +
            '<p class="lp-note">' + esc(T('{s} of {n} grid cells show a significant change in wind speed: {u} windier, {d} calmer. Average change: {r} per decade.',
              { s: up + dn, n: done.length, u: up, d: dn, r: TD.withUnit(TD.signed(TD.S.mean(rates), 2), 'm/s') })) + '</p>';
        }
        var note = monsoonNote(s.lat, s.lon, m);
        if (note) html += '<p class="lp-note">' + esc(note) + '</p>';
        html += cellCtl();
        panel.innerHTML = html;
      }

      function play(on) {
        clearInterval(wind.timer); wind.timer = 0;
        if (on) wind.timer = setInterval(function () {
          if (my !== token || active !== 'wind') { clearInterval(wind.timer); wind.timer = 0; return; }
          windMonth = windMonth % 12 + 1; render();
        }, 2500);   // one month every 2.5 s, time to see the streaks settle
        var b = $('lp-wplay'); if (b) { b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', T(on ? 'Pause' : 'Play')); }
      }

      render();
      panel.onclick = function (e) {
        var t = e.target.closest('button'); if (!t) return;
        if (t.id === 'lp-wplay') {
          var on = !wind.timer;
          if (on && !windMonth) { windMonth = 1; render(); }   // play goes month by month
          play(on);
        }
        else if (t.dataset.wmode) { wind.mode = t.dataset.wmode; render(); }
      };
      panel.oninput = function (e) {
        if (e.target.id !== 'lp-wslider') return;
        play(false); windMonth = +e.target.value; render();
      };
    }).catch(function (e) { if (my === token) fail(T('Wind'), e.message); });
  }

  // ---- wiring ----------------------------------------------------------------------

  function init() {
    TD = window.TD;
    panel = $('layer-panel');
    if (!TD || !panel) return;
    $('layers').addEventListener('click', function (e) {
      var b = e.target.closest('[data-layer]');
      if (!b) return;
      var id = b.getAttribute('data-layer');
      setLayer(id === active ? '' : id);
    });
    panel.addEventListener('click', function (e) {
      if (e.target.id !== 'lp-opp-go') return;
      var pts = JSON.parse(panel.dataset.opp || '[]');
      if (pts.length !== 2) return;
      TD.apply({ lat: pts[0].lat, lon: pts[0].lon, size: 0, keepYears: true, keepMonth: true,
        compare: 'pt:' + pts[1].lat.toFixed(2) + ',' + pts[1].lon.toFixed(2) });
    }, true);
    // Trend map area: this area or the whole globe
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-scope]');
      if (!b || b.getAttribute('data-scope') === SCOPE) return;
      SCOPE = b.getAttribute('data-scope');
      try { localStorage.setItem('td-mapscope', SCOPE); } catch (err) { /* private mode */ }
      setLayer(active);
    });
    // Grid look: crisp cells or smooth, and opacity. Redraws only; nothing is reloaded.
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cm]');
      if (!b) return;
      CELLS.mode = b.getAttribute('data-cm');
      try { localStorage.setItem('td-cellmode', CELLS.mode); } catch (err) { /* private mode */ }
      Array.prototype.forEach.call(panel.querySelectorAll('[data-cm]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      TD.globe.setCellStyle(CELLS.mode);
    });
    panel.addEventListener('input', function (e) {
      if (e.target.id !== 'lp-alpha') return;
      CELLS.alpha = +e.target.value / 100;
      try { localStorage.setItem('td-cellalpha', String(CELLS.alpha)); } catch (err) { /* private mode */ }
      TD.globe.setCellStyle(null, CELLS.alpha);
    });
    // Map-area slider (trend map, timelapse, wind): label follows the thumb, reload on release
    panel.addEventListener('input', function (e) {
      if (e.target.id !== 'lp-box') return;
      var out = $('lp-box-out'); if (out) out.textContent = boxLabel(+e.target.value);
    });
    panel.addEventListener('change', function (e) {
      if (e.target.id !== 'lp-box') return;
      var b = Math.max(BOX_MIN, Math.min(BOX_MAX, parseInt(e.target.value, 10) || BOX));
      if (b === BOX) return;
      BOX = b;
      try { localStorage.setItem('td-mapbox', String(BOX)); } catch (err) { /* private mode */ }
      if (active) setLayer(active, { frame: active === 'lapse' ? lapse.i : undefined });
    });
    // When the case changes, refresh map layers that depend on it.
    document.addEventListener('td:result', function () {
      var key = active === 'trend' || active === 'lapse' ? scopeKey() : gridKey();
      if ((active === 'trend' || active === 'lapse' || active === 'wind') && loadKey && loadKey !== key) setLayer(active);
    });
    document.addEventListener('td:lang', function () { if (active) setLayer(active); });
  }

  window.TDMap = { setLayer: function (id, opts) { setLayer(id, opts); }, get active() { return active; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
