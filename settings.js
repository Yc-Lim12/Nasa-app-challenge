/*
 * Trend Detective: Settings.
 * A gear button under the globe controls opens one small panel with the display
 * settings that already exist elsewhere (theme, language, map style) plus help
 * links. It only calls the existing controls, so nothing is set in two places.
 */
(function () {
  'use strict';

  var TD, btn, pop, lastFocus = null;
  function $(id) { return document.getElementById(id); }
  function T(s, v) { return TD.T(s, v); }
  function esc(s) { return TD.esc(s); }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
    return null;
  }

  var GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function theme() { return document.documentElement.getAttribute('data-theme') || 'auto'; }
  function setTheme(v) {
    if (v === 'auto') { document.documentElement.removeAttribute('data-theme'); store('td-theme', null); }
    else { document.documentElement.setAttribute('data-theme', v); store('td-theme', v); }
    TD.rerender();          // the theme button in the case file follows
  }
  function mapStyle() { return store('td-globe') || 'sat'; }
  function setMapStyle(v) {
    store('td-globe', v);
    if (TD.globe && TD.globe.setBasemap) TD.globe.setBasemap(v);
  }

  function seg(name, current, opts) {
    return '<div class="st-seg" role="radiogroup" aria-label="' + esc(T(name)) + '">' + opts.map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (o[0] === current) + '" data-set="' + name + '" data-v="' + o[0] + '">' + esc(T(o[1])) + '</button>';
    }).join('') + '</div>';
  }
  function render() {
    var lang = window.TDi18n ? window.TDi18n.lang : 'en';
    pop.innerHTML =
      '<header class="st-head"><h2 id="st-title">' + esc(T('Settings')) + '</h2>' +
        '<button type="button" class="ai-icon" data-act="close" aria-label="' + esc(T('Close')) + '">✕</button></header>' +
      '<section><h3>' + esc(T('Appearance')) + '</h3>' + seg('theme', theme(), [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]) + '</section>' +
      '<section><h3>' + esc(T('Language')) + '</h3>' + seg('lang', lang, [['en', 'English'], ['bm', 'Bahasa Malaysia']]) + '</section>' +
      '<section><h3>' + esc(T('Map style')) + '</h3>' + seg('map', mapStyle(), [['sat', 'Satellite'], ['live', 'Latest satellite pass'], ['dark', 'Dark map']]) +
        '<p class="st-hint">' + esc(T('Satellite is a cloud-free NASA picture. Latest satellite pass is yesterday’s real view, clouds included.')) + '</p></section>' +
      '<section class="st-links"><h3>' + esc(T('Help')) + '</h3>' +
        '<button type="button" data-act="tour">' + esc(T('Show the tour again')) + '</button>' +
        '<button type="button" data-act="methods">' + esc(T('How the maths works (Methods)')) + '</button>' +
        '<button type="button" data-act="ai">' + esc(T('AI settings (OpenAI key)')) + '</button></section>';
  }
  function place() {
    if (pop.hidden) return;
    var r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, w = Math.min(340, vw - 24);
    pop.style.width = w + 'px';
    if (vw <= 640) { pop.style.left = '12px'; pop.style.right = '12px'; pop.style.width = 'auto'; pop.style.top = 'auto'; pop.style.bottom = '12px'; return; }
    pop.style.right = 'auto'; pop.style.bottom = 'auto';
    var h = pop.offsetHeight;
    pop.style.left = Math.max(12, r.left - w - 12) + 'px';
    pop.style.top = Math.max(12, Math.min(vh - h - 12, r.bottom - h)) + 'px';
  }
  function open() {
    lastFocus = document.activeElement;
    render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    place();
    var f = pop.querySelector('[aria-checked="true"]'); if (f) f.focus();
  }
  function close() {
    if (pop.hidden) return;
    pop.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function build() {
    var ctrls = document.querySelector('.g-ctrls');
    if (!ctrls) return false;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'g-settings'; btn.id = 'st-open';
    btn.title = T('Settings'); btn.setAttribute('aria-label', T('Settings'));
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = GEAR;
    ctrls.appendChild(btn);
    pop = document.createElement('div');
    pop.className = 'st-pop'; pop.id = 'st-pop'; pop.hidden = true;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'st-title');
    document.body.appendChild(pop);

    btn.addEventListener('click', function (e) { e.stopPropagation(); if (pop.hidden) open(); else close(); });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var set = b.getAttribute('data-set'), v = b.getAttribute('data-v'), act = b.getAttribute('data-act');
      if (set === 'theme') setTheme(v);
      else if (set === 'lang') { if (window.TDi18n) window.TDi18n.set(v); }
      else if (set === 'map') setMapStyle(v);
      else if (act === 'close') { close(); return; }
      else if (act === 'tour') { close(); if (window.TDGuide) window.TDGuide.start(); return; }
      else if (act === 'methods') { close(); var m = document.querySelector('[data-open-methods]'); if (m) m.click(); return; }
      else if (act === 'ai') { close(); if (window.TDAI && window.TDAI.settings) window.TDAI.settings(); return; }
      render(); place();
      var again = pop.querySelector('[data-set="' + set + '"][data-v="' + v + '"]'); if (again) again.focus();
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) close(); });
    window.addEventListener('resize', place);
    document.addEventListener('td:lang', function () {
      btn.title = T('Settings'); btn.setAttribute('aria-label', T('Settings'));
      if (!pop.hidden) { render(); place(); }
    });
    return true;
  }

  function init() {
    TD = window.TD;
    if (!TD) return;
    if (!build()) setTimeout(function () { build(); }, 500);   // the globe controls appear with the globe
  }

  window.TDSettings = { open: function () { if (btn) open(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
