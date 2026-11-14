/*
 * Trend Detective: "How to use" guided tour.
 * Each step dims the page, lights up one part of it and says what it does and where
 * to click. The case-file steps open a real example (Klang Valley air temperature) so
 * they point at real results. A first-time visitor is offered the tour once.
 */
(function () {
  'use strict';

  var TD, wide = function () { return window.innerWidth > 960; };
  var SEEN = 'td-guide-seen';
  function $(id) { return document.getElementById(id); }
  function T(s, v) { return TD.T(s, v); }
  function esc(s) { return TD.esc(s); }

  // target: a selector; prep: runs before the step (may return a promise)
  var STEPS = [
    { target: '#map', title: 'The globe',
      text: 'Drag to spin the Earth, scroll or pinch to zoom. Click any place to test it: forty years of NASA data are fetched for that spot.' },
    { target: '#ask-form', title: 'Ask a question',
      text: 'Or type a question in plain words, such as “Is Penang getting rainier?” or “Is the Arctic warming since 2000?”. It sets up the case for you.' },
    { target: '#wz-open', title: 'Not sure what to test?',
      text: 'Answer three short questions (what kind of place, what you are curious about, where) and get suggested NASA variables to test.' },
    { target: '#stage-foot', title: 'Guided stories',
      text: 'Step-by-step examples with real data: city heat, haze, monsoon rain, a warming sea and wildfire smoke. A good place to start.' },
    { target: '#layers', title: 'Map layers',
      text: 'Trend map: the trend in every grid cell around the place (a dot means significant). Timelapse: every month, one after another. Rain now and Wind: current conditions.' },
    { target: '#verdict', prep: 'case', title: 'The answer',
      text: 'The verdict in one sentence: is it really changing, and how fast? The badge says whether the change is statistically significant or could be chance.' },
    { target: '#chart', prep: 'case', title: 'The chart',
      text: 'One dot per year, with the trend line and its 95% range. Hover for values. Drag across the chart to test only part of the record. The coloured stripes show warm and cool years.' },
    { target: '#tiles', prep: 'case', title: 'The evidence',
      text: 'The numbers behind the verdict: rate per decade, total change, the two tests (Mann-Kendall and t-test) and how many years a test would need.' },
    { target: '#settings', prep: 'case', title: 'Change the case',
      text: 'What, where and when: the variable, the place and area, the years, a season or a month, and one value per year or every month.' },
    { target: '.ai-bar', prep: 'case', title: 'Ask AI',
      text: '“Explain this simply” puts the result in plain words. “Ask AI a question” opens a chat about it. It works without an account; an OpenAI key in Settings gives longer answers.' },
    { target: '#st-open', title: 'Settings',
      text: 'Light or dark, English or Bahasa Malaysia, the map style, and this tour again.' }
  ];

  var i = 0, box, ring, bubble, lastFocus = null, running = false;

  function ensureCase() {
    if (TD.current) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false, finish = function () { if (!done) { done = true; resolve(); } };
      document.addEventListener('td:result', function () { setTimeout(finish, 400); }, { once: true });
      setTimeout(finish, 20000);          // never hang the tour on a slow network
      TD.apply({ place: 'klang', v: 'T2M', scroll: false });
    });
  }
  function openCase() {
    var app = document.querySelector('.app');
    if (wide() && app && !app.classList.contains('panel-open')) { var t = $('panel-open'); if (t) t.click(); }
  }

  function targetEl(step) {
    var el = document.querySelector(step.target);
    if (!el || el.hidden || !el.getClientRects().length) return null;
    return el;
  }

  function place() {
    if (!running) return;
    var step = STEPS[i], el = targetEl(step), vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var r = el ? el.getBoundingClientRect() : { left: vw / 2, top: vh / 2, width: 0, height: 0 };
    // the lit-up area, kept on screen
    var L = Math.max(4, r.left - pad), Tp = Math.max(4, r.top - pad);
    var W = Math.min(vw - 8, r.left + r.width + pad) - L, H = Math.min(vh - 8, r.top + r.height + pad) - Tp;
    ring.style.left = L + 'px'; ring.style.top = Tp + 'px';
    ring.style.width = Math.max(0, W) + 'px'; ring.style.height = Math.max(0, H) + 'px';
    ring.style.display = el ? 'block' : 'none';
    // the bubble: below the target if it fits, else above, else beside, else centred
    var bw = Math.min(360, vw - 24), bh = bubble.offsetHeight || 180, x, y;
    if (!el) { x = (vw - bw) / 2; y = (vh - bh) / 2; }
    else if (Tp + H + 12 + bh < vh) { x = L; y = Tp + H + 12; }
    else if (Tp - 12 - bh > 0) { x = L; y = Tp - 12 - bh; }
    else if (L + W + 12 + bw < vw) { x = L + W + 12; y = Math.max(12, Math.min(vh - bh - 12, Tp)); }
    else if (L - 12 - bw > 0) { x = L - 12 - bw; y = Math.max(12, Math.min(vh - bh - 12, Tp)); }
    else { x = (vw - bw) / 2; y = vh - bh - 16; }
    bubble.style.width = bw + 'px';
    bubble.style.left = Math.max(12, Math.min(vw - bw - 12, x)) + 'px';
    bubble.style.top = Math.max(12, Math.min(vh - bh - 12, y)) + 'px';
  }

  var showToken = 0;   // only the latest step may draw itself (an older one may finish loading later)
  function show(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    var step = STEPS[i], my = ++showToken;
    bubble.classList.add('loading');
    var ready = step.prep === 'case' ? ensureCase().then(openCase) : Promise.resolve();
    ready.then(function () {
      if (!running || my !== showToken) return;
      var el = targetEl(step);
      if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      bubble.innerHTML =
        '<p class="gd-count">' + esc(T('Step {a} of {b}', { a: i + 1, b: STEPS.length })) + '</p>' +
        '<h2 class="gd-title" id="gd-title">' + esc(T(step.title)) + '</h2>' +
        '<p class="gd-text">' + esc(T(step.text)) + '</p>' +
        '<div class="gd-nav"><button type="button" class="gd-skip" data-gd="end">' + esc(T('Close tour')) + '</button>' +
        '<span class="gd-btns">' + (i ? '<button type="button" class="gd-back" data-gd="back">' + esc(T('Back')) + '</button>' : '') +
        '<button type="button" class="gd-next" data-gd="next">' + esc(T(i < STEPS.length - 1 ? 'Next' : 'Finish')) + '</button></span></div>';
      bubble.classList.remove('loading');
      // wait a frame so scrolling and the case file sliding open have settled
      requestAnimationFrame(function () { place(); setTimeout(place, 380); });
      var nb = bubble.querySelector('.gd-next'); if (nb) nb.focus({ preventScroll: true });
    });
  }

  function start() {
    if (running) return;
    running = true; lastFocus = document.activeElement;
    try { localStorage.setItem(SEEN, '1'); } catch (e) { /* private mode */ }
    hideOffer();
    box.hidden = false; document.body.classList.add('gd-on');
    show(0);
  }
  function end() {
    running = false; box.hidden = true; document.body.classList.remove('gd-on');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // first visit: a small card offering the tour
  function offer() {
    var seen = false;
    try { seen = localStorage.getItem(SEEN) === '1'; } catch (e) { seen = true; }
    if (seen || /(^|[#&])v=/.test(location.hash)) return;    // not over a shared case
    var c = document.createElement('div');
    c.className = 'gd-offer'; c.id = 'gd-offer';
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', T('How to use'));
    c.innerHTML = '<p><strong>' + esc(T('New here?')) + '</strong> ' + esc(T('Take a one-minute tour of what to click and what each part shows.')) + '</p>' +
      '<div><button type="button" class="gd-next" data-gd="start">' + esc(T('Show me')) + '</button>' +
      '<button type="button" class="gd-skip" data-gd="dismiss">' + esc(T('No thanks')) + '</button></div>';
    document.body.appendChild(c);
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gd]'); if (!b) return;
      if (b.getAttribute('data-gd') === 'start') start();
      else { try { localStorage.setItem(SEEN, '1'); } catch (err) { /* private mode */ } hideOffer(); }
    });
  }
  function hideOffer() { var c = $('gd-offer'); if (c) c.remove(); }

  function build() {
    box = document.createElement('div');
    box.className = 'gd'; box.hidden = true;
    box.innerHTML = '<div class="gd-ring"></div><section class="gd-bubble" role="dialog" aria-modal="true" aria-labelledby="gd-title"></section>';
    document.body.appendChild(box);
    ring = box.querySelector('.gd-ring'); bubble = box.querySelector('.gd-bubble');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gd]');
      if (!b) return;
      var a = b.getAttribute('data-gd');
      // While a step is still loading its example case, the old bubble is on screen: pressing
      // Next or Back there would skip a step, so wait. "Close tour" always works.
      if ((a === 'next' || a === 'back') && bubble.classList.contains('loading')) return;
      if (a === 'next') { if (i < STEPS.length - 1) show(i + 1); else end(); }
      else if (a === 'back') show(i - 1);
      else end();
    });
    document.addEventListener('keydown', function (e) {
      if (!running) return;
      var loading = bubble.classList.contains('loading');
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' && !loading) show(i + 1);
      else if (e.key === 'ArrowLeft' && !loading) show(i - 1);
      else if (e.key === 'Tab') {      // keep focus inside the bubble
        var f = bubble.querySelectorAll('button');
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    // the "How to use" button, next to "Help me choose" on the globe
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'wz-open gd-open'; btn.id = 'gd-open';
    var wz = $('wz-open'), out = $('ask-out');
    var row = document.createElement('div'); row.className = 'gd-row';
    if (wz) { wz.parentNode.insertBefore(row, wz); row.appendChild(wz); }
    else out.parentNode.insertBefore(row, out);
    row.appendChild(btn);
    btn.addEventListener('click', start);
    label();
  }
  function label() {
    var b = $('gd-open');
    if (b) b.innerHTML = '<span aria-hidden="true">?</span> ' + esc(T('How to use'));
    if (running) show(i);
  }

  function init() {
    TD = window.TD;
    if (!TD || !$('ask-out')) return;
    build();
    document.addEventListener('td:lang', label);
    setTimeout(offer, 1800);           // after the globe has appeared
  }

  window.TDGuide = { start: start, steps: STEPS };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
