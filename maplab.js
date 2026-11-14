/*
 * Trend Detective map tools, drawn on the globe:
 *   Trend map      one Sen's slope + Mann-Kendall test per NASA POWER grid cell (red up, blue down)
 *   Significance   a dot on every cell where p < 0.05
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
  var TD, panel, active = '', loadKey = '', token = 0;
  var grid = null;           // { key, cells, dlon, dlat, vr }
  var lapse = { timer: 0, i: 0, mode: 'anom', speed: 1 };
  var rain = { timer: 0, i: 0, frames: null, speed: 1 };
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
    clearInterval(lapse.timer); clearInterval(rain.timer);
    g.setCells(null); g.setMarks(null); g.setRaster(null); g.setField(null);
    active = id || '';
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
        var table = f.properties.parameter[pm] || {};
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

  function showTrend() {
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
      var list = ok.map(function (c) {
        var b = cellBounds(c), r = c.stats.sen.slope * 10, t = Math.max(-1, Math.min(1, r / lim));
        b.fill = d3.interpolateRdBu(0.5 - t / 2);
        b.opacity = 0.82;
        b.dot = c.stats.mk.p < 0.05;
        return b;
      });
      TD.globe.setCells(list);

      var up = ok.filter(function (c) { return c.stats.mk.p < 0.05 && c.stats.sen.slope > 0; });
      var dn = ok.filter(function (c) { return c.stats.mk.p < 0.05 && c.stats.sen.slope < 0; });
      var html = '<div class="lp-head"><strong>' + esc(T('Trend map')) + '</strong><span>' + esc(TD.vname(vr)) + ', ' +
        TD.state.y0 + '–' + TD.state.y1 + (TD.state.month ? ', ' + esc(T(TD.MONTHS[TD.state.month])) : '') + '</span></div>';
      html += boxCtl();
      html += '<div class="lp-scale"><span>' + esc(TD.withUnit(TD.signed(-lim, 2), vr.unit)) + '</span><i class="lp-ramp lp-ramp-div"></i><span>' +
        esc(TD.withUnit(TD.signed(lim, 2), vr.unit)) + '</span></div>';
      html += '<p class="lp-key"><span class="lp-dot"></span>' + esc(T('Dot: statistically significant (p < 0.05). Red: going up, blue: going down, per decade.')) + '</p>';
      html += '<p class="lp-note">' + esc(T('{s} of {n} grid cells show a significant trend: {u} rising, {d} falling.',
        { s: up.length + dn.length, n: ok.length, u: up.length, d: dn.length })) + '</p>';

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

  function showLapse(startFrame) {
    var my = token;
    busy(T('Timelapse'), T('Loading every month in a {b}° box around this place…', { b: BOX }));
    TD.globe.flyTo(TD.state.lat, TD.state.lon, BOX, 1300, zoomFor());
    loadGrid().then(function (g) {
      if (my !== token) return;
      loadKey = g.key;
      var s = TD.state, frames = [];
      var keep = TD.partMonths(s.month);
      for (var y = s.y0; y <= s.y1; y++) for (var m = 1; m <= 12; m++) {
        if (keep.indexOf(m) < 0) continue;
        frames.push(y + (m < 10 ? '0' : '') + m);
      }
      // each cell's normal for every calendar month
      g.cells.forEach(function (c) {
        var sum = {}, n = {};
        frames.forEach(function (k) {
          var v = c.table[k]; if (v === undefined || v === null || v < -900) return;
          var mm = k.slice(4); sum[mm] = (sum[mm] || 0) + v; n[mm] = (n[mm] || 0) + 1;
        });
        c.normal = {};
        for (var mm in sum) c.normal[mm] = sum[mm] / n[mm];
      });
      var raw = [], anom = [];
      for (var i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 120))) {
        g.cells.forEach(function (c) {
          var v = c.table[frames[i]];
          if (v === undefined || v === null || v < -900) return;
          raw.push(v); anom.push(Math.abs(v - c.normal[frames[i].slice(4)]));
        });
      }
      var rLo = percentile(raw, 0.02), rHi = percentile(raw, 0.98), aLim = percentile(anom, 0.97) || 1;
      var vr = g.vr, wet = vr.topic === 'water' || vr.topic === 'soil';
      var seq = wet ? d3.interpolateYlGnBu : (vr.topic === 'heat' ? function (t) { return d3.interpolateRdYlBu(1 - t); } : d3.interpolateViridis);

      TD.globe.setCells(g.cells.map(function (c) { var b = cellBounds(c); b.fill = 'transparent'; b.opacity = 0.85; return b; }));

      function paint(i) {
        lapse.i = i;
        var k = frames[i];
        TD.globe.recolorCells(function (b, j) {
          var c = g.cells[j], v = c.table[k];
          if (v === undefined || v === null || v < -900) return 'transparent';
          if (lapse.mode === 'anom') {
            var t = Math.max(-1, Math.min(1, (v - c.normal[k.slice(4)]) / aLim));
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
          boxCtl() +
          '<div class="lp-player"><button type="button" class="lp-play" id="lp-play" aria-label="' + esc(T('Play')) + '">' + (lapse.timer ? '❚❚' : '▶') + '</button>' +
          '<input type="range" id="lp-slider" min="0" max="' + (frames.length - 1) + '" value="' + lapse.i + '" aria-label="' + esc(T('Month')) + '">' +
          '<output id="lp-when" class="lp-when"></output></div>' +
          '<div class="lp-row"><div class="lp-seg" id="lp-mode"><button type="button" data-m="anom" aria-pressed="' + (lapse.mode === 'anom') + '">' + esc(T('Difference from normal')) + '</button>' +
          '<button type="button" data-m="raw" aria-pressed="' + (lapse.mode === 'raw') + '">' + esc(T('Monthly values')) + '</button></div>' +
          '<div class="lp-seg" id="lp-speed">' + [1, 2, 4].map(function (sp) { return '<button type="button" data-s="' + sp + '" aria-pressed="' + (lapse.speed === sp) + '">' + sp + '×</button>'; }).join('') + '</div></div>' +
          legend();
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

  // ---- wind particles -------------------------------------------------------------

  function showWind() {
    var my = token, s = TD.state;
    // a season shows its middle month, which matches one of the panel buttons
    if (windMonth === null) windMonth = s.month > 12 ? { 13: 7, 14: 10, 15: 1, 16: 4 }[s.month] : s.month;
    busy(T('Wind'), T('Loading 10 m wind for a {b}° box around this place…', { b: BOX }));
    TD.globe.flyTo(s.lat, s.lon, BOX, 1300, zoomFor());
    Promise.all(['U10M', 'V10M'].map(function (pm) { return TD.fetchJson(TD.urlFor(pm, s.lat, s.lon, BOX)); })).then(function (js) {
      if (my !== token) return;
      loadKey = gridKey();
      var b = TD.box(s.lat, s.lon, BOX);
      var mean = function (table) {
        var sum = 0, n = 0;
        for (var k in table) {
          var y = +k.slice(0, 4), m = +k.slice(4, 6), v = table[k];
          if (m > 12 || y < s.y0 || y > s.y1 || (windMonth && m !== windMonth) || v === null || v < -900) continue;
          sum += v; n++;
        }
        return n ? sum / n : null;
      };
      var pts = {};
      js[0].features.forEach(function (f, i) {
        var lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
        var u = mean(f.properties.parameter.U10M || {}), v = mean((js[1].features[i] || f).properties.parameter.V10M || {});
        if (u !== null && v !== null) pts[lon.toFixed(3) + ',' + lat.toFixed(3)] = [u, v];
      });
      var lons = [], lats = [];
      Object.keys(pts).forEach(function (k) { var p = k.split(','); lons.push(+p[0]); lats.push(+p[1]); });
      lons = lons.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, c) { return a - c; });
      lats = lats.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, c) { return a - c; });
      var get = function (i, j) { return pts[lons[i].toFixed(3) + ',' + lats[j].toFixed(3)]; };
      var idx = function (arr, x) {
        for (var i = 0; i < arr.length - 1; i++) if (x <= arr[i + 1]) return i;
        return arr.length - 2;
      };
      var speeds = Object.keys(pts).map(function (k) { return Math.sqrt(pts[k][0] * pts[k][0] + pts[k][1] * pts[k][1]); });
      TD.globe.setField({
        bounds: { lonMin: lons[0], lonMax: lons[lons.length - 1], latMin: lats[0], latMax: lats[lats.length - 1] },
        count: 1100,
        speed: 0.0045 * BOX / 10,
        sample: function (lon, lat) {
          var i = idx(lons, lon), j = idx(lats, lat);
          var a = get(i, j), c = get(i + 1, j), d = get(i, j + 1), e = get(i + 1, j + 1);
          if (!a || !c || !d || !e) return a || null;
          var tx = (lon - lons[i]) / (lons[i + 1] - lons[i]), ty = (lat - lats[j]) / (lats[j + 1] - lats[j]);
          return [0, 1].map(function (q) {
            return (a[q] * (1 - tx) + c[q] * tx) * (1 - ty) + (d[q] * (1 - tx) + e[q] * tx) * ty;
          });
        }
      });
      var malaysia = s.lat > -6 && s.lat < 12 && s.lon > 94 && s.lon < 122;
      var caption = '';
      if (malaysia && (windMonth === 12 || windMonth === 1 || windMonth === 2)) caption = T('This is the northeast monsoon season: winds blow from the north-east across the South China Sea.');
      else if (malaysia && windMonth >= 6 && windMonth <= 8) caption = T('This is the southwest monsoon season: winds blow from the south-west, and the Strait of Malacca is drier.');
      panel.innerHTML = '<div class="lp-head"><strong>' + esc(T('Wind')) + '</strong><span>' + esc(T('Average at 10 m')) + ', ' + s.y0 + '–' + s.y1 + '</span></div>' +
        boxCtl() +
        '<div class="lp-seg lp-months" id="lp-wm">' + [0, 1, 4, 7, 10].map(function (m) {
          return '<button type="button" data-wm="' + m + '" aria-pressed="' + (windMonth === m) + '">' + esc(m ? T(TD.MONTHS[m]).slice(0, 3) : T('Year')) + '</button>';
        }).join('') + '</div>' +
        '<p class="lp-key">' + esc(T('Each streak follows the average wind. Brighter streaks are faster. Average speed in this box: {s} m/s.',
          { s: TD.S.mean(speeds).toFixed(1) })) + '</p>' + (caption ? '<p class="lp-note">' + esc(caption) + '</p>' : '');
      panel.onclick = function (e) {
        var t = e.target.closest('[data-wm]'); if (!t) return;
        windMonth = +t.dataset.wm; setLayer('wind');
      };
      panel.oninput = null;
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
      if ((active === 'trend' || active === 'lapse' || active === 'wind') && loadKey && loadKey !== gridKey()) setLayer(active);
    });
    document.addEventListener('td:lang', function () { if (active) setLayer(active); });
  }

  window.TDMap = { setLayer: function (id, opts) { setLayer(id, opts); }, get active() { return active; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
