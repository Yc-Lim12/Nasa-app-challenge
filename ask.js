/*
 * Trend Detective: ask in plain English (or Bahasa Malaysia).
 * Not an AI service: a small set of rules in the browser finds the variable,
 * the place, the month and the years in a question, then opens that case.
 * Nothing typed here leaves the device.
 */
(function () {
  'use strict';

  // Most specific first: the first match wins.
  var VARS = [
    ['T2M_MIN', /\b(night|nights|nighttime|night-time|overnight|malam)\b/],
    ['T2M_MAX', /\b(daytime|day-time|afternoons?|highs?|siang|tengah hari)\b/],
    ['SST', /\b(sea|ocean|seas|laut|lautan)\b/],
    ['TS', /\b(ground|land surface|surface temperature|permukaan tanah)\b/],
    ['AOD_55', /\b(haze|hazy|hazier|smoke|smoky|smog|wildfires?|dust|dusty|aerosols?|air quality|pollution|polluted|jerebu|asap|debu|pencemaran)\b/],
    ['GWETTOP', /\b(topsoil|top soil)\b/],
    ['GWETROOT', /\b(drought|droughts|dry|drier|drying|soil|soils|kemarau|kering|tanah)\b/],
    ['PRECTOTCORR', /\b(rain|rains|rainy|rainier|rainfall|wetter|precipitation|monsoon|floods?|flooding|storms?|hujan|banjir|ribut|basah)\b/],
    ['SNODP', /\b(snow|snowy|snowier|snowfall|snowpack|salji)\b/],
    ['EVLAND', /\b(evaporation|evaporate|evaporating|penyejatan)\b/],
    ['TQV', /\b(water vapou?r|vapou?r|wap air)\b/],
    ['RH2M', /\b(humid|humidity|muggy|sticky|lembap|kelembapan)\b/],
    ['CLOUD_AMT', /\b(cloud|clouds|cloudy|cloudier|overcast|awan|mendung)\b/],
    ['ALLSKY_SFC_SW_DWN', /\b(sun|sunny|sunnier|sunlight|sunshine|solar|matahari|cerah)\b/],
    ['WS10M', /\b(wind|winds|windy|windier|breeze|breezy|angin)\b/],
    ['PS', /\b(pressure|barometer|tekanan udara)\b/],
    ['TO3', /\b(ozone|ozon|uv|ultraviolet)\b/],
    ['T2M', /\b(hot|hotter|warm|warmer|warming|heat|heatwaves?|temperature|temperatures|cold|colder|cool|cooler|cooling|suhu|panas|sejuk)\b/]
  ];

  // name, lat, lon, box size (degrees, 0 = one grid cell). Longest names are tried first.
  var BROAD = ['malaysia', 'all of malaysia', 'seluruh malaysia', 'borneo', 'peninsular malaysia', 'semenanjung'];
  var PLACES = [
    ['kuala lumpur', 3.14, 101.69, 2, 'klang'], ['kl', 3.14, 101.69, 2, 'klang'], ['klang valley', 3.1, 101.6, 2, 'klang'], ['lembah klang', 3.1, 101.6, 2, 'klang'],
    ['selangor', 3.3, 101.5, 2], ['shah alam', 3.07, 101.52, 0], ['petaling jaya', 3.11, 101.61, 0], ['putrajaya', 2.93, 101.69, 0], ['cyberjaya', 2.92, 101.65, 0],
    ['penang', 5.35, 100.4, 2, 'penang'], ['pulau pinang', 5.35, 100.4, 2, 'penang'], ['george town', 5.41, 100.33, 0], ['georgetown', 5.41, 100.33, 0],
    ['johor bahru', 1.49, 103.74, 2], ['johor', 1.9, 103.4, 2], ['jb', 1.49, 103.74, 2],
    ['melaka', 2.19, 102.25, 2], ['malacca', 2.19, 102.25, 2], ['seremban', 2.73, 101.94, 2], ['negeri sembilan', 2.73, 102.1, 2],
    ['ipoh', 4.6, 101.08, 2], ['perak', 4.6, 101.0, 2], ['alor setar', 6.12, 100.37, 2], ['kedah', 6.0, 100.6, 2], ['perlis', 6.44, 100.2, 2],
    ['langkawi', 6.35, 99.8, 0], ['cameron highlands', 4.47, 101.38, 0],
    ['kota bharu', 6.13, 102.24, 2], ['kelantan', 5.6, 102.1, 2], ['kuala terengganu', 5.33, 103.14, 2], ['terengganu', 5.0, 103.0, 2],
    ['kuantan', 3.81, 103.33, 2], ['pahang', 3.8, 102.5, 2],
    ['east coast', 5.4, 102.6, 2, 'eastcoast'], ['pantai timur', 5.4, 102.6, 2, 'eastcoast'], ['west coast', 4.2, 100.9, 2], ['pantai barat', 4.2, 100.9, 2],
    ['kota kinabalu', 5.98, 116.07, 2], ['sabah', 5.3, 117.0, 4], ['sandakan', 5.84, 118.12, 2], ['tawau', 4.24, 117.89, 2], ['labuan', 5.28, 115.24, 0],
    ['kuching', 1.55, 110.35, 2], ['sarawak', 2.5, 113.0, 4], ['miri', 4.4, 114.0, 2], ['sibu', 2.29, 111.83, 2], ['bintulu', 3.17, 113.03, 2],
    ['peninsular malaysia', 4.0, 102.0, 6, 'peninsular'], ['semenanjung', 4.0, 102.0, 6, 'peninsular'],
    ['all of malaysia', 4.0, 109.5, 20, 'malaysia'], ['seluruh malaysia', 4.0, 109.5, 20, 'malaysia'], ['malaysia', 4.0, 109.5, 20, 'malaysia'],
    ['borneo', 1.5, 114.0, 12, 'borneo'],
    ['strait of malacca', 3.0, 100.5, 2], ['selat melaka', 3.0, 100.5, 2], ['south china sea', 6.0, 109.0, 4], ['laut china selatan', 6.0, 109.0, 4],
    ['singapore', 1.35, 103.82, 0], ['jakarta', -6.2, 106.85, 2], ['sumatra', 0.0, 101.5, 6], ['bangkok', 13.75, 100.5, 2],
    ['manila', 14.6, 121.0, 2], ['hanoi', 21.03, 105.85, 2], ['ho chi minh', 10.82, 106.63, 2], ['tokyo', 35.68, 139.69, 2], ['beijing', 39.9, 116.4, 2],
    ['shanghai', 31.23, 121.47, 2], ['hong kong', 22.32, 114.17, 0], ['seoul', 37.57, 126.98, 2], ['delhi', 28.6, 77.2, 2, 'delhi'], ['mumbai', 19.08, 72.88, 2],
    ['dhaka', 23.81, 90.41, 2], ['dubai', 25.2, 55.27, 2], ['cairo', 30.04, 31.24, 2], ['lagos', 6.52, 3.38, 2], ['nairobi', -1.29, 36.82, 2],
    ['london', 51.5, -0.12, 2], ['paris', 48.86, 2.35, 2], ['berlin', 52.52, 13.4, 2], ['madrid', 40.42, -3.7, 2], ['new york', 40.71, -74.0, 2],
    ['los angeles', 34.05, -118.24, 2], ['mexico city', 19.43, -99.13, 2], ['sao paulo', -23.55, -46.63, 2], ['sydney', -33.87, 151.21, 2], ['melbourne', -37.81, 144.96, 2],
    ['sahel', 14.0, 8.0, 6, 'sahel'], ['amazon', -3.5, -60.0, 6, 'amazon'], ['aral sea', 45.0, 60.0, 4, 'aral'], ['murray-darling', -34.0, 145.0, 6, 'murray'],
    ['murray darling', -34.0, 145.0, 6, 'murray'], ['central valley', 36.7, -119.8, 4, 'california'], ['california', 36.7, -119.8, 4, 'california'],
    ['alaska', 70.5, -156.8, 4, 'utqiagvik'], ['arctic', 70.5, -156.8, 4, 'utqiagvik'], ['greenland', 72.0, -40.0, 6, 'greenland'],
    ['wisconsin', 44.5, -89.5, 4, 'wisconsin'], ['chicago', 41.88, -87.63, 2], ['toronto', 43.65, -79.38, 2]
  ].sort(function (a, b) {
    // whole regions only when no more specific place is named ("Penang, Malaysia" is Penang)
    var ra = BROAD.indexOf(a[0]) >= 0, rb = BROAD.indexOf(b[0]) >= 0;
    return ra !== rb ? (ra ? 1 : -1) : b[0].length - a[0].length;
  });

  var MONTHS = [
    [1, /\b(january|jan|januari)\b/], [2, /\b(february|feb|februari)\b/], [3, /\b(march|mac)\b/], [4, /\b(april|apr)\b/],
    [5, /\b(may|mei)\b/], [6, /\b(june|jun)\b/], [7, /\b(july|jul|julai)\b/], [8, /\b(august|aug|ogos)\b/],
    [9, /\b(september|sept|sep)\b/], [10, /\b(october|oct|oktober)\b/], [11, /\b(november|nov)\b/], [12, /\b(december|dec|disember)\b/]
  ];

  var TD;
  var waiting = null;   // the listener waiting for the current question's answer
  function $(id) { return document.getElementById(id); }
  function T(s, v) { return TD.T(s, v); }
  function esc(s) { return TD.esc(s); }
  function title(s) { return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }

  function parse(q) {
    var s = ' ' + q.toLowerCase().replace(/[’']/g, "'").replace(/[?!.,;:]/g, ' ') + ' ';
    var out = { cfg: {}, guessed: [] };

    var v = null;
    for (var i = 0; i < VARS.length && !v; i++) if (VARS[i][1].test(s)) v = VARS[i][0];
    if (!v) { v = TD.state.v || 'T2M'; out.guessed.push('variable'); }
    out.cfg.v = v;

    var p = null;
    for (var j = 0; j < PLACES.length && !p; j++) {
      var name = PLACES[j][0].replace(/[-\s]/g, '[-\\s]');
      if (new RegExp('\\b' + name + '\\b').test(s)) p = PLACES[j];
    }
    if (p) {
      if (p[4]) out.cfg.place = p[4];
      else { out.cfg.lat = p[1]; out.cfg.lon = p[2]; out.cfg.size = p[3]; }
      out.where = p[4] ? TD.place(p[4]).short : title(p[0]);
    } else {
      out.guessed.push('place');
      out.cfg.keepPlace = true;
      out.where = TD.state.placeId === 'custom' ? TD.coordLabel(TD.state.lat, TD.state.lon) : (TD.place(TD.state.placeId) || {}).short;
    }

    // Avoid reading "may" as a month in "may be" / "might".
    var month = 0;
    for (var k = 0; k < MONTHS.length; k++) {
      if (MONTHS[k][0] === 5 && /\bmay (be|have|get|it)\b/.test(s)) continue;
      if (MONTHS[k][1].test(s)) { month = MONTHS[k][0]; break; }
    }
    // Seasons. "Summer" and "winter" follow the hemisphere of the place.
    if (!month) {
      var south = (p ? p[1] : TD.state.lat) < 0;
      if (/\b(summer|musim panas)\b/.test(s)) month = south ? 15 : 13;
      else if (/\b(winter|musim sejuk)\b/.test(s)) month = south ? 13 : 15;
      else if (/\b(spring|musim bunga)\b/.test(s)) month = south ? 14 : 16;
      else if (/\b(autumn|musim luruh)\b/.test(s)) month = south ? 16 : 14;
    }
    out.cfg.month = month;

    var y0 = TD.FIRST_YEAR, y1 = TD.LAST_YEAR, m;
    if ((m = s.match(/\b(19[89]\d|20[0-4]\d)\s*(?:-|–|to|and|until|till|hingga|sampai|dan)\s*(19[89]\d|20[0-4]\d)\b/))) { y0 = +m[1]; y1 = +m[2]; }
    else if ((m = s.match(/\b(?:since|from|after|sejak|selepas|dari)\s+(19[89]\d|20[0-4]\d)\b/))) y0 = +m[1];
    else if ((m = s.match(/\b(?:last|past|lepas)\s+(\d{1,2})\s+(?:years|tahun)\b/))) y0 = TD.LAST_YEAR - +m[1] + 1;
    out.cfg.y0 = Math.max(TD.FIRST_YEAR, Math.min(y0, y1));
    out.cfg.y1 = Math.min(TD.LAST_YEAR, Math.max(y0, y1));
    if (v === 'AOD_55' && out.cfg.y0 < 2001) out.cfg.y0 = 2001;   // aerosol record starts in 2001
    return out;
  }

  function ask(q) {
    q = (q || '').trim();
    var outEl = $('ask-out');
    if (!q) { outEl.textContent = ''; return; }
    var r = parse(q), vr = TD.variable(r.cfg.v);
    var parts = [TD.vname(vr), r.where, r.cfg.y0 + '–' + r.cfg.y1];
    if (r.cfg.month) parts.push(T(TD.MONTHS[r.cfg.month]));
    var guess = r.guessed.length ? ' <em>' + esc(T(r.guessed.indexOf('variable') >= 0
      ? 'I could not tell what to measure, so I kept the current variable.' : 'No place named, so I used the current one.')) + '</em>' : '';
    outEl.innerHTML = '<span class="ask-tag">' + esc(T('Understood')) + '</span> ' + parts.map(esc).join(' · ') + guess;
    var cfg = r.cfg;
    if (cfg.keepPlace) { delete cfg.keepPlace; }
    cfg.compare = '';
    if (window.TDStories) window.TDStories.exit();
    // Only one question waits for an answer at a time. Without this, asking twice in a row
    // (or after a question that failed) left an extra listener and printed the answer twice.
    if (waiting) document.removeEventListener('td:result', waiting);
    waiting = function () {
      document.removeEventListener('td:result', waiting);
      waiting = null;
      var head = $('verdict-head').textContent;
      outEl.innerHTML += '<span class="ask-answer">' + esc(head) + '</span>';
    };
    document.addEventListener('td:result', waiting);
    TD.apply(cfg);
  }

  function init() {
    TD = window.TD;
    var form = $('ask-form');
    if (!TD || !form) return;
    form.addEventListener('submit', function (e) { e.preventDefault(); ask($('ask').value); $('ask').blur(); });
  }

  window.TDAsk = { parse: function (q) { return parse(q); }, ask: ask };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
