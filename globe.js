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
    var gNight1 = svg.append('path').attr('class', 'g-night').attr('fill-opacity', 0.4);
    var gNight2 = svg.append('path').attr('class', 'g-night').attr('fill-opacity', 0.26);
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
    var readout = readBox.append('span').text(HINT);
    var sunEl = readBox.append('span').attr('class', 'g-sun');

    var proj = d3.geoOrthographic().clipAngle(90).precision(0.3);
    var path = d3.geoPath(proj);
    var grat = d3.geoGraticule10();
    var land = null, borders = null;
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
    var cells = null, cellSel = null, dotSel = null, marks = [];

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
    var night1 = null, night2 = null;
    function updateSun() {
      var d = new Date();
      var day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
      var decl = -23.44 * Math.cos(2 * Math.PI * (day + 10) / 365);
      var hrs = d.getUTCHours() + d.getUTCMinutes() / 60;
      var anti = [wrapLon((12 - hrs) * 15 + 180), -decl];
      night1 = d3.geoCircle().center(anti).radius(90)();
      night2 = d3.geoCircle().center(anti).radius(82)();
      var hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
      sunEl.text('Daylight now · ' + hh + ':' + mm + ' UTC');
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
      gNight1.attr('d', night1 ? path(night1) : null);
      gNight2.attr('d', night2 ? path(night2) : null);
      if (REDUCED) drawStars(0);
      gGrat.attr('d', path(grat));
      gLand.attr('d', land ? path(land) : null);
      gBord.attr('d', borders ? path(borders) : null);
      if (sat) {
        var still = !(drag || anim || spinning);
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
      badgeEl.style('display', null).style('left', xy[0] * sx + 'px').style('top', xy[1] * sx + 'px')
        .classed('flip', xy[0] > (W - inset) * (W - inset < 600 ? 0.5 : 0.62));
    }

    function setBadge(b) {
      badge = b;
      if (b) {
        badgeEl.attr('class', 'g-badge ' + (b.cls || '')).html('');
        if (b.title) badgeEl.append('strong').text(b.title);
        badgeEl.append('span').text(b.text || '');
        if (b.note) badgeEl.append('em').text(b.note);
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
      if (!spinning && sat) settleSat();
      if (spinning) { stopAnim(); spinRaf = requestAnimationFrame(spinFrame); }
    }


    // ---- satellite surface (NASA GIBS) ---------------------------------------
    // The sphere is painted from an equirectangular NASA image: a small one for the
    // whole Earth, plus a sharp one for the area in view once the globe stops moving.
    var GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&FORMAT=image/jpeg';
    var STYLES = {
      sat: { name: 'Satellite', layer: 'BlueMarble_ShadedRelief_Bathymetry' },
      live: { name: 'Latest satellite pass', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', daily: true },
      dark: { name: 'Dark map' }
    };
    var sCanvas = document.createElement('canvas');
    sCanvas.className = 'g-sat';
    sCanvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(sCanvas, svg.node());
    var sctx = sCanvas.getContext('2d'), sBuf = document.createElement('canvas'), sbctx = sBuf.getContext('2d');
    var basemap = 'dark', sat = null, satToken = 0, satTimer = 0, refineTimer = 0, refineKey = '', satFine = '';
    function satKey() {
      return [rot[0].toFixed(4), rot[1].toFixed(4), k.toFixed(5), CX.toFixed(1), CY.toFixed(1), R.toFixed(1), W, H,
        sat ? sat.base.w : 0, sat && sat.region ? sat.region.lon0 + ',' + sat.region.lat0 + ',' + sat.region.w : ''].join('|');
    }

    function gibsUrl(st, bbox, w, h) {
      var url = GIBS_WMS + '&LAYERS=' + st.layer + '&BBOX=' + bbox.join(',') + '&WIDTH=' + w + '&HEIGHT=' + h;
      // the daily image for "yesterday" is complete everywhere about 36 hours back
      if (st.daily) url += '&TIME=' + new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
      return url;
    }
    function loadPixels(url, done) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          done({ data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height });
        } catch (err) { done(null); }
      };
      img.onerror = function () { done(null); };
      img.src = url;
    }
    function setBasemap(style) {
      if (!STYLES[style]) style = 'dark';
      basemap = style;
      var my = ++satToken, st = STYLES[style];
      clearTimeout(refineTimer); refineKey = '';
      if (!st.layer) {
        sat = null;
        host.classList.remove('has-sat');
        sctx.clearRect(0, 0, sCanvas.width, sCanvas.height);
        render();
        return;
      }
      var world = [-90, -180, 90, 180], small = Math.min(window.innerWidth, window.innerHeight) < 700;
      // a quick small picture first, then a sharper one
      loadPixels(gibsUrl(st, world, 1024, 512), function (px) {
        if (my !== satToken) return;
        if (!px) { if (!sat) setBasemap('dark'); return; }
        sat = { base: px, region: null };
        host.classList.add('has-sat');
        render();
        loadPixels(gibsUrl(st, world, small ? 2048 : 4096, small ? 1024 : 2048), function (big) {
          if (my !== satToken || !big || !sat) return;
          sat.base = big;
          render();
        });
      });
    }

    function drawSat(fine) {
      if (!sat) return;
      var rr = R * k;
      var x0 = Math.max(0, Math.floor(CX - rr)), x1 = Math.min(W, Math.ceil(CX + rr));
      var y0 = Math.max(0, Math.floor(CY - rr)), y1 = Math.min(H, Math.ceil(CY + rr));
      if (x1 <= x0 || y1 <= y0) return;
      // samples per CSS pixel: one per device pixel at rest (sharp on Retina screens),
      // coarser while moving, more so when the globe fills the view
      var dens = fine ? dpr : (k > 2.5 ? 0.5 : 0.75) * Math.min(dpr, 1.5);
      var w = Math.ceil((x1 - x0) * dens), h = Math.ceil((y1 - y0) * dens);
      sBuf.width = w; sBuf.height = h;
      var img = sbctx.createImageData(w, h), d = img.data;
      var RAD = Math.PI / 180, lam0 = -rot[0] * RAD, phi0 = -rot[1] * RAD, sp = Math.sin(phi0), cp = Math.cos(phi0);
      var b = sat.base, bd = b.data, bw = b.w, bh = b.h, TWO = 2 * Math.PI;
      var g = sat.region, gd = g && g.data;
      // bilinear lookup into an image; fx/fy in texel units, x wraps around for the world image
      function sample(src, sw, sh, fx, fy, wrap, o) {
        fx -= 0.5; fy -= 0.5;
        var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, ix1 = ix + 1, iy1 = iy + 1;
        if (wrap) { ix = (ix % sw + sw) % sw; ix1 = ix1 % sw; } else { ix = ix < 0 ? 0 : ix >= sw ? sw - 1 : ix; ix1 = ix1 >= sw ? sw - 1 : ix1 < 0 ? 0 : ix1; }
        iy = iy < 0 ? 0 : iy >= sh ? sh - 1 : iy; iy1 = iy1 >= sh ? sh - 1 : iy1 < 0 ? 0 : iy1;
        var a = (iy * sw + ix) * 4, bb = (iy * sw + ix1) * 4, c = (iy1 * sw + ix) * 4, e = (iy1 * sw + ix1) * 4;
        var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        d[o] = src[a] * w00 + src[bb] * w10 + src[c] * w01 + src[e] * w11;
        d[o + 1] = src[a + 1] * w00 + src[bb + 1] * w10 + src[c + 1] * w01 + src[e + 1] * w11;
        d[o + 2] = src[a + 2] * w00 + src[bb + 2] * w10 + src[c + 2] * w01 + src[e + 2] * w11;
        d[o + 3] = 255;
      }
      for (var j = 0; j < h; j++) {
        var yy = (CY - (y0 + (j + 0.5) / dens)) / rr;
        for (var i = 0; i < w; i++) {
          var xx = (x0 + (i + 0.5) / dens - CX) / rr, r2 = xx * xx + yy * yy;
          if (r2 >= 1) continue;
          // inverse orthographic projection: screen point -> longitude, latitude
          var cz = Math.sqrt(1 - r2);
          var lat = Math.asin(cz * sp + yy * cp);
          var lon = lam0 + Math.atan2(xx, cz * cp - yy * sp);
          var o = (j * w + i) * 4, s;
          if (g) {
            var gl = lon / RAD; gl = gl - 360 * Math.round((gl - g.lonMid) / 360);
            var gt = lat / RAD;
            if (gl >= g.lon0 && gl < g.lon1 && gt > g.lat0 && gt <= g.lat1) {
              if (fine) sample(gd, g.w, g.h, (gl - g.lon0) / (g.lon1 - g.lon0) * g.w, (g.lat1 - gt) / (g.lat1 - g.lat0) * g.h, false, o);
              else {
                s = (Math.min(g.h - 1, Math.floor((g.lat1 - gt) / (g.lat1 - g.lat0) * g.h)) * g.w +
                  Math.min(g.w - 1, Math.floor((gl - g.lon0) / (g.lon1 - g.lon0) * g.w))) * 4;
                d[o] = gd[s]; d[o + 1] = gd[s + 1]; d[o + 2] = gd[s + 2]; d[o + 3] = 255;
              }
              continue;
            }
          }
          var u = lon / TWO + 0.5; u -= Math.floor(u);
          if (fine) { sample(bd, bw, bh, u * bw, (0.5 - lat / Math.PI) * bh, true, o); continue; }
          s = (Math.min(bh - 1, Math.floor((0.5 - lat / Math.PI) * bh)) * bw + Math.min(bw - 1, Math.floor(u * bw))) * 4;
          d[o] = bd[s]; d[o + 1] = bd[s + 1]; d[o + 2] = bd[s + 2]; d[o + 3] = 255;
        }
      }
      sbctx.putImageData(img, 0, 0);
      if (sCanvas.width !== Math.round(W * dpr) || sCanvas.height !== Math.round(H * dpr)) {
        sCanvas.width = Math.round(W * dpr); sCanvas.height = Math.round(H * dpr);
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, W, H);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(sBuf, x0, y0, w / dens, h / dens);
    }

    // After the globe comes to rest: repaint at full detail, then ask NASA for a
    // sharper picture of just the area in view.
    function settleSat() {
      clearTimeout(satTimer);
      satTimer = setTimeout(function () {
        if (!sat || drag || anim || spinning) return;
        drawSat(true); satFine = satKey();
        clearTimeout(refineTimer);
        refineTimer = setTimeout(refineSat, 250);
      }, 120);
    }
    function refineSat() {
      if (!sat || drag || anim || spinning) return;
      if (k < 1.6) { if (sat.region) { sat.region = null; refineKey = ''; drawSat(true); satFine = satKey(); } return; }
      // lon/lat of a grid of screen points; give up if the edge of the Earth is in view
      var lonMid = wrapLon(-rot[0]), la0 = 90, la1 = -90, lo0 = 1e9, lo1 = -1e9, n = 8;
      for (var a = 0; a <= n; a++) {
        for (var c = 0; c <= n; c++) {
          var p = proj.invert([W * a / n, H * c / n]);
          if (!p || isNaN(p[0]) || !visible(p)) return;
          var l = p[0] - 360 * Math.round((p[0] - lonMid) / 360);
          if (l < lo0) lo0 = l; if (l > lo1) lo1 = l;
          if (p[1] < la0) la0 = p[1]; if (p[1] > la1) la1 = p[1];
        }
      }
      var padLon = (lo1 - lo0) * 0.08, padLat = (la1 - la0) * 0.08;
      lo0 -= padLon; lo1 += padLon; la0 = Math.max(-90, la0 - padLat); la1 = Math.min(90, la1 + padLat);
      if (lo0 < -180 || lo1 > 180 || lo1 - lo0 > 120) return;       // across the date line or too wide: keep the world image
      var key = [basemap, lo0.toFixed(2), lo1.toFixed(2), la0.toFixed(2), la1.toFixed(2)].join('|');
      if (key === refineKey) return;
      var g = sat.region;
      if (g && lo0 >= g.lon0 && lo1 <= g.lon1 && la0 >= g.lat0 && la1 <= g.lat1 && (g.lon1 - g.lon0) < (lo1 - lo0) * 1.6) return;
      refineKey = key;
      var MAXPX = Math.min(2400, Math.round(Math.max(W, H) * dpr * 1.15)), ws, hs, ratio = (lo1 - lo0) / (la1 - la0);
      if (ratio >= 1) { ws = MAXPX; hs = Math.max(128, Math.round(MAXPX / ratio)); } else { hs = MAXPX; ws = Math.max(128, Math.round(MAXPX * ratio)); }
      var my = satToken;
      loadPixels(gibsUrl(STYLES[basemap], [la0.toFixed(4), lo0.toFixed(4), la1.toFixed(4), lo1.toFixed(4)], ws, hs), function (px) {
        if (my !== satToken || !px || !sat || refineKey !== key) return;
        sat.region = { data: px.data, w: px.w, h: px.h, lon0: lo0, lon1: lo1, lat0: la0, lat1: la1, lonMid: (lo0 + lo1) / 2 };
        if (!drag && !anim && !spinning) { drawSat(true); satFine = satKey(); }
      });
    }

    // ---- data layers ---------------------------------------------------------

    function cellShape(c) {
      return { type: 'Polygon', coordinates: [[[c.lon0, c.lat0], [c.lon0, c.lat1], [c.lon1, c.lat1], [c.lon1, c.lat0], [c.lon0, c.lat0]]] };
    }
    function setCells(list) {
      cells = list;
      gCells.selectAll('path').remove();
      gDots.selectAll('circle').remove();
      cellSel = dotSel = null;
      if (list) {
        cellSel = gCells.selectAll('path').data(list).enter().append('path')
          .attr('fill', function (c) { return c.fill; }).attr('fill-opacity', function (c) { return c.opacity == null ? 0.78 : c.opacity; });
        dotSel = gDots.selectAll('circle').data(list.filter(function (c) { return c.dot; })).enter().append('circle').attr('r', 1.8);
      }
      host.classList.toggle('has-cells', !!list);
      drawCells();
    }
    function recolorCells(fn) {
      if (!cellSel) return;
      cellSel.attr('fill', function (c, i) { return fn(c, i); });
    }
    function drawCells() {
      if (!cellSel) return;
      cellSel.attr('d', function (c) { return path(cellShape(c)); });
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
      rasterCache = null;
      host.classList.toggle('has-raster', !!r);
      if (!r) { rctx.clearRect(0, 0, rCanvas.width, rCanvas.height); return; }
      queueRaster();
    }
    function queueRaster() {
      if (!raster || rasterQueued) return;
      rasterQueued = true;
      requestAnimationFrame(function () { rasterQueued = false; drawRaster(); });
    }
    function drawRaster() {
      if (!raster) return;
      var moving = !!(drag || anim || spinning);
      var step = moving ? 4 : 2, w = Math.ceil(W / step), h = Math.ceil(H / step);
      var key = [rot[0].toFixed(3), rot[1].toFixed(3), k.toFixed(4), W, H, step].join('|');
      if (!rasterCache || rasterCache.key !== key) {
        // cache the lon/lat under every sample pixel, so a new frame is just lookups
        var lon = new Float32Array(w * h), lat = new Float32Array(w * h), rr = R * k, rr2 = rr * rr;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var px = x * step + step / 2, py = y * step + step / 2, i = y * w + x;
            var dx = px - CX, dy = py - CY;
            if (dx * dx + dy * dy >= rr2) { lon[i] = NaN; continue; }
            var g = proj.invert([px, py]);
            lon[i] = g ? g[0] : NaN; lat[i] = g ? g[1] : NaN;
          }
        }
        rasterCache = { key: key, lon: lon, lat: lat, w: w, h: h };
      }
      var c = rasterCache;
      rBuf.width = c.w; rBuf.height = c.h;
      var img = rbctx.createImageData(c.w, c.h), d = img.data;
      for (var j = 0; j < c.lon.length; j++) {
        if (isNaN(c.lon[j])) continue;
        var col = raster.sample(c.lon[j], c.lat[j]);
        if (!col) continue;
        d[j * 4] = col[0]; d[j * 4 + 1] = col[1]; d[j * 4 + 2] = col[2]; d[j * 4 + 3] = col[3];
      }
      rbctx.putImageData(img, 0, 0);
      rCanvas.width = Math.round(W * dpr); rCanvas.height = Math.round(H * dpr);
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.imageSmoothingEnabled = true;
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
      pctx.lineWidth = 1.2; pctx.lineCap = 'round';
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
        pctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.9, 0.25 + sp / 9).toFixed(2) + ')';
        pctx.beginPath(); pctx.moveTo(xa[0], xa[1]); pctx.lineTo(xb[0], xb[1]); pctx.stroke();
      }
    }

    // ---- motion ------------------------------------------------------------

    function stopAnim() {
      if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.safety); anim = null; if (sat) settleSat(); }
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
        readout.text(p ? fmt(p[1], wrapLon(p[0])) : HINT);
        return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.sqrt(dx * dx + dy * dy) < 4) return;
        drag.moved = true;
        host.classList.add('dragging');
        try { node.setPointerCapture(drag.id); } catch (err) { /* ignore */ }
      }
      var r = node.getBoundingClientRect();
      var sens = 180 / (Math.PI * R * k) * (W / r.width);
      rot = [drag.rot[0] + dx * sens, clamp(drag.rot[1] - dy * sens, -89, 89)];
      // keep the last few positions so the release speed can be measured
      drag.sens = sens;
      drag.trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (drag.trail.length > 6) drag.trail.shift();
      render();
    });
    function end(e, cancel) {
      if (!drag) return;
      var d = drag; drag = null;
      host.classList.remove('dragging');
      if (sat) settleSat();
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
    node.addEventListener('pointerleave', function () { if (!drag) readout.text(HINT); });
    node.addEventListener('dblclick', function (e) { e.preventDefault(); zoomBy(1.6); });
    // Trackpad pinch (and ctrl + wheel) zooms; a plain wheel still scrolls the page.
    node.addEventListener('wheel', function (e) {
      var wide = opts.fill && window.matchMedia && window.matchMedia('(min-width: 961px)').matches;
      if (!e.ctrlKey && !wide) return;
      e.preventDefault(); stopAnim(); spin(false);
      k = clamp(k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), K_MIN, K_MAX);
      render();
    }, { passive: false });
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
