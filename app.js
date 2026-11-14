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
    { id: 'greenland', name: 'central Greenland', short: 'Greenland', lat: 72.0, lon: -40.0, size: 6 },
    // Whole regions: their own bounds instead of a square box. Bigger than 10° means
    // several NASA POWER requests (see fetchArea).
    { id: 'peninsular', name: 'Peninsular Malaysia', short: 'Peninsular Malaysia', lat: 4.0, lon: 102.0, size: 6, region: true,
      bounds: { latMin: 1.0, latMax: 7.0, lonMin: 99.5, lonMax: 104.5 } },
    { id: 'malaysia', name: 'all of Malaysia (with the sea between)', short: 'Malaysia', lat: 4.0, lon: 109.5, size: 20, region: true,
      bounds: { latMin: 0.5, latMax: 7.5, lonMin: 99.5, lonMax: 119.5 } },
    { id: 'borneo', name: 'Borneo', short: 'Borneo', lat: 1.5, lon: 114.0, size: 12, region: true,
      bounds: { latMin: -4.5, latMax: 7.5, lonMin: 108.5, lonMax: 119.5 } }
  ];

  // Area to average over: one grid cell, or a box from 2° to 20°. NASA POWER answers
  // at most 10° × 10° per request, so bigger boxes are fetched in parts (fetchArea).
  // The slider position is an index into SIZE_STEPS; 0 means a single grid cell.
  var SIZE_STEPS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
  var TILE_MAX = 10;   // the largest size is the last entry of SIZE_STEPS
  function sizeIndex(v) {
    var best = 0;
    for (var i = 1; i < SIZE_STEPS.length; i++) if (Math.abs(SIZE_STEPS[i] - v) < Math.abs(SIZE_STEPS[best] - v)) best = i;
    return best;
  }
  function sizeLabel(v) {
    var p = place(state.placeId);
    if (p && p.bounds) {
      var b = p.bounds;
      return T('The whole region ({a}° × {b}°)', { a: b.latMax - b.latMin, b: b.lonMax - b.lonMin });
    }
    return v < 2 ? T('One grid cell (about 50 km)')
      : T('{b}° box (about {km} km)', { b: v, km: (Math.round(v * 111 / 10) * 10).toLocaleString() }) +
        (v > TILE_MAX ? ' · ' + T('loads in parts, about a minute') : '');
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
    y0: FIRST_YEAR, y1: LAST_YEAR, month: 0, compare: '',
    step: 'year'          // 'year': one value per year; 'month': every month, seasonal cycle removed
  };
  var view = { anom: false, smooth: false, future: false };
  var cache = {};
  var runId = 0;
  var compareRequestId = 0, var2RequestId = 0, scanRequestId = 0;
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
    var bm = !!(window.TDi18n && window.TDi18n.lang === 'bm');   // Malay: U(tara), S(elatan), T(imur), B(arat)
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? (bm ? 'U' : 'N') : 'S') + ', ' +
      Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? (bm ? 'T' : 'E') : (bm ? 'B' : 'W'));
  }
  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function verdictLabel(v) { return v === 'significant' ? 'Significant' : (v === 'borderline' ? 'Borderline' : 'No clear trend'); }
  function verdictClass(v) { return v === 'significant' ? 'sig' : (v === 'borderline' ? 'border' : 'none'); }
  function ratePhrase(st, vr) { return withUnit(signed(st.sen.slope * 10, 2), vr.unit) + ' ' + T('per decade'); }

  // ---- data ----------------------------------------------------------------

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function box(lat, lon, size) {
    // Snap to half degrees: POWER rejects boxes that come out a hair under
    // 2 degrees wide after floating-point rounding (for example 2.10 to 4.10).
    var la0 = clamp(Math.round((lat - size / 2) * 2) / 2, -90, 90 - size);
    var lo0 = clamp(Math.round((lon - size / 2) * 2) / 2, -180, 180 - size);
    return { latMin: la0, latMax: la0 + size, lonMin: lo0, lonMax: lo0 + size };
  }

  /** The area a case covers: a named region's bounds, a square box, or null for one grid cell. */
  function regionOf(st) {
    var p = place(st.placeId);
    if (p && p.bounds) return p.bounds;
    return st.size ? box(st.lat, st.lon, st.size) : null;
  }

  /** Cut an area into equal tiles of at most 10° a side (NASA POWER's limit). */
  function splitArea(b) {
    var nLat = Math.max(1, Math.ceil((b.latMax - b.latMin) / TILE_MAX - 1e-9));
    var nLon = Math.max(1, Math.ceil((b.lonMax - b.lonMin) / TILE_MAX - 1e-9));
    var dLat = (b.latMax - b.latMin) / nLat, dLon = (b.lonMax - b.lonMin) / nLon, out = [];
    for (var i = 0; i < nLat; i++) {
      for (var j = 0; j < nLon; j++) {
        out.push({ latMin: b.latMin + i * dLat, latMax: b.latMin + (i + 1) * dLat,
          lonMin: b.lonMin + j * dLon, lonMax: b.lonMin + (j + 1) * dLon });
      }
    }
    return out;
  }

  function areaUrl(params, b) {
    return API + 'regional?parameters=' + params +
      '&latitude-min=' + b.latMin.toFixed(2) + '&latitude-max=' + b.latMax.toFixed(2) +
      '&longitude-min=' + b.lonMin.toFixed(2) + '&longitude-max=' + b.lonMax.toFixed(2) +
      '&community=AG&start=' + FIRST_YEAR + '&end=' + LAST_YEAR + '&format=JSON';
  }

  /**
   * Fetch one parameter for a case's area. Areas over 10° are fetched as tiles,
   * three at a time, and their grid cells merged into one regional answer (cells on
   * a shared edge are counted once). monthlyTable then averages them as usual.
   */
  function fetchArea(params, st, onProgress) {
    var b = regionOf(st);
    if (!b) return fetchJson(urlFor(params, st.lat, st.lon, 0));
    var tiles = splitArea(b);
    if (tiles.length === 1) return fetchJson(areaUrl(params, tiles[0]));
    var key = 'area|' + params + '|' + [b.latMin, b.latMax, b.lonMin, b.lonMax].join(',');
    if (cache[key]) return Promise.resolve(cache[key]);
    var replies = new Array(tiles.length), next = 0, done = 0;
    return new Promise(function (resolve, reject) {
      var failed = false;
      function launch() {
        if (failed || next >= tiles.length) return;
        var i = next++;
        fetchJson(areaUrl(params, tiles[i])).then(function (j) {
          replies[i] = j; done++;
          if (onProgress) onProgress(done, tiles.length);
          if (done === tiles.length) finish(); else launch();
        }, function (e) { if (!failed) { failed = true; reject(e); } });
      }
      function finish() {
        var seen = {}, feats = [];
        replies.forEach(function (j) {
          (j.features || []).forEach(function (f) {
            var c = f.geometry.coordinates, id = c[0].toFixed(3) + ',' + c[1].toFixed(3);
            if (!seen[id]) { seen[id] = 1; feats.push(f); }
          });
        });
        cache[key] = { type: 'FeatureCollection', features: feats };
        resolve(cache[key]);
      }
      for (var k = 0; k < 3; k++) launch();
    });
  }
  function isCached(params, st) {
    var b = regionOf(st);
    if (!b) return !!cache[urlFor(params, st.lat, st.lon, 0)];
    var tiles = splitArea(b);
    return tiles.length === 1 ? !!cache[areaUrl(params, tiles[0])]
      : !!cache['area|' + params + '|' + [b.latMin, b.latMax, b.lonMin, b.lonMax].join(',')];
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
          throw new Error(T('NASA POWER answered with error {status}.', { status: r.status }));
        }
        cache[url] = j;
        return j;
      });
    }, function () {
      throw new Error(T('Could not reach NASA POWER. Check your internet connection and try again.'));
    });
  }

  /**
   * Turn an API response into one monthly table {YYYYMM: value} for a parameter.
   * A regional response has one feature per grid cell: average them, weighted by
   * cos(latitude) because cells shrink towards the poles.
   */
  /**
   * Over open ocean NASA POWER gives topsoil wetness (GWETTOP) as exactly 1 in every
   * month, while the other land-only variables give -999 there. A cell like that is
   * ocean, not a measurement, so it is left out (and the raw answer is logged).
   */
  var OCEAN_FILL = { GWETTOP: 1 };
  function isOceanFill(param, t) {
    var f = OCEAN_FILL[param], n = 0;
    if (f === undefined || !t) return false;
    for (var k in t) {
      var v = t[k];
      if (v === null || v < FILL) continue;
      if (Math.abs(v - f) > 1e-6) return false;
      n++;
    }
    return n > 0;
  }
  function logOcean(param, n, json) {
    if (n && window.console) console.info('[Trend Detective] NASA POWER returned ' + param + ' = ' + OCEAN_FILL[param] +
      ' in every month for ' + n + ' grid cell(s): open ocean, left out of the average. Raw NASA response:', json);
  }

  function monthlyTable(json, param) {
    if (json.properties) {
      var pt = json.properties.parameter[param] || {};
      if (isOceanFill(param, pt)) { logOcean(param, 1, json); return { table: {}, cells: 0, ocean: 1 }; }
      return { table: pt, cells: 1, ocean: 0 };
    }
    var feats = json.features || [];
    var sum = {}, wsum = {}, ocean = 0, land = 0;
    feats.forEach(function (f) {
      var w = Math.cos(f.geometry.coordinates[1] * Math.PI / 180);
      var t = f.properties.parameter[param] || {};
      if (isOceanFill(param, t)) { ocean++; return; }
      land++;
      for (var k in t) {
        var v = t[k];
        if (v === null || v < FILL) continue;
        sum[k] = (sum[k] || 0) + v * w;
        wsum[k] = (wsum[k] || 0) + w;
      }
    });
    var out = {};
    for (var k in sum) out[k] = sum[k] / wsum[k];
    logOcean(param, ocean, json);
    return { table: out, cells: land, ocean: ocean };
  }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  /**
   * One value per year: the mean of all twelve months, one chosen month, or a
   * three-month season (a negative month means that month of the year before).
   * Months are weighted by their number of days, the same way NASA POWER
   * computes its own annual value (so February counts a little less).
   */
  function yearlySeries(table, y0, y1, month) {
    var years = [], values = [], skipped = [];
    var ms = !month ? partMonths(0) : SEASONS[month] || [month];
    for (var y = y0; y <= y1; y++) {
      var s = 0, days = 0, missing = [];
      for (var i = 0; i < ms.length; i++) {
        var m = Math.abs(ms[i]), yy = ms[i] < 0 ? y - 1 : y;
        var x = table[yy + (m < 10 ? '0' : '') + m];
        if (x === undefined || x === null || x < FILL) { missing.push(m); continue; }
        s += x * daysInMonth(yy, m);
        days += daysInMonth(yy, m);
      }
      // a year with any month missing is left out, and remembered so the page can say so
      if (missing.length) { skipped.push({ year: y, missing: missing }); continue; }
      years.push(y); values.push(s / days);
    }
    return { years: years, values: values, skipped: skipped, expected: y1 - y0 + 1 };
  }

  /**
   * Every month as its difference from that calendar month's average over the
   * period: the seasonal cycle is removed, so a trend shows month by month. Times
   * are decimal years (mid-month). With a season or month chosen, only its months.
   */
  function monthlyAnomalies(table, y0, y1, month) {
    var ms = partMonths(month).slice().sort(function (a, b) { return a - b; });
    var key = function (y, m) { return y + (m < 10 ? '0' : '') + m; };
    var ok = function (v) { return v !== undefined && v !== null && v >= FILL; };
    var sum = {}, cnt = {}, y, i, m, v;
    for (y = y0; y <= y1; y++) for (i = 0; i < ms.length; i++) {
      m = ms[i]; v = table[key(y, m)];
      if (ok(v)) { sum[m] = (sum[m] || 0) + v; cnt[m] = (cnt[m] || 0) + 1; }
    }
    var years = [], values = [], skipped = [];
    for (y = y0; y <= y1; y++) {
      var missing = [];
      for (i = 0; i < ms.length; i++) {
        m = ms[i]; v = table[key(y, m)];
        if (!ok(v) || !cnt[m]) { missing.push(m); continue; }
        years.push(y + (m - 0.5) / 12); values.push(v - sum[m] / cnt[m]);
      }
      if (missing.length) skipped.push({ year: y, missing: missing });
    }
    return { years: years, values: values, skipped: skipped, monthly: true, expected: (y1 - y0 + 1) * ms.length };
  }

  /** The series a case tests: yearly values, or monthly anomalies. */
  function seriesOf(table, st) {
    return st.step === 'month' ? monthlyAnomalies(table, st.y0, st.y1, st.month) : yearlySeries(table, st.y0, st.y1, st.month);
  }
  /**
   * The tests for a series. stats.js (Ryan) adjusts both tests for year-to-year
   * memory (lag-1 autocorrelation) for every series, yearly or monthly; the verdict
   * uses the memory-adjusted Mann-Kendall p-value (mk.pAdj).
   */
  function analyzeFor(st, years, values) {
    return S.analyze(years, values);
  }
  /** Distinct calendar years in a series (months share a year). */
  function yearCount(ser) {
    var seen = {}, n = 0;
    ser.years.forEach(function (x) { var y = Math.floor(x); if (!seen[y]) { seen[y] = 1; n++; } });
    return n;
  }
  /** "2015" for a yearly point, "Mar 2015" for a monthly one. */
  function whenLabel(x) {
    if (x === Math.floor(x)) return String(x);
    var y = Math.floor(x), m = Math.round((x - y) * 12 + 0.5);
    return T(MONTH_SHORT[m - 1]) + ' ' + y;
  }

  function loadSeries(vid, st, onProgress) {
    var pm = prm(variable(vid));
    return fetchArea(pm, st, onProgress).then(function (json) {
      var mt = monthlyTable(json, pm);
      var ser = seriesOf(mt.table, st);
      ser.cells = mt.cells;
      ser.ocean = mt.ocean;
      ser.table = mt.table;
      return ser;
    });
  }

  /**
   * Centred k-year running mean; null where the window is incomplete.
   * A window that spans a skipped year is incomplete too.
   */
  function runningMean(years, vals, k, dx) {
    var h = Math.floor(k / 2), out = [], step = dx || 1;   // dx: spacing of the points (1 year, or 1/12 for months)
    for (var i = 0; i < vals.length; i++) {
      var span = i < h || i >= vals.length - h ? null : years[i + h] - years[i - h];
      if (span === null || Math.abs(span - 2 * h * step) > step / 2) { out.push(null); continue; }
      var s = 0;
      for (var j = i - h; j <= i + h; j++) s += vals[j];
      out.push(s / k);
    }
    return out;
  }

  // ---- drawing (chart.js) ----------------------------------------------------
  // The chart, the months panel, the two-variable chart and the PNG export live in
  // chart.js. They get the helpers and state they need here.

  var C = window.TDChart;
  C.init({
    S: S, T: T, esc: esc, clamp: clamp, fmtValue: fmtValue, fmtAnom: fmtAnom, pEquals: pEquals, ratePhrase: ratePhrase,
    verdictLabel: verdictLabel, runningMean: runningMean, yearlySeries: yearlySeries, chooseMonth: chooseMonth,
    setPeriod: setPeriod, investigate: investigate, toast: toast, view: view,
    MONTHS: MONTHS, MONTH_SHORT: MONTH_SHORT, MIN_YEARS: MIN_YEARS, MERRA: MERRA, CERES: CERES, REDUCED: REDUCED, whenLabel: whenLabel,
    get current() { return current; }, get compareData() { return compareData; }
  });
  function drawChart(res, animate) { C.drawChart(res, animate); }
  function drawSeason(res) { C.drawSeason(res); }
  function drawPair(host, ys, za, zb, la, lb) { C.drawPair(host, ys, za, zb, la, lb); }
  function savePng() { C.savePng(); }

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
    // whole years, also for monthly data (whose times are decimal years)
    var a = Math.floor(res.years[0]), b = Math.floor(res.years[res.years.length - 1]);
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
    // the formula gives years; monthly data has twelve points a year
    var have = res.step === 'month' ? res.years[res.years.length - 1] - res.years[0] + 1 / 12 : o.n;
    return { total: Math.ceil(nStar), more: Math.ceil(nStar - have) };
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

  /**
   * Data quality: how much of the chosen period was used, and why anything was left
   * out. Runs at the start or end are described as such; gaps are listed.
   */
  function qualityText(res) {
    var sk = res.skipped || [];
    if (!sk.length) return '';
    var monthly = res.step === 'month';
    var used = res.years.length, total = res.expected;
    var head = monthly ? T('Used {n} of {t} months.', { n: used, t: total }) : T('Used {n} of {t} years.', { n: used, t: total });
    var yrs = sk.map(function (x) { return x.year; });
    var lead = [], trail = [], mid = [];
    var y = res.y0;
    while (yrs.indexOf(y) >= 0) { lead.push(y); y++; }
    y = res.y1;
    while (yrs.indexOf(y) >= 0 && lead.indexOf(y) < 0) { trail.unshift(y); y--; }
    yrs.forEach(function (x) { if (lead.indexOf(x) < 0 && trail.indexOf(x) < 0) mid.push(x); });
    var parts = [];
    var range = function (a) { return a.length > 1 ? a[0] + '–' + a[a.length - 1] : String(a[0]); };
    if (lead.length) {
      if (lead.length === 1 && res.month === 15 && lead[0] === FIRST_YEAR && !monthly) {
        parts.push(T('{y} left out: December to February needs the December before, which is before the record starts.', { y: lead[0] }));
      } else {
        parts.push(T('No data for {y} here.', { y: range(lead) }));
      }
    }
    if (mid.length) {
      var list = mid.slice(0, 6).join(', ') + (mid.length > 6 ? ' ' + T('and {n} more', { n: mid.length - 6 }) : '');
      parts.push(T(monthly ? '{y}: some months missing.' : '{y} skipped: missing months.', { y: list }));
    }
    if (trail.length) {
      parts.push(trail[trail.length - 1] === LAST_YEAR && trail.length === 1
        ? T('{y} left out: not every month is in NASA POWER yet.', { y: trail[0] })
        : T('No data for {y} here.', { y: range(trail) }));
    }
    return head + ' ' + parts.join(' ');
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
    if (!current) $('settings').open = false;   // first answer: fold the settings away so the result comes first
    current = res;
    var vr = res.variable, st = res.stats, n = res.years.length, monthly = res.step === 'month';
    // single months are too noisy to call out as spikes; the spike check is for yearly values
    var spk = monthly ? { list: [] } : findSpikes(res.years, res.values, st);
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
      (monthly ? T('each month minus its normal') + (res.month ? ' (' + T(MONTHS[res.month]) + ')' : '')
        : T(res.month ? '{month} average' : 'yearly average', { month: T(MONTHS[res.month]) })) + ', ' +
      (res.placeId === 'custom' ? coordLabel(res.lat, res.lon) : T(res.placeName));
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
      esc(monthly ? T('Along the trend line from {a} to {b} ({n} months of data).', { a: whenLabel(res.years[0]), b: whenLabel(res.years[n - 1]), n: n })
        : T('Along the trend line from {a} to {b} ({n} years of data).', { a: res.years[0], b: res.years[n - 1], n: n })), 1);
    tiles += tile(T('Mann-Kendall test'), esc(pEquals(st.mk.pAdj)),
      esc(T('Checks whether later years are mostly higher or lower than earlier ones. Below 0.05 counts as significant. Kendall’s tau is {t} (1 is always rising, −1 always falling).', { t: st.mk.tau.toFixed(2) })) +
      ' ' + esc(T('Adjusted for year-to-year memory.')), 2);
    tiles += tile(T('t-test on the slope'), esc(pEquals(st.ols.pAdj)),
      esc(T('The chance of seeing a slope this steep if there were really no trend. The line explains {r}% of the year-to-year variation.', { r: Math.round(st.ols.r2 * 100) })), 3);
    tiles += tile(T('Sen’s slope'), esc(withUnit(signed(st.sen.slope * 10, 2), vr.unit)) + perDec,
      esc(T('The middle value of the slopes between every pair of years. One freak year barely moves it.')), 4);
    if (need) {
      tiles += tile(T('Years needed to tell'), need.more > 150 ? '150+' : (need.more > 0 ? '+' + need.more + ' <small>' + esc(T('more years')) + '</small>' : esc(T('Enough'))),
        esc(T('How long a record a trend of this size needs before a test can reliably detect it ({n} years in total), from Weatherhead et al. (1998).', { n: need.total })), 5);
    }
    $('tiles').innerHTML = tiles;
    if (fresh) replay($('tiles')); else $('tiles').classList.remove('reveal');

    // stats.js adjusts both tests for memory; say so when it made a real difference
    var note = '', o = st.ols;
    if (o.nEff < n * 0.67) {   // only when memory is strong enough to matter
      note = T(monthly ? 'Neighbouring months are alike (lag-1 autocorrelation {r}), so {n} monthly values carry about as much independent information as {e}. Both tests were adjusted for this.'
        : 'Each year here resembles the year before it (lag-1 autocorrelation {r}), so {n} years carry about as much independent information as {e}. Both tests were adjusted for this.',
        { r: o.lag1.toFixed(2), n: n, e: Math.max(2, Math.round(o.nEff)) });
    }
    $('caution').textContent = note;
    $('caution').hidden = !note;
    var q = qualityText(res);
    $('quality').textContent = q;
    $('quality').hidden = !q;

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
      (res.cells > 1 ? 'Averaged over ' + res.cells + ' grid cells in the area, weighted by area.' : 'One grid cell at ' + esc(coordLabel(res.lat, res.lon)) + '.') +
      (res.ocean ? ' ' + esc(T('{n} open-ocean cells were left out: NASA POWER has no soil there.', { n: res.ocean })) : '') +
      (monthly ? ' ' + esc(T('Each value is that month minus the average for the same calendar month in {a}–{b}.', { a: res.y0, b: res.y1 })) : '') + '</span>';

    $('table-body').innerHTML = res.years.map(function (y, i) {
      return '<tr><td>' + whenLabel(y) + '</td><td>' + res.values[i].toFixed(vr.dp) + '</td><td>' +
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
    if (!isCached(prm(vr), snap)) setStatus(T('Fetching {what} for {where} from NASA POWER…', {
      what: T(vr.name).toLowerCase(), where: T(state.placeName)
    }));
    loadSeries(vr.id, snap, function (a, b) {
      if (id === runId) setStatus(T('Fetching a big area in {b} parts from NASA POWER: {a} of {b} done…', { a: a, b: b }));
    }).then(function (ser) {
      if (id !== runId) return;
      var got = yearCount(ser);
      if (ser.ocean && !ser.cells) {
        throw new Error(T('{what} is only measured on land, and this spot is open ocean. Choose a place on land, or another variable.', {
          what: capFirst(T(vr.name).toLowerCase()) }));
      }
      if (got < MIN_YEARS) {
        throw new Error(T('Only {n} usable years of {what} here for that period. A trend test needs at least {min}. Try a longer period, another place or another variable.', {
          n: got, what: T(vr.name).toLowerCase(), min: MIN_YEARS
        }));
      }
      render({ variable: vr, years: ser.years, values: ser.values, cells: ser.cells, table: ser.table,
        skipped: ser.skipped, expected: ser.expected, step: snap.step, ocean: ser.ocean,
        stats: analyzeFor(snap, ser.years, ser.values), placeName: snap.placeName, short: snap.short, placeId: snap.placeId,
        lat: snap.lat, lon: snap.lon, size: snap.size, month: snap.month, y0: snap.y0, y1: snap.y1 });
      if (opts.scroll) $('result').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    }).catch(function (e) {
      if (id !== runId) return;
      setStatus(e.message, true);
      if (globe) globe.setBadge({ title: T('No answer here'), text: T('See the case file for why'), cls: 'none' });
      // The old answer belonged to other settings: take it away so it cannot be read
      // as the result of this case. Only the message above stays.
      current = null; compareData = null;
      $('result').hidden = true;
      $('empty').hidden = true;
      document.dispatchEvent(new CustomEvent('td:clear'));
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
    var requestId = ++compareRequestId;
    var res = current, note = $('compare-note');
    var p = compareTarget();
    updateMap(false);
    if (!res || !p) {
      if (compareData) { compareData = null; drawChart(res, false); }
      note.hidden = true;
      return;
    }
    var vr = res.variable, myRun = runId;
    // same area size as the main case; a whole region compares against the place's own box
    var mainP = place(res.placeId);
    var snap = { lat: p.lat, lon: p.lon, size: mainP && mainP.bounds ? p.size : res.size, placeId: p.id,
      y0: res.y0, y1: res.y1, month: res.month, step: res.step };
    if (!compareData || compareData.id !== p.id) {
      note.hidden = false;
      note.textContent = T('Loading {name} from NASA POWER…', { name: T(p.short).toLowerCase() });
    }
    loadSeries(vr.id, snap).then(function (ser) {
      if (requestId !== compareRequestId || myRun !== runId || current !== res || state.compare !== p.id) return;
      if (yearCount(ser) < MIN_YEARS) throw new Error(T('There is not enough {what} data for {where} in that period.', {
        what: T(vr.name).toLowerCase(), where: T(p.short)
      }));
      compareData = { id: p.id, v: vr.id, name: p.name, short: p.short, years: ser.years, values: ser.values,
        table: ser.table, stats: analyzeFor(snap, ser.years, ser.values) };   // table: for its own 1991–2020 baseline
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
        verdictLabel(b.verdict).toLowerCase() + ', ' + esc(pEquals(b.mk.pAdj)) + ').' + esc(comp) +
        (view.anom ? '' : ' <button type="button" class="link" id="to-anom">Show both as difference from average</button>');
    }).catch(function (e) {
      if (requestId !== compareRequestId || myRun !== runId || current !== res || state.compare !== p.id) return;
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
    var requestId = ++var2RequestId;
    fillVar2();
    var id = $('var2').value, host = $('var2-chart'), note = $('var2-note');
    host.innerHTML = ''; note.textContent = '';
    if (!id || !current) return;
    var res = current, vb = variable(id), myRun = runId;
    note.textContent = T('Loading {name} from NASA POWER…', { name: vname(vb).toLowerCase() });
    loadSeries(vb.id, { lat: res.lat, lon: res.lon, size: res.size, placeId: res.placeId, y0: res.y0, y1: res.y1, month: res.month, step: res.step }).then(function (ser) {
      if (requestId !== var2RequestId || myRun !== runId || current !== res || $('var2').value !== id) return;
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
      // If removing the trends flips the sign, say so: the first link came only from both changing over the years.
      var flipped = r * rd < 0 && Math.abs(rd) >= 0.2;
      var det = flipped
        ? T(rd < 0 ? 'After removing both long-term trends, the link turns the other way ({s}, r = {r}): a year with more {a} than usual tends to have less {b}. The first link came from both rising or falling over the same years.'
          : 'After removing both long-term trends, the link turns the other way ({s}, r = {r}): a year with more {a} than usual tends to have more {b}. The first link came from both rising or falling over the same years.',
          { s: strength(rd).replace(/^(a|an) /, ''), r: rd.toFixed(2), a: A, b: B })
        : T('After removing both long-term trends, the link is {s} (r = {r}), which shows how much of it is just two things changing over the same years.',
          { s: strength(rd).replace(/^(a|an) /, ''), r: rd.toFixed(2) });
      note.innerHTML = esc(lead) + ' ' + esc(det) + ' <span class="muted">' + esc(T('A link is not proof that one causes the other.')) + '</span>';
    }).catch(function (e) {
      if (requestId === var2RequestId && myRun === runId && current === res && $('var2').value === id) note.textContent = e.message;
    });
  }

  // ---- scan every variable -------------------------------------------------

  function scan() {
    if (!current) return;
    var scanId = ++scanRequestId;
    var st = { lat: current.lat, lon: current.lon, size: current.size, placeId: current.placeId,
      y0: current.y0, y1: current.y1, month: current.month, step: current.step };
    var out = $('scan-out'), status = $('scan-status'), btn = $('scan');
    var area = regionOf(st);
    if (area && splitArea(area).length > 1) {
      status.textContent = T('Scanning every variable works for areas up to 10° × 10°. A bigger area would need dozens of slow requests. Choose a smaller area, or test variables one at a time.');
      return;
    }
    var myRun = runId;
    btn.disabled = true;
    out.innerHTML = '';
    var results = [];

    function add(vr, ser) {
      if (yearCount(ser) < MIN_YEARS) { results.push({ vr: vr, skip: true }); return; }
      results.push({ vr: vr, stats: analyzeFor(st, ser.years, ser.values), n: ser.years.length, y0: ser.years[0] });
    }
    function finish() {
      if (myRun !== runId || scanId !== scanRequestId) {
        btn.disabled = false;
        status.textContent = '';
        return;
      }
      btn.disabled = false;
      status.textContent = '';
      var ok = results.filter(function (r) { return !r.skip; }).sort(function (a, b) { return a.stats.mk.pAdj - b.stats.mk.pAdj; });
      var skipped = results.filter(function (r) { return r.skip; });
      var nsig = ok.filter(function (r) { return r.stats.verdict === 'significant'; }).length;
      var html = '<p>' + esc(T('{sig} of {n} variables show a significant trend here. Click a name to open it.', {
        sig: nsig, n: ok.length
      })) + '</p>' +
        '<table class="leads"><thead><tr><th>' + esc(T('Variable')) + '</th><th>' + esc(T('Direction')) +
        '</th><th>' + esc(T('Strength (tau)')) + '</th><th>' + esc(T('Change per decade')) +
        '</th><th>' + esc(T('Mann-Kendall p')) + '</th><th>' + esc(T('Verdict')) + '</th></tr></thead><tbody>';
      ok.forEach(function (r) {
        var dir = r.stats.direction === 'up' ? '↑ ' + T('rising')
          : (r.stats.direction === 'down' ? '↓ ' + T('falling') : T('flat'));
        var tau = r.stats.mk.tau, w = Math.min(50, Math.abs(tau) * 50).toFixed(1);
        html += '<tr><td><button type="button" class="link" data-v="' + r.vr.id + '">' + esc(T(r.vr.name)) + '</button></td><td>' + esc(dir) +
          '</td><td><span class="taubar' + (r.stats.verdict === 'none' ? ' faint' : '') + '" title="tau ' + tau.toFixed(2) + '"><i class="' + (tau < 0 ? 'neg' : 'pos') +
          '" style="width:' + w + '%"></i></span></td><td>' + esc(withUnit(signed(r.stats.sen.slope * 10, 2), r.vr.unit)) + '</td><td>' + esc(fmtP(r.stats.mk.pAdj)) +
          '</td><td><span class="badge badge-small badge-' + verdictClass(r.stats.verdict) + '">' + esc(T(verdictLabel(r.stats.verdict))) + '</span></td></tr>';
      });
      html += '</tbody></table>';
      if (skipped.length) {
        var skippedNames = skipped.map(function (r) { return T(r.vr.name).toLowerCase(); }).join(', ');
        html += '<p class="muted">' + esc(T('Not enough data here for: {items}.', { items: skippedNames })) + '</p>';
      }
      html += '<p class="muted">' + esc(T('With {n} tests at the 0.05 level, expect about one false alarm in twenty even where nothing is changing. Treat this list as leads to investigate, not proof.', {
        n: ok.length
      })) + '</p>';
      out.innerHTML = html;
    }

    if (!area) {
      status.textContent = T('Scanning all {n} variables…', { n: VARIABLES.length });
      var ids = VARIABLES.map(prm).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(',');
      fetchJson(urlFor(ids, st.lat, st.lon, 0)).then(function (json) {
        VARIABLES.forEach(function (vr) {
          add(vr, seriesOf(monthlyTable(json, prm(vr)).table, st));
        });
        finish();
      }).catch(function (e) {
        if (myRun !== runId || scanId !== scanRequestId) {
          btn.disabled = false; status.textContent = '';
          return;
        }
        btn.disabled = false; status.textContent = e.message;
      });
      return;
    }
    // Regional requests take one variable each. Keep at most two in flight,
    // below the requested 3–4 request ceiling and friendlier to NASA POWER.
    var queue = VARIABLES.slice(), done = 0;
    function next() {
      if (myRun !== runId || scanId !== scanRequestId) { finish(); return; }
      var vr = queue.shift();
      if (!vr) return;
      loadSeries(vr.id, st).then(function (ser) { add(vr, ser); }, function () { results.push({ vr: vr, skip: true }); })
        .then(function () {
          done++;
          status.textContent = T('Scanned {done} of {n} variables…', { done: done, n: VARIABLES.length });
          if (done === VARIABLES.length) finish(); else next();
        });
    }
    status.textContent = T('Scanning {n} variables. This takes about half a minute for a box…', { n: VARIABLES.length });
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
      part: part('when', (state.month ? T('in {month}', { month: T(MONTHS[state.month]) }) : T('whole year')) +
        (state.step === 'month' ? ', ' + T('month by month') : '')) });
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
    $('size').value = sizeIndex(state.size);
    $('step').value = state.step;
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
    var pr = place($('place').value);
    if (pr && pr.bounds) state.size = pr.size;           // a whole region keeps its own area
    else state.size = SIZE_STEPS[clamp(parseInt($('size').value, 10) || 0, 0, SIZE_STEPS.length - 1)];
    state.step = $('step').value === 'month' ? 'month' : 'year';
    var a = parseInt($('y0').value, 10), b = parseInt($('y1').value, 10);
    state.y0 = Math.min(a, b); state.y1 = Math.max(a, b);
    state.month = parseInt($('month').value, 10) || 0;
    state.placeId = $('place').value;
    var p = place(state.placeId);
    state.placeName = p ? p.name : coordLabel(state.lat, state.lon);
    state.short = p ? p.short : 'Your place';
    showSize();
    updateBrief();
  }

  function setCustom(lat, lon) {
    state.placeId = 'custom';
    $('place').value = 'custom';
    $('lat').value = lat.toFixed(2); $('lon').value = lon.toFixed(2);
    readForm(); updateMap(false);
  }

  // ---- "At this spot": one quick reading per topic after a click on the globe ----

  // One variable stands in for each topic. The full list is still in the case settings.
  var SPOT_VARS = ['T2M', 'PRECTOTCORR', 'GWETROOT', 'CLOUD_AMT', 'AOD_55'];
  var spotRun = 0;

  function topicLabel(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return T(TOPICS[i].label);
    return id;
  }

  function showSpot(lat, lon) {
    var run = ++spotRun, box = $('spot');
    var head = '<h2 class="spot-title">' + esc(T('At this spot')) + ' <span>' + esc(coordLabel(lat, lon)) + '</span></h2>';
    box.innerHTML = head + '<p class="spot-note">' + esc(T('Asking NASA…')) + '</p>';
    box.hidden = false;

    // One request for all five variables, for the single grid cell that was clicked.
    var url = urlFor(SPOT_VARS.join(','), lat, lon, 0);
    fetchJson(url).then(function (json) {
      if (run !== spotRun) return;               // a newer click has taken over
      var rows = SPOT_VARS.map(function (id) {
        var vr = variable(id);
        var ser = yearlySeries(monthlyTable(json, id).table, FIRST_YEAR, LAST_YEAR, 0);
        return { vr: vr, ser: ser, st: ser.years.length >= MIN_YEARS ? S.analyze(ser.years, ser.values) : null };
      });
      box.innerHTML = head + '<ul class="spot-list">' + rows.map(spotRow).join('') + '</ul>' +
        '<p class="spot-note">' + esc(T('One grid cell, yearly averages from NASA POWER. Pick one to open the full case: chart, tests and evidence.')) + '</p>';
    }).catch(function (e) {
      if (run !== spotRun) return;
      box.innerHTML = head + '<p class="spot-note">' + esc(e.message) + '</p>';
    });
  }

  function spotRow(r) {
    var vr = r.vr, label = '<span class="spot-topic">' + esc(topicLabel(vr.topic)) + '</span>' +
      '<span class="spot-var">' + esc(vname(vr)) + '</span>';
    if (!r.ser.years.length) {
      return '<li><div class="spot-row spot-empty">' + label + '<span class="spot-val">' + esc(T('No data here')) + '</span></div></li>';
    }
    var last = r.ser.years.length - 1;
    var value = '<span class="spot-val">' + esc(fmtValue(r.ser.values[last], vr)) + ' <small>' + r.ser.years[last] + '</small></span>';
    var trend = '';
    if (r.st) {
      var arrow = r.st.direction === 'up' ? '↑ ' : (r.st.direction === 'down' ? '↓ ' : '');
      trend = '<span class="spot-trend">' + esc(arrow + ratePhrase(r.st, vr)) +
        ' <span class="badge badge-small badge-' + verdictClass(r.st.verdict) + '">' + esc(T(verdictLabel(r.st.verdict))) + '</span></span>';
    }
    return '<li><button type="button" class="spot-row" data-var="' + vr.id + '">' + label + value + trend + '</button></li>';
  }

  // Picking a row makes it the case: same spot, that variable, then run it.
  function initSpot() {
    $('spot').addEventListener('click', function (e) {
      var row = e.target.closest('button[data-var]');
      if (!row) return;
      var vr = variable(row.getAttribute('data-var'));
      state.topic = vr.topic; state.v = vr.id;
      renderVariables();
      investigate({ scroll: true });
    });
  }

  function initMap() {
    if (!window.TDGlobe || !window.d3) { $('map').hidden = true; return; }
    globe = window.TDGlobe.create($('map'), {
      places: PLACES.filter(function (p) { return !p.region; }),   // whole regions are chosen from the list
      fill: true,
      onStyle: function (name) { toast(T(name)); },
      onPick: function (lat, lon) {
        setCustom(lat, lon);
        // The current variable runs as before (its result shows in the card on the globe),
        // and the case file opens with a reading of every topic so the user can switch.
        showSpot(lat, lon);
        if (window.TDPanel) window.TDPanel.open();
        if (!wideScreen()) $('spot').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
        if (current) scheduleLive(500); else investigate({ scroll: false });
      },
      onPlace: function (id) {
        spotRun++; $('spot').hidden = true;      // the spot card belongs to a clicked point, not a named place
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
    var fromTo = [Math.floor(y0), Math.floor(y1)];
    globe.setBadge({
      place: (res.placeId === 'custom' ? coordLabel(res.lat, res.lon) : T(res.short || res.placeName)) +
        (res.month ? ' · ' + T(MONTHS[res.month]) : ''),
      title: vname(vr), cls: verdictClass(st.verdict),
      text: arrow + T('{x} per decade', { x: withUnit(signed(st.sen.slope * 10, 2), vr.unit) }), note: T(verdictLabel(st.verdict)),
      spark: { values: res.values, trend: [line(y0), line(y1)], from: fromTo[0], to: fromTo[1] },
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
    return { lat: lat, lon: lon, size: size, placeId: placeId, box: regionOf({ lat: lat, lon: lon, size: size, placeId: placeId }) };
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
      (state.compare ? '&c=' + encodeURIComponent(state.compare) : '') + (view.anom ? '&a=1' : '') + (view.smooth ? '&s=1' : '') + (view.future ? '&f=1' : '') +
      (state.step === 'month' ? '&ts=m' : '');
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* file preview: ignore */ }
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return false;
    var q = {};
    try {
      h.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      });
    } catch (e) { return false; }
    if (!q.v) return false;
    var vr = variable(q.v);
    state.v = vr.id; state.topic = vr.topic;
    var p = place(q.p);
    state.placeId = p ? p.id : 'custom';
    var lat = Number(q.lat), lon = Number(q.lon);
    state.lat = q.lat !== undefined && Number.isFinite(lat) ? clamp(lat, -89.5, 89.5) : (p ? p.lat : HOME.lat);
    state.lon = q.lon !== undefined && Number.isFinite(lon) ? clamp(lon, -180, 180) : (p ? p.lon : HOME.lon);
    var qs = Number(q.size);
    state.size = SIZE_STEPS.indexOf(qs) >= 0 ? qs : 2;
    if (p && p.bounds) state.size = p.size;            // a whole region keeps its own area
    state.step = q.ts === 'm' ? 'month' : 'year';
    var y0 = Number(q.y0), y1 = Number(q.y1);
    var validYear = function (y) { return Number.isInteger(y) && y >= FIRST_YEAR && y <= LAST_YEAR; };
    if (validYear(y0) && validYear(y1) && y0 <= y1) {
      state.y0 = y0; state.y1 = y1;
    } else {
      state.y0 = FIRST_YEAR; state.y1 = LAST_YEAR;
    }
    var month = Number(q.m);
    state.month = Number.isInteger(month) && month >= 0 && month <= 16 ? month : 0;
    var compare = q.c || '';
    var point = /^pt:([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)$/.exec(compare);
    var validPoint = point && Number(point[1]) >= -90 && Number(point[1]) <= 90 && Number(point[2]) >= -180 && Number(point[2]) <= 180;
    state.compare = place(compare) || validPoint ? compare : '';
    view.future = q.f === '1';
    view.anom = q.a === '1';
    view.smooth = q.s === '1';
    return true;
  }

  function downloadCsv() {
    if (!current) return;
    var vr = current.variable, ols = current.stats.ols;
    var csvCell = function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; };
    var monthly = current.step === 'month', sen = current.stats.sen;
    var lines = [[monthly ? 'month' : 'year', vr.id + (monthly ? '_minus_monthly_normal' : '') + (vr.unit ? ' (' + vr.unit + ')' : ''),
      'trend_line', 'band_low_95', 'band_high_95', 'prediction_low_95', 'prediction_high_95', 'residual', 'sen_line'].map(csvCell).join(',')];
    current.years.forEach(function (y, i) {
      var t = monthly ? Math.floor(y) + '-' + ('0' + Math.round((y - Math.floor(y)) * 12 + 0.5)).slice(-2) : y;
      var fit = ols.intercept + ols.slope * y;
      var lever = 1 / ols.n + Math.pow(y - ols.meanX, 2) / ols.sxx;
      var h = ols.tCrit * ols.residualSE * Math.sqrt(lever);             // confidence band, adjusted for memory (as drawn)
      var ph = ols.tCritPlain * ols.residualSE * Math.sqrt(1 + lever);   // prediction interval for single values
      var resid = ols.resid ? ols.resid[i] : current.values[i] - fit;
      lines.push([t].concat([current.values[i], fit, fit - h, fit + h, fit - ph, fit + ph, resid].map(function (v) { return v.toFixed(4); }))
        .concat(sen ? [(sen.intercept + sen.slope * y).toFixed(4)] : ['']).map(csvCell).join(','));
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
    initSpot();
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
    $('size').addEventListener('input', function () {
      var p = place($('place').value);
      if (p && p.bounds) $('place').value = 'custom';   // moving the slider means a box of your own
      readForm(); updateMap(false);
    });
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
    if (cfg.step !== undefined) state.step = cfg.step === 'month' ? 'month' : 'year';
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
    seriesOf: seriesOf, monthlyAnomalies: monthlyAnomalies, isOceanFill: isOceanFill,
    raw: function (url) { return cache[url]; },   // debugging: the raw NASA answer behind a URL regionOf: regionOf, splitArea: splitArea, whenLabel: whenLabel,
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
