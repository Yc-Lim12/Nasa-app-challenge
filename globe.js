/*
 * Trend Detective globe: an interactive 3D-looking Earth (D3 orthographic projection).
 * Drag to spin, +/− or pinch to zoom, click to choose a place.
 * Needs d3 v7 and topojson-client. Coastlines: Natural Earth via world-atlas.
 */
(function () {
  'use strict';

  var WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
  var WORLD_FINE = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var K_MIN = 0.9, K_MAX = 24;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrapLon(x) { return ((x + 540) % 360 + 360) % 360 - 180; }
  function fmt(lat, lon) {
    if (window.TD && window.TD.coordLabel) return window.TD.coordLabel(lat, lon);   // U/S/T/B in Bahasa Malaysia
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
  }

  /** A lat/lon box as a polygon, with edges densified so they follow parallels. */
  function boxShape(b) {
    var pts = [], s = 0.5, x, y;
    for (y = b.latMin; y < b.latMax; y += s) pts.push([b.lonMin, y]);
    for (x = b.lonMin; x < b.lonMax; x += s) pts.push([x, b.latMax]);
    for (y = b.latMax; y > b.latMin; y -= s) pts.push([b.lonMax, y]);
    for (x = b.lonMax; x > b.lonMin; x -= s) pts.push([x, b.latMin]);
    pts.push(pts[0]);
    return { type: 'Polygon', coordinates: [pts] };
  }

  function create(host, opts) {
    var d3 = window.d3, topo = window.topojson;
    opts = opts || {};
    host.innerHTML = '';
    host.classList.add('globe');
    var HINT = 'Drag to spin · click a place';

    var uid = 'g' + Math.random().toString(36).slice(2, 8);
    var svg = d3.select(host).append('svg').attr('tabindex', 0).attr('role', 'application')
      .attr('aria-label', 'Globe. Drag or use the arrow keys to spin, plus and minus to zoom, Enter to choose the place in the centre.');
    var defs = svg.append('defs');
    function radial(id, stops, cx, cy, r) {
      var g = defs.append('radialGradient').attr('id', uid + id)
        .attr('cx', cx || '50%').attr('cy', cy || '50%').attr('r', r || '50%');
      stops.forEach(function (s) {
        g.append('stop').attr('offset', s[0]).attr('stop-color', s[1]).attr('stop-opacity', s[2] === undefined ? 1 : s[2]);
      });
    }
    radial('ocean', [['0%', '#1a4a7a'], ['60%', '#0d2847'], ['100%', '#040d1a']], '40%', '36%', '72%');
    radial('shade', [['58%', '#000', 0], ['100%', '#000', 0.5]]);
    radial('shine', [['0%', '#cfe0ff', 0.16], ['60%', '#cfe0ff', 0]], '34%', '26%', '55%');
    radial('halo', [['84%', '#8fb8ff', 0.34], ['90%', '#8fb8ff', 0.12], ['100%', '#8fb8ff', 0]]);

    // star field behind the globe (canvas, drawn with a little parallax)
    var canvas = document.createElement('canvas');
    canvas.className = 'g-stars';
    canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(canvas, svg.node());
    var ctx = canvas.getContext('2d'), stars = [], dpr = Math.min(2, window.devicePixelRatio || 1);

    var gHalo = svg.append('circle').attr('class', 'g-overlay').attr('fill', 'url(#' + uid + 'halo)');
    var gOcean = svg.append('path').attr('class', 'g-ocean').attr('fill', 'url(#' + uid + 'ocean)');
    var gGrat = svg.append('path').attr('class', 'g-grat');
    var gLand = svg.append('path').attr('class', 'g-land');
    var gBord = svg.append('path').attr('class', 'g-border');
    // Night side: 20 faint layers 1° apart, so dusk fades in gradually (too finely to
    // see steps) instead of showing hard stripes. Together they darken the deep night
    // side by about 40%, light enough that the filled polar-night area stays readable.
    var NIGHT_RADII = [];
    for (var nr = 96; nr > 76; nr--) NIGHT_RADII.push(nr);
    var gNights = NIGHT_RADII.map(function () {
      return svg.append('path').attr('class', 'g-night').attr('fill-opacity', 0.025);
    });
    var gShade = svg.append('path').attr('class', 'g-overlay').attr('fill', 'url(#' + uid + 'shade)');
    var gShine = svg.append('path').attr('class', 'g-overlay').attr('fill', 'url(#' + uid + 'shine)');
    var gRim = svg.append('path').attr('class', 'g-rim');
    var gCells = svg.append('g').attr('class', 'g-cells');
    var gDots = svg.append('g').attr('class', 'g-dots');
    var gCmp = svg.append('path').attr('class', 'g-cmp');
    var gSel = svg.append('path').attr('class', 'g-sel');
    var gPlaces = svg.append('g').attr('class', 'g-places');
    var gMarks = svg.append('g').attr('class', 'g-marks');
    var cmpPin = svg.append('g').attr('class', 'g-pin g-pin-cmp');
    cmpPin.append('circle').attr('r', 5);
    var pin = svg.append('g').attr('class', 'g-pin');
    pin.append('circle').attr('class', 'g-ring').attr('r', 6);
    pin.append('circle').attr('r', 5);

    var ctrls = d3.select(host).append('div').attr('class', 'g-ctrls');
    function button(label, title, fn) {
      ctrls.append('button').attr('type', 'button').attr('title', title).attr('aria-label', title).text(label)
        .on('click', function (e) { e.preventDefault(); fn(); });
    }
    button('+', 'Zoom in', function () { zoomBy(1.6); });
    button('−', 'Zoom out', function () { zoomBy(1 / 1.6); });
    button('◎', 'Back to the chosen place', function () { if (sel) flyTo(sel.lat, sel.lon, sel.size, 900); });
    if (opts.fill) {
      ctrls.append('button').attr('type', 'button').attr('class', 'g-style').attr('title', 'Change the map style').attr('aria-label', 'Change the map style')
        .html('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m3 12.5 9 5 9-5M3 17l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')
        .on('click', function (e) {
          e.preventDefault();
          var order = ['sat', 'live', 'dark'], next = order[(order.indexOf(basemap) + 1) % order.length];
          setBasemap(next);
          try { localStorage.setItem('td-globe', next); } catch (err) { /* private mode */ }
          if (opts.onStyle) opts.onStyle(STYLES[next].name);
        });
    }
    var readBox = d3.select(host).append('div').attr('class', 'g-readout').attr('aria-hidden', 'true');
    var readout = readBox.append('span').text(trG(HINT));
    var sunEl = readBox.append('span').attr('class', 'g-sun');
    // says what the grey areas are, when the daily picture had gaps filled
    var fillEl = readBox.append('span').attr('class', 'g-sun g-fillnote').style('display', 'none');
    function trG(sx) { return window.TDi18n ? window.TDi18n.tr(sx) : sx; }
    function showFillNote() {
      var on = basemap === 'live' && fillUsed;
      fillEl.style('display', on ? null : 'none')
        .text(!on ? '' : iceUsed
          ? trG('Grey areas: no satellite photo, or too dark to see (polar night, low sun or no pass yet). NASA Blue Marble shown, with sea ice from {d} (NASA GHRSST).').replace('{d}', ICE.date)
          : trG('Grey areas: no satellite photo, or too dark to see (polar night, low sun or no pass yet). NASA Blue Marble shown.'));
    }
    document.addEventListener('td:lang', function () {
      showFillNote(); updateSun();
      var bmHint = window.TDi18n && window.TDi18n.dict[HINT];
      if (readout.text() === HINT || readout.text() === bmHint) readout.text(trG(HINT));
    });

    var proj = d3.geoOrthographic().clipAngle(90).precision(0.3);
    var path = d3.geoPath(proj);
    var grat = d3.geoGraticule10();
    var land = null, borders = null, landLo = null, bordLo = null, restTimer = 0;
    // once the globe stops, redraw with the detailed outlines (and sharp picture)
    // Pointer and wheel events can arrive several times per frame; draw once per frame.
    var frameQueued = false;
    function requestRender() {
      if (frameQueued) return;
      frameQueued = true;
      requestAnimationFrame(function () { frameQueued = false; render(); });
    }
    function rested() {
      clearTimeout(restTimer);
      restTimer = setTimeout(function () { if (!drag && !anim && !spinning) render(); }, 80);
    }
    var W = 300, H = 300, R = 140, k = K_MIN, rot = [-20, -10];
    var sel = null, cmp = null, anim = null, first = true;
    var CX = 150, CY = 150, spinning = false, spinRaf = 0, spinLast = null, badge = null;
    var badgeEl = d3.select(host).append('div').attr('class', 'g-badge').style('display', 'none');

    function overlayCanvas(cls) {
      var c = document.createElement('canvas');
      c.className = 'g-layer ' + cls;
      c.setAttribute('aria-hidden', 'true');
      host.insertBefore(c, svg.node().nextSibling);
      return c;
    }
    var rCanvas = overlayCanvas('g-raster'), rctx = rCanvas.getContext('2d');
    var pCanvas = overlayCanvas('g-particles'), pctx = pCanvas.getContext('2d');
    var rBuf = document.createElement('canvas'), rbctx = rBuf.getContext('2d');
    var raster = null, rasterQueued = false, rasterCache = null;
    var field = null, particles = [], pRaf = 0, pClear = true;
    var dotSel = null, marks = [];

    var placeG = gPlaces.selectAll('g').data(opts.places || []).enter().append('g').attr('class', 'g-place')
      .on('click', function (e, d) { e.stopPropagation(); if (opts.onPlace) opts.onPlace(d.id); })
      .on('pointerenter', function (e, d) { readout.text(d.name.charAt(0).toUpperCase() + d.name.slice(1)); });
    placeG.append('circle').attr('r', 4.5);
    placeG.append('text')
      .attr('x', function (d) { return d.label === 'left' ? -8 : d.label === 'below' ? 0 : 8; })
      .attr('y', function (d) { return d.label === 'below' ? 16 : 4; })
      .attr('text-anchor', function (d) { return d.label === 'left' ? 'end' : d.label === 'below' ? 'middle' : 'start'; })
      .text(function (d) { return d.short || d.name; });
    placeG.append('title').text(function (d) { return d.name; });

    function makeStars() {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var rnd = d3.randomLcg(7), n = Math.round(W * H / 2400);
      stars = [];
      for (var i = 0; i < n; i++) {
        var big = rnd() > 0.92;
        stars.push({ x: rnd() * W, y: rnd() * H, r: big ? 0.9 + rnd() * 0.8 : 0.35 + rnd() * 0.55,
          a: 0.2 + rnd() * 0.7, tw: rnd() < 0.4 ? 0.5 + rnd() * 1.6 : 0, ph: rnd() * 6.283, d: 0.15 + rnd() * 0.85 });
      }
    }
    function drawStars(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var ox = rot[0] * 0.5, oy = rot[1] * 0.25;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var x = ((s.x + ox * s.d) % W + W) % W, y = ((s.y - oy * s.d) % H + H) % H;
        var a = s.tw && !REDUCED ? s.a * (0.6 + 0.4 * Math.sin(t / 1000 * s.tw + s.ph)) : s.a;
        ctx.globalAlpha = a;
        ctx.fillStyle = s.r > 0.9 ? '#fff6e3' : '#d9e4ff';
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (!REDUCED) {
      var twinkle = function (t) { drawStars(t); requestAnimationFrame(twinkle); };
      requestAnimationFrame(twinkle);
    }

    // where the Sun is overhead right now, so the night side can be shaded
    var nights = [];
    function updateSun() {
      var d = new Date();
      var day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
      var decl = -23.44 * Math.cos(2 * Math.PI * (day + 10) / 365);
      var hrs = d.getUTCHours() + d.getUTCMinutes() / 60;
      var anti = [wrapLon((12 - hrs) * 15 + 180), -decl];
      nights = NIGHT_RADII.map(function (r) { return d3.geoCircle().center(anti).radius(r)(); });
      var hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
      sunEl.text(trG('Daylight now · {t} UTC').replace('{t}', hh + ':' + mm));
    }
    updateSun();
    setInterval(function () { updateSun(); render(); }, 60000);

    function centre() { return [-rot[0], -rot[1]]; }
    function visible(p) { return d3.geoDistance(p, centre()) < Math.PI / 2 - 0.01; }

    // `inset` is the width covered by the case-file sheet on the right. The globe
    // centres itself in what is left, so it stays in view while the sheet is out.
    var inset = 0, insetRaf = 0;
    function layout() {
      if (opts.fill) {
        var We = Math.max(240, W - inset);
        var wide = We >= 600, big = We >= 1000;
        // With the whole screen to itself the globe is larger; otherwise it leaves
        // room for the title above and the stories below.
        CX = We * (wide ? 0.54 : 0.5);
        CY = H * (big ? 0.57 : wide ? 0.6 : 0.58);
        R = big ? Math.min(We * 0.36, H * 0.4) : Math.min(We * (wide ? 0.38 : 0.44), H * (wide ? 0.33 : 0.3));
      } else {
        R = Math.min(W, H) / 2 - 14;
        CX = W / 2; CY = H / 2;
      }
    }
    function size() {
      W = Math.max(240, host.clientWidth || 300);
      H = opts.fill ? Math.max(320, host.clientHeight || 600) : Math.round(Math.min(W, 360));
      layout();
      svg.attr('width', W).attr('height', H).attr('viewBox', '0 0 ' + W + ' ' + H);
      makeStars();
    }
    function setInset(px, animate) {
      px = Math.max(0, px || 0);
      cancelAnimationFrame(insetRaf);
      if (REDUCED || !animate) { inset = px; layout(); render(); return; }
      var from = inset, t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var u = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - u, 3);
        inset = from + (px - from) * e;
        layout(); render();
        if (u < 1) insetRaf = requestAnimationFrame(frame);
      }
      insetRaf = requestAnimationFrame(frame);
    }

    function drawSel(shape, pinG, s) {
      if (!s) { shape.attr('d', null); pinG.style('display', 'none'); return; }
      shape.attr('d', s.box ? path(boxShape(s.box)) : null);
      var p = [s.lon, s.lat];
      if (visible(p)) {
        var xy = proj(p);
        pinG.style('display', null).attr('transform', 'translate(' + xy[0] + ',' + xy[1] + ')');
      } else pinG.style('display', 'none');
    }

    function render() {
      proj.translate([CX, CY]).scale(R * k).rotate([rot[0], rot[1], 0]);
      var ds = path({ type: 'Sphere' });
      gOcean.attr('d', ds); gShade.attr('d', ds); gShine.attr('d', ds); gRim.attr('d', ds);
      gHalo.attr('cx', CX).attr('cy', CY).attr('r', R * k * 1.16);
      gNights.forEach(function (g, i) { g.attr('d', nights[i] ? path(nights[i]) : null); });
      if (REDUCED) drawStars(0);
      gGrat.attr('d', path(grat));
      var still = !(drag || anim || spinning);
      var lnd = still || !landLo ? land : landLo, brd = still || !bordLo ? borders : bordLo;
      gLand.attr('d', lnd ? path(lnd) : null);
      gBord.attr('d', brd ? path(brd) : null);
      if (sat && gl) {
        drawSat(true);
        if (still) settleSat();
        var fade = clamp(1.6 - k / 5, 0, 1);
        gLand.style('stroke-opacity', fade); gBord.style('stroke-opacity', fade);
      } else if (sat) {
        // a redraw that does not move the globe keeps the sharp picture already on screen
        if (!(still && satKey() === satFine)) {
          drawSat(false); satFine = '';
          if (still) settleSat();
        }
        var fadeOut = clamp(1.6 - k / 5, 0, 1);
        gLand.style('stroke-opacity', fadeOut); gBord.style('stroke-opacity', fadeOut);
      } else { gLand.style('stroke-opacity', null); gBord.style('stroke-opacity', null); }
      drawSel(gCmp, cmpPin, cmp);
      drawSel(gSel, pin, sel);
      drawCells();
      drawMarks();
      queueRaster();
      pClear = true;
      placeG.style('display', function (d) { return visible([d.lon, d.lat]) ? null : 'none'; })
        .attr('transform', function (d) { var xy = proj([d.lon, d.lat]); return 'translate(' + xy[0] + ',' + xy[1] + ')'; })
        .classed('on', function (d) { return !!sel && sel.placeId === d.id; });
      drawBadge();
    }

    function drawBadge() {
      var show = !!(badge && sel && visible([sel.lon, sel.lat]));
      host.classList.toggle('has-badge', show);
      if (!show) { badgeEl.style('display', 'none'); return; }
      var xy = proj([sel.lon, sel.lat]);
      var r = node.getBoundingClientRect(), sx = r.width / W || 1;
      var x = xy[0] * sx, y = xy[1] * sx, avail = (W - inset) * sx, gap = 24, edge = 8;
      badgeEl.style('display', null);
      // measure once per badge, and again when a map layer turns the card compact
      var lay = !!(host.parentNode && host.parentNode.classList.contains('layer-on'));
      if (badgeH === null || lay !== badgeLay) { var bn = badgeEl.node(); badgeH = bn.offsetHeight; badgeW = bn.offsetWidth; badgeLay = lay; }
      // Beside the place, on the side with more room. On a narrow screen where
      // neither side fits, sit just below (or above) the place instead.
      var flip = x > avail * (avail < 600 ? 0.5 : 0.62);
      var fits = function (l) { return l >= edge && l + badgeW <= avail - edge; };
      var left = flip ? x - gap - badgeW : x + gap, under = false;
      if (!fits(left)) {
        var other = flip ? x + gap : x - gap - badgeW;
        if (fits(other)) { left = other; flip = !flip; } else under = true;
      }
      var top, half = badgeH / 2;
      if (under) {
        left = Math.max(edge, Math.min(avail - edge - badgeW, x - badgeW / 2));
        top = y + 22 + half;                                   // below the pin
        if (top + half > r.height - edge) top = y - 22 - half; // or above it
        top = Math.max(half + edge, Math.min(r.height - half - edge, top));
      } else {
        // keep a tall card on screen; the connector line still points at the place
        top = Math.max(half + 12, Math.min(r.height - half - 12, y));
      }
      badgeEl.classed('flip', flip && !under).classed('under', under)
        .style('left', left + 'px').style('top', top + 'px').style('--dy', (y - top) + 'px');
    }
    var badgeH = null, badgeW = 0, badgeLay = false;   // measured once per badge, not on every frame

    /** A small chart of the yearly values and their trend line, inside the badge. */
    function sparkline(sp) {
      var w = 200, h = 44, pad = 3, v = sp.values, n = v.length;
      if (n < 2) return;
      var lo = d3.min(v.concat(sp.trend)), hi = d3.max(v.concat(sp.trend)), span = hi - lo || 1;
      var X = function (i) { return pad + (w - 2 * pad) * i / (n - 1); };
      var Y = function (y) { return h - pad - (h - 2 * pad) * (y - lo) / span; };
      var svg = badgeEl.append('svg').attr('class', 'g-spark').attr('viewBox', '0 0 ' + w + ' ' + h)
        .attr('preserveAspectRatio', 'none').attr('aria-hidden', 'true');
      svg.append('path').attr('class', 'g-spark-line')
        .attr('d', v.map(function (y, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(y).toFixed(1); }).join(''));
      svg.append('path').attr('class', 'g-spark-trend')
        .attr('d', 'M' + X(0) + ',' + Y(sp.trend[0]).toFixed(1) + 'L' + X(n - 1) + ',' + Y(sp.trend[1]).toFixed(1));
      if (sp.from) {
        var lab = badgeEl.append('div').attr('class', 'g-spark-years');
        lab.append('i').text(sp.from); lab.append('i').text(sp.to);
      }
    }

    function setBadge(b) {
      badge = b; badgeH = null; badgeW = 0;
      if (b) {
        badgeEl.attr('class', 'g-badge ' + (b.cls || '') + (b.spark ? ' g-card' : '')).html('');
        if (b.place) badgeEl.append('small').attr('class', 'g-badge-place').text(b.place);
        if (b.title) badgeEl.append('strong').text(b.title);
        badgeEl.append('span').text(b.text || '');
        if (b.spark) sparkline(b.spark);
        if (b.note) badgeEl.append('em').text(b.note);
        if (b.action) {
          badgeEl.append('button').attr('type', 'button').attr('class', 'g-go').text(b.action.label)
            .on('pointerdown', function (e) { e.stopPropagation(); })
            .on('click', function (e) { e.stopPropagation(); b.action.run(); });
        }
        // restart the entrance animation
        var n = badgeEl.node(); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
      }
      drawBadge();
    }

    // ---- idle spin ---------------------------------------------------------

    function spinFrame(now) {
      if (!spinning) return;
      if (spinLast !== null && !drag && !anim) {
        rot[0] += Math.min(50, now - spinLast) * 0.004;
        render();
      }
      spinLast = now;
      spinRaf = requestAnimationFrame(spinFrame);
    }
    function spin(on) {
      spinning = !!on && !REDUCED;
      cancelAnimationFrame(spinRaf);
      spinLast = null;
      host.classList.toggle('spinning', spinning);
      if (!spinning) rested();
      if (spinning) { stopAnim(); spinRaf = requestAnimationFrame(spinFrame); }
    }


    // ---- satellite surface ---------------------------------------------------
    // The sphere is painted from an equirectangular image of the whole Earth (a local
    // 8K NASA Blue Marble, or NASA GIBS for the daily picture), plus a sharp GIBS picture
    // of just the area in view when zoomed in. Drawn on the GPU with WebGL2: every pixel
    // is projected and filtered (mipmaps + anisotropic) in a shader, so it is sharp at
    // full screen resolution and costs almost nothing per frame. Falls back to a slower
    // CPU drawing when WebGL2 is not available.
    var GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&FORMAT=image/jpeg';
    var STYLES = {
      // tms/maxZ: NASA GIBS ready-made tiles (WMTS) for sharp close-ups: 500 m and 250 m
      sat: { name: 'Satellite', layer: 'BlueMarble_ShadedRelief_Bathymetry', local: 'assets/earth-', tms: '500m', maxZ: 7 },
      live: { name: 'Latest satellite pass', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', daily: true, tms: '250m', maxZ: 8 },
      dark: { name: 'Dark map' }
    };
    var SMALL = Math.min(window.innerWidth, window.innerHeight) < 700;
    var sCanvas = document.createElement('canvas');
    sCanvas.className = 'g-sat';
    sCanvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(sCanvas, svg.node());
    var gl = null, glProg = null, glU = {}, glAniso = null, glAnisoMax = 1, glMaxTex = 4096;
    try { gl = sCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false }); } catch (err) { gl = null; }
    if (gl && !initGL()) {
      gl = null;
      var c2 = document.createElement('canvas'); c2.className = sCanvas.className; c2.setAttribute('aria-hidden', 'true');
      host.replaceChild(c2, sCanvas); sCanvas = c2;
    }
    var sctx = gl ? null : sCanvas.getContext('2d'), sBuf = document.createElement('canvas'), sbctx = sBuf.getContext('2d');
    var basemap = 'dark', sat = null, satToken = 0, satTimer = 0, refineTimer = 0, refineKey = '', satFine = '';
    function satKey() {
      return [rot[0].toFixed(4), rot[1].toFixed(4), k.toFixed(5), CX.toFixed(1), CY.toFixed(1), R.toFixed(1), W, H,
        sat ? sat.base.w : 0, sat && sat.region ? sat.region.lon0 + ',' + sat.region.lat0 + ',' + sat.region.w : ''].join('|');
    }

    function initGL() {
      var VS = '#version 300 es\nin vec2 p;\nvoid main(){ gl_Position = vec4(p, 0.0, 1.0); }';
      var FS = [
        '#version 300 es',
        'precision highp float;',
        'uniform vec2 uC; uniform float uR, uLam, uSp, uCp, uHasReg, uMid;',
        'uniform vec4 uBox;',
        'uniform sampler2D uBase, uReg;',
        'out vec4 o;',
        'const float PI = 3.141592653589793;',
        'void main() {',
        '  vec2 q = (gl_FragCoord.xy - uC) / uR;',
        '  float r2 = dot(q, q);',
        '  if (r2 > 1.0) discard;',
        '  float a = clamp((1.0 - sqrt(r2)) * uR + 0.5, 0.0, 1.0);',
        '  float cz = sqrt(max(0.0, 1.0 - r2));',
        '  float lat = asin(clamp(cz * uSp + q.y * uCp, -1.0, 1.0));',
        '  float lon = uLam + atan(q.x, cz * uCp - q.y * uSp);',
        // two copies of u that wrap at different places; use the smooth one so no seam line
        '  float u = lon / (2.0 * PI) + 0.5;',
        '  float ua = fract(u), ub = fract(u + 0.5) - 0.5;',
        '  float uu = fwidth(ua) <= fwidth(ub) + 1e-7 ? ua : ub;',
        '  vec3 c = texture(uBase, vec2(uu, 0.5 - lat / PI)).rgb;',
        '  float gx = degrees(lon); gx -= 360.0 * floor((gx - uMid) / 360.0 + 0.5);',
        '  vec2 rs = vec2((gx - uBox.x) / (uBox.y - uBox.x), (uBox.w - degrees(lat)) / (uBox.w - uBox.z));',
        '  vec3 rc = texture(uReg, clamp(rs, 0.0, 1.0)).rgb;',
        '  vec2 e = min(rs, 1.0 - rs);',
        '  float f = uHasReg * smoothstep(0.0, 0.03, min(e.x, e.y));',
        '  o = vec4(mix(c, rc, f) * a, a);',
        '}'].join('\n');
      function sh(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
        return s;
      }
      var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      glProg = gl.createProgram(); gl.attachShader(glProg, vs); gl.attachShader(glProg, fs);
      gl.bindAttribLocation(glProg, 0, 'p'); gl.linkProgram(glProg);
      if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) return false;
      ['uC', 'uR', 'uLam', 'uSp', 'uCp', 'uHasReg', 'uMid', 'uBox', 'uBase', 'uReg'].forEach(function (n) { glU[n] = gl.getUniformLocation(glProg, n); });
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      glAniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (glAniso) glAnisoMax = Math.min(16, gl.getParameter(glAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
      glMaxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.clearColor(0, 0, 0, 0);
      return true;
    }
    // Upload an image as a mipmapped texture. Fails (returns null) when the browser
    // forbids it, e.g. a local file opened straight from disk (file://).
    function makeTex(img, wrapS) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } catch (err) { gl.deleteTexture(t); return null; }
      if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (glAniso) gl.texParameterf(gl.TEXTURE_2D, glAniso.TEXTURE_MAX_ANISOTROPY_EXT, glAnisoMax);
      return t;
    }
    function freeTex(o) { if (gl && o && o.tex) gl.deleteTexture(o.tex); }

    function gibsUrl(st, bbox, w, h) {
      var url = GIBS_WMS + '&LAYERS=' + st.layer + '&BBOX=' + bbox.join(',') + '&WIDTH=' + w + '&HEIGHT=' + h;
      // the daily image for "yesterday" is complete everywhere about 36 hours back
      if (st.daily) url += '&TIME=' + new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
      return url;
    }
    // ---- NASA GIBS tiles (WMTS) ----------------------------------------------------
    // Pre-rendered 512 px tiles in plate carrée: at level z one tile spans 288 / 2^z
    // degrees, counted from (-180°, 90°). From level 3 up the grid fits the world exactly.
    // They come from NASA's cache and stay in the browser's cache, so they are much
    // quicker than asking the WMS to draw a new picture for every view.
    var GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
    function tileSpan(z) { return 288 / Math.pow(2, z); }
    function gibsDate(st) { return st.daily ? new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10) : 'default'; }
    function tileUrl(st, z, row, col) {
      return GIBS_WMTS + st.layer + '/default/' + gibsDate(st) + '/' + st.tms + '/' + z + '/' + row + '/' + col + '.jpg';
    }
    /** Tiles covering a lon/lat box at level z: column and row ranges, and their exact bounds. */
    function tileRange(z, lo0, lo1, la0, la1) {
      var sp = tileSpan(z), cols = Math.round(360 / sp), rows = Math.round(180 / sp);
      var c0 = Math.max(0, Math.floor((lo0 + 180) / sp)), c1 = Math.min(cols - 1, Math.floor((lo1 + 180 - 1e-9) / sp));
      var r0 = Math.max(0, Math.floor((90 - la1) / sp)), r1 = Math.min(rows - 1, Math.floor((90 - la0 - 1e-9) / sp));
      return { z: z, c0: c0, c1: c1, r0: r0, r1: r1, n: (c1 - c0 + 1) * (r1 - r0 + 1),
        lon0: -180 + c0 * sp, lon1: -180 + (c1 + 1) * sp, lat1: 90 - r0 * sp, lat0: 90 - (r1 + 1) * sp };
    }
    // The daily satellite picture is black where there was no sunlight to photograph
    // (polar night) or no pass yet. Those pixels are filled from the cloud-free Blue
    // Marble picture (see blendAll).
    var under = null, underWait = [], fillUsed = false;
    function withUnder(cb) {
      if (under !== null) { cb(under); return; }
      underWait.push(cb);
      if (underWait.length > 1) return;
      var img = new Image();
      img.onload = function () { under = img; underWait.splice(0).forEach(function (f) { f(img); }); };
      img.onerror = function () { under = false; underWait.splice(0).forEach(function (f) { f(false); }); };
      img.src = STYLES.sat.local + (SMALL ? '4k' : '8k') + '.jpg';
    }
    // Sea ice today, for the gaps: NASA GHRSST MUR sea-ice concentration (daily, gap-free,
    // from microwave, so it also covers polar night). Its tiles are transparent where
    // there is no ice; elsewhere each colour is one step of NASA's 101-step scale for
    // 0-100% ice cover (GIBS colormap GHRSST_Sea_Ice_Concentration), turned back into
    // the percentage here.
    var ICE_RAMP = '1111110e000e1c001c3200324000404e004e630063710071870087950095a300a3b800b8c600c6dc00dcea00eaf800f8f100ffe300ffcd00ffbf00ffb100ff9c00ff8e00ff7f00ff6a00ff5c00ff4700ff3900ff2a00ff1500ff0700ff0010ff0021ff0031ff004aff005aff0073ff0084ff0094ff00adff00bdff00ceff00e6ff00f7ff00faf100f6e300f1d400eabf00e5b100de9c00d98e00d47f00cd6a00c95c00c24700bd3900b82a00b11500ac070faf001eb4002db90044c10053c60062cb0078d20087d7009edf00ade400bce900d2f000e1f500f8fd00fff800ffea00ffd400ffc600ffb100ffa300ff9500ff7f00ff7100ff6300ff4e00ff4000ff2a00ff1c00ff0e00ff0909ff1a1aff3333ff4444ff5555ff6f6fff8080ff9999ffaaaaffbbbbffd5d5ffe6e6ffffff', iceLookup = {};
    for (var ii = 0; ii <= 100; ii++) iceLookup[parseInt(ICE_RAMP.substr(ii * 6, 6), 16)] = ii / 100;
    function iceCover(r, g, b) {
      var v = iceLookup[(r << 16) | (g << 8) | b];
      if (v !== undefined) return v;
      // not an exact palette colour (edge smoothing): the nearest step
      var best = 0, bd = 1e9;
      for (var q = 0; q <= 100; q++) {
        var c = parseInt(ICE_RAMP.substr(q * 6, 6), 16), dr = (c >> 16) - r, dg = ((c >> 8) & 255) - g, db = (c & 255) - b;
        var dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = q; }
      }
      iceLookup[(r << 16) | (g << 8) | b] = best / 100;
      return best / 100;
    }
    var ICE = { layer: 'GHRSST_L4_MUR_Sea_Ice_Concentration', tms: '1km', maxZ: 6,
      date: new Date(Date.now() - 60 * 3600e3).toISOString().slice(0, 10) };
    var iceTiles = {}, iceUsed = false;
    function iceImage(zi, row, col, cb) {
      var key = zi + '/' + row + '/' + col, e = iceTiles[key];
      if (e && e.done) { cb(e.img); return; }
      if (e) { e.wait.push(cb); return; }
      e = iceTiles[key] = { done: false, img: null, wait: [cb] };
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { e.done = true; e.img = img; e.wait.splice(0).forEach(function (f) { f(img); }); };
      img.onerror = function () { e.done = true; e.wait.splice(0).forEach(function (f) { f(null); }); };
      img.src = GIBS_WMTS + ICE.layer + '/default/' + ICE.date + '/' + ICE.tms + '/' + zi + '/' + row + '/' + col + '.png';
    }
    /** The ice under one picture tile (level z), as 512 x 512 RGBA, or null. */
    function iceFor(z, row, col, cb) {
      var zi = Math.min(z, ICE.maxZ), sc = Math.pow(2, z - zi);
      iceImage(zi, Math.floor(row / sc), Math.floor(col / sc), function (img) {
        if (!img) { cb(null); return; }
        try {
          var t = document.createElement('canvas');
          t.width = 512; t.height = 512;
          var tx = t.getContext('2d', { willReadFrequently: true }), part = 512 / sc;
          tx.drawImage(img, (col % sc) * part, (row % sc) * part, part, part, 0, 0, 512, 512);
          cb(tx.getImageData(0, 0, 512, 512).data);
        } catch (err) { cb(null); }
      });
    }

    // A filled pixel is shown slightly muted, so it reads as background, not as today's
    // photo; today's sea ice is drawn on it in white; the edge is blended over a wide
    // band so the patch fades into the photo instead of showing a hard rim.
    // The blend is worked out once for the whole picture (not tile by tile, which would
    // leave seams), on a coarse grid of 8 x 8-pixel cells so it needs little memory,
    // and fades over about FILL_DEG degrees: the clouds thin out into the patch.
    var FILL_DEG = 12, CELL = 8, CPT = 512 / CELL;   // CPT: grid cells along one tile side
    var DIM_LUM = 60;                  // photo pixels darker than this, near a gap, are partly filled
    var ICE_RGB = [205, 215, 228];     // sea ice colour on the fill: soft blue-white
    function isHole(d, k) { return d[k] < 9 && d[k + 1] < 9 && d[k + 2] < 9; }

    /** Paste one daily tile and add up, per grid cell, how much of it has no photo. */
    function scanTile(x, img, dx, dy, grid, GW) {
      x.drawImage(img, dx, dy);
      var d;
      try { d = x.getImageData(dx, dy, 512, 512).data; } catch (err) { return; }
      var gx0 = dx / CELL, gy0 = dy / CELL, inv = 1 / (CELL * CELL);
      for (var py = 0; py < 512; py++) {
        var base = (gy0 + (py / CELL | 0)) * GW + gx0;
        for (var px = 0; px < 512; px++) {
          if (isHole(d, (py * 512 + px) * 4)) grid[base + (px / CELL | 0)] += inv;
        }
      }
    }

    // one box blur along a line of n values (every `stride`-th from `start`), ends held
    function boxLine(src, dst, n, stride, start, r) {
      var acc = 0, inv = 1 / (2 * r + 1), i;
      function at(j) { return src[start + (j < 0 ? 0 : j >= n ? n - 1 : j) * stride]; }
      for (i = -r; i <= r; i++) acc += at(i);
      for (i = 0; i < n; i++) {
        dst[start + i * stride] = acc * inv;
        acc += at(i + r + 1) - at(i - r);
      }
    }
    /**
     * Soft version of the hole grid: two box blurs each way (close to a Gaussian).
     * Across, the radius grows toward the poles, where a degree of longitude is short,
     * so the fade is about as wide on the ground in every direction.
     */
    function blurGrid(grid, GW, GH, tr) {
      var sp = tileSpan(tr.z), a = new Float32Array(GW * GH), b = new Float32Array(GW * GH), i, j;
      var ry = Math.max(1, Math.round(FILL_DEG / sp * CPT / 2));
      for (j = 0; j < GH; j++) {
        var lat = tr.lat1 - (j + 0.5) / CPT * sp;
        var rx = Math.min(GW, Math.max(1, Math.round(ry / Math.max(0.2, Math.cos(lat * Math.PI / 180)))));
        boxLine(grid, a, GW, 1, j * GW, rx);
        boxLine(a, b, GW, 1, j * GW, rx);
      }
      for (i = 0; i < GW; i++) {
        boxLine(b, a, GH, GW, i, ry);
        boxLine(a, b, GH, GW, i, ry);
      }
      return b;
    }

    /** Blend Blue Marble (and today's sea ice) into one tile of the joined picture. */
    function blendTile(x, dx, dy, lon0, lat1, span, z, row, col, w, GW, GH, done) {
      var gx0 = dx / CELL, gy0 = dy / CELL, need = false, i, j;
      for (j = 0; j < CPT && !need; j++) {
        for (i = 0; i < CPT; i++) if (w[(gy0 + j) * GW + gx0 + i] > 0.001) { need = true; break; }
      }
      if (!need) { done(); return; }
      var a, b;
      try {
        var t = document.createElement('canvas');
        t.width = 512; t.height = 512;
        var tx = t.getContext('2d', { willReadFrequently: true });
        var bw = under.naturalWidth, bh = under.naturalHeight;
        tx.drawImage(under, (lon0 + 180) / 360 * bw, (90 - lat1) / 180 * bh, span / 360 * bw, span / 180 * bh, 0, 0, 512, 512);
        b = tx.getImageData(0, 0, 512, 512).data;
        a = x.getImageData(dx, dy, 512, 512);
      } catch (err) { done(); return; }   // e.g. opened from disk
      // sea ice only exists toward the poles; elsewhere skip the extra download
      var polar = lat1 > 40 || lat1 - span < -40;
      (polar ? function (cb) { iceFor(z, row, col, cb); } : function (cb) { cb(null); })(function (ice) {
        var d = a.data;
        for (var py = 0; py < 512; py++) {
          var gy = (dy + py + 0.5) / CELL - 0.5, y0 = Math.floor(gy), fy = gy - y0;
          var ya = Math.max(0, y0) * GW, yb = Math.min(GH - 1, y0 + 1) * GW;
          for (var px = 0; px < 512; px++) {
            var k = (py * 512 + px) * 4, m;
            if (isHole(d, k)) m = 1;
            else {
              var gx = (dx + px + 0.5) / CELL - 0.5, x0 = Math.floor(gx), fx = gx - x0;
              var xa = Math.max(0, x0), xb = Math.min(GW - 1, x0 + 1);
              var ww = (w[ya + xa] * (1 - fx) + w[ya + xb] * fx) * (1 - fy) + (w[yb + xa] * (1 - fx) + w[yb + xb] * fx) * fy;
              // ww is about 0.5 at the rim: doubled, the fade starts at 1 there (no step)
              m = Math.min(1, ww * 2);
              m = m * m * (3 - 2 * m);   // ease in and out
              // Near the gap the photo is often only dim (low sun, twilight): treat it as
              // partly missing, more so the darker it is (fully at the black limit of 9,
              // not at all from 60). Only close to a gap, so dark open sea elsewhere in
              // the daytime photo is left alone.
              var lum = 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2];
              if (lum < DIM_LUM) m = Math.max(m, Math.min(1, (DIM_LUM - lum) / (DIM_LUM - 9)) * Math.min(1, ww * 4));
              if (m <= 0.002) continue;
            }
            var g = 0.3 * b[k] + 0.59 * b[k + 1] + 0.11 * b[k + 2];
            var ic = ice && ice[k + 3] > 128 ? iceCover(ice[k], ice[k + 1], ice[k + 2]) * 0.88 : 0;   // today's ice cover
            if (ic) iceUsed = true;
            for (var c = 0; c < 3; c++) {
              var f = (g + (b[k + c] - g) * 0.7) * 0.9;          // Blue Marble: 70% colour, 90% brightness
              // sea ice: soft blue-white, keeping 15% of the Blue Marble texture underneath
              f = f * (1 - ic) + (ICE_RGB[c] * 0.85 + g * 0.15) * ic;
              d[k + c] = d[k + c] * (1 - m) + f * m;
            }
          }
        }
        x.putImageData(a, dx, dy);
        done();
      });
    }

    /** After all daily tiles are in: fill the gaps across the whole picture. */
    function blendAll(x, tr, grid, GW, GH, done) {
      var any = false, i;
      for (i = 0; i < grid.length; i++) if (grid[i] > 0) { any = true; break; }
      if (!any || !under) { done(); return; }
      fillUsed = true;
      var w = blurGrid(grid, GW, GH, tr), sp = tileSpan(tr.z);
      var left = (tr.c1 - tr.c0 + 1) * (tr.r1 - tr.r0 + 1);
      for (var r = tr.r0; r <= tr.r1; r++) {
        for (var c = tr.c0; c <= tr.c1; c++) {
          blendTile(x, (c - tr.c0) * 512, (r - tr.r0) * 512, -180 + c * sp, 90 - r * sp, sp, tr.z, r, c, w, GW, GH,
            function () { if (--left === 0) done(); });
        }
      }
    }

    /**
     * Load a block of tiles in parallel, paste them into one canvas and hand it on
     * like loadSurface does. Any failed tile fails the whole block (the caller then
     * falls back to the WMS), so no holes are ever shown.
     */
    function loadTiles(st, tr, wrap, done) {
      var nc = tr.c1 - tr.c0 + 1, nr = tr.r1 - tr.r0 + 1, left = nc * nr, failed = false;
      var c = document.createElement('canvas');
      c.width = nc * 512; c.height = nr * 512;
      var x = c.getContext('2d', { willReadFrequently: !gl || !!st.daily });
      if (st.daily && under === null) { withUnder(function () { loadTiles(st, tr, wrap, done); }); return; }
      var GW = nc * CPT, GH = nr * CPT, grid = st.daily ? new Float32Array(GW * GH) : null;
      for (var r = tr.r0; r <= tr.r1; r++) {
        for (var cc = tr.c0; cc <= tr.c1; cc++) {
          (function (row, col) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
              if (failed) return;
              if (st.daily) scanTile(x, img, (col - tr.c0) * 512, (row - tr.r0) * 512, grid, GW);
              else x.drawImage(img, (col - tr.c0) * 512, (row - tr.r0) * 512);
              if (--left === 0) finish();
            };
            img.onerror = function () { if (!failed) { failed = true; done(null); } };
            img.src = tileUrl(st, tr.z, row, col);
          })(r, cc);
        }
      }
      function finish() {
        if (st.daily) blendAll(x, tr, grid, GW, GH, publish);
        else publish();
      }
      function publish() {
        if (st.daily) showFillNote();
        if (gl) {
          var t = makeTex(c, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
          done(t ? { tex: t, w: c.width, h: c.height } : null);
          return;
        }
        try { done({ data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }); } catch (err) { done(null); }
      }
    }

    // Load an image and turn it into what the active renderer needs:
    // a WebGL texture, or raw pixels for the CPU fallback. null on failure.
    function loadSurface(url, wrap, done) {
      var img = new Image();
      if (/^https?:/.test(url)) img.crossOrigin = 'anonymous';
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (gl) {
          var t = makeTex(img, wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE);
          done(t ? { tex: t, w: w, h: h } : null);
          return;
        }
        try {
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          done({ data: x.getImageData(0, 0, w, h).data, w: w, h: h });
        } catch (err) { done(null); }
      };
      img.onerror = function () { done(null); };
      img.src = url;
    }
    function setBasemap(style) {
      if (!STYLES[style]) style = 'dark';
      basemap = style;
      fillUsed = false; showFillNote();
      var my = ++satToken, st = STYLES[style];
      clearTimeout(refineTimer); refineKey = '';
      if (sat) { freeTex(sat.base); freeTex(sat.region); }
      if (!st.layer) {
        sat = null;
        host.classList.remove('has-sat');
        clearSat();
        render();
        return;
      }
      var world = [-90, -180, 90, 180];
      // biggest picture this device should hold: 8K on desktops with WebGL, 4K otherwise
      var bigLocal = gl && !SMALL && glMaxTex >= 8192 ? '8k' : '4k';
      var steps = st.local
        ? [st.local + '2k.jpg', st.local + bigLocal + '.jpg']
        : [gibsUrl(st, world, 1024, 512), gibsUrl(st, world, SMALL ? 2048 : 4096, SMALL ? 1024 : 2048)];
      var fallback = [gibsUrl(st, world, 1024, 512), gibsUrl(st, world, SMALL ? 2048 : 4096, SMALL ? 1024 : 2048)];
      // the daily cloud picture: the 50 level-3 tiles (5120 x 2560) on a desktop
      if (!st.local && st.tms && gl && !SMALL && glMaxTex >= 5120) steps[1] = { tiles: tileRange(3, -180, 180, -90, 90) };
      // a quick small picture first, then a sharper one
      function step(list, i, isFallback) {
        if (i >= list.length) return;
        var item = list[i];
        var load = item.tiles ? function (cb) { loadTiles(st, item.tiles, true, cb); } : function (cb) { loadSurface(item, true, cb); };
        load(function (px) {
          if (my !== satToken) { freeTex(px); return; }
          if (!px && item.tiles) { step(fallback, i, true); return; }   // tiles failed: the WMS picture instead
          if (!px) {
            // the local picture could not be used (e.g. opened from disk): ask NASA GIBS instead
            if (!isFallback && st.local) { step(fallback, sat ? 1 : 0, true); return; }
            if (!sat) setBasemap('dark');
            return;
          }
          if (!sat) sat = { base: px, region: null };
          else { freeTex(sat.base); sat.base = px; }
          host.classList.add('has-sat');
          satFine = '';
          render();
          step(list, i + 1, isFallback);
        });
      }
      step(steps, 0, false);
    }

    function clearSat() {
      if (gl) { gl.clear(gl.COLOR_BUFFER_BIT); return; }
      sctx.clearRect(0, 0, sCanvas.width, sCanvas.height);
    }
    function fitSatCanvas() {
      var cw = Math.round(W * dpr), ch = Math.round(H * dpr);
      if (sCanvas.width !== cw || sCanvas.height !== ch) { sCanvas.width = cw; sCanvas.height = ch; }
    }

    function drawSat(fine) {
      if (!sat) return;
      fitSatCanvas();
      if (gl) { drawSatGL(); return; }
      drawSat2D(fine);
    }

    function drawSatGL() {
      var cw = sCanvas.width, ch = sCanvas.height, s = cw / W, RAD = Math.PI / 180, g = sat.region;
      gl.viewport(0, 0, cw, ch);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(glProg);
      gl.uniform2f(glU.uC, CX * s, (H - CY) * s);
      gl.uniform1f(glU.uR, R * k * s);
      gl.uniform1f(glU.uLam, -rot[0] * RAD);
      gl.uniform1f(glU.uSp, Math.sin(-rot[1] * RAD));
      gl.uniform1f(glU.uCp, Math.cos(-rot[1] * RAD));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sat.base.tex); gl.uniform1i(glU.uBase, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g ? g.tex : sat.base.tex); gl.uniform1i(glU.uReg, 1);
      gl.uniform1f(glU.uHasReg, g ? 1 : 0);
      gl.uniform1f(glU.uMid, g ? g.lonMid : 0);
      gl.uniform4f(glU.uBox, g ? g.lon0 : 0, g ? g.lon1 : 1, g ? g.lat0 : 0, g ? g.lat1 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // CPU fallback (no WebGL2): sample the picture pixel by pixel.
    function drawSat2D(fine) {
      var rr = R * k;
      var x0 = Math.max(0, Math.floor(CX - rr)), x1 = Math.min(W, Math.ceil(CX + rr));
      var y0 = Math.max(0, Math.floor(CY - rr)), y1 = Math.min(H, Math.ceil(CY + rr));
      if (x1 <= x0 || y1 <= y0) return;
      var dens = fine ? Math.min(dpr, 1.5) : (k > 2.5 ? 0.34 : 0.5);
      var w = Math.ceil((x1 - x0) * dens), h = Math.ceil((y1 - y0) * dens);
      sBuf.width = w; sBuf.height = h;
      var img = sbctx.createImageData(w, h), d = img.data;
      var RAD = Math.PI / 180, lam0 = -rot[0] * RAD, phi0 = -rot[1] * RAD, sp = Math.sin(phi0), cp = Math.cos(phi0);
      var b = sat.base, bd = b.data, bw = b.w, bh = b.h, TWO = 2 * Math.PI;
      var g = sat.region, gd = g && g.data;
      for (var j = 0; j < h; j++) {
        var yy = (CY - (y0 + (j + 0.5) / dens)) / rr;
        for (var i = 0; i < w; i++) {
          var xx = (x0 + (i + 0.5) / dens - CX) / rr, r2 = xx * xx + yy * yy;
          if (r2 >= 1) continue;
          var cz = Math.sqrt(1 - r2);
          var lat = Math.asin(cz * sp + yy * cp);
          var lon = lam0 + Math.atan2(xx, cz * cp - yy * sp);
          var o = (j * w + i) * 4, s;
          if (g) {
            var gx = lon / RAD; gx = gx - 360 * Math.round((gx - g.lonMid) / 360);
            var gt = lat / RAD;
            if (gx >= g.lon0 && gx < g.lon1 && gt > g.lat0 && gt <= g.lat1) {
              s = (Math.min(g.h - 1, Math.floor((g.lat1 - gt) / (g.lat1 - g.lat0) * g.h)) * g.w +
                Math.min(g.w - 1, Math.floor((gx - g.lon0) / (g.lon1 - g.lon0) * g.w))) * 4;
              d[o] = gd[s]; d[o + 1] = gd[s + 1]; d[o + 2] = gd[s + 2]; d[o + 3] = 255;
              continue;
            }
          }
          var u = lon / TWO + 0.5; u -= Math.floor(u);
          s = (Math.min(bh - 1, Math.floor((0.5 - lat / Math.PI) * bh)) * bw + Math.min(bw - 1, Math.floor(u * bw))) * 4;
          d[o] = bd[s]; d[o + 1] = bd[s + 1]; d[o + 2] = bd[s + 2]; d[o + 3] = 255;
        }
      }
      sbctx.putImageData(img, 0, 0);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, W, H);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(sBuf, x0, y0, w / dens, h / dens);
    }

    // After the globe comes to rest: repaint at full detail (CPU fallback only; the GPU
    // is always at full detail), then ask NASA for a sharper picture of the area in view.
    function settleSat() {
      clearTimeout(satTimer);
      satTimer = setTimeout(function () {
        if (!sat || drag || anim || spinning) return;
        if (!gl) { drawSat(true); satFine = satKey(); }
        clearTimeout(refineTimer);
        refineTimer = setTimeout(refineSat, 250);
      }, 120);
    }
    function dropRegion() {
      if (!sat || !sat.region) return;
      freeTex(sat.region); sat.region = null; refineKey = ''; satFine = '';
      render();
    }
    function refineSat() {
      if (!sat || drag || anim || spinning) return;
      // zoomed out, the world picture is enough
      if (k < 1.3) { dropRegion(); return; }
      // lon/lat of a grid of screen points that land on the Earth (the edge of the disc
      // may be in view: those points are skipped)
      var lonMid = wrapLon(-rot[0]), la0 = 90, la1 = -90, lo0 = 1e9, lo1 = -1e9, n = 10, hits = 0;
      for (var a = 0; a <= n; a++) {
        for (var c = 0; c <= n; c++) {
          var p = proj.invert([(W - inset) * a / n, H * c / n]);
          if (!p || isNaN(p[0]) || !visible(p)) continue;
          hits++;
          var l = p[0] - 360 * Math.round((p[0] - lonMid) / 360);
          if (l < lo0) lo0 = l; if (l > lo1) lo1 = l;
          if (p[1] < la0) la0 = p[1]; if (p[1] > la1) la1 = p[1];
        }
      }
      if (hits < 4) return;
      var padLon = (lo1 - lo0) * 0.08 + 0.2, padLat = (la1 - la0) * 0.08 + 0.2;
      lo0 -= padLon; lo1 += padLon; la0 = Math.max(-90, la0 - padLat); la1 = Math.min(90, la1 + padLat);
      if (lo0 < -180 || lo1 > 180 || lo1 - lo0 > 120) return;       // across the date line or too wide: keep the world image
      // the world picture is already sharp enough for this zoom: no need to ask NASA
      var screenPx = Math.max(W - inset, H) * dpr, worldPx = (lo1 - lo0) / 360 * sat.base.w;
      if (worldPx >= screenPx * 0.9) { dropRegion(); return; }
      var key = [basemap, lo0.toFixed(2), lo1.toFixed(2), la0.toFixed(2), la1.toFixed(2)].join('|');
      if (key === refineKey) return;
      var g = sat.region;
      if (g && lo0 >= g.lon0 && lo1 <= g.lon1 && la0 >= g.lat0 && la1 <= g.lat1 && (g.lon1 - g.lon0) < (lo1 - lo0) * 1.6) return;
      refineKey = key;
      var my = satToken, st = STYLES[basemap];
      function apply(px, b) {
        if (my !== satToken || !px || !sat || refineKey !== key) { freeTex(px); return false; }
        freeTex(sat.region);
        px.lon0 = b.lon0; px.lon1 = b.lon1; px.lat0 = b.lat0; px.lat1 = b.lat1; px.lonMid = (b.lon0 + b.lon1) / 2;
        sat.region = px; satFine = '';
        if (!drag && !anim && !spinning) render();
        return true;
      }
      // NASA tiles at the level that matches the screen: the least detailed level that
      // still gives about one picture pixel per screen pixel, at most 64 tiles.
      if (st.tms) {
        var need = screenPx / (lo1 - lo0), z = 3, cap = gl ? Math.min(glMaxTex, 8192) : 4096;
        while (z < st.maxZ && 512 / tileSpan(z) < need * 0.85) z++;
        var tr = tileRange(z, lo0, lo1, la0, la1);
        while (z > 3 && (tr.n > 64 || (tr.c1 - tr.c0 + 1) * 512 > cap || (tr.r1 - tr.r0 + 1) * 512 > cap)) { z--; tr = tileRange(z, lo0, lo1, la0, la1); }
        loadTiles(st, tr, false, function (px) {
          if (px) { apply(px, tr); return; }
          if (my === satToken && refineKey === key) wmsRegion();   // tiles failed: ask the WMS
        });
        return;
      }
      wmsRegion();
      function wmsRegion() {
        var MAXPX = Math.min(gl ? 3072 : 2000, Math.round(screenPx * 1.2)), ws, hs, ratio = (lo1 - lo0) / (la1 - la0);
        if (ratio >= 1) { ws = MAXPX; hs = Math.max(128, Math.round(MAXPX / ratio)); } else { hs = MAXPX; ws = Math.max(128, Math.round(MAXPX * ratio)); }
        loadSurface(gibsUrl(st, [la0.toFixed(4), lo0.toFixed(4), la1.toFixed(4), lo1.toFixed(4)], ws, hs), false, function (px) {
          apply(px, { lon0: lo0, lon1: lo1, lat0: la0, lat1: la1 });
        });
      }
    }

    // ---- data layers ---------------------------------------------------------

    // Grid cells (trend map, timelapse) are painted on the raster canvas. 'crisp' (the
    // default) gives every pixel the colour of the NASA grid cell it falls in, so the
    // map shows the data's real resolution; faint borders appear once cells are large
    // on screen. 'smooth' blends between cell centres (bilinear) for a softer look.
    // Either way only the drawing changes, never the values.
    var cellGrid = null, cellMode = 'crisp', cellAlpha = 0.75, cellPx = 0, lastCellDraw = 0, cellSettle = 0;
    function setCells(list) {
      gCells.selectAll('path').remove();
      gDots.selectAll('circle').remove();
      dotSel = null;
      cellGrid = null;
      if (list && list.length) {
        dotSel = gDots.selectAll('circle').data(list.filter(function (c) { return c.dot; })).enter().append('circle').attr('r', 1.8);
        buildCellGrid(list);
        paintCellGrid(function (c) { return c.fill; });
        var g = cellGrid;   // outline of the whole area, curved like the lines of latitude
        gCells.append('path').attr('class', 'g-cells-edge').datum(areaShape(g.lonMin, g.lonMax, g.latMin, g.latMax));
      }
      host.classList.toggle('has-cells', !!(list && list.length));
      if (!raster) {
        if (cellGrid) queueRaster();
        else rctx.clearRect(0, 0, rCanvas.width, rCanvas.height);
      }
      drawCells();
    }
    function buildCellGrid(list) {
      var c0 = list[0], dlon = c0.lon1 - c0.lon0, dlat = c0.lat1 - c0.lat0;
      var lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
      list.forEach(function (c) {
        lonMin = Math.min(lonMin, c.lon0); lonMax = Math.max(lonMax, c.lon1);
        latMin = Math.min(latMin, c.lat0); latMax = Math.max(latMax, c.lat1);
      });
      var nx = Math.max(1, Math.round((lonMax - lonMin) / dlon)), ny = Math.max(1, Math.round((latMax - latMin) / dlat));
      var idx = list.map(function (c) {
        return Math.min(ny - 1, Math.max(0, Math.round((c.lat0 - latMin) / dlat))) * nx +
          Math.min(nx - 1, Math.max(0, Math.round((c.lon0 - lonMin) / dlon)));
      });
      cellGrid = { lonMin: lonMin, lonMax: lonMax, latMin: latMin, latMax: latMax, dlon: dlon, dlat: dlat, nx: nx, ny: ny,
        idx: idx, list: list, rgba: new Float32Array(nx * ny * 4) };
    }
    // premultiplied colours per grid node; 'transparent' or missing cells are alpha 0
    function paintCellGrid(fn) {
      var g = cellGrid, a = g.rgba;
      a.fill(0);
      g.list.forEach(function (c, i) {
        var f = fn(c, i), col = f && f !== 'transparent' ? d3.color(f) : null;
        if (!col) return;
        var op = (c.opacity == null ? 0.78 : c.opacity) * 0.86 * (col.opacity == null ? 1 : col.opacity), o = g.idx[i] * 4;
        a[o] = col.r * op; a[o + 1] = col.g * op; a[o + 2] = col.b * op; a[o + 3] = op;
      });
    }
    function areaShape(lo0, lo1, la0, la1) {
      var ring = [], n = Math.max(2, Math.ceil(Math.max(lo1 - lo0, la1 - la0) / 0.5)), i;
      for (i = 0; i <= n; i++) ring.push([lo0, la0 + (la1 - la0) * i / n]);
      for (i = 1; i <= n; i++) ring.push([lo0 + (lo1 - lo0) * i / n, la1]);
      for (i = 1; i <= n; i++) ring.push([lo1, la1 - (la1 - la0) * i / n]);
      for (i = 1; i <= n; i++) ring.push([lo1 - (lo1 - lo0) * i / n, la0]);
      return { type: 'Polygon', coordinates: [ring] };
    }
    function sampleCells(lon, lat) {
      var g = cellGrid;
      if (lat < g.latMin || lat > g.latMax) return null;
      lon = lon - 360 * Math.round((lon - (g.lonMin + g.lonMax) / 2) / 360);
      if (lon < g.lonMin || lon > g.lonMax) return null;
      if (cellMode === 'crisp') return sampleCrisp(g, lon, lat);
      var fx = (lon - g.lonMin) / g.dlon - 0.5, fy = (lat - g.latMin) / g.dlat - 0.5;
      fx = fx < 0 ? 0 : fx > g.nx - 1 ? g.nx - 1 : fx; fy = fy < 0 ? 0 : fy > g.ny - 1 ? g.ny - 1 : fy;
      var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.nx - 1, x0 + 1), y1 = Math.min(g.ny - 1, y0 + 1);
      var tx = fx - x0, ty = fy - y0, a = g.rgba;
      var i00 = (y0 * g.nx + x0) * 4, i10 = (y0 * g.nx + x1) * 4, i01 = (y1 * g.nx + x0) * 4, i11 = (y1 * g.nx + x1) * 4;
      var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      var al = a[i00 + 3] * w00 + a[i10 + 3] * w10 + a[i01 + 3] * w01 + a[i11 + 3] * w11;
      if (al < 0.02) return null;
      return [
        (a[i00] * w00 + a[i10] * w10 + a[i01] * w01 + a[i11] * w11) / al,
        (a[i00 + 1] * w00 + a[i10 + 1] * w10 + a[i01 + 1] * w01 + a[i11 + 1] * w11) / al,
        (a[i00 + 2] * w00 + a[i10 + 2] * w10 + a[i01 + 2] * w01 + a[i11 + 2] * w11) / al,
        al * 255 * cellAlpha];
    }
    // the colour of the one cell under (lon, lat), with a faint border near its edges
    function sampleCrisp(g, lon, lat) {
      var fx = (lon - g.lonMin) / g.dlon, fy = (lat - g.latMin) / g.dlat;
      var ix = Math.min(g.nx - 1, Math.floor(fx)), iy = Math.min(g.ny - 1, Math.floor(fy)), o = (iy * g.nx + ix) * 4, a = g.rgba;
      var al = a[o + 3];
      if (al < 0.02) return null;
      var r = a[o] / al, gg = a[o + 1] / al, b = a[o + 2] / al;
      if (cellPx) {
        // distance to the nearest cell edge in screen pixels (cos(lat) narrows the columns)
        var ex = Math.min(fx - ix, ix + 1 - fx) * cellPx * g.dlon * Math.cos(lat * Math.PI / 180);
        var ey = Math.min(fy - iy, iy + 1 - fy) * cellPx * g.dlat;
        if (ex < 0.7 || ey < 0.7) { r *= 0.72; gg *= 0.72; b *= 0.72; }
      }
      return [r, gg, b, al * 255 * cellAlpha];
    }
    function setCellStyle(mode, alpha) {
      if (mode) cellMode = mode === 'smooth' ? 'smooth' : 'crisp';
      if (alpha != null) cellAlpha = Math.max(0.2, Math.min(1, alpha));
      if (cellGrid && !raster) queueRaster();
    }
    function recolorCells(fn) {
      if (!cellGrid) return;
      paintCellGrid(fn);
      if (!raster) queueRaster();   // the lon/lat cache stays valid: only the colours changed
    }
    function drawCells() {
      var edge = gCells.select('path.g-cells-edge');
      if (!edge.empty()) edge.attr('d', path);
      if (!dotSel) return;
      dotSel.each(function (c) {
        var p = [(c.lon0 + c.lon1) / 2, (c.lat0 + c.lat1) / 2], el = d3.select(this);
        if (!visible(p)) { el.attr('display', 'none'); return; }
        var xy = proj(p);
        el.attr('display', null).attr('cx', xy[0]).attr('cy', xy[1]).attr('r', Math.max(1.2, Math.min(3.2, k * 1.6)));
      });
    }
    function setMarks(list) {
      marks = list || [];
      gMarks.selectAll('g').remove();
      var g = gMarks.selectAll('g').data(marks).enter().append('g').attr('class', function (m) { return 'g-mark ' + (m.cls || ''); });
      g.append('circle').attr('r', 9);
      g.append('text').attr('class', 'g-mark-glyph').attr('text-anchor', 'middle').attr('y', 4).text(function (m) { return m.glyph || ''; });
      g.append('text').attr('class', 'g-mark-label').attr('x', 14).attr('y', 4).text(function (m) { return m.text || ''; });
      drawMarks();
    }
    function drawMarks() {
      gMarks.selectAll('g').each(function (m) {
        var el = d3.select(this), p = [m.lon, m.lat];
        if (!visible(p)) { el.attr('display', 'none'); return; }
        var xy = proj(p);
        el.attr('display', null).attr('transform', 'translate(' + xy[0] + ',' + xy[1] + ')');
      });
    }

    // Raster: an equirectangular image draped on the sphere (live rain).
    function setRaster(r) {
      raster = r;
      host.classList.toggle('has-raster', !!r);
      if (!r && !cellGrid) { rctx.clearRect(0, 0, rCanvas.width, rCanvas.height); return; }
      queueRaster();
    }
    function queueRaster() {
      if ((!raster && !cellGrid) || rasterQueued) return;
      rasterQueued = true;
      requestAnimationFrame(function () { rasterQueued = false; drawRaster(); });
    }
    function drawRaster() {
      var src = raster ? raster.sample : cellGrid ? sampleCells : null;
      if (!src) return;
      var moving = !!(drag || anim || spinning), crisp = !raster && cellMode === 'crisp';
      // CSS pixels per sample: fine at rest (one per pixel for crisp cells, so their
      // edges are sharp), coarser while the globe moves
      // While colours change quickly (timelapse playing), crisp cells draw at half
      // resolution and get one sharp redraw once the frames stop.
      var now = performance.now(), rapid = crisp && !moving && now - lastCellDraw < 250;
      lastCellDraw = now;
      if (rapid) { clearTimeout(cellSettle); cellSettle = setTimeout(queueRaster, 260); }
      var step = moving ? 4 : crisp ? (rapid ? 2 : 1) : Math.max(1, 2 / dpr), w = Math.ceil(W / step), h = Math.ceil(H / step);
      // screen pixels per degree near the centre; cell borders only once cells are big
      var ppd = R * k * Math.PI / 180;
      cellPx = crisp && !moving && cellGrid && Math.min(cellGrid.dlon, cellGrid.dlat) * ppd >= 14 ? ppd : 0;
      var key = [rot[0].toFixed(3), rot[1].toFixed(3), k.toFixed(4), W, H, step].join('|');
      if (!rasterCache || rasterCache.key !== key) {
        // cache the lon/lat under every sample pixel, so a new frame is just lookups
        var lon = new Float32Array(w * h).fill(NaN), lat = new Float32Array(w * h), rr = R * k;
        var RAD = Math.PI / 180, lam0 = -rot[0], sp = Math.sin(-rot[1] * RAD), cp = Math.cos(-rot[1] * RAD);
        var ya = Math.max(0, Math.floor((CY - rr) / step)), yb = Math.min(h, Math.ceil((CY + rr) / step));
        var xa = Math.max(0, Math.floor((CX - rr) / step)), xb = Math.min(w, Math.ceil((CX + rr) / step));
        for (var y = ya; y < yb; y++) {
          var yy = (CY - (y + 0.5) * step) / rr;
          for (var x = xa; x < xb; x++) {
            var xx = ((x + 0.5) * step - CX) / rr, r2 = xx * xx + yy * yy;
            if (r2 >= 1) continue;
            var cz = Math.sqrt(1 - r2), i = y * w + x;
            lat[i] = Math.asin(cz * sp + yy * cp) / RAD;
            lon[i] = wrapLon(lam0 + Math.atan2(xx, cz * cp - yy * sp) / RAD);
          }
        }
        rasterCache = { key: key, lon: lon, lat: lat, w: w, h: h };
      }
      var c = rasterCache;
      rBuf.width = c.w; rBuf.height = c.h;
      var img = rbctx.createImageData(c.w, c.h), d = img.data;
      for (var j = 0; j < c.lon.length; j++) {
        if (isNaN(c.lon[j])) continue;
        var col = src(c.lon[j], c.lat[j]);
        if (!col) continue;
        d[j * 4] = col[0]; d[j * 4 + 1] = col[1]; d[j * 4 + 2] = col[2]; d[j * 4 + 3] = col[3];
      }
      rbctx.putImageData(img, 0, 0);
      rCanvas.width = Math.round(W * dpr); rCanvas.height = Math.round(H * dpr);
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.imageSmoothingEnabled = !crisp || moving || rapid;
      rctx.imageSmoothingQuality = 'high';
      rctx.drawImage(rBuf, 0, 0, rCanvas.width, rCanvas.height);
    }

    // Particles: a wind field sample(lon, lat) -> [u, v] in m/s, inside bounds.
    function setField(f) {
      field = f;
      cancelAnimationFrame(pRaf);
      particles = [];
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      host.classList.toggle('has-field', !!f);
      if (!f) return;
      pCanvas.width = Math.round(W * dpr); pCanvas.height = Math.round(H * dpr);
      var n = f.count || 900;
      for (var i = 0; i < n; i++) particles.push(spawn({}));
      if (REDUCED) { stepParticles(); return; }
      var loop = function () { stepParticles(); pRaf = requestAnimationFrame(loop); };
      pRaf = requestAnimationFrame(loop);
    }
    function spawn(p) {
      var b = field.bounds;
      p.lon = b.lonMin + Math.random() * (b.lonMax - b.lonMin);
      p.lat = b.latMin + Math.random() * (b.latMax - b.latMin);
      p.age = Math.floor(Math.random() * 80);
      return p;
    }
    function stepParticles() {
      if (!field) return;
      if (pCanvas.width !== Math.round(W * dpr)) { pCanvas.width = Math.round(W * dpr); pCanvas.height = Math.round(H * dpr); }
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (pClear) { pctx.clearRect(0, 0, W, H); pClear = false; }
      else {
        pctx.globalCompositeOperation = 'destination-out';
        pctx.fillStyle = 'rgba(0,0,0,0.09)';
        pctx.fillRect(0, 0, W, H);
        pctx.globalCompositeOperation = 'source-over';
      }
      var b = field.bounds, s = field.speed || 0.0045;
      var edge = 0.12 * Math.min(b.lonMax - b.lonMin, b.latMax - b.latMin) || 1;
      pctx.lineWidth = 1.3; pctx.lineCap = 'round';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i], uv = field.sample(p.lon, p.lat);
        if (!uv || p.age > 90 || p.lon < b.lonMin || p.lon > b.lonMax || p.lat < b.latMin || p.lat > b.latMax) { spawn(p); p.age = 0; continue; }
        var a = [p.lon, p.lat];
        p.lon += uv[0] * s / Math.max(0.2, Math.cos(p.lat * Math.PI / 180));
        p.lat += uv[1] * s;
        p.age++;
        if (!visible(a)) continue;
        var xa = proj(a), xb = proj([p.lon, p.lat]);
        var sp = Math.sqrt(uv[0] * uv[0] + uv[1] * uv[1]);
        // soft edges: streaks fade out near the sides of the box instead of stopping at a hard square
        var f = Math.min(1, Math.min(p.lon - b.lonMin, b.lonMax - p.lon, p.lat - b.latMin, b.latMax - p.lat) / edge);
        // slow = pale cyan, fast = white
        var t = Math.min(1, sp / 10), al = Math.min(0.95, 0.35 + sp / 9) * Math.max(0, f);
        if (al < 0.02) continue;
        pctx.strokeStyle = 'rgba(' + Math.round(150 + 105 * t) + ',' + Math.round(225 + 30 * t) + ',255,' + al.toFixed(2) + ')';
        pctx.beginPath(); pctx.moveTo(xa[0], xa[1]); pctx.lineTo(xb[0], xb[1]); pctx.stroke();
      }
    }

    // ---- motion ------------------------------------------------------------

    function stopAnim() {
      if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.safety); anim = null; rested(); }
    }

    function animateTo(r1, k1, dur) {
      stopAnim();
      var r0 = rot.slice(), k0 = k;
      var dl = wrapLon(r1[0] - r0[0]);
      var end = [r0[0] + dl, r1[1]];
      if (REDUCED || !dur) { rot = end; k = k1; render(); return; }
      var hop = d3.geoDistance(centre(), [-r1[0], -r1[1]]);
      var dip = 0.5 * Math.min(1, hop / 1.2);   // zoom out a little on long flights
      var t0 = null, me = {};
      function frame(now) {
        if (anim !== me) return;
        if (t0 === null) t0 = now;
        var u = Math.min(1, (now - t0) / dur), e = d3.easeCubicInOut(u);
        rot = [r0[0] + dl * e, r0[1] + (r1[1] - r0[1]) * e];
        k = (k0 + (k1 - k0) * e) * (1 - dip * Math.sin(Math.PI * e));
        render();
        if (u >= 1) stopAnim(); else me.raf = requestAnimationFrame(frame);
      }
      anim = me;
      me.raf = requestAnimationFrame(frame);
      // If frames stall (background tab, throttled browser), still land on the target.
      me.safety = setTimeout(function () {
        if (anim !== me) return;
        stopAnim(); rot = end; k = k1; render();
      }, dur + 400);
    }

    function flyTo(lat, lon, sz, dur, zoom) {
      spin(false);
      var k1 = zoom ? zoom : opts.fill ? (sz >= 6 ? 1.0 : 1.08)
        : (sz >= 10 ? 1.1 : (sz >= 6 ? 1.25 : 1.4));   // keep the round edge in view
      if (first) { first = false; if (dur === undefined) dur = 2200; }
      animateTo([-lon, -lat], k1, dur === undefined ? 1100 : dur);
    }

    function zoomBy(f) { spin(false); animateTo(rot, clamp(k * f, K_MIN, K_MAX), 350); }

    // Momentum: after a flick the globe carries on at the finger's speed and slows
    // down like a scroll view. It runs in the same slot as other animations, so a
    // new touch stops it at once and takes over from wherever the globe is.
    var DECAY = 0.997;   // share of the speed kept after each millisecond
    function fling(vLon, vLat) {
      stopAnim();
      var me = {}, last = null;
      function frame(now) {
        if (anim !== me) return;
        if (last !== null) {
          var dt = Math.min(40, now - last);
          rot = [rot[0] + vLon * dt, clamp(rot[1] + vLat * dt, -89, 89)];
          if (rot[1] <= -89 || rot[1] >= 89) vLat = 0;
          var keep = Math.pow(DECAY, dt);
          vLon *= keep; vLat *= keep;
          render();
          if (Math.sqrt(vLon * vLon + vLat * vLat) < 0.003) { stopAnim(); return; }
        }
        last = now;
        me.raf = requestAnimationFrame(frame);
      }
      anim = me;
      me.raf = requestAnimationFrame(frame);
    }

    // ---- input -------------------------------------------------------------

    var node = svg.node(), drag = null;
    function local(e) {
      var r = node.getBoundingClientRect();
      return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
    }
    function geoAt(e) {
      var p = proj.invert(local(e));
      return p && !isNaN(p[0]) && visible(p) ? p : null;
    }

    node.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.g-place')) return;
      stopAnim(); spin(false);
      drag = { x: e.clientX, y: e.clientY, rot: rot.slice(), moved: false, id: e.pointerId, trail: [] };
    });
    node.addEventListener('pointermove', function (e) {
      if (!drag) {
        if (e.target.closest && e.target.closest('.g-place')) return;
        var p = geoAt(e);
        readout.text(p ? fmt(p[1], wrapLon(p[0])) : trG(HINT));
        return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.sqrt(dx * dx + dy * dy) < 4) return;
        drag.moved = true;
        host.classList.add('dragging');
        if (host.parentNode) host.parentNode.classList.add('globe-moving');
        try { node.setPointerCapture(drag.id); } catch (err) { /* ignore */ }
      }
      var r = node.getBoundingClientRect();
      var sens = 180 / (Math.PI * R * k) * (W / r.width);
      rot = [drag.rot[0] + dx * sens, clamp(drag.rot[1] - dy * sens, -89, 89)];
      // keep the last few positions so the release speed can be measured
      drag.sens = sens;
      drag.trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (drag.trail.length > 6) drag.trail.shift();
      requestRender();
    });
    function end(e, cancel) {
      if (!drag) return;
      var d = drag; drag = null;
      host.classList.remove('dragging');
      if (host.parentNode) host.parentNode.classList.remove('globe-moving');
      rested();
      if (d.moved && !cancel && !REDUCED && d.trail.length > 1) {
        // speed over the last ~100 ms of the drag; a pause before letting go means no flick
        var b = d.trail[d.trail.length - 1], a = d.trail[0];
        for (var i = d.trail.length - 2; i >= 0; i--) { if (b.t - d.trail[i].t <= 100) a = d.trail[i]; }
        var span = b.t - a.t;
        if (span > 8 && e.timeStamp - b.t < 80) {
          var vx = (b.x - a.x) / span, vy = (b.y - a.y) / span;   // px per ms
          if (Math.sqrt(vx * vx + vy * vy) > 0.15) fling(vx * d.sens, -vy * d.sens);
        }
      }
      if (d.moved || cancel) return;
      var p = geoAt(e);
      if (p && opts.onPick) opts.onPick(clamp(p[1], -89.5, 89.5), wrapLon(p[0]));
    }
    node.addEventListener('pointerup', function (e) { end(e, false); });
    node.addEventListener('pointercancel', function (e) { end(e, true); });
    node.addEventListener('pointerleave', function () { if (!drag) readout.text(trG(HINT)); });
    node.addEventListener('dblclick', function (e) { e.preventDefault(); zoomBy(1.6); });
    // Trackpad pinch (and ctrl + wheel) zooms; a plain wheel still scrolls the page.
    node.addEventListener('wheel', function (e) {
      var wide = opts.fill && window.matchMedia && window.matchMedia('(min-width: 961px)').matches;
      if (!e.ctrlKey && !wide) return;
      e.preventDefault(); spin(false);
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;   // lines -> pixels
      var from = anim && anim.zoomTo ? anim.zoomTo : k;
      glideZoom(clamp(from * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022)), K_MIN, K_MAX));
    }, { passive: false });
    // Ease the zoom towards its target over a few frames instead of jumping per wheel tick.
    function glideZoom(target) {
      if (REDUCED) { stopAnim(); k = target; render(); rested(); return; }
      if (anim && anim.zoomTo) { anim.zoomTo = target; return; }
      stopAnim();
      var me = { zoomTo: target, raf: 0, safety: 0 }, last = null;
      anim = me;
      function frame(now) {
        if (anim !== me) return;
        var dt = last === null ? 16 : Math.min(50, now - last); last = now;
        var a = 1 - Math.pow(0.78, dt / 16);           // ~22% of the gap per 60 Hz frame
        k = k * Math.pow(me.zoomTo / k, a);              // log-space, so zooming feels even
        if (Math.abs(Math.log(me.zoomTo / k)) < 0.002) { k = me.zoomTo; render(); anim = null; rested(); return; }
        render();
        me.raf = requestAnimationFrame(frame);
      }
      me.raf = requestAnimationFrame(frame);
    }
    node.addEventListener('keydown', function (e) {
      spin(false);
      var step = 10 / k;
      if (e.key === 'ArrowLeft') rot[0] += step;
      else if (e.key === 'ArrowRight') rot[0] -= step;
      else if (e.key === 'ArrowUp') rot[1] = clamp(rot[1] - step, -89, 89);
      else if (e.key === 'ArrowDown') rot[1] = clamp(rot[1] + step, -89, 89);
      else if (e.key === '+' || e.key === '=') { zoomBy(1.4); e.preventDefault(); return; }
      else if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.4); e.preventDefault(); return; }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var c = centre();
        if (opts.onPick) opts.onPick(clamp(c[1], -89.5, 89.5), wrapLon(c[0]));
        return;
      } else return;
      e.preventDefault(); stopAnim();
      var c2 = centre();
      readout.text('Centre ' + fmt(c2[1], wrapLon(c2[0])) + ' · Enter to choose');
      render();
    });

    size();
    render();
    if (opts.fill) {
      var saved = null;
      try { saved = localStorage.getItem('td-globe'); } catch (err) { /* private mode */ }
      setBasemap(STYLES[saved] ? saved : 'sat');
    }
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var w = host.clientWidth;
        if (w && (Math.max(240, w) !== W || (opts.fill && host.clientHeight && host.clientHeight !== H))) { size(); render(); }
      }).observe(host);
    }

    if (topo) {
      d3.json(WORLD).then(function (t) {
        land = topo.feature(t, t.objects.land);
        borders = topo.mesh(t, t.objects.countries, function (a, b) { return a !== b; });
        host.classList.add('ready');
        render();
        // then the more detailed 1:50m coastlines and borders
        d3.json(WORLD_FINE).then(function (f) {
          landLo = land; bordLo = borders;
          land = topo.feature(f, f.objects.land);
          borders = topo.mesh(f, f.objects.countries, function (a, b) { return a !== b; });
          render();
        }).catch(function () { /* keep the 1:110m outlines */ });
      }).catch(function () {
        readout.text('Coastlines could not load. You can still click to choose a place.');
      });
    }

    return {
      setSelection: function (s) { sel = s; render(); },
      setCompare: function (s) { cmp = s; render(); },
      flyTo: flyTo,
      spin: spin,
      setBadge: setBadge,
      setCells: setCells,
      setCellStyle: setCellStyle,
      recolorCells: recolorCells,
      setMarks: setMarks,
      setRaster: setRaster,
      redrawRaster: function () { queueRaster(); },
      setField: setField,
      setInset: setInset,
      setBasemap: setBasemap,
      render: render
    };
  }

  window.TDGlobe = { create: create };
})();
