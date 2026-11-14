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
  function boxLabel(b) {
    // north-south is always about 111 km a degree; east-west shrinks toward the poles
    var ns = Math.round(b * 111 / 10) * 10, lat = TD.state ? Math.abs(TD.state.lat) : 0;
    var ew = Math.round(b * 111 * Math.cos(Math.min(89, lat) * Math.PI / 180) / 10) * 10;
    return b + '° × ' + b + '° (' + (ew > ns * 0.85 ? T('about {km} km', { km: ns })
      : T('about {w} × {h} km', { w: Math.max(10, ew), h: ns })) + ')';
  }
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
  var rain = { timer: 0, i: 0, frames: null, speed: 1 };
  var windMonth = null, windStash = null;

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
    clearInterval(lapse.timer); clearInterval(rain.timer); clearInterval(world.timer); world.timer = 0;
    clearInterval(wind.timer); wind.timer = 0;
    g.setCells(null); g.setMarks(null); g.setRaster(null); g.setField(null);
    panel.onclick = null; panel.oninput = null;     // handlers of the previous layer's panel
    // Wind always opens as Ryan designed it (whole 10° box, crisp cells, 75% opacity),
    // whatever was chosen on the trend map; the trend map gets its own choices back after.
    var next = id || '';
    if (next === 'wind' && active !== 'wind') {
      windStash = { box: BOX, mode: CELLS.mode, alpha: CELLS.alpha };
      BOX = BOX_MAX; CELLS.mode = 'crisp'; CELLS.alpha = 0.75;
    } else if (next !== 'wind' && active === 'wind' && windStash) {
      BOX = windStash.box; CELLS.mode = windStash.mode; CELLS.alpha = windStash.alpha;
      windStash = null;
    }
    active = next;
    loadKey = '';
    Array.prototype.forEach.call(document.querySelectorAll('#layers button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-layer') === active ? 'true' : 'false');
    });
    document.querySelector('.stage').classList.toggle('layer-on', !!active);
    panel.classList.toggle('is-rain', active === 'rain');
    panel.hidden = !active;
    if (!active) { panel.innerHTML = ''; g.render(); return; }
    g.spin(false);
    g.render();
    if (active === 'trend') showTrend();
    else if (active === 'lapse') showLapse(opts.frame);
    else if (active === 'rain') showRain();
    else if (active === 'wind') { if (opts.month !== undefined) windMonth = opts.month; showWind(); }
    else if (active === 'world') showWorld();
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
        if (TD.isOceanFill(pm, table)) return { lon: lon, lat: lat, table: {}, stats: null, ocean: true };
        var ser = TD.yearlySeries(table, s.y0, s.y1, s.month);
        var st = ser.years.length >= TD.MIN_YEARS ? TD.S.analyze(ser.years, ser.values) : null;
        return { lon: lon, lat: lat, table: table, stats: st, n: ser.years.length };
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
      if (!ok.length) {
        var land = g.cells.filter(function (c) { return !c.ocean; });
        var most = Math.max.apply(null, land.map(function (c) { return c.n || 0; }).concat(0));
        fail(T('Trend map'), !land.length
          ? T('{what} is only measured on land with soil, and this whole box is open ocean or ice sheet. Choose a place on land or another variable.', { what: TD.capFirst(TD.vname(vr).toLowerCase()) })
          : most
            ? T('Only {n} usable years in {a}–{b}. Each grid cell needs at least {min} years for a trend test. Choose a longer period.', { n: most, a: TD.state.y0, b: TD.state.y1, min: TD.MIN_YEARS })
            : T('There is not enough data here for this variable and period.'));
        return;
      }
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
      // any temperature (including sea surface temperature, filed under Water) uses the heat colours
      var vr = src.vr, hot = vr.topic === 'heat' || vr.unit === '°C', wet = !hot && (vr.topic === 'water' || vr.topic === 'soil');
      var seq = wet ? d3.interpolateYlGnBu : (hot ? function (t) { return d3.interpolateRdYlBu(1 - t); } : d3.interpolateViridis);

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
          : '<div class="lp-scale"><span>' + esc(TD.withUnit(rLo.toFixed(vr.dp), u)) + '</span><i class="lp-ramp ' + (wet ? 'lp-ramp-wet' : hot ? 'lp-ramp-heat' : 'lp-ramp-seq') + '"></i><span>' +
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

  var RW = 3600, RH = 1800; // Match the 0.1° IMERG grid.
  var RAIN_FRAME_MS = 800;
  var GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=IMERG_Precipitation_Rate_30min&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=' + RW + '&HEIGHT=' + RH +
    '&FORMAT=image/png&TRANSPARENT=true&TIME=';

  // Store color indices for these palette-based images to keep the 12-frame cache small.
  function packRain(data) {
    var rgba = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
    var palette = new Uint32Array(256);
    var indices = new Uint8Array(rgba.length);
    var byColor = new Map([[0, 0]]);
    for (var i = 0; i < rgba.length; i++) {
      if (data[i * 4 + 3] < 6) continue;
      var color = rgba[i], index = byColor.get(color);
      if (index === undefined) {
        index = byColor.size;
        if (index === palette.length) return { pixels: data, palette: null };
        palette[index] = color;
        byColor.set(color, index);
      }
      indices[i] = index;
    }
    return { pixels: indices, palette: new Uint8Array(palette.buffer) };
  }

  // Use the source pixel under the cursor to keep adjoining rain cells distinct.
  function rainAt(frame, lon, lat) {
    var x = Math.floor((lon + 180) * RW / 360);
    var y = Math.max(0, Math.min(RH - 1, Math.floor((90 - lat) * RH / 180)));
    var pixel = y * RW + ((x % RW + RW) % RW);
    var colors = frame.palette || frame.pixels;
    var offset = (frame.palette ? frame.pixels[pixel] : pixel) * 4;
    var a = colors[offset + 3];
    if (a < 6) return null;
    return [colors[offset], colors[offset + 1], colors[offset + 2], Math.min(245, a)];
  }
  function iso(d) { return d.toISOString().slice(0, 17) + '00Z'; }
  function loadFrame(d) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = RW; c.height = RH;
          var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, RW, RH);
          var data = x.getImageData(0, 0, RW, RH).data, n = 0;
          for (var i = 3; i < data.length; i += 64) if (data[i]) n++;
          var frame = n > 20 ? packRain(data) : { pixels: null };
          frame.width = RW;
          frame.height = RH;
          frame.time = d;
          frame.filled = n;
          resolve(frame);
        } catch (e) {
          reject(new Error(T('Could not load rain images from NASA GIBS.')));
        }
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
        if (my !== token) return null;
        if (f.filled > 20) return f;
        if (++tries > 14) throw new Error(T('No recent rain images are available right now. Try again later.'));
        return probe(new Date(d.getTime() - 1800e3));
      });
    }
    (rain.frames && rain.frames.length && Date.now() - rain.loaded < 20 * 60e3 ? Promise.resolve(rain.frames) :
      probe(start).then(function (latest) {
        if (!latest || my !== token) return null;
        panel.querySelector('.lp-busy').lastChild.textContent = T('Loading the last 12 hours…');
        // Decode at most three of the larger images at once, keeping frames in time order.
        var fs = new Array(11), next = 0;
        function loadNext() {
          if (my !== token || next >= fs.length) return;
          var i = next++;
          var time = new Date(latest.time.getTime() - (fs.length - i) * 3600e3);
          return loadFrame(time).then(function (f) { fs[i] = f; }, function () { fs[i] = null; }).then(loadNext);
        }
        return Promise.all([loadNext(), loadNext(), loadNext()]).then(function () {
          if (my !== token) return null;
          rain.frames = fs.filter(function (frame) { return frame && frame.pixels; }).concat([latest]);
          rain.loaded = Date.now();
          return rain.frames;
        });
      })
    ).then(function (frames) {
      if (!frames || my !== token) return;
      var g = TD.globe;
      var formatTime = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        weekday: 'short', hour: '2-digit', minute: '2-digit'
      });
      var canPlay = frames.length > 1;
      panel.innerHTML = '<div class="lp-head"><strong>' + esc(T('Rain now')) + '</strong><span>NASA GPM IMERG</span></div>' +
        '<div class="lp-rain-controls"><div class="lp-rain-time"><time id="lp-when"></time><span id="lp-rain-utc"></span></div>' +
        '<label class="lp-rain-speed">' + esc(T('Playback speed')) + '<select id="lp-rain-speed">' +
        [0.25, 0.5, 1, 2].map(function (speed) {
          return '<option value="' + speed + '"' + (rain.speed === speed ? ' selected' : '') + '>' + speed + '×</option>';
        }).join('') + '</select></label></div>' +
        '<div class="lp-player"><button type="button" class="lp-play" id="lp-play"></button>' +
        '<input type="range" id="lp-slider" min="0" max="' + (frames.length - 1) + '" aria-label="' + esc(T('Hour')) + '"></div>' +
        '<div class="lp-scale"><span>' + esc(T('Light')) + '</span><i class="lp-ramp lp-ramp-rain"></i><span>' + esc(T('Heavy')) + '</span></div>' +
        '<p class="lp-key">' + esc(T('Satellite rain estimates for the last 12 hours, one frame per hour. Images: NASA GIBS. For viewing only, not used in the trend tests.')) + '</p>';

      var playButton = $('lp-play'), slider = $('lp-slider'), speedSelect = $('lp-rain-speed');
      var localTime = $('lp-when'), utcTime = $('lp-rain-utc');
      playButton.disabled = slider.disabled = speedSelect.disabled = !canPlay;
      function paint(i) {
        rain.i = i;
        var f = frames[i];
        g.setRaster({
          crisp: true,
          grid: f,
          sample: function (lon, lat) { return rainAt(f, lon, lat); }
        });
        localTime.dateTime = f.time.toISOString();
        localTime.textContent = formatTime.format(f.time);
        utcTime.textContent = localTime.dateTime.slice(11, 16) + ' UTC';
        slider.value = i;
        slider.setAttribute('aria-valuetext', localTime.textContent + ' · ' + utcTime.textContent);
      }
      function play(on) {
        clearInterval(rain.timer); rain.timer = 0;
        on = on && canPlay;
        if (on) {
          rain.timer = setInterval(function () {
            paint((rain.i + 1) % frames.length);
          }, RAIN_FRAME_MS / rain.speed);
        }
        playButton.textContent = on ? '❚❚' : '▶';
        playButton.setAttribute('aria-label', T(on ? 'Pause' : 'Play'));
      }
      paint(frames.length - 1);
      panel.onclick = function (e) { if (e.target.id === 'lp-play') play(!rain.timer); };
      panel.oninput = function (e) { if (e.target.id === 'lp-slider') { play(false); paint(+e.target.value); } };
      speedSelect.addEventListener('change', function () {
        rain.speed = +speedSelect.value;
        play(Boolean(rain.timer));
      });
      play(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }).catch(function (e) { if (my === token) fail(T('Rain now'), e.message); });
  }

  // ---- whole world: NASA GIBS monthly maps, one picture per year ------------------
  // Ready-made global MERRA-2 pictures from NASA GIBS (the same model behind most of
  // the app's variables), painted on the globe. MERRA-2 itself is about 0.5° (~50 km);
  // the pictures are fetched at twice that (1440 x 720) so the blending between data
  // points is smooth, and kept compressed: only the frame on screen is unpacked.
  // For viewing only: the trend tests use NASA POWER numbers.
  // NASA's colour scales for these two layers (GIBS colormaps), as colour -> value, so a
  // picture can be turned back into numbers for the "difference from normal" view.
  // The first and last colours are open-ended ("below -53 °C", "above 18 mm/day"), so
  // those pixels have no exact value and are left out of the differences.
  var WORLD_SCALE = {
    T2M: { hex: '5e4fa23288bd348abb368dba398fb93b92b83d95b74097b6429ab5449db4479fb349a2b24ca5b14ea7af50aaae53acad55afac57b2ab5ab4aa5cb7a95ebaa861bca763bfa666c2a569c3a46cc4a46fc5a472c6a475c8a478c9a47bcaa47fcba482cda485cea488cfa48bd0a48ed1a491d3a495d4a498d5a49bd6a49ed8a4a1d9a4a4daa4a7dba4abdda4addea3b0dfa2b3e0a2b5e1a1b8e2a1bbe3a0bde4a0c0e59fc3e69fc5e79ec8e99ecbea9dcdeb9cd0ec9cd3ed9bd5ee9bd8ef9adbf09addf199e0f299e3f398e6f598e7f599e8f59be9f69deaf69febf7a0ecf7a2edf8a4eff8a6f0f9a7f1f9a9f2faabf3faadf4faaff5fbb0f7fbb2f8fcb4f9fcb6fafdb7fbfdb9fcfebbfdfebdffffbffefdbcfefcbafefab7fef9b5fef7b3fef6b0fef5aefef3acfef2a9fef0a7feefa5feeea2feeca0feeb9dfee99bfee899fee796fee594fee492fee28ffee18dfee08bfddd89fddb87fdd985fdd683fdd481fdd27ffdd07dfdcd7bfdcb79fdc977fdc776fdc474fdc272fdc070fdbd6efdbb6cfdb96afdb768fdb466fdb264fdb062fdae61fcab5ffca85efba55cfba25bfa9f5afa9c58fa9957f99656f99354f89053f88d52f88a50f7874ff7844df6814cf67e4bf67b49f57848f57547f47245f46f44f46d43f26a43f16844ef6644ee6445ec6245eb6046ea5e46e85b47e75947e55748e45549e35349e1514ae04f4ade4c4bdd4a4bdc484cda464cd9444dd7424dd6404ed53e4fd23b4ecf384dcd354d9e0142', vals: [-53.37, -53.15, -52.65, -51.65, -51.15, -51.15, -50.65, -49.65, -49.15, -49.15, -48.65, -47.65, -47.15, -47.15, -46.65, -45.65, -45.15, -45.15, -44.65, -43.65, -43.15, -43.15, -42.65, -41.65, -41.15, -41.15, -40.65, -39.65, -39.15, -39.15, -38.65, -37.65, -37.15, -37.15, -36.65, -35.65, -35.15, -35.15, -34.65, -33.65, -33.15, -33.15, -32.65, -31.65, -31.15, -31.15, -30.65, -29.65, -29.15, -29.15, -28.65, -27.65, -27.15, -27.15, -26.65, -25.65, -25.15, -25.15, -24.65, -23.65, -23.15, -23.15, -22.65, -21.65, -21.15, -21.15, -20.65, -19.65, -19.15, -19.15, -18.65, -17.65, -17.15, -17.15, -16.65, -15.65, -15.15, -15.15, -14.65, -13.65, -13.15, -13.15, -12.65, -11.65, -11.15, -11.15, -10.65, -9.65, -9.15, -9.15, -8.65, -7.65, -7.15, -7.15, -6.65, -5.65, -5.15, -5.15, -4.65, -3.65, -3.15, -3.15, -2.65, -1.65, -1.15, -1.15, -0.65, 0.35, 0.85, 0.85, 1.35, 2.35, 2.85, 2.85, 3.35, 4.35, 4.85, 4.85, 5.35, 6.35, 6.85, 6.85, 7.35, 8.35, 8.85, 8.85, 9.35, 10.35, 10.85, 10.85, 11.35, 12.35, 12.85, 12.85, 13.35, 14.35, 14.85, 14.85, 15.35, 16.35, 16.85, 16.85, 17.35, 18.35, 18.85, 18.85, 19.35, 20.35, 20.85, 20.85, 21.35, 22.35, 22.85, 22.85, 23.35, 24.35, 24.85, 24.85, 25.35, 26.35, 26.85, 26.85, 27.35, 28.35, 28.85, 28.85, 29.35, 30.35, 30.85, 30.85, 31.35, 32.35, 32.85, 32.85, 33.35, 34.35, 34.85, 34.85, 35.35, 36.35, 36.85, 36.85], unit: '°C', lim: 3 },
    PRECTOTCORR: { hex: 'f7fcfde5f5f9e4f4f8e3f4f7e2f4f7e2f3f6e1f3f6e0f3f5e0f3f5dff2f4def2f4ddf2f3ddf2f3dcf1f2dbf1f1dbf1f1daf1f0d9f0f0d8f0efd8f0efd7f0eed6efeed6efedd5efedd4efecd3eeebd3eeebd2eeead1eeead1ede9d0ede9cfede8ceede8ceece7cdece7ccece6ccece6caebe5c9eae4c7eae3c6e9e2c4e9e1c3e8e1c1e8e0c0e7dfbee6debde6ddbbe5dcbae5dcb9e4dbb7e4dab6e3d9b4e2d8b3e2d7b1e1d7b0e1d6aee0d5ade0d4abdfd3aaded2a9ded2a7ddd1a6ddd0a4dccfa3dccea1dbcda0dacd9edacc9dd9cb9bd9ca9ad8c999d8c997d7c796d6c694d6c593d5c491d4c390d4c28ed3c18dd2c08bd2bf8ad1be88d0bd87d0bb85cfba84ceb982ceb881cdb77fcdb67eccb57ccbb47bcbb379cab278c9b176c9af75c8ae73c7ad72c7ac70c6ab6fc5aa6dc5a96cc4a86ac3a769c3a667c2a566c2a464c1a263c0a162c0a061bf9e60bf9d5fbe9c5ebe9a5dbd995cbc985bbc965abb9559bb9458ba9257ba9156b99055b88e54b88d52b78c51b78b50b6894fb6884eb5874db4854cb4844bb3834ab38149b28048b27f47b17d46b07c45b07b44af7943af7842ae7741ae7640ad743fac733eab713daa703ca96f3ba86d3ba76c3aa66a39a56938a46837a36636a26535a16335a062349f61339e5f329d5e319c5c309b5b2f9a5a2f99582e98572d97552c96542b95532a945129935029924e28914d27904c268f4a258e49248d47238c46238b45228a442189432088421f87421e86411d85401c85401b843f1a833e19823d18813d17803c167f3b157f3b147e3a137d39127c38117b38107a370f79360e79360d78350c77340b76330a753309743208733107733106723005712f04702e036f2e026e2d016d2c006d2c00441b', vals: [-0.004, 0.043, 0.13, 0.216, 0.302, 0.389, 0.475, 0.562, 0.648, 0.734, 0.821, 0.907, 0.994, 1.08, 1.166, 1.253, 1.339, 1.426, 1.512, 1.598, 1.685, 1.771, 1.858, 1.944, 2.03, 2.117, 2.203, 2.29, 2.376, 2.462, 2.549, 2.635, 2.722, 2.808, 2.894, 2.981, 3.067, 3.154, 3.24, 3.326, 3.413, 3.499, 3.586, 3.672, 3.758, 3.845, 3.931, 4.018, 4.104, 4.19, 4.277, 4.363, 4.45, 4.536, 4.622, 4.709, 4.795, 4.882, 4.968, 5.054, 5.141, 5.227, 5.314, 5.4, 5.486, 5.573, 5.659, 5.746, 5.832, 5.918, 6.005, 6.091, 6.178, 6.264, 6.35, 6.437, 6.523, 6.61, 6.696, 6.782, 6.869, 6.955, 7.042, 7.128, 7.214, 7.301, 7.387, 7.474, 7.56, 7.646, 7.733, 7.819, 7.906, 7.992, 8.078, 8.165, 8.251, 8.338, 8.424, 8.51, 8.597, 8.683, 8.77, 8.856, 8.942, 9.029, 9.115, 9.202, 9.288, 9.374, 9.461, 9.547, 9.634, 9.72, 9.806, 9.893, 9.979, 10.066, 10.152, 10.238, 10.325, 10.411, 10.498, 10.584, 10.67, 10.757, 10.843, 10.93, 11.016, 11.102, 11.189, 11.275, 11.362, 11.448, 11.534, 11.621, 11.707, 11.794, 11.88, 11.966, 12.053, 12.139, 12.226, 12.312, 12.398, 12.485, 12.571, 12.658, 12.744, 12.83, 12.917, 13.003, 13.09, 13.176, 13.262, 13.349, 13.435, 13.522, 13.608, 13.694, 13.781, 13.867, 13.954, 14.04, 14.126, 14.213, 14.299, 14.386, 14.472, 14.558, 14.645, 14.731, 14.818, 14.904, 14.99, 15.077, 15.163, 15.25, 15.336, 15.422, 15.509, 15.595, 15.682, 15.768, 15.854, 15.941, 16.027, 16.114, 16.2, 16.286, 16.373, 16.459, 16.546, 16.632, 16.718, 16.805, 16.891, 16.978, 17.064, 17.15, 17.237, 17.323, 17.41, 17.496, 17.582, 17.669, 17.755, 17.842, 17.928, 18.014, 18.101, 18.144], unit: 'mm/day', lim: 3 }
  };
  var WORLD = {
    T2M: { layer: 'MERRA2_2m_Air_Temperature_Assimilated_Monthly', name: 'Air temperature', lo: '−53 °C', hi: '+37 °C',
      stops: ['#5e4fa2', '#66c2a5', '#abdda4', '#e7f599', '#fefdbc', '#fddb87', '#fba55c', '#ef6644', '#9e0142'] },
    PRECTOTCORR: { layer: 'MERRA2_Precipitation_Bias_Corrected_Monthly', name: 'Rain and snowfall', lo: '0', hi: '18+ mm/day',
      stops: ['#f7fcfd', '#d3eeeb', '#b3e2d7', '#8dd2c0', '#64c1a2', '#49b280', '#319c5c', '#19823d', '#00441b'] }
  };
  var WW = 1440, WH = 720, WORLD_FIRST = 1980, worldCanvas = null;
  var GIBS_WORLD = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326' +
    '&BBOX=-90,-180,90,180&WIDTH=' + WW + '&HEIGHT=' + WH + '&FORMAT=image/png&STYLES=';
  var world = { v: 'T2M', month: 7, key: '', frames: null, timer: 0, i: 0, mode: 'anom', anom: null };
  var AW = 720, AH = 360;            // grid for the differences: MERRA-2's own 0.5° spacing

  /** colour (r, g, b) -> value, exact for NASA's palette; NaN for the open-ended ends */
  function scaleLookup(v) {
    var sc = WORLD_SCALE[v];
    if (sc.map) return sc.map;
    var m = {}, n = sc.vals.length;
    for (var i = 0; i < n; i++) {
      var c = parseInt(sc.hex.substr(i * 6, 6), 16);
      if (m[c] === undefined) m[c] = (i === 0 || i === n - 1) ? NaN : sc.vals[i];
    }
    sc.map = m;
    return m;
  }
  /** One frame as numbers on the 0.5° grid (every second pixel of the 1440 x 720 picture). */
  function decodeFrame(img, v) {
    var c = document.createElement('canvas'); c.width = WW; c.height = WH;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);                       // 1:1, so the palette colours stay exact
    var d = x.getImageData(0, 0, WW, WH).data, map = scaleLookup(v), out = new Float32Array(AW * AH);
    for (var j = 0; j < AH; j++) {
      for (var i = 0; i < AW; i++) {
        var o = ((j * 2 + 1) * WW + i * 2 + 1) * 4, val = NaN;
        if (d[o + 3] > 200) {
          val = map[(d[o] << 16) | (d[o + 1] << 8) | d[o + 2]];
          if (val === undefined) val = NaN;      // not a palette colour: leave it out
        }
        out[j * AW + i] = val;
      }
    }
    return out;
  }
  /**
   * Differences from each spot's 1981-2010 average for the chosen month, and the
   * global mean difference per year (weighted by cos(latitude), the area of a cell).
   */
  function buildAnomalies(frames, v) {
    var vals = frames.map(function (f) { return decodeFrame(f.img, v); });
    var N = AW * AH, sum = new Float32Array(N), cnt = new Uint8Array(N), k, i;
    frames.forEach(function (f, fi) {
      if (f.year < 1981 || f.year > 2010) return;
      var a = vals[fi];
      for (k = 0; k < N; k++) if (a[k] === a[k]) { sum[k] += a[k]; cnt[k]++; }
    });
    var cosw = new Float32Array(AH);
    for (i = 0; i < AH; i++) cosw[i] = Math.cos((90 - (i + 0.5) * 180 / AH) * Math.PI / 180);
    var global = [];
    var tmp = new Float32Array(N);
    vals.forEach(function (a) {
      var s = 0, w = 0;
      for (k = 0; k < N; k++) {
        if (cnt[k] >= 20 && a[k] === a[k]) { a[k] -= sum[k] / cnt[k]; s += a[k] * cosw[(k / AW) | 0]; w += cosw[(k / AW) | 0]; }
        else a[k] = NaN;
      }
      global.push(w ? s / w : NaN);   // the global number uses the unsmoothed values
      // NASA's colour steps (~0.5 °C) leave stripes in the differences: average each cell
      // with its eight neighbours (missing ones skipped) for the map only
      for (var y = 0; y < AH; y++) {
        for (var x = 0; x < AW; x++) {
          var t = 0, c = 0;
          for (var dy = -1; dy <= 1; dy++) {
            var yy = y + dy; if (yy < 0 || yy >= AH) continue;
            for (var dx = -1; dx <= 1; dx++) {
              var v = a[yy * AW + (x + dx + AW) % AW];
              if (v === v) { t += v; c++; }
            }
          }
          tmp[y * AW + x] = a[y * AW + x] === a[y * AW + x] && c ? t / c : NaN;
        }
      }
      a.set(tmp);
    });
    return { vals: vals, global: global };
  }
  // diverging colours, precomputed: red warmer / blue cooler; green wetter / brown drier
  var ANOM_LUT = {};
  function anomLut(v) {
    if (ANOM_LUT[v]) return ANOM_LUT[v];
    var lut = [];
    for (var i = 0; i < 256; i++) {
      var t = i / 255, c = d3.rgb(v === 'PRECTOTCORR' ? d3.interpolateBrBG(t) : d3.interpolateRdBu(1 - t));
      lut.push([c.r, c.g, c.b]);
    }
    return (ANOM_LUT[v] = lut);
  }
  function anomAt(a, lut, lim, lon, lat) {
    var fx = (lon + 180) / 360 * AW - 0.5, fy = (90 - lat) / 180 * AH - 0.5;
    var x0 = Math.floor(fx), y0 = Math.max(0, Math.min(AH - 1, Math.floor(fy))), tx = fx - x0, ty = fy - y0;
    var x1 = (x0 + 1 + AW) % AW, y1 = Math.min(AH - 1, y0 + 1);
    x0 = (x0 + AW) % AW;
    var p = [a[y0 * AW + x0], a[y0 * AW + x1], a[y1 * AW + x0], a[y1 * AW + x1]];
    var w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], s = 0, ws = 0;
    for (var i = 0; i < 4; i++) if (typeof p[i] === 'number' && p[i] === p[i]) { s += p[i] * w[i]; ws += w[i]; }
    if (!(ws >= 0.5) || !isFinite(s)) return null;      // no difference here (no data, or a clipped value)
    var t = Math.max(0, Math.min(1, (s / ws / lim + 1) / 2)), c = lut[Math.round(t * 255)];
    return c ? [c[0], c[1], c[2], 225] : null;
  }

  /** Colour of the world picture at (lon, lat), blended between pixels. */
  function worldAt(data, lon, lat) {
    var fx = (lon + 180) / 360 * WW - 0.5, fy = (90 - lat) / 180 * WH - 0.5;
    var x0 = Math.floor(fx), y0 = Math.max(0, Math.min(WH - 1, Math.floor(fy))), tx = fx - x0, ty = fy - y0;
    var x1 = (x0 + 1 + WW) % WW, y1 = Math.min(WH - 1, y0 + 1);
    x0 = (x0 + WW) % WW;
    var o = [(y0 * WW + x0) * 4, (y0 * WW + x1) * 4, (y1 * WW + x0) * 4, (y1 * WW + x1) * 4];
    var w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    var r = 0, g = 0, b = 0, a = 0;
    for (var i = 0; i < 4; i++) {
      var al = data[o[i] + 3] * w[i];
      r += data[o[i]] * al; g += data[o[i] + 1] * al; b += data[o[i] + 2] * al; a += al;
    }
    if (a < 6) return null;
    return [r / a, g / a, b / a, Math.min(235, a)];
  }
  /** Pixels of one frame, unpacked only when it is shown (one shared canvas). */
  function unpack(img) {
    try {
      if (!worldCanvas) { worldCanvas = document.createElement('canvas'); worldCanvas.width = WW; worldCanvas.height = WH; }
      var x = worldCanvas.getContext('2d', { willReadFrequently: true });
      x.clearRect(0, 0, WW, WH);
      x.drawImage(img, 0, 0, WW, WH);
      return x.getImageData(0, 0, WW, WH).data;
    } catch (err) { return null; }
  }
  function worldUrl(v, year, month) {
    return GIBS_WORLD + '&LAYERS=' + WORLD[v].layer + '&TIME=' + year + '-' + (month < 10 ? '0' : '') + month + '-01';
  }
  function loadWorldFrame(v, year, month) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve({ year: year, img: img }); };
      img.onerror = function () { resolve(null); };
      img.src = worldUrl(v, year, month);
    });
  }
  function worviewUrl(v, year, month) {
    return 'https://worldview.earthdata.nasa.gov/?l=' + WORLD[v].layer + ',Coastlines_15m&t=' + year + '-' + (month < 10 ? '0' : '') + month + '-01';
  }

  function showWorld() {
    var my = token, v = world.v, month = world.month, key = v + '|' + month;
    var last = TD.LAST_YEAR, years = [];
    for (var y = WORLD_FIRST; y <= last; y++) years.push(y);
    TD.globe.flyTo(TD.state.lat, TD.state.lon, 10, 1200, 1);
    function controls() {
      return '<div class="lp-row"><div class="lp-seg" id="lp-wv">' + Object.keys(WORLD).map(function (k) {
        return '<button type="button" data-wv="' + k + '" aria-pressed="' + (k === world.v) + '">' + esc(T(WORLD[k].name)) + '</button>';
      }).join('') + '</div></div>' +
        '<div class="lp-row"><div class="lp-seg lp-months" id="lp-wmo">' + [1, 4, 7, 10].map(function (m) {
          return '<button type="button" data-wmo="' + m + '" aria-pressed="' + (m === world.month) + '">' + esc(T(TD.MONTHS[m])) + '</button>';
        }).join('') + '</div></div>';
    }
    var head = '<div class="lp-head"><strong>' + esc(T('Whole world')) + '</strong><span>NASA MERRA-2 · GIBS</span></div>';
    var done = 0;
    function progress() {
      panel.innerHTML = head + controls() + '<p class="lp-busy"><i class="spinner"></i>' +
        esc(T('Loading one NASA picture per year: {a} of {b}…', { a: done, b: years.length })) + '</p>';
    }
    var ready = world.key === key && world.frames ? Promise.resolve(world.frames) : new Promise(function (resolve) {
      world.frames = null; world.key = '';
      var out = new Array(years.length), next = 0, left = years.length;
      progress();
      function launch() {
        if (next >= years.length || my !== token) return;
        var i = next++;
        loadWorldFrame(v, years[i], month).then(function (f) {
          out[i] = f; done++; left--;
          if (my === token) { var b = panel.querySelector('.lp-busy'); if (b) b.lastChild.textContent = T('Loading one NASA picture per year: {a} of {b}…', { a: done, b: years.length }); }
          if (left === 0) resolve(out.filter(Boolean)); else launch();
        });
      }
      for (var k = 0; k < 6; k++) launch();
    });
    ready.then(function (frames) {
      if (my !== token) return;
      if (!frames.length) { fail(T('Whole world'), T('Could not load the world pictures from NASA GIBS. Try again later.')); return; }
      if (world.key !== key || !world.anom) {
        try { world.anom = buildAnomalies(frames, v); } catch (err) { world.anom = null; world.mode = 'values'; }
      }
      world.frames = frames; world.key = key;
      var g = TD.globe, info = WORLD[v], anomOn = world.mode === 'anom' && !!world.anom, lim = WORLD_SCALE[v].lim;
      var divStops = [0, 0.25, 0.5, 0.75, 1].map(function (t) { return v === 'PRECTOTCORR' ? d3.interpolateBrBG(t) : d3.interpolateRdBu(1 - t); });
      function paint(i) {
        world.i = i;
        var f = frames[i];
        if (world.mode === 'anom' && world.anom) {
          var grid = world.anom.vals[i], lut = anomLut(v), lim = WORLD_SCALE[v].lim;
          g.setRaster({ sample: function (lon, lat) { return anomAt(grid, lut, lim, lon, lat); }, coast: true, fine: true });
          var gm = world.anom.global[i], ge = $('lp-wglobal');
          if (ge) ge.textContent = isFinite(gm) ? T('Whole world: {x} {u} vs 1981–2010', { x: (gm >= 0 ? '+' : '−') + Math.abs(gm).toFixed(2), u: WORLD_SCALE[v].unit }) : '';
        } else {
          var data = unpack(f.img);
          if (!data) return;
          g.setRaster({ sample: function (lon, lat) { return worldAt(data, lon, lat); }, coast: true, fine: true });
        }
        var el = $('lp-when'); if (el) el.textContent = T(TD.MONTHS[month]) + ' ' + f.year;
        var sl = $('lp-slider'); if (sl && +sl.value !== i) sl.value = i;
        var link = $('lp-wlink'); if (link) link.href = worviewUrl(v, f.year, month);
      }
      panel.innerHTML = head + controls() +
        '<div class="lp-player"><button type="button" class="lp-play" id="lp-play">❚❚</button>' +
        '<input type="range" id="lp-slider" min="0" max="' + (frames.length - 1) + '" value="0" aria-label="' + esc(T('Year')) + '">' +
        '<output id="lp-when" class="lp-when"></output></div>' +
        '<div class="lp-row"><div class="lp-seg" id="lp-wmode"><button type="button" data-wmode="anom" aria-pressed="' + anomOn + '"' + (world.anom ? '' : ' disabled') + '>' +
          esc(T('Difference from normal')) + '</button><button type="button" data-wmode="values" aria-pressed="' + !anomOn + '">' + esc(T('Values')) + '</button></div></div>' +
        (anomOn
          ? '<p class="lp-wglobal" id="lp-wglobal"></p>' +
            '<div class="lp-scale"><span>−' + lim + ' ' + esc(WORLD_SCALE[v].unit) + '</span><i class="lp-ramp" style="background:linear-gradient(90deg,' + divStops.join(',') + ')"></i><span>+' + lim + ' ' + esc(WORLD_SCALE[v].unit) + '</span></div>' +
            '<p class="lp-key">' + esc(T(v === 'PRECTOTCORR'
              ? 'Each {month} compared with the average {month} of 1981–2010 at the same spot: green wetter, brown drier.'
              : 'Each {month} compared with the average {month} of 1981–2010 at the same spot: red warmer, blue cooler.', { month: T(TD.MONTHS[month]) })) + ' ' +
              esc(T('Worked out from NASA’s pictures, so values are rounded to NASA’s colour steps. For viewing only: the trend tests use NASA POWER numbers.')) + ' ' +
              esc(T(v === 'PRECTOTCORR' ? 'No colour: above 18 mm/day, beyond NASA’s colour scale, so the exact value is unknown.'
                : 'No colour: hotter than 37 °C or colder than −53 °C, beyond NASA’s colour scale, so the exact value is unknown.')) + '</p>'
          : '<div class="lp-scale"><span>' + esc(info.lo) + '</span><i class="lp-ramp" style="background:linear-gradient(90deg,' + info.stops.join(',') + ')"></i><span>' + esc(info.hi) + '</span></div>' +
            '<p class="lp-key">' + esc(T('One global NASA picture for every {month} since {y}. For viewing only: the trend tests use NASA POWER numbers for one place.', { month: T(TD.MONTHS[month]), y: WORLD_FIRST })) + '</p>') +
        '<p class="lp-key"><a id="lp-wlink" class="lp-link" target="_blank" rel="noopener">' + esc(T('Explore more on NASA Worldview')) + ' ↗</a></p>';
      function play(on) {
        clearInterval(world.timer); world.timer = 0;
        if (on) world.timer = setInterval(function () {
          if (my !== token) { clearInterval(world.timer); return; }
          paint((world.i + 1) % frames.length);
        }, 420);
        var b = $('lp-play'); if (b) { b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', T(on ? 'Pause' : 'Play')); }
      }
      paint(0);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play(true); else play(false);
      panel.onclick = function (e) {
        var t = e.target.closest('button');
        if (!t) return;
        if (t.id === 'lp-play') { play(!world.timer); return; }
        var nv = t.getAttribute('data-wv'), nm = t.getAttribute('data-wmo'), md = t.getAttribute('data-wmode');
        if (nv && nv !== world.v) { world.v = nv; world.anom = null; setLayer('world'); }
        else if (nm && +nm !== world.month) { world.month = +nm; world.anom = null; setLayer('world'); }
        else if (md && md !== world.mode) { world.mode = md; var at = world.i; setLayer('world'); world.i = at; }
      };
      panel.oninput = function (e) { if (e.target.id === 'lp-slider') { play(false); paint(+e.target.value); } };
    });
    // switching variable or month while loading
    panel.onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var nv = t.getAttribute('data-wv'), nm = t.getAttribute('data-wmo');
      if (nv && nv !== world.v) { world.v = nv; world.anom = null; setLayer('world'); }
      else if (nm && +nm !== world.month) { world.month = +nm; world.anom = null; setLayer('world'); }
    };
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
      try { if (active !== 'wind') localStorage.setItem('td-cellmode', CELLS.mode); } catch (err) { /* private mode */ }
      Array.prototype.forEach.call(panel.querySelectorAll('[data-cm]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      TD.globe.setCellStyle(CELLS.mode);
    });
    panel.addEventListener('input', function (e) {
      if (e.target.id !== 'lp-alpha') return;
      CELLS.alpha = +e.target.value / 100;
      try { if (active !== 'wind') localStorage.setItem('td-cellalpha', String(CELLS.alpha)); } catch (err) { /* private mode */ }
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
      try { if (active !== 'wind') localStorage.setItem('td-mapbox', String(BOX)); } catch (err) { /* private mode */ }
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
