/*
 * Interaction polish that needs a little script.
 * 1. On a wide screen the case file is a sheet that starts closed, so the globe
 *    fills the screen. A handle pulls it out; the globe moves aside to stay in view.
 * 2. Segmented controls (topics, chart mode, map layers, timelapse options) get a
 * selection "thumb" that slides to the pressed segment, as on iOS and macOS.
 * Without this file the controls still work: the pressed segment is simply filled.
 */
(function () {
  'use strict';

  var SEL = '.seg, .topics, .layers, .lp-seg';

  function place(box, animate) {
    var thumb = box.querySelector(':scope > .seg-thumb');
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'seg-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      box.insertBefore(thumb, box.firstChild);
      box.classList.add('has-thumb');
      animate = false;
    }
    var on = box.querySelector(':scope > button[aria-pressed="true"]');
    if (!on || !on.offsetWidth) { thumb.style.opacity = '0'; return; }
    // Jump (no slide) on first paint, after a resize, or when coming back from hidden.
    var jump = !animate || thumb.style.opacity === '0';
    if (jump) thumb.style.transition = 'none';
    thumb.style.opacity = '1';
    thumb.style.width = on.offsetWidth + 'px';
    thumb.style.height = on.offsetHeight + 'px';
    thumb.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
    if (jump) { void thumb.offsetWidth; thumb.style.transition = ''; }
  }

  function placeAll(animate) {
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (box) { place(box, animate); });
  }

  var queued = false, slide = false;
  function schedule(animate) {
    slide = slide || animate;
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      var a = slide;
      queued = false; slide = false;
      placeAll(a);
    });
  }

  function touches(node) {
    return node && node.nodeType === 1 && (node.closest(SEL) || node.matches(SEL) || node.querySelector(SEL));
  }

  // ---- the case file is a sheet: closed at first, pulled out on request ------
  function initPanel() {
    var app = document.querySelector('.app'), panel = document.getElementById('case-panel');
    var tab = document.getElementById('panel-open'), close = document.getElementById('panel-close');
    var dot = document.getElementById('panel-dot');
    if (!app || !panel || !tab || !close) return;
    var desk = window.matchMedia('(min-width: 961px)');

    function isOpen() { return app.classList.contains('panel-open'); }
    function sync(animate) {
      var open = isOpen();
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.inert = desk.matches && !open;       // closed sheet is out of the tab order
      var globe = window.TD && window.TD.globe;
      if (globe && globe.setInset) globe.setInset(desk.matches && open ? panel.offsetWidth : 0, animate);
    }
    function set(open, animate, focus) {
      if (open === isOpen()) return;
      app.classList.toggle('panel-open', open);
      if (open && dot) dot.hidden = true;
      sync(animate !== false);
      schedule(false);                            // segment thumbs inside were measured while hidden
      if (focus) (open ? close : tab).focus({ preventScroll: true });
    }

    // Lets app.js open the sheet at the top (used after a click on the globe).
    window.TDPanel = { open: function () { panel.scrollTop = 0; set(true, true, false); } };

    tab.addEventListener('click', function () {
      // open at the answer if there is one, otherwise at the top
      var res = document.getElementById('result');
      panel.scrollTop = res && !res.hidden ? Math.max(0, res.offsetTop - 64) : 0;
      set(true, true, true);
    });
    close.addEventListener('click', function () { set(false, true, true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen() && desk.matches && !document.querySelector('dialog[open]')) set(false, true, true);
    });
    if (desk.addEventListener) desk.addEventListener('change', function () { sync(false); });
    window.addEventListener('resize', function () { if (isOpen()) sync(false); });

    // A new answer shows a dot on the handle; it does not open the sheet by itself.
    var head = document.getElementById('verdict-head');
    if (head && dot) new MutationObserver(function () { if (!isOpen() && head.textContent) dot.hidden = false; })
      .observe(head, { childList: true, characterData: true, subtree: true });
    // A story is read in the sheet, so starting one opens it.
    var story = document.getElementById('story');
    if (story) new MutationObserver(function () { if (!story.hidden) set(true, true, false); })
      .observe(story, { attributes: true, attributeFilter: ['hidden'] });

    // A shared link reopens the exact view, sheet included.
    if (/(^|[#&])v=/.test(location.hash)) set(true, false, false); else sync(false);
  }

  function start() {
    initPanel();
    placeAll(false);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'attributes') {
          if (m.attributeName === 'aria-pressed') { if (touches(m.target)) schedule(true); }
          else if (touches(m.target)) schedule(false);          // hidden / open toggled
        } else if (m.type === 'characterData') {
          if (touches(m.target.parentNode)) schedule(false);     // label text changed (language switch)
        } else {
          if (touches(m.target)) { schedule(false); continue; }
          for (var j = 0; j < m.addedNodes.length; j++) {
            if (touches(m.addedNodes[j])) { schedule(false); break; }
          }
        }
      }
    }).observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['aria-pressed', 'hidden', 'open']
    });
    window.addEventListener('resize', function () { schedule(false); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { schedule(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
