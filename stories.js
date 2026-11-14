/*
 * Trend Detective: Malaysia story mode.
 * Each story is a short guided tour. A step sets up the case (and a map layer if
 * needed) and explains what to look for. The numbers always come from live data.
 */
(function () {
  'use strict';

  var STORIES = [
    {
      id: 'kl-heat', title: 'Is KL getting hotter?', sub: 'Days, nights and the map around the city',
      steps: [
        { text: 'Start with air temperature over the Klang Valley: one value per year since 1981. Read the verdict. Is the rise steady enough to be real?',
          cfg: { v: 'T2M', place: 'klang' } },
        { text: 'Now the night-time lows. Cities hold heat after dark, so nights often warm faster than days. Compare this rate with the first step.',
          cfg: { v: 'T2M_MIN', place: 'klang' } },
        { text: 'Is it only the city? The trend map tests every grid cell around the Klang Valley. Red is warming, and a dot means the warming is significant.',
          cfg: { v: 'T2M', place: 'klang' }, layer: 'trend' },
        { text: 'If the trend continues: the dotted line carries today’s rate ten years past the data. It is a simple extension, not a forecast.',
          cfg: { v: 'T2M', place: 'klang', future: true } },
        { text: 'Compare with published research. Saimi et al. (2020) found significant warming at four airport stations in Peninsular Malaysia, between 0.014 and 0.059 °C per year (1970–2016). That is 0.14 to 0.59 °C per decade. Is the rate on this chart in that range?',
          cfg: { v: 'T2M', place: 'klang' },
          source: { cite: 'Saimi et al. (2020), Sustainability 12(22), 9533', url: 'https://mdpi.com/2071-1050/12/22/9533' } }
      ]
    },
    {
      id: 'haze', title: 'Haze: spikes or trend?', sub: 'Smoke years against the long-term picture',
      steps: [
        { text: 'Haze, smoke and dust over the Klang Valley since 2001, as a yearly average. Look for years that stand out from the rest.',
          cfg: { v: 'AOD_55', place: 'klang', y0: 2001 } },
        { text: 'Only September, the peak of the haze season. Fire years such as 2015 and 2019 stand out. The “Spike, not trend” note checks whether they drive the trend or are one-off events.',
          cfg: { v: 'AOD_55', place: 'klang', y0: 2001, month: 9 } },
        { text: 'Every September on the map, one year after another. The slider is set to September 2015: press play to compare the other years.',
          cfg: { v: 'AOD_55', place: 'klang', y0: 2001, month: 9 }, layer: 'lapse', layerOpts: { frame: '201509' } },
        { text: 'Compare with published research. Cohen, Lecoeur and Ng (2017) studied satellite data from 2001 to 2013 and found one haze peak a year in southern Southeast Asia, usually from August to October, driven by fires. They did not report a long-term trend. Does the September chart show the same spikes?',
          cfg: { v: 'AOD_55', place: 'klang', y0: 2001, month: 9 },
          source: { cite: 'Cohen, Lecoeur and Ng (2017), Atmospheric Chemistry and Physics 17, 721–743', url: 'https://acp.copernicus.org/articles/17/721/2017/' } }
      ]
    },
    {
      id: 'coasts', title: 'East vs west coast rain', sub: 'Two coasts, two monsoons',
      steps: [
        { text: 'Rain on the east coast of the Peninsula (Kelantan and Terengganu), with Penang on the west coast drawn on the same chart.',
          cfg: { v: 'PRECTOTCORR', place: 'eastcoast', compare: 'penang' } },
        { text: 'December only, when the northeast monsoon soaks the east coast. Is monsoon rain there changing, and does Penang follow?',
          cfg: { v: 'PRECTOTCORR', place: 'eastcoast', compare: 'penang', month: 12 } },
        { text: 'Rain trends across the whole Peninsula. If one part grows wetter while another dries, the opposite-trend finder says so and marks both.',
          cfg: { v: 'PRECTOTCORR', lat: 4.2, lon: 102.0, size: 2, compare: '' }, layer: 'trend' },
        { text: 'Why the coasts differ: the monsoon winds. In January they blow from the north-east onto the east coast. Tap “Jul” to see the southwest monsoon.',
          cfg: { v: 'PRECTOTCORR', lat: 4.2, lon: 102.0, size: 2, compare: '' }, layer: 'wind', layerOpts: { month: 1 } },
        { text: 'Compare with published research. Suhaila et al. (2010) studied rain gauges from 1975 to 2004. In the southwest monsoon, total rain and wet days fell at most stations while rain intensity rose. In the northeast monsoon, several stations grew wetter. Do the two coasts on this chart agree?',
          cfg: { v: 'PRECTOTCORR', place: 'eastcoast', compare: 'penang', month: 12 },
          source: { cite: 'Suhaila et al. (2010), Sains Malaysiana 39(4), 533–542', url: 'https://www.ukm.my/jsm/english_journals/vol39num4_2010/vol39num4_2010pg533-542.html' } }
      ]
    },
    {
      id: 'sea', title: 'Is the sea around Malaysia warming?', sub: 'The South China Sea and the Strait of Malacca',
      steps: [
        { text: 'Sea surface temperature in the South China Sea, off the east coast of the Peninsula.',
          cfg: { v: 'SST', lat: 5.0, lon: 105.0, size: 2 } },
        { text: 'The Strait of Malacca, between the Peninsula and Sumatra, drawn against the South China Sea spot.',
          cfg: { v: 'SST', lat: 3.0, lon: 100.5, size: 0, compare: 'pt:5.00,105.00' } },
        { text: 'Warming across the whole area. Over the sea, dots mark the cells where the change is significant. Over land, this map shows ground temperature.',
          cfg: { v: 'SST', lat: 4.0, lon: 104.0, size: 2, compare: '' }, layer: 'trend' },
        { text: 'Pick the years and the answer can change. Jiang et al. (2021) found the South China Sea warmed by about 0.15 °C per decade from 1970 to 1997, then hardly at all from 1999 to 2010. This step tests only 1999 to 2010. Is the trend still significant?',
          cfg: { v: 'SST', lat: 5.0, lon: 105.0, size: 2, y0: 1999, y1: 2010 },
          source: { cite: 'Jiang et al. (2021), Climate Dynamics 57, 2093–2108', url: 'https://link.springer.com/10.1007/s00382-021-05796-8' } }
      ]
    }
    ,
    {
      id: 'smoke', kicker: 'World story', title: 'Wildfire smoke over Wisconsin', sub: 'Summer haze far from the fires',
      steps: [
        { text: 'Haze, smoke and dust over Wisconsin, USA, in summer (June to August), one value per year since 2001. Look at 2021 and 2023, when smoke from wildfires in Canada drifted hundreds of kilometres south.',
          cfg: { v: 'AOD_55', place: 'wisconsin', y0: 2001, month: 13 } },
        { text: 'Is summer haze rising, or do a few smoke years only make it look that way? The “Spike, not trend” note flags years far from the trend line and runs the test again without them.',
          cfg: { v: 'AOD_55', place: 'wisconsin', y0: 2001, month: 13 } },
        { text: 'If the verdict is “no clear trend”, that does not mean nothing is happening. A short or noisy record may simply need more years. “Years needed to tell” says how long a record a change this size needs before a test can detect it.',
          cfg: { v: 'AOD_55', place: 'wisconsin', y0: 2001, month: 13 } },
        { text: 'Every summer month on the map, one after another. The slider is set to June 2023. Press play to compare it with other summers.',
          cfg: { v: 'AOD_55', place: 'wisconsin', y0: 2001, month: 13 }, layer: 'lapse', layerOpts: { frame: '202306' } }
      ]
    }
  ];

  var TD, cur = null, step = 0;
  function $(id) { return document.getElementById(id); }
  function T(s, v) { return TD.T(s, v); }
  function esc(s) { return TD.esc(s); }

  function list() {
    $('stories').innerHTML = STORIES.map(function (s, i) {
      return '<li><button type="button" class="starter" data-story="' + i + '"><span class="starter-q"><strong>' + esc(T(s.title)) +
        '</strong><small>' + esc(T(s.sub)) + '</small></span><span class="starter-go" aria-hidden="true">›</span></button></li>';
    }).join('');
  }

  // Which NASA dataset this step uses, and the paper a research step compares with.
  function sourceLine(st) {
    var vr = TD.variable ? TD.variable(st.cfg.v) : null;
    var html = vr && vr.source ? '<p class="muted story-data">' + esc(T('Data: NASA POWER, {src}', { src: vr.source })) + '</p>' : '';
    if (st.source) html += '<p class="muted story-src">' + esc(T('Source:')) + ' <a href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + esc(st.source.cite) + '</a></p>';
    return html;
  }

  function card() {
    var box = $('story');
    if (!cur) { box.hidden = true; box.innerHTML = ''; return; }
    var s = cur, st = s.steps[step];
    box.hidden = false;
    box.innerHTML = '<div class="story-top"><span class="story-kicker">' + esc(T(s.kicker || 'Malaysia story')) + ' · ' +
      esc(T('Step {a} of {b}', { a: step + 1, b: s.steps.length })) + '</span>' +
      '<button type="button" class="story-x" data-act="exit" aria-label="' + esc(T('Close story')) + '">✕</button></div>' +
      '<h2>' + esc(T(s.title)) + '</h2><p>' + esc(T(st.text)) + '</p>' + sourceLine(st) +
      '<div class="story-nav"><div class="story-dots">' + s.steps.map(function (x, i) {
        return '<i class="' + (i === step ? 'on' : i < step ? 'done' : '') + '"></i>';
      }).join('') + '</div>' +
      '<div class="story-btns">' + (step ? '<button type="button" class="pill-btn ghost" data-act="back">' + esc(T('Back')) + '</button>' : '') +
      (step < s.steps.length - 1 ? '<button type="button" class="pill-btn" data-act="next">' + esc(T('Next')) + '</button>'
        : '<button type="button" class="pill-btn" data-act="exit">' + esc(T('Finish')) + '</button>') + '</div></div>';
  }

  function go(i) {
    step = i;
    var st = cur.steps[step], cfg = {};
    for (var k in st.cfg) cfg[k] = st.cfg[k];
    if (cfg.compare === undefined) cfg.compare = '';
    if (cfg.future === undefined) cfg.future = false;
    cfg.scroll = false;
    TD.apply(cfg);
    if (window.TDMap) window.TDMap.setLayer(st.layer || '', st.layerOpts || {});
    card();
    var box = $('story');
    if (window.innerWidth > 960) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function start(i) { cur = STORIES[i]; go(0); }
  function exit() { cur = null; card(); if (window.TDMap) window.TDMap.setLayer(''); }

  function init() {
    TD = window.TD;
    if (!TD || !$('stories')) return;
    list();
    $('stories').addEventListener('click', function (e) {
      var b = e.target.closest('[data-story]');
      if (b) start(+b.getAttribute('data-story'));
    });
    $('story').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'next') go(step + 1);
      else if (a === 'back') go(step - 1);
      else exit();
    });
    document.addEventListener('td:lang', function () { list(); card(); });
  }

  window.TDStories = { list: STORIES, start: start, exit: exit };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
