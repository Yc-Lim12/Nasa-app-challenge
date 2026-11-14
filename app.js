/*
 * Trend Detective app: choose a variable and a region, fetch NASA data,
 * draw the time series and report whether the trend is statistically significant.
 * Data: NASA POWER monthly API (MERRA-2 reanalysis, CERES SYN1deg / GEWEX SRB).
 */
(function () {
  'use strict';

  var S = window.TDStats;
  var API = 'https://power.larc.nasa.gov/api/temporal/monthly/';
  var FIRST_YEAR = 1981;
  var LAST_YEAR = new Date().getFullYear() - 1;   // last complete calendar year
  var MIN_YEARS = 10;
  // Put the team's public repository address here to show it in the footer.
  var REPO_URL = '';
  var FILL = -900;                                // POWER uses -999 for missing
  /** Translate a UI string (English is the key) and fill {placeholders}. See i18n.js. */
  function T(str, vars) {
    var out = window.TDi18n ? window.TDi18n.tr(str) : str;
    return vars ? out.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] === undefined ? m : vars[k]; }) : out;
  }
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- catalogue -----------------------------------------------------------

  var TOPICS = [
    { id: 'heat', label: 'Heat' },
    { id: 'water', label: 'Water' },
    { id: 'soil', label: 'Soil' },
    { id: 'sky', label: 'Sky' },
    { id: 'air', label: 'Air' }
  ];

  var MERRA = 'MERRA-2 reanalysis (NASA GMAO)';
  var CERES = 'CERES SYN1deg, GEWEX SRB before 2001 (NASA LaRC)';

  var VARIABLES = [
    { id: 'T2M', topic: 'heat', name: 'Air temperature', unit: '°C', dp: 2, source: MERRA,
      def: 'How warm the air is about 2 metres above the ground, the height where weather stations measure.' },
    { id: 'T2M_MAX', topic: 'heat', name: 'Daytime high temperature', unit: '°C', dp: 2, source: MERRA,
      def: 'The hottest the air gets during the day, averaged over the month.' },
    { id: 'T2M_MIN', topic: 'heat', name: 'Night-time low temperature', unit: '°C', dp: 2, source: MERRA,
      def: 'The coolest the air gets, usually just before sunrise, averaged over the month.' },
    { id: 'TS', topic: 'heat', name: 'Ground surface temperature', unit: '°C', dp: 2, source: MERRA,
      def: 'How hot the surface itself is (soil, roads, rooftops or water), not the air above it.' },
    { id: 'PRECTOTCORR', topic: 'water', name: 'Rain and snowfall', unit: 'mm/day', dp: 2, source: MERRA,
      def: 'Average precipitation per day. Rain and melted snow are counted together.' },
    { id: 'EVLAND', topic: 'water', name: 'Evaporation from land', unit: 'mm/day', dp: 2, source: MERRA,
      def: 'Water leaving the land as vapour, from soil and from plants. Blank over open ocean.' },
    { id: 'RH2M', topic: 'water', name: 'Relative humidity', unit: '%', dp: 1, source: MERRA,
      def: 'How full of water vapour the air is, compared with the most it could hold at that temperature.' },
    { id: 'TQV', topic: 'water', name: 'Water vapour above you', unit: 'kg/m²', dp: 2, source: MERRA,
      def: 'All the water vapour in the column of air above one square metre of ground.' },
    { id: 'SST', param: 'TS', topic: 'water', name: 'Sea surface temperature', unit: '°C', dp: 2, source: MERRA + ' (surface temperature over water)',
      def: 'How warm the top of the sea is. Choose a spot over open water; over land this shows the ground temperature instead.' },
    { id: 'SNODP', topic: 'water', name: 'Snow depth', unit: 'cm', dp: 2, source: MERRA,
      def: 'How deep the snow lying on the ground is.' },
    { id: 'GWETTOP', topic: 'soil', name: 'Topsoil wetness', unit: '', dp: 3, source: MERRA,
      def: 'How wet the top few centimetres of soil are, from 0 (completely dry) to 1 (completely soaked).' },
    { id: 'GWETROOT', topic: 'soil', name: 'Root-zone soil wetness', unit: '', dp: 3, source: MERRA,
      def: 'How wet the soil is down where plant roots drink, from 0 (completely dry) to 1 (completely soaked).' },
    { id: 'ALLSKY_SFC_SW_DWN', topic: 'sky', name: 'Sunlight reaching the ground', unit: 'MJ/m²/day', dp: 2, source: CERES,
      def: 'Solar energy arriving at the surface each day, after clouds and haze have taken their share.' },
    { id: 'CLOUD_AMT', topic: 'sky', name: 'Cloud cover', unit: '%', dp: 1, source: CERES,
      def: 'The share of the sky covered by cloud.' },
    { id: 'WS10M', topic: 'air', name: 'Wind speed', unit: 'm/s', dp: 2, source: MERRA,
      def: 'Average wind speed 10 metres above the ground.' },
    { id: 'TO3', topic: 'air', name: 'Ozone layer thickness', unit: 'DU', dp: 1, source: MERRA,
      def: 'Total ozone in the air column above you, in Dobson units. Ozone blocks harmful ultraviolet light.' },
    { id: 'PS', topic: 'air', name: 'Surface air pressure', unit: 'kPa', dp: 3, source: MERRA,
      def: 'The weight of all the air above, pressing on the ground. It is lower on high ground and falls when storms pass.' },
    { id: 'AOD_55', topic: 'air', name: 'Haze, smoke and dust', unit: '', dp: 3, source: CERES,
      def: 'Aerosol optical depth: how much tiny particles in the air dim the light. Higher means hazier. Starts in 2001.' }
  ];

  var PLACES = [
    { id: 'eastcoast', name: 'the east coast of Peninsular Malaysia', short: 'East coast', label: 'right', lat: 5.4, lon: 102.6, size: 2 },
    { id: 'klang', name: 'Klang Valley, Malaysia', short: 'Klang Valley', label: 'below', lat: 3.1, lon: 101.6, size: 2 },
    { id: 'penang', name: 'Penang, Malaysia', short: 'Penang', label: 'left', lat: 5.35, lon: 100.4, size: 2 },
    { id: 'delhi', name: 'Delhi, India', short: 'Delhi', lat: 28.6, lon: 77.2, size: 2 },
    { id: 'sahel', name: 'the Sahel in Niger', short: 'Sahel', lat: 14.0, lon: 8.0, size: 6 },
    { id: 'amazon', name: 'the central Amazon, Brazil', short: 'Amazon', lat: -3.5, lon: -60.0, size: 6 },
    { id: 'aral', name: 'the Aral Sea region', short: 'Aral Sea', lat: 45.0, lon: 60.0, size: 4 },
    { id: 'murray', name: 'the Murray-Darling basin, Australia', short: 'Murray-Darling', lat: -34.0, lon: 145.0, size: 6 },
    { id: 'california', name: 'the Central Valley, California', short: 'Central Valley', lat: 36.7, lon: -119.8, size: 4 },
    { id: 'utqiagvik', name: 'the Arctic coast of Alaska', short: 'Arctic Alaska', lat: 70.5, lon: -156.8, size: 4 },
    { id: 'wisconsin', name: 'Wisconsin, USA', short: 'Wisconsin', lat: 44.5, lon: -89.5, size: 4 },
    { id: 'greenland', name: 'central Greenland', short: 'Greenland', lat: 72.0, lon: -40.0, size: 6 }
  ];

  // Area to average over: one grid cell, or a box from 2° to 10° (NASA POWER's limits).
  // The slider runs 1–10, where 1 means a single grid cell.
  var SIZE_MAX = 10;
  function sizeLabel(v) {
    return v < 2 ? T('One grid cell (about 50 km)')
      : T('{b}° box (about {km} km)', { b: v, km: (Math.round(v * 111 / 10) * 10).toLocaleString() });
  }
  function showSize() { var o = $('size-out'); if (o) o.textContent = sizeLabel(state.size); }

  var MONTHS = ['Whole year', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'June to August', 'September to November', 'December to February', 'March to May'];
  // 13–16 are three-month seasons. December to February takes December from the year before.
  var SEASONS = { 13: [6, 7, 8], 14: [9, 10, 11], 15: [-12, 1, 2], 16: [3, 4, 5] };
  /** Calendar months (1–12) that belong to a choice in the "Part of the year" list. */
  function partMonths(month) {
    if (!month) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return SEASONS[month] ? SEASONS[month].map(Math.abs) : [month];
  }
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var STARTERS = [
    { q: 'Are nights getting warmer in the Klang Valley?', v: 'T2M_MIN', place: 'klang' },
    { q: 'Is the Sahel getting more rain?', v: 'PRECTOTCORR', place: 'sahel' },
    { q: 'Is the Arctic coast of Alaska warming?', v: 'T2M', place: 'utqiagvik' },
    { q: 'Is the soil drying out around the Aral Sea?', v: 'GWETROOT', place: 'aral' }
  ];

  // ---- state ---------------------------------------------------------------

  var HOME = PLACES.filter(function (p) { return p.id === 'klang'; })[0];   // the default case
  var state = {
    topic: 'heat', v: 'T2M', placeId: HOME.id, placeName: HOME.name, short: HOME.short,
    lat: HOME.lat, lon: HOME.lon, size: HOME.size,
    y0: FIRST_YEAR, y1: LAST_YEAR, month: 0, compare: ''
  };
  var view = { anom: false, smooth: false, future: false };
  var cache = {};
  var runId = 0;
  var current = null;     // last analysed result
  var compareData = null; // second place, same variable and period
  var globe = null;
  var liveTimer = null, toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function variable(id) {
    for (var i = 0; i < VARIABLES.length; i++) if (VARIABLES[i].id === id) return VARIABLES[i];
    return VARIABLES[0];
  }
  function prm(vr) { return vr.param || vr.id; }      // NASA POWER parameter behind a variable
  function vname(vr) { return T(vr.name); }
  function place(id) {
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i].id === id) return PLACES[i];
    return null;
  }

  function compareTarget() {
    var c = state.compare || '';
    if (c.indexOf('pt:') === 0) {
      var ll = c.slice(3).split(','), la = parseFloat(ll[0]), lo = parseFloat(ll[1]);
      if (isNaN(la) || isNaN(lo)) return null;
      var lab = coordLabel(la, lo);
      return { id: c, lat: la, lon: lo, short: lab, name: lab };
    }
    return place(c);
  }

  // ---- formatting ----------------------------------------------------------

  function withUnit(text, unit) {
    if (!unit) return text;
    return unit === '%' ? text + '%' : text + ' ' + unit;
  }
  function fmtValue(v, vr) { return withUnit(v.toFixed(vr.dp), vr.unit); }
  function fmtAnom(v, vr) { return withUnit((v < 0 ? '−' : '+') + Math.abs(v).toFixed(vr.dp), vr.unit); }
  function sig(v, n) {
    if (v === 0) return '0';
    var s = Number(Math.abs(v).toPrecision(n || 2));
    return s < 1e-6 ? s.toExponential(1) : String(s);
  }
  function signed(v, n) { return (v < 0 ? '−' : '+') + sig(v, n); }
  function fmtP(p) { return p < 0.001 ? '< 0.001' : p.toFixed(3); }
  function pEquals(p) { return p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3); }
  function coordLabel(lat, lon) {
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
  }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function verdictLabel(v) { return v === 'significant' ? 'Significant' : (v === 'borderline' ? 'Borderline' : 'No clear trend'); }
  function verdictClass(v) { return v === 'significant' ? 'sig' : (v === 'borderline' ? 'border' : 'none'); }
  function ratePhrase(st, vr) { return withUnit(signed(st.sen.slope * 10, 2), vr.unit) + ' per decade'; }

  // ---- data ----------------------------------------------------------------

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function box(lat, lon, size) {
    // Snap to half degrees: POWER rejects boxes that come out a hair under
    // 2 degrees wide after floating-point rounding (for example 2.10 to 4.10).
    var la0 = clamp(Math.round((lat - size / 2) * 2) / 2, -90, 90 - size);
    var lo0 = clamp(Math.round((lon - size / 2) * 2) / 2, -180, 180 - size);
    return { latMin: la0, latMax: la0 + size, lonMin: lo0, lonMax: lo0 + size };
  }

  function urlFor(params, lat, lon, size) {
    var tail = '&community=AG&start=' + FIRST_YEAR + '&end=' + LAST_YEAR + '&format=JSON';
    if (!size) {
      return API + 'point?parameters=' + params + '&longitude=' + lon.toFixed(3) +
        '&latitude=' + lat.toFixed(3) + tail;
    }
    var b = box(lat, lon, size);
    return API + 'regional?parameters=' + params +
      '&latitude-min=' + b.latMin.toFixed(2) + '&latitude-max=' + b.latMax.toFixed(2) +
      '&longitude-min=' + b.lonMin.toFixed(2) + '&longitude-max=' + b.lonMax.toFixed(2) + tail;
  }

  function fetchJson(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var msg = (j.messages && j.messages.join(' ')) || j.detail || ('NASA POWER answered with error ' + r.status + '.');
          throw new Error(typeof msg === 'string' ? msg : 'NASA POWER could not handle that request.');
        }
        cache[url] = j;
        return j;
      });
    }, function () {
      throw new Error('Could not reach NASA POWER. Check your internet connection and try again.');
    });
  }

  /**
   * Turn an API response into one monthly table {YYYYMM: value} for a parameter.
   * A regional response has one feature per grid cell: average them, weighted by
   * cos(latitude) because cells shrink towards the poles.
   */
  function monthlyTable(json, param) {
    if (json.properties) return { table: json.properties.parameter[param] || {}, cells: 1 };
    var feats = json.features || [];
    var sum = {}, wsum = {};
    feats.forEach(function (f) {
      var w = Math.cos(f.geometry.coordinates[1] * Math.PI / 180);
      var t = f.properties.parameter[param] || {};
      for (var k in t) {
        var v = t[k];
        if (v === null || v < FILL) continue;
        sum[k] = (sum[k] || 0) + v * w;
        wsum[k] = (wsum[k] || 0) + w;
      }
    });
    var out = {};
    for (var k in sum) out[k] = sum[k] / wsum[k];
    return { table: out, cells: feats.length };
  }

  /**
   * One value per year: the mean of all twelve months, one chosen month, or a
   * three-month season (a negative month means that month of the year before).
   */
  function yearlySeries(table, y0, y1, month) {
    var years = [], values = [];
    var ms = !month ? partMonths(0) : SEASONS[month] || [month];
    for (var y = y0; y <= y1; y++) {
      var s = 0, ok = true;
      for (var i = 0; i < ms.length; i++) {
        var m = Math.abs(ms[i]), yy = ms[i] < 0 ? y - 1 : y;
        var x = table[yy + (m < 10 ? '0' : '') + m];
        if (x === undefined || x === null || x < FILL) { ok = false; break; }
        s += x;
      }
      if (!ok) continue;
      years.push(y); values.push(s / ms.length);
    }
    return { years: years, values: values };
  }

  function loadSeries(vid, st) {
    var pm = prm(variable(vid));
    return fetchJson(urlFor(pm, st.lat, st.lon, st.size)).then(function (json) {
      var mt = monthlyTable(json, pm);
      var ser = yearlySeries(mt.table, st.y0, st.y1, st.month);
      ser.cells = mt.cells;
      ser.table = mt.table;
      return ser;
    });
  }

  /** Centred 5-year running mean; null where the window is incomplete. */
  function runningMean(vals, k) {
    var h = Math.floor(k / 2), out = [];
    for (var i = 0; i < vals.length; i++) {
      if (i < h || i >= vals.length - h) { out.push(null); continue; }
      var s = 0;
      for (var j = i - h; j <= i + h; j++) s += vals[j];
      out.push(s / k);
    }
    return out;
  }

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
    var cmp = compareData && compareData.v === vr.id ? compareData : null;
    var cbase = cmp && view.anom ? S.mean(cmp.values) : 0;
    var cvals = cmp ? cmp.values.map(function (v) { return v - cbase; }) : [];
    var cols = cmp ? cmp.stats.ols : null;
    var smooth = view.smooth ? runningMean(vals, 5) : null;

    var W = Math.max(300, host.clientWidth), narrow = W < 560, H = narrow ? 300 : 380;
    var STRIPE = 14;
    var m = { l: 56, r: narrow ? 16 : 118, t: 14, b: 34 + STRIPE + 8 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    function trendAt(x) { return ols.intercept + ols.slope * x - base; }
    function ctrendAt(x) { return cols.intercept + cols.slope * x - cbase; }
    function half(x) {
      return ols.tCrit * ols.residualSE * Math.sqrt(1 / ols.n + Math.pow(x - ols.meanX, 2) / ols.sxx);
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
    var sc = stripeColours(vr), yw = x1 === x0 ? iw : iw / (x1 - x0);
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
        { y: sy(vals[vals.length - 1]), t: cmp ? res.short : T('Yearly value'), c: 'endlabel' },
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
      var html = '<strong>' + yy + '</strong><span><i class="key key-series"></i>' +
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
    var lg = '<span><i class="key key-series"></i>' + esc(cmp ? res.short : 'Yearly value') + '</span>' +
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

  function chooseMonth(mo) {
    if (!current) return;
    $('month').value = current.month === mo ? 0 : mo;
    investigate({ scroll: false });
  }

  function setPeriod(a, b) {
    $('y0').value = a; $('y1').value = b;
    investigate({ scroll: false });
    toast('Testing ' + a + '–' + b + ' only.');
  }

  // ---- results -------------------------------------------------------------

  function periodPhrase(res) {
    var a = res.years[0], b = res.years[res.years.length - 1];
    return res.month ? T('each {month} from {a} to {b}', { month: T(MONTHS[res.month]), a: a, b: b })
      : T('from {a} to {b}', { a: a, b: b });
  }

  function verdictText(res) {
    var vr = res.variable, st = res.stats;
    var v = { name: capFirst(vname(vr).toLowerCase()), where: T(res.placeName), period: periodPhrase(res),
      rate: T('{x} per decade', { x: withUnit(sig(st.sen.slope * 10, 2), vr.unit) }) };
    if (st.direction === 'flat') {
      return { head: T('{name} around {where} has not changed.', v), badge: T('No trend'), cls: 'none',
        sub: T('The typical year-to-year change {period} is zero.', v) };
    }
    var up = st.direction === 'up';
    if (st.verdict === 'significant') {
      return { head: T(up ? '{name} around {where} is rising by about {rate}.' : '{name} around {where} is falling by about {rate}.', v),
        badge: T('Statistically significant'), cls: 'sig',
        sub: T('Measured {period}. A pattern this steady would be very unlikely to appear by chance alone.', v) };
    }
    if (st.verdict === 'borderline') {
      return { head: T(up ? '{name} around {where} may be rising, by about {rate}.' : '{name} around {where} may be falling, by about {rate}.', v),
        badge: T('Borderline'), cls: 'border',
        sub: T('Measured {period}. The evidence is suggestive but not strong enough to rule out chance. A longer record could settle it.', v) };
    }
    return { head: T('{name} around {where} shows no clear trend.', v), badge: T('Not statistically significant'), cls: 'none',
      sub: T(up ? 'Measured {period}. The line tilts up by about {rate}, but that is within the normal ups and downs from year to year.'
        : 'Measured {period}. The line tilts down by about {rate}, but that is within the normal ups and downs from year to year.', v) };
  }

  /**
   * Years of data needed before a trend of this size would be detectable
   * (Weatherhead et al. 1998: 5% test, 90% probability of detection).
   */
  function yearsNeeded(res) {
    var o = res.stats.ols, w = Math.abs(o.slope);
    if (!w || !o.residualSE) return null;
    var phi = clamp(o.lag1, -0.5, 0.9);
    var nStar = Math.pow((3.3 * o.residualSE / w) * Math.sqrt((1 + phi) / (1 - phi)), 2 / 3);
    return { total: Math.ceil(nStar), more: Math.ceil(nStar - o.n) };
  }

  /**
   * One-off spikes: years far from the robust (Sen) trend line, using a
   * median-absolute-deviation z score above 3.5. Then re-test without them.
   */
  function findSpikes(years, values, st) {
    var res = values.map(function (v, i) { return v - (st.sen.intercept + st.sen.slope * years[i]); });
    var med = S.median(res);
    var mad = S.median(res.map(function (r) { return Math.abs(r - med); }));
    var sd = 1.4826 * mad;
    if (!sd) return { list: [] };
    var list = [];
    res.forEach(function (r, i) {
      var z = (r - med) / sd;
      if (Math.abs(z) > 3.5) list.push({ i: i, year: years[i], z: z, resid: r });
    });
    list.sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); });
    list = list.slice(0, 3).sort(function (a, b) { return a.i - b.i; });
    var without = null;
    if (list.length && years.length - list.length >= MIN_YEARS) {
      var drop = list.map(function (x) { return x.i; });
      var ys = [], vs = [];
      years.forEach(function (y, i) { if (drop.indexOf(i) < 0) { ys.push(y); vs.push(values[i]); } });
      without = S.analyze(ys, vs);
    }
    return { list: list, without: without };
  }

  function tile(label, value, note, i) {
    return '<div class="tile" style="--i:' + i + '"><dt>' + esc(label) + '</dt><dd>' + value + '</dd><p>' + note + '</p></div>';
  }

  function replay(el) {
    if (REDUCED) return;
    el.classList.remove('reveal');
    void el.offsetWidth;
    el.classList.add('reveal');
  }

  function render(res) {
    var fresh = !current || current.variable.id !== res.variable.id || current.placeName !== res.placeName;
    if (!current && wideScreen()) $('settings').open = false;   // first answer: fold the settings away
    current = res;
    var vr = res.variable, st = res.stats, n = res.years.length;
    var spk = findSpikes(res.years, res.values, st);
    res.spikes = spk.list;
    var need = st.verdict !== 'significant' && st.direction !== 'flat' ? yearsNeeded(res) : null;
    var v = verdictText(res);
    globeBadge(res);
    $('verdict-head').textContent = v.head;
    var extra = '';
    if (need) {
      extra = need.more > 150 ? ' ' + T('Not proven yet. The change is tiny next to the year-to-year wobble, so it would take more than 150 more years of data to tell.')
        : need.more > 0 ? ' ' + T('Not proven yet. If this trend is real, about {n} more years of data would be needed to tell.', { n: need.more })
        : ' ' + T('The record is already long enough to detect a trend this size, so the true trend is probably smaller than it looks, or absent.');
    }
    $('verdict-sub').textContent = v.sub + extra;
    var badge = $('verdict-badge');
    badge.textContent = v.badge; badge.className = 'badge badge-' + v.cls;
    replay($('verdict'));

    $('chart-title').textContent = vname(vr) + (vr.unit ? ' (' + vr.unit + ')' : '') + ', ' +
      (res.month ? MONTHS[res.month] + ' average' : 'yearly average') + ', ' + res.placeName;
    $('empty').hidden = true;
    $('result').hidden = false;
    $('live-hint').hidden = false;
    if (compareData && compareData.v !== vr.id) compareData = null;
    drawChart(res, fresh);

    var full = res.y0 === FIRST_YEAR && res.y1 === LAST_YEAR;
    $('reset-years').hidden = full;
    $('reset-years').textContent = 'Back to the full record (' + FIRST_YEAR + '–' + LAST_YEAR + ')';

    var total = st.ols.slope * (res.years[n - 1] - res.years[0]);
    var tiles = '';
    var perDec = ' <small>' + esc(T('per decade')) + '</small>';
    tiles += tile(T('Rate of change'), esc(withUnit(signed(st.ols.slope * 10, 2), vr.unit)) + perDec,
      esc(T('Slope of the straight line through the points. With 95% confidence the true rate is between {a} and {b}.',
        { a: signed(st.ols.ciLow * 10, 2), b: withUnit(signed(st.ols.ciHigh * 10, 2), vr.unit) })), 0);
    tiles += tile(T('Total change'), esc(withUnit(signed(total, 2), vr.unit)),
      esc(T('Along the trend line from {a} to {b} ({n} years of data).', { a: res.years[0], b: res.years[n - 1], n: n })), 1);
    tiles += tile(T('Mann-Kendall test'), esc(pEquals(st.mk.p)),
      esc(T('Checks whether later years are mostly higher or lower than earlier ones. Below 0.05 counts as significant. Kendall’s tau is {t} (1 is always rising, −1 always falling).', { t: st.mk.tau.toFixed(2) })), 2);
    tiles += tile(T('t-test on the slope'), esc(pEquals(st.ols.p)),
      esc(T('The chance of seeing a slope this steep if there were really no trend. The line explains {r}% of the year-to-year variation.', { r: Math.round(st.ols.r2 * 100) })), 3);
    tiles += tile(T('Sen’s slope'), esc(withUnit(signed(st.sen.slope * 10, 2), vr.unit)) + perDec,
      esc(T('The middle value of the slopes between every pair of years. One freak year barely moves it.')), 4);
    if (need) {
      tiles += tile(T('Years needed to tell'), need.more > 150 ? '150+' : (need.more > 0 ? '+' + need.more + ' <small>' + esc(T('more years')) + '</small>' : esc(T('Enough'))),
        esc(T('How long a record a trend of this size needs before a test can reliably detect it ({n} years in total), from Weatherhead et al. (1998).', { n: need.total })), 5);
    }
    $('tiles').innerHTML = tiles;
    if (fresh) replay($('tiles')); else $('tiles').classList.remove('reveal');

    var note = '';
    if (Math.abs(st.ols.lag1) > 2 / Math.sqrt(n)) {
      note = 'Heads up: each year here resembles the year before it (lag-1 autocorrelation ' + st.ols.lag1.toFixed(2) +
        '). That can make a trend look more certain than it is, so treat the p-values with some caution.';
    }
    $('caution').textContent = note;
    $('caution').hidden = !note;

    // "Spike, not trend"
    var sp = $('spike');
    if (spk.list.length) {
      var yrsTxt = spk.list.map(function (x) { return x.year; }).join(', ');
      var first = spk.list.reduce(function (m, x) { return Math.abs(x.z) > Math.abs(m.z) ? x : m; }, spk.list[0]);   // describe the biggest
      var msg = T(spk.list.length > 1 ? '{years} stand out from the rest.' : '{years} stands out from the rest.', { years: yrsTxt }) + ' ' +
        T(first.resid > 0 ? 'In {y} the value was {amt} above the trend line, about {z} times the usual year-to-year wobble.' :
          'In {y} the value was {amt} below the trend line, about {z} times the usual year-to-year wobble.',
          { y: first.year, amt: withUnit(Math.abs(first.resid).toFixed(vr.dp), vr.unit), z: Math.abs(first.z).toFixed(1) }) + ' ' +
        T('That is a one-off spike, not a trend.');
      if (spk.without) {
        var w = spk.without, was = st.verdict === 'significant', now = w.verdict === 'significant';
        msg += ' ' + T(now && was ? 'Without it, the trend is still significant ({rate}).' : now ? 'Without it, the trend becomes significant ({rate}).'
          : was ? 'Without it, the trend is no longer significant ({rate}), so the spike was doing the work.' : 'Without it, there is still no significant trend ({rate}).',
          { rate: T('{x} per decade', { x: withUnit(signed(w.sen.slope * 10, 2), vr.unit) }) });
      }
      sp.innerHTML = '<strong>' + esc(T('Spike, not trend')) + '</strong> ' + esc(msg);
      sp.hidden = false;
    } else sp.hidden = true;

    $('about-var').innerHTML = '<strong>' + esc(vname(vr)) + '.</strong> ' + esc(T(vr.def)) +
      ' <span class="muted">Source: ' + esc(vr.source) + ', through NASA POWER. ' +
      (res.cells > 1 ? 'Averaged over ' + res.cells + ' grid cells in the box, weighted by area.' : 'One grid cell at ' + esc(coordLabel(res.lat, res.lon)) + '.') + '</span>';

    $('table-body').innerHTML = res.years.map(function (y, i) {
      return '<tr><td>' + y + '</td><td>' + res.values[i].toFixed(vr.dp) + '</td><td>' +
        (st.ols.intercept + st.ols.slope * y).toFixed(vr.dp) + '</td></tr>';
    }).join('');
    $('table-unit').textContent = vr.unit ? ' (' + vr.unit + ')' : '';

    drawSeason(res);
    fillCompare(res);
    loadVar2();

    $('scan-out').innerHTML = '';
    $('scan-status').textContent = '';
    setStatus('');
    writeHash();
    loadCompare();
    document.dispatchEvent(new CustomEvent('td:result', { detail: res }));
  }

  function setStatus(msg, isError) {
    var s = $('status');
    s.textContent = msg;
    s.className = 'status' + (isError ? ' status-error' : '');
    s.hidden = !msg;
  }

  function setLoading(on) {
    $('progress').hidden = !on;
    $('result').classList.toggle('is-loading', on);
  }

  function investigate(opts) {
    opts = opts || {};
    clearTimeout(liveTimer);
    readForm();
    var id = ++runId;
    var vr = variable(state.v);
    var snap = JSON.parse(JSON.stringify(state));
    var btn = $('run');
    btn.disabled = true; btn.textContent = T('Asking NASA…');
    setLoading(true);
    if (globe) globe.setBadge({ title: vname(vr), text: T('Asking NASA'), cls: 'loading' });
    document.dispatchEvent(new CustomEvent('td:investigate', { detail: snap }));
    var cached = !!cache[urlFor(prm(vr), snap.lat, snap.lon, snap.size)];
    if (!cached) setStatus('Fetching ' + vr.name.toLowerCase() + ' for ' + state.placeName + ' from NASA POWER…');
    loadSeries(vr.id, snap).then(function (ser) {
      if (id !== runId) return;
      if (ser.years.length < MIN_YEARS) {
        throw new Error('Only ' + ser.years.length + ' usable years of ' + vr.name.toLowerCase() +
          ' here for that period. A trend test needs at least ' + MIN_YEARS + '. Try a longer period, another place or another variable.');
      }
      render({ variable: vr, years: ser.years, values: ser.values, cells: ser.cells, table: ser.table,
        stats: S.analyze(ser.years, ser.values), placeName: snap.placeName, short: snap.short, placeId: snap.placeId,
        lat: snap.lat, lon: snap.lon, size: snap.size, month: snap.month, y0: snap.y0, y1: snap.y1 });
      if (opts.scroll) $('result').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    }).catch(function (e) {
      if (id !== runId) return;
      setStatus(e.message, true);
      if (globe) globe.setBadge({ title: T('No answer here'), text: T('See the case file for why'), cls: 'none' });
    }).then(function () {
      if (id !== runId) return;
      btn.disabled = false; btn.textContent = T('Investigate');
      setLoading(false);
    });
  }

  /** Once a case is open, any change to the form re-runs it. */
  function scheduleLive(delay) {
    if (!current) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { investigate({ scroll: false }); }, delay || 450);
  }

  // ---- compare -------------------------------------------------------------

  function fillCompare(res) {
    var sel = $('compare');
    if (state.compare === res.placeId) state.compare = '';
    var ct = compareTarget();
    sel.innerHTML = '<option value="">' + esc(T('Nothing')) + '</option>' +
      (ct && state.compare.indexOf('pt:') === 0 ? '<option value="' + esc(ct.id) + '">' + esc(ct.short) + '</option>' : '') +
      PLACES.filter(function (p) { return p.id !== res.placeId; }).map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.short) + '</option>';
      }).join('');
    sel.value = state.compare;
  }

  function loadCompare() {
    var res = current, note = $('compare-note');
    var p = compareTarget();
    updateMap(false);
    if (!res || !p) {
      if (compareData) { compareData = null; drawChart(res, false); }
      note.hidden = true;
      return;
    }
    var vr = res.variable, myRun = runId;
    var snap = { lat: p.lat, lon: p.lon, size: res.size, y0: res.y0, y1: res.y1, month: res.month };
    if (!compareData || compareData.id !== p.id) { note.hidden = false; note.textContent = 'Loading ' + p.short + ' from NASA POWER…'; }
    loadSeries(vr.id, snap).then(function (ser) {
      if (myRun !== runId || state.compare !== p.id) return;
      if (ser.years.length < MIN_YEARS) throw new Error('There is not enough ' + vr.name.toLowerCase() + ' data for ' + p.short + ' in that period.');
      compareData = { id: p.id, v: vr.id, name: p.name, short: p.short, years: ser.years, values: ser.values,
        stats: S.analyze(ser.years, ser.values) };
      drawChart(current, false);
      var a = res.stats, b = compareData.stats;
      var dir = b.direction === 'up' ? 'rising' : (b.direction === 'down' ? 'falling' : 'flat');
      var ratio = Math.abs(a.sen.slope) > 0 && Math.abs(b.sen.slope) > 0 ? Math.abs(a.sen.slope) / Math.abs(b.sen.slope) : 0;
      var comp = '';
      if (ratio && a.direction === b.direction && a.verdict === 'significant' && b.verdict === 'significant') {
        comp = ratio >= 1.15 ? ' ' + capFirst(res.short) + ' is changing about ' + ratio.toFixed(1) + '× as fast.'
          : (ratio <= 0.87 ? ' ' + p.short + ' is changing about ' + (1 / ratio).toFixed(1) + '× as fast.' : ' Both are changing at a similar rate.');
      } else if (a.direction !== b.direction && a.direction !== 'flat' && b.direction !== 'flat') {
        comp = ' The two places are moving in opposite directions.';
      }
      note.hidden = false;
      note.innerHTML = '<strong>' + esc(p.short) + ':</strong> ' + dir + ' by about ' + esc(ratePhrase(b, vr)) + ' (' +
        verdictLabel(b.verdict).toLowerCase() + ', ' + esc(pEquals(b.mk.p)) + ').' + esc(comp) +
        (view.anom ? '' : ' <button type="button" class="link" id="to-anom">Show both as difference from average</button>');
    }).catch(function (e) {
      if (myRun !== runId) return;
      compareData = null; drawChart(current, false);
      note.hidden = false; note.textContent = e.message;
    });
  }

  // ---- compare two variables ------------------------------------------------

  function pearson(a, b) {
    var ma = S.mean(a), mb = S.mean(b), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
  }
  function detrend(xs, ys) {
    var o = S.linearRegression(xs, ys);
    return ys.map(function (y, i) { return y - (o.intercept + o.slope * xs[i]); });
  }
  function zscores(v) {
    var m = S.mean(v), sd = Math.sqrt(v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (v.length - 1)) || 1;
    return v.map(function (x) { return (x - m) / sd; });
  }

  function fillVar2() {
    var sel = $('var2'), keep = sel.value;
    sel.innerHTML = '<option value="">' + esc(T('Choose a second variable')) + '</option>' + VARIABLES.filter(function (v) {
      return !current || v.id !== current.variable.id;
    }).map(function (v) { return '<option value="' + v.id + '">' + esc(vname(v)) + '</option>'; }).join('');
    sel.value = keep && (!current || keep !== current.variable.id) ? keep : '';
  }

  function loadVar2() {
    fillVar2();
    var id = $('var2').value, host = $('var2-chart'), note = $('var2-note');
    host.innerHTML = ''; note.textContent = '';
    if (!id || !current) return;
    var res = current, vb = variable(id), myRun = runId;
    note.textContent = T('Loading {name} from NASA POWER…', { name: vname(vb).toLowerCase() });
    loadSeries(vb.id, { lat: res.lat, lon: res.lon, size: res.size, y0: res.y0, y1: res.y1, month: res.month }).then(function (ser) {
      if (myRun !== runId) return;
      var ys = [], a = [], b = [];
      res.years.forEach(function (y, i) {
        var j = ser.years.indexOf(y);
        if (j >= 0) { ys.push(y); a.push(res.values[i]); b.push(ser.values[j]); }
      });
      if (ys.length < MIN_YEARS) { note.textContent = T('Not enough overlapping years to compare these two here.'); return; }
      var r = pearson(a, b), rd = pearson(detrend(ys, a), detrend(ys, b));
      drawPair(host, ys, zscores(a), zscores(b), vname(res.variable), vname(vb));
      var strength = function (x) { x = Math.abs(x); return x < 0.2 ? T('no clear') : x < 0.4 ? T('a weak') : x < 0.6 ? T('a moderate') : T('a strong'); };
      var A = vname(res.variable).toLowerCase(), B = vname(vb).toLowerCase();
      var lead = Math.abs(r) < 0.2 ? T('{a} and {b} show no clear link here (r = {r}).', { a: capFirst(A), b: B, r: r.toFixed(2) })
        : T(r > 0 ? 'Years with high {a} tend to have high {b}: {s} link (r = {r}).' : 'Years with high {a} tend to have low {b}: {s} link (r = {r}).',
          { a: A, b: B, s: strength(r), r: r.toFixed(2) });
      var det = T('After removing both long-term trends, the link is {s} (r = {r}), which shows how much of it is just two things changing over the same years.',
        { s: strength(rd).replace(/^(a|an) /, ''), r: rd.toFixed(2) });
      note.innerHTML = esc(lead) + ' ' + esc(det) + ' <span class="muted">' + esc(T('A link is not proof that one causes the other.')) + '</span>';
    }).catch(function (e) { if (myRun === runId) note.textContent = e.message; });
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
    if (!svg || !current) return;
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
        a.download = 'trend-detective-' + current.variable.id + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        toast(T('Chart saved as an image.'));
      });
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(T('This browser could not save the chart.')); };
    img.src = url;
  }

  // ---- scan every variable -------------------------------------------------

  function scan() {
    if (!current) return;
    var st = { lat: current.lat, lon: current.lon, size: current.size, y0: current.y0, y1: current.y1, month: current.month };
    var out = $('scan-out'), status = $('scan-status'), btn = $('scan');
    var myRun = runId;
    btn.disabled = true;
    out.innerHTML = '';
    var results = [];

    function add(vr, ser) {
      if (ser.years.length < MIN_YEARS) { results.push({ vr: vr, skip: true }); return; }
      results.push({ vr: vr, stats: S.analyze(ser.years, ser.values), n: ser.years.length, y0: ser.years[0] });
    }
    function finish() {
      if (myRun !== runId) return;
      btn.disabled = false;
      status.textContent = '';
      var ok = results.filter(function (r) { return !r.skip; }).sort(function (a, b) { return a.stats.mk.p - b.stats.mk.p; });
      var skipped = results.filter(function (r) { return r.skip; });
      var nsig = ok.filter(function (r) { return r.stats.verdict === 'significant'; }).length;
      var html = '<p><strong>' + nsig + ' of ' + ok.length + '</strong> variables show a significant trend here. Click a name to open it.</p>' +
        '<table class="leads"><thead><tr><th>Variable</th><th>Direction</th><th>Strength (tau)</th><th>Change per decade</th><th>Mann-Kendall p</th><th>Verdict</th></tr></thead><tbody>';
      ok.forEach(function (r) {
        var dir = r.stats.direction === 'up' ? '↑ rising' : (r.stats.direction === 'down' ? '↓ falling' : 'flat');
        var tau = r.stats.mk.tau, w = Math.min(50, Math.abs(tau) * 50).toFixed(1);
        html += '<tr><td><button type="button" class="link" data-v="' + r.vr.id + '">' + esc(r.vr.name) + '</button></td><td>' + dir +
          '</td><td><span class="taubar' + (r.stats.verdict === 'none' ? ' faint' : '') + '" title="tau ' + tau.toFixed(2) + '"><i class="' + (tau < 0 ? 'neg' : 'pos') +
          '" style="width:' + w + '%"></i></span></td><td>' + esc(withUnit(signed(r.stats.sen.slope * 10, 2), r.vr.unit)) + '</td><td>' + esc(fmtP(r.stats.mk.p)) +
          '</td><td><span class="badge badge-small badge-' + verdictClass(r.stats.verdict) + '">' + verdictLabel(r.stats.verdict) + '</span></td></tr>';
      });
      html += '</tbody></table>';
      if (skipped.length) {
        html += '<p class="muted">Not enough data here for: ' + skipped.map(function (r) { return esc(r.vr.name.toLowerCase()); }).join(', ') + '.</p>';
      }
      html += '<p class="muted">With ' + ok.length + ' tests at the 0.05 level, expect about one false alarm in twenty even where nothing is changing. Treat this list as leads to investigate, not proof.</p>';
      out.innerHTML = html;
    }

    if (!st.size) {
      status.textContent = 'Scanning all ' + VARIABLES.length + ' variables…';
      var ids = VARIABLES.map(prm).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(',');
      fetchJson(urlFor(ids, st.lat, st.lon, 0)).then(function (json) {
        VARIABLES.forEach(function (vr) {
          add(vr, yearlySeries(monthlyTable(json, prm(vr)).table, st.y0, st.y1, st.month));
        });
        finish();
      }).catch(function (e) { btn.disabled = false; status.textContent = e.message; });
      return;
    }
    // Regional requests take one variable each, so run them two at a time.
    var queue = VARIABLES.slice(), done = 0;
    function next() {
      if (myRun !== runId) { btn.disabled = false; return; }
      var vr = queue.shift();
      if (!vr) return;
      loadSeries(vr.id, st).then(function (ser) { add(vr, ser); }, function () { results.push({ vr: vr, skip: true }); })
        .then(function () {
          done++;
          status.textContent = 'Scanned ' + done + ' of ' + VARIABLES.length + ' variables…';
          if (done === VARIABLES.length) finish(); else next();
        });
    }
    status.textContent = 'Scanning ' + VARIABLES.length + ' variables. This takes about half a minute for a box…';
    next(); next();
  }

  // ---- form ----------------------------------------------------------------

  function buildForm() {
    $('topics').innerHTML = TOPICS.map(function (t) {
      return '<button type="button" class="chip" data-topic="' + t.id + '" aria-pressed="false">' + esc(T(t.label)) + '</button>';
    }).join('');
    $('place').innerHTML = PLACES.map(function (p) {
      return '<option value="' + p.id + '">' + esc(capFirst(p.name)) + '</option>';
    }).join('') + '<option value="custom">A place I chose on the globe</option>';
    var ys = '';
    for (var y = FIRST_YEAR; y <= LAST_YEAR; y++) ys += '<option>' + y + '</option>';
    $('y0').innerHTML = ys; $('y1').innerHTML = ys;
    var opt = function (mm, i) { return '<option value="' + i + '">' + esc(T(mm)) + '</option>'; };
    $('month').innerHTML = opt(MONTHS[0], 0) +
      '<optgroup label="' + esc(T('Seasons')) + '">' + [13, 14, 15, 16].map(function (i) { return opt(MONTHS[i], i); }).join('') + '</optgroup>' +
      '<optgroup label="' + esc(T('One month')) + '">' + MONTHS.slice(1, 13).map(function (mm, i) { return opt(mm, i + 1); }).join('') + '</optgroup>';
    $('starters').innerHTML = STARTERS.map(function (s, i) {
      return '<li><button type="button" class="starter" data-i="' + i + '"><span class="starter-no">' +
        (i < 9 ? '0' : '') + (i + 1) + '</span><span class="starter-q">' + esc(s.q) +
        '</span><span class="starter-go" aria-hidden="true">›</span></button></li>';
    }).join('');
  }

  function renderVariables() {
    var list = VARIABLES.filter(function (v) { return v.topic === state.topic; });
    if (!list.some(function (v) { return v.id === state.v; })) state.v = list[0].id;
    $('variables').innerHTML = list.map(function (v) {
      return '<label class="var' + (v.id === state.v ? ' var-on' : '') + '"><input type="radio" name="var" value="' + v.id + '"' +
        (v.id === state.v ? ' checked' : '') + '><span class="var-name">' + esc(vname(v)) + (v.unit ? ' <small>' + esc(v.unit) + '</small>' : '') +
        '</span><span class="var-def">' + esc(T(v.def)) + '</span></label>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.setAttribute('aria-pressed', c.getAttribute('data-topic') === state.topic ? 'true' : 'false');
    });
    updateBrief();
  }

  /** The one-line case summary at the top of the panel. Each part opens its setting. */
  function updateBrief() {
    var vr = variable(state.v);
    var p = place(state.placeId);
    var where = p ? p.short : coordLabel(state.lat, state.lon);
    var when = state.y0 + '–' + state.y1;
    var part = function (go, text) { return '<button type="button" class="brief-part" data-go="' + go + '">' + esc(text) + '</button>'; };
    $('brief').innerHTML = T('Testing {what} around {where}, {when}, {part}.', {
      what: part('what', vname(vr).toLowerCase()), where: part('where', where), when: part('when', when),
      part: part('when', state.month ? T('in {month}', { month: T(MONTHS[state.month]) }) : T('whole year')) });
    $('case-loc').textContent = '· ' + coordLabel(state.lat, state.lon);
  }

  function openStep(go) {
    var det = $('settings'), step = $('step-' + go);
    det.open = true;
    if (!step) return;
    step.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    var focusable = step.querySelector(go === 'what' ? 'input:checked' : 'select, input');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, REDUCED ? 0 : 350);
  }

  function writeForm() {
    renderVariables();
    $('place').value = state.placeId;
    $('lat').value = state.lat; $('lon').value = state.lon;
    $('size').value = state.size || 1;
    showSize();
    $('y0').value = state.y0; $('y1').value = state.y1;
    $('month').value = state.month;
    updateBrief();
    updateMap(true);
  }

  function readForm() {
    var lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
    state.lat = clamp(isNaN(lat) ? 0 : lat, -89.5, 89.5);
    state.lon = clamp(isNaN(lon) ? 0 : lon, -180, 180);
    var sv = parseInt($('size').value, 10) || 0;
    state.size = sv >= 2 ? Math.min(SIZE_MAX, sv) : 0;
    showSize();
    var a = parseInt($('y0').value, 10), b = parseInt($('y1').value, 10);
    state.y0 = Math.min(a, b); state.y1 = Math.max(a, b);
    state.month = parseInt($('month').value, 10) || 0;
    state.placeId = $('place').value;
    var p = place(state.placeId);
    state.placeName = p ? p.name : coordLabel(state.lat, state.lon);
    state.short = p ? p.short : 'Your place';
    updateBrief();
  }

  function setCustom(lat, lon) {
    state.placeId = 'custom';
    $('place').value = 'custom';
    $('lat').value = lat.toFixed(2); $('lon').value = lon.toFixed(2);
    readForm(); updateMap(false);
  }

  function initMap() {
    if (!window.TDGlobe || !window.d3) { $('map').hidden = true; return; }
    globe = window.TDGlobe.create($('map'), {
      places: PLACES,
      fill: true,
      onStyle: function (name) { toast(T(name)); },
      onPick: function (lat, lon) {
        setCustom(lat, lon);
        if (current) scheduleLive(500); else investigate({ scroll: wideScreen() });
      },
      onPlace: function (id) {
        var s = $('place');
        s.value = id;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        if (!current) investigate({ scroll: wideScreen() });
      }
    });
  }

  function wideScreen() { return window.innerWidth > 960; }

  /** Show the answer as a label on the globe, next to the chosen place. */
  function globeBadge(res) {
    if (!globe) return;
    if (!res) { globe.setBadge(null); return; }
    var st = res.stats, vr = res.variable;
    var arrow = st.direction === 'up' ? '↑ ' : (st.direction === 'down' ? '↓ ' : '');
    var y0 = res.years[0], y1 = res.years[res.years.length - 1];
    var line = function (x) { return st.sen.intercept + st.sen.slope * x; };
    globe.setBadge({
      place: (res.placeId === 'custom' ? coordLabel(res.lat, res.lon) : T(res.short || res.placeName)) +
        (res.month ? ' · ' + T(MONTHS[res.month]) : ''),
      title: vname(vr), cls: verdictClass(st.verdict),
      text: arrow + T('{x} per decade', { x: withUnit(signed(st.sen.slope * 10, 2), vr.unit) }), note: T(verdictLabel(st.verdict)),
      spark: { values: res.values, trend: [line(y0), line(y1)], from: y0, to: y1 },
      action: { label: T('See the full case') + ' ›', run: openCase }
    });
  }

  /** Show the full result: pull out the case file sheet, or scroll to it on a phone. */
  function openCase() {
    var app = document.querySelector('.app'), tab = $('panel-open');
    if (wideScreen() && tab && !(app && app.classList.contains('panel-open'))) { tab.click(); return; }
    var r = $('result'), panel = $('case-panel');
    if (wideScreen() && panel) panel.scrollTo({ top: Math.max(0, r.offsetTop - 64), behavior: REDUCED ? 'auto' : 'smooth' });
    else r.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  function selectionFor(lat, lon, size, placeId) {
    return { lat: lat, lon: lon, size: size, placeId: placeId, box: size ? box(lat, lon, size) : null };
  }

  function updateMap(recentre) {
    if (!globe) return;
    globe.setSelection(selectionFor(state.lat, state.lon, state.size, state.placeId));
    var p = current && compareTarget();
    globe.setCompare(p ? selectionFor(p.lat, p.lon, current.size, p.id) : null);
    if (recentre) globe.flyTo(state.lat, state.lon, state.size);
  }

  // ---- shareable link ------------------------------------------------------

  function writeHash() {
    var h = 'v=' + state.v + '&lat=' + state.lat + '&lon=' + state.lon + '&size=' + state.size +
      '&y0=' + state.y0 + '&y1=' + state.y1 + '&m=' + state.month + '&p=' + state.placeId +
      (state.compare ? '&c=' + state.compare : '') + (view.anom ? '&a=1' : '') + (view.smooth ? '&s=1' : '') + (view.future ? '&f=1' : '');
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* file preview: ignore */ }
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return false;
    var q = {};
    h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (!q.v) return false;
    var vr = variable(q.v);
    state.v = vr.id; state.topic = vr.topic;
    var p = place(q.p);
    state.placeId = p ? p.id : 'custom';
    state.lat = clamp(parseFloat(q.lat) || 0, -89.5, 89.5);
    state.lon = clamp(parseFloat(q.lon) || 0, -180, 180);
    var qs = parseInt(q.size, 10);
    state.size = qs === 0 || (qs >= 2 && qs <= SIZE_MAX) ? qs : 2;
    state.y0 = clamp(parseInt(q.y0, 10) || FIRST_YEAR, FIRST_YEAR, LAST_YEAR);
    state.y1 = clamp(parseInt(q.y1, 10) || LAST_YEAR, FIRST_YEAR, LAST_YEAR);
    state.month = clamp(parseInt(q.m, 10) || 0, 0, 16);
    state.compare = place(q.c) || (q.c && q.c.indexOf('pt:') === 0) ? q.c : '';
    view.future = q.f === '1';
    view.anom = q.a === '1';
    view.smooth = q.s === '1';
    return true;
  }

  function downloadCsv() {
    if (!current) return;
    var vr = current.variable, ols = current.stats.ols;
    var lines = ['year,' + vr.id + (vr.unit ? ' (' + vr.unit + ')' : '') + ',trend_line'];
    current.years.forEach(function (y, i) {
      lines.push(y + ',' + current.values[i].toFixed(4) + ',' + (ols.intercept + ols.slope * y).toFixed(4));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    a.download = 'trend-detective-' + vr.id + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function copyLink() {
    var url = location.href;
    var done = function () { toast('Link copied. Anyone who opens it sees this case.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { toast('Copy the link from the address bar.'); });
    } else toast('Copy the link from the address bar.');
  }

  // ---- small UI pieces -----------------------------------------------------

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  function syncThemeButton() {
    var dark = isDark(), b = $('theme');
    b.innerHTML = dark ? ICON_SUN : ICON_MOON;
    b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    b.title = b.getAttribute('aria-label');
  }
  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('td-theme', next); } catch (e) { /* storage blocked */ }
    syncThemeButton();
  }

  function syncViewControls() {
    Array.prototype.forEach.call(document.querySelectorAll('#mode button'), function (b) {
      b.setAttribute('aria-pressed', (b.getAttribute('data-mode') === 'anom') === view.anom ? 'true' : 'false');
    });
    $('smooth').checked = view.smooth;
    $('future').checked = view.future;
  }

  function locate() {
    if (!navigator.geolocation) { toast('Your browser cannot share its location.'); return; }
    var b = $('locate');
    b.disabled = true; b.textContent = 'finding you…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      b.disabled = false; b.textContent = 'use my location';
      setCustom(pos.coords.latitude, pos.coords.longitude);
      updateMap(true);
      toast('Moved to ' + coordLabel(state.lat, state.lon) + '.');
      scheduleLive(100);
    }, function () {
      b.disabled = false; b.textContent = 'use my location';
      toast('Could not get your location. Click the map instead.');
    }, { timeout: 10000, maximumAge: 600000 });
  }

  // ---- wiring --------------------------------------------------------------

  function init() {
    buildForm();
    var fromLink = readHash();
    initMap();
    writeForm();
    syncViewControls();
    syncThemeButton();

    $('theme').addEventListener('click', toggleTheme);
    $('locate').addEventListener('click', locate);
    $('topics').addEventListener('click', function (e) {
      var t = e.target.getAttribute('data-topic');
      if (!t) return;
      var before = state.v;
      state.topic = t; renderVariables();
      if (state.v !== before) scheduleLive();
    });
    $('variables').addEventListener('change', function (e) {
      if (e.target.name === 'var') { state.v = e.target.value; renderVariables(); }
    });
    $('place').addEventListener('change', function () {
      var p = place($('place').value);
      if (p) { state.placeId = p.id; state.lat = p.lat; state.lon = p.lon; state.size = p.size; writeForm(); }
      readForm();
    });
    ['lat', 'lon'].forEach(function (id) {
      $(id).addEventListener('change', function () { $('place').value = 'custom'; readForm(); updateMap(true); });
    });
    // while dragging: resize the box on the globe live; on release: frame it and re-run
    $('size').addEventListener('input', function () { readForm(); updateMap(false); });
    $('size').addEventListener('change', function () { readForm(); updateMap(true); });
    // Any change inside the form re-runs an open case (after the handlers above).
    $('case-form').addEventListener('change', function () { readForm(); scheduleLive(); });
    $('brief').addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b) openStep(b.getAttribute('data-go'));
    });
    if (REPO_URL) { $('repo-link').href = REPO_URL; $('repo-wrap').hidden = false; }
    $('case-form').addEventListener('submit', function (e) { e.preventDefault(); investigate({ scroll: true }); });
    $('starters').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-i]');
      if (!btn) return;
      var s = STARTERS[+btn.getAttribute('data-i')], p = place(s.place), vr = variable(s.v);
      state.v = vr.id; state.topic = vr.topic; state.placeId = p.id; state.lat = p.lat; state.lon = p.lon; state.size = p.size;
      state.y0 = FIRST_YEAR; state.y1 = LAST_YEAR; state.month = 0;
      writeForm(); investigate({ scroll: wideScreen() });
    });

    $('mode').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b || !current) return;
      view.anom = b.getAttribute('data-mode') === 'anom';
      syncViewControls(); drawChart(current, false); writeHash();
      if (compareData) loadCompare();
    });
    $('smooth').addEventListener('change', function () {
      view.smooth = this.checked;
      if (current) { drawChart(current, false); writeHash(); }
    });
    $('compare').addEventListener('change', function () {
      state.compare = this.value;
      loadCompare(); writeHash();
    });
    $('compare-note').addEventListener('click', function (e) {
      if (e.target.id !== 'to-anom') return;
      view.anom = true; syncViewControls(); drawChart(current, false); writeHash(); loadCompare();
    });
    $('reset-years').addEventListener('click', function () { setPeriod(FIRST_YEAR, LAST_YEAR); });

    $('scan').addEventListener('click', scan);
    $('scan-out').addEventListener('click', function (e) {
      var v = e.target.getAttribute('data-v');
      if (!v) return;
      var vr = variable(v);
      state.v = vr.id; state.topic = vr.topic; renderVariables(); investigate({ scroll: true });
    });
    $('csv').addEventListener('click', downloadCsv);
    $('png').addEventListener('click', savePng);
    $('future').addEventListener('change', function () {
      view.future = this.checked;
      if (current) { drawChart(current, false); writeHash(); }
    });
    $('var2').addEventListener('change', loadVar2);
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-methods]'), function (b) {
      b.addEventListener('click', function () { var d = $('methods'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
    });
    $('methods-close').addEventListener('click', function () { $('methods').close(); });
    $('methods').addEventListener('click', function (e) { if (e.target === this) this.close(); });
    $('share').addEventListener('click', copyLink);

    var timer, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return;   // ignore mobile address-bar height changes
      lastW = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(function () { if (current) { drawChart(current, false); drawSeason(current); } }, 150);
    });
    if (fromLink) investigate({ scroll: wideScreen() });
    else if (globe) globe.spin(true);   // idle Earth slowly turns until someone touches it
  }

  // ---- public API for the add-on modules (maplab.js, stories.js, ask.js, i18n.js) ----

  /** Set several case settings at once, then investigate. */
  function apply(cfg) {
    cfg = cfg || {};
    if (cfg.v) { var vr = variable(cfg.v); state.v = vr.id; state.topic = vr.topic; }
    if (cfg.place) {
      var p = place(cfg.place);
      if (p) { state.placeId = p.id; state.lat = p.lat; state.lon = p.lon; state.size = p.size; }
    } else if (cfg.lat !== undefined) {
      state.placeId = 'custom'; state.lat = clamp(cfg.lat, -89.5, 89.5); state.lon = clamp(cfg.lon, -180, 180);
    }
    if (cfg.size !== undefined) state.size = cfg.size;
    state.y0 = cfg.y0 || (cfg.keepYears ? state.y0 : FIRST_YEAR);
    state.y1 = cfg.y1 || (cfg.keepYears ? state.y1 : LAST_YEAR);
    if (cfg.month !== undefined) state.month = cfg.month; else if (!cfg.keepMonth) state.month = 0;
    if (cfg.compare !== undefined) state.compare = cfg.compare;
    if (cfg.anom !== undefined) view.anom = !!cfg.anom;
    if (cfg.smooth !== undefined) view.smooth = !!cfg.smooth;
    if (cfg.future !== undefined) view.future = !!cfg.future;
    syncViewControls();
    writeForm();
    if (cfg.investigate !== false) investigate({ scroll: cfg.scroll !== undefined ? cfg.scroll : wideScreen() });
  }

  window.TD = {
    T: T, S: S, state: state, view: view, VARIABLES: VARIABLES, PLACES: PLACES, MONTHS: MONTHS, TOPICS: TOPICS,
    FIRST_YEAR: FIRST_YEAR, LAST_YEAR: LAST_YEAR, MIN_YEARS: MIN_YEARS,
    variable: variable, place: place, prm: prm, vname: vname, box: box, urlFor: urlFor, fetchJson: fetchJson,
    monthlyTable: monthlyTable, yearlySeries: yearlySeries, loadSeries: loadSeries, partMonths: partMonths,
    esc: esc, withUnit: withUnit, signed: signed, sig: sig, fmtP: fmtP, pEquals: pEquals, coordLabel: coordLabel, capFirst: capFirst,
    toast: toast, apply: apply, investigate: investigate, openStep: openStep,
    get globe() { return globe; }, get current() { return current; },
    compareSpot: function (lat, lon) {
      state.compare = 'pt:' + lat.toFixed(2) + ',' + lon.toFixed(2);
      if (current) { fillCompare(current); loadCompare(); writeHash(); }
    },
    rerender: function () {
      buildForm(); writeForm(); syncViewControls(); syncThemeButton();
      $('run').textContent = T('Investigate');
      if (current) render(current); else updateBrief();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
