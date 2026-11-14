/*
 * Trend Detective AI helper.
 *   1. "Explain simply": turns the statistics of the current case into plain words.
 *      Built in, works offline and needs no key.
 *   2. "Ask AI" chat: follow-up questions about the current case.
 *      Without a key it answers from the built-in explainer (common questions).
 *      With an OpenAI API key (pasted by the user, kept only in this browser) it
 *      asks an OpenAI model, giving it the numbers of the current case.
 * Needs app.js (window.TD). English / Bahasa Malaysia follow the page language.
 */
(function () {
  'use strict';

  var KEY_STORE = 'td-ai-key', MODEL_STORE = 'td-ai-model';
  var DEFAULT_MODEL = 'gpt-4o-mini';
  var OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
  var TD, res = null, history = [], busy = false, ctrl = null;

  function $(id) { return document.getElementById(id); }
  function bm() { return !!(window.TDi18n && window.TDi18n.lang === 'bm'); }
  function L(en, ms) { var t = window.TDi18n ? window.TDi18n.tr(en) : en; return (bm() && t === en && ms !== undefined) ? ms : t; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function apiKey() { return (store(KEY_STORE) || '').trim(); }
  function model() { return (store(MODEL_STORE) || '').trim() || DEFAULT_MODEL; }

  // Light formatting for model replies: escape everything, then **bold** and line breaks / bullets.
  function fmtReply(text) {
    var h = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    var lines = h.split(/\n/), out = '', inList = false;
    lines.forEach(function (ln) {
      var m = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + m[1] + '</li>'; return; }
      if (inList) { out += '</ul>'; inList = false; }
      if (ln.trim()) out += '<p>' + ln + '</p>';
    });
    if (inList) out += '</ul>';
    return out;
  }

  // ---- facts about the current case ------------------------------------------

  function num(x, dp) { return Number(x).toFixed(dp == null ? 2 : dp); }
  function facts(r) {
    var vr = r.variable, st = r.stats, n = r.years.length, unit = vr.unit || '';
    var span = r.years[n - 1] - r.years[0], monthly = r.step === 'month';
    var y0 = Math.floor(r.years[0]), y1 = Math.floor(r.years[n - 1]);
    // monthly data: summarise as one mean anomaly per year, so the prompt stays small
    var perYear = r.years.map(function (y, i) { return [y, +Number(r.values[i]).toFixed(vr.dp)]; });
    if (monthly) {
      var acc = {};
      r.years.forEach(function (y, i) { var k = Math.floor(y); (acc[k] = acc[k] || []).push(r.values[i]); });
      perYear = Object.keys(acc).map(function (k) {
        var a = acc[k]; return [+k, +(a.reduce(function (s, v) { return s + v; }, 0) / a.length).toFixed(vr.dp)];
      });
    }
    return {
      variable: TD.vname(vr), unit: unit, definition: vr.def, place: r.placeName,
      lat: r.lat, lon: r.lon, area: r.cells > 1 ? r.cells + ' grid cells averaged' : 'one grid cell',
      season: r.month ? TD.MONTHS[r.month] + ' only' : 'whole year',
      first_year: y0, last_year: y1, years_of_data: monthly ? perYear.length : n,
      time_step: monthly ? 'monthly values with the seasonal cycle removed (each month minus its calendar-month mean); both tests adjusted for lag-1 autocorrelation' : 'one value per year; both tests adjusted for lag-1 autocorrelation',
      effective_sample_size: Math.round(st.ols.nEff),
      sen_slope_per_decade: +num(st.sen.slope * 10, 4),
      total_change_along_trend: +num(st.sen.slope * span, 4),
      ols_slope_per_decade: +num(st.ols.slope * 10, 4),
      ols_95ci_per_decade: [+num(st.ols.ciLow * 10, 4), +num(st.ols.ciHigh * 10, 4)],
      mann_kendall_p_memory_adjusted: +st.mk.pAdj.toPrecision(3), kendall_tau: +num(st.mk.tau, 3),
      t_test_p_memory_adjusted: +st.ols.pAdj.toPrecision(3), r_squared: +num(st.ols.r2, 3), lag1_autocorrelation: +num(st.ols.lag1, 3),
      verdict: st.verdict, direction: st.direction,
      unusual_years: (r.spikes || []).map(function (s) { return s.year; }),
      yearly_values: perYear
    };
  }

  function amount(x, unit, dp) { return (Math.abs(x) < 1e-9 ? '0' : Math.abs(x).toFixed(dp)) + (unit ? ' ' + L(unit) : ''); }
  function oneIn(p) {
    var k = Math.round(1 / Math.max(p, 1e-9));
    return k >= 1000 ? L('less than 1 time in 1,000') : L('about 1 time in ' + k, 'kira-kira 1 kali dalam ' + k);
  }

  /** Plain-language summary of the current case: [{title, text}]. */
  function explain(r) {
    var f = facts(r), st = r.stats, vr = r.variable, dp = Math.max(1, vr.dp || 1);
    var name = f.variable.toLowerCase(), place = f.place, out = [];
    var years = f.last_year - f.first_year, up = st.direction === 'up', flat = st.direction === 'flat';
    var total = amount(f.total_change_along_trend, f.unit, dp), dec = amount(f.sen_slope_per_decade, f.unit, dp + 1);

    // 1. what happened
    out.push({ kind: 'short', title: L('In short'), text: flat
      ? L('Over ' + years + ' years (' + f.first_year + '–' + f.last_year + '), ' + name + ' around ' + place + ' has stayed about the same.',
          'Dalam ' + years + ' tahun (' + f.first_year + '–' + f.last_year + '), ' + name + ' di sekitar ' + place + ' kekal hampir sama.')
      : L('Over ' + years + ' years (' + f.first_year + '–' + f.last_year + '), ' + name + ' around ' + place + ' has gone ' + (up ? 'up' : 'down') +
          ' by about ' + total + ' in total. That is roughly ' + dec + ' every 10 years.',
          'Dalam ' + years + ' tahun (' + f.first_year + '–' + f.last_year + '), ' + name + ' di sekitar ' + place + ' telah ' + (up ? 'naik' : 'turun') +
          ' kira-kira ' + total + ' secara keseluruhan, iaitu lebih kurang ' + dec + ' setiap 10 tahun.') });

    // 2. is it real?
    var p = st.mk.pAdj, real;
    if (st.verdict === 'significant') {
      real = L('Very likely real. If nothing were actually changing, a pattern this steady would turn up by luck only ' + oneIn(p) + '. Scientists call anything rarer than 1 in 20 "statistically significant".',
        'Besar kemungkinan benar. Jika tiada apa-apa yang berubah, corak sekukuh ini hanya akan muncul secara kebetulan ' + oneIn(p) + '. Saintis menganggap apa-apa yang lebih jarang daripada 1 dalam 20 sebagai "signifikan secara statistik".');
    } else if (st.verdict === 'borderline') {
      real = L('Maybe. A pattern like this would turn up by luck ' + oneIn(p) + ', which is not rare enough to be sure (the usual bar is 1 in 20). More years of data could settle it.',
        'Mungkin. Corak seperti ini akan muncul secara kebetulan ' + oneIn(p) + ', yang belum cukup jarang untuk pasti (had biasa ialah 1 dalam 20). Lebih banyak tahun data boleh memastikannya.');
    } else {
      real = L('Not proven. The normal ups and downs from one year to the next are bigger than this trend, so it could easily be chance (' + oneIn(p) + ').',
        'Belum terbukti. Turun naik biasa dari tahun ke tahun lebih besar daripada tren ini, jadi ia mungkin sekadar kebetulan (' + oneIn(p) + ').');
    }
    out.push({ kind: 'real', title: L('Is the change real?'), text: real });

    // 3. how big compared with the wobble
    var r2 = Math.round(f.r_squared * 100);
    out.push({ kind: 'wiggle', title: L('Trend vs. normal variation'), text:
      L('The steady trend explains about ' + r2 + '% of the differences between years. The other ' + (100 - r2) + '% is ordinary year-to-year variation (weather, El Niño and so on).',
        'Tren yang stabil menjelaskan kira-kira ' + r2 + '% perbezaan antara tahun. Baki ' + (100 - r2) + '% ialah turun naik biasa dari tahun ke tahun (cuaca, El Niño dan sebagainya).') });

    // 4. warnings
    var warn = [];
    if (f.unusual_years.length) warn.push(L(f.unusual_years.join(', ') + (f.unusual_years.length > 1 ? ' stood out as unusual one-off years.' : ' stood out as an unusual one-off year.') + ' One extreme year is a spike, not a trend.',
      f.unusual_years.join(', ') + ' menonjol sebagai tahun luar biasa. Satu tahun ekstrem ialah lonjakan, bukan tren.'));
    // stats.js adjusts the tests for year-to-year memory; mention it when it mattered
    var nPts = r.years.length;
    if (f.effective_sample_size < nPts * 0.67) {
      var mon = r.step === 'month';
      warn.push(L((mon ? 'Neighbouring months look alike, so the ' + nPts + ' monthly values' : 'Each year looks a lot like the year before, so the ' + nPts + ' years') +
        ' count as only about ' + f.effective_sample_size + ' independent values. The tests were adjusted for this.',
        (mon ? 'Bulan bersebelahan kelihatan serupa, jadi ' + nPts + ' nilai bulanan' : 'Setiap tahun hampir sama dengan tahun sebelumnya, jadi ' + nPts + ' tahun') +
        ' dikira sebagai kira-kira ' + f.effective_sample_size + ' nilai bebas sahaja. Ujian telah diselaraskan untuk ini.'));
    }
    if (warn.length) out.push({ kind: 'careful', title: L('Be careful'), text: warn.join(' ') });

    // 5. what the tests are
    out.push({ kind: 'tests', title: L('The two tests, in one line each'), text:
      L('Mann-Kendall asks: are later years mostly higher (or lower) than earlier ones? Sen’s slope is the typical change per year, worked out so that one freak year barely moves it.') });
    return out;
  }

  // ---- built-in answers (no key) -------------------------------------------------

  var GLOSSARY = [
    { re: /p[\s-]?value|\bp\b|significan|chance|luck|real|kebetulan|signifikan|benar/i, en: 'The p-value is the chance of seeing a pattern this steady if nothing were really changing. Small means "unlikely to be luck". Below 0.05 (1 in 20) we call it statistically significant.' },
    { re: /mann|kendall|tau/i, en: 'The Mann-Kendall test compares every pair of years and counts how often the later year is higher. Tau runs from −1 (always falling) to +1 (always rising). It does not care how big the change is, only how consistent.' },
    { re: /sen|slope|rate|decade|per year|how fast|cerun|kadar|dekad|laju/i, en: 'Sen’s slope is the middle value of the slopes between every pair of years, so a single extreme year hardly affects it. We show it per decade (10 years) because yearly changes are tiny.' },
    { re: /spike|outlier|unusual|extreme|lonjakan|luar biasa/i, en: 'A spike is a single year far from the trend line (for example a strong El Niño year). One spike can make a line tilt, so we re-test without it to see whether the trend survives.' },
    { re: /why|cause|because|reason|kenapa|mengapa|punca|sebab/i, en: 'These tests show whether something changed, not why. Common drivers include global warming, land-use change (cities, deforestation), and natural cycles such as El Niño. Treat any cause as a hypothesis to check.' },
    { re: /r2|r²|r-squared|variation|wobble|explain/i, en: 'R² is the share of the year-to-year differences that the straight trend line accounts for. Climate data is noisy, so even a real trend often explains only a small share.' },
    { re: /data|source|nasa|power|merra|where.*from|sumber/i, en: 'The numbers come from NASA POWER, which serves satellite and model data (such as MERRA-2 and CERES) for any point on Earth since the 1980s.' }
  ];
  // Never let a bad case or an odd question break the chat: check the numbers first,
  // and catch anything unexpected.
  function safeExplain(r) {
    try {
      var f = facts(r);
      if (!isFinite(f.sen_slope_per_decade) || !isFinite(f.mann_kendall_p_memory_adjusted) || f.years_of_data < 2) return null;
      return explain(r);
    } catch (e) { return null; }
  }
  function safeAnswer(q) {
    try { return offlineAnswer(String(q || '').slice(0, 300)); }
    catch (e) { return L('Sorry, something went wrong while answering. Please try another question.'); }
  }

  function offlineAnswer(q) {
    var hits = GLOSSARY.filter(function (g) { return g.re.test(q); }).slice(0, 2);
    var parts = hits.map(function (g) { return L(g.en, g.ms); });
    var wantsSummary = /summar|explain (this|the|it)|simpl|result|big|ringkas|terangkan|keputusan|besar/i.test(q);
    if (wantsSummary || !parts.length) {
      var ex = res ? safeExplain(res) : null;
      if (ex) parts.unshift(ex.slice(0, 2).map(function (x) { return '**' + x.title + ':** ' + x.text; }).join('\n'));
      else if (res) parts.unshift(L('I could not read the numbers for this case. Try another place or period, then ask again.'));
      else parts.unshift(L('Pick a place and a variable first, then I can explain the result.'));
    }
    if (!hits.length && !wantsSummary) {
      parts.push(L('I can only answer questions about this result. Try: "Is the change real?", "How fast is it changing?" or "Why might it be changing?"'));
    }
    return parts.join('\n\n');
  }

  // ---- OpenAI ------------------------------------------------------------------------

  function systemPrompt() {
    return 'You are the assistant inside "Trend Detective", a NASA Space Apps web app that tests whether an Earth variable ' +
      '(temperature, rain, soil wetness, etc.) at a place has a statistically real long-term trend, using NASA POWER data, ' +
      'the Mann-Kendall test and Sen\'s slope. Your readers are students and the general public, not scientists. ' +
      'Explain in plain, friendly language, with everyday comparisons. Avoid jargon; when you must use a term, explain it in a few words. ' +
      'Use only the numbers in the case data you are given; never invent data. If asked about causes, give commonly accepted possibilities and ' +
      'say clearly they are not proven by this test. Keep answers short (under about 120 words) unless asked for more. ' +
      'Reply in ' + (bm() ? 'Bahasa Malaysia' : 'English') + '.';
  }
  function caseMessage() {
    return res ? 'Current case data (JSON):\n' + JSON.stringify(facts(res))
      : 'No case is open yet. The user has not picked a place and variable.';
  }

  /** Stream a chat completion; onText gets the growing text. Resolves to the full text. */
  function askOpenAI(messages, onText) {
    ctrl = new AbortController();
    return fetch(OPENAI_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey() },
      body: JSON.stringify({ model: model(), stream: true, messages: messages })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var msg = (j.error && j.error.message) || ('HTTP ' + r.status);
          if (r.status === 401) msg = L('The API key was not accepted. Check it in the AI settings.');
          else if (r.status === 429) msg = L('OpenAI says the limit or quota is reached. Try again later or check your billing.');
          else if (r.status === 404) msg = L('The model "' + model() + '" is not available to this key. Change it in the AI settings.', 'Model "' + model() + '" tidak tersedia untuk kunci ini. Tukar dalam tetapan AI.');
          throw new Error(msg);
        });
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', text = '';
      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return text;
          buf += dec.decode(chunk.value, { stream: true });
          var lines = buf.split('\n'); buf = lines.pop();
          lines.forEach(function (ln) {
            ln = ln.trim();
            if (ln.indexOf('data:') !== 0) return;
            var data = ln.slice(5).trim();
            if (!data || data === '[DONE]') return;
            try {
              var j = JSON.parse(data), d = j.choices && j.choices[0] && j.choices[0].delta;
              if (d && d.content) { text += d.content; onText(text); }
            } catch (e) { /* partial line: ignore */ }
          });
          return pump();
        });
      }
      return pump();
    }).finally(function () { ctrl = null; });
  }

  // ---- "Explain simply" card in the case file ----------------------------------------

  // small line icons (currentColor), so the AI parts need no emoji or image files
  var ICON = {
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    short: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    real: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 12.5 3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wiggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c2-4 4-4 6 0s4 4 6 0 4-4 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 19 21 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 3" stroke-linecap="round"/></svg>',
    careful: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4M12 17v.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    tests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function buildExplainUI() {
    var verdict = $('verdict');
    if (!verdict || $('ai-explain-btn')) return;
    var bar = document.createElement('div');
    bar.className = 'ai-bar';
    bar.innerHTML = '<button type="button" class="ai-btn" id="ai-explain-btn" aria-expanded="false" aria-controls="ai-explain">' +
      ICON.spark + '<span class="ai-btn-label"></span></button>' +
      '<button type="button" class="ai-link" id="ai-ask-btn"></button>';
    var card = document.createElement('section');
    card.className = 'ai-card'; card.id = 'ai-explain'; card.hidden = true;
    card.setAttribute('aria-live', 'polite');
    verdict.parentNode.insertBefore(bar, verdict.nextSibling);
    bar.parentNode.insertBefore(card, bar.nextSibling);
    $('ai-explain-btn').addEventListener('click', function () {
      var open = card.hidden;
      card.hidden = !open;
      this.setAttribute('aria-expanded', String(open));
      if (open) fillExplain();
    });
    $('ai-ask-btn').addEventListener('click', function () { openChat(); });
    labelExplain();
  }
  function labelExplain() {
    var b = document.querySelector('#ai-explain-btn .ai-btn-label');
    if (b) b.textContent = L('Explain this simply');
    var a = $('ai-ask-btn'); if (a) a.innerHTML = ICON.chat + '<span>' + esc(L('Ask AI a question')) + '</span>';
  }
  function fillExplain() {
    var card = $('ai-explain');
    if (!card || !res) return;
    var items = safeExplain(res);
    if (!items) { card.innerHTML = '<p class="ai-note">' + esc(L('I could not read the numbers for this case. Try another place or period, then ask again.')) + '</p>'; return; }
    var html = '<header class="ai-card-head"><span class="ai-card-ico">' + ICON.spark + '</span><h3>' + esc(L('In plain words')) + '</h3>' +
      '<span class="ai-tag">' + esc(apiKey() ? 'OpenAI' : L('built-in')) + '</span></header><dl>' + items.map(function (x) {
      return '<div class="ai-item ai-k-' + (x.kind || 'short') + '"><span class="ai-ico">' + (ICON[x.kind] || ICON.short) + '</span>' +
        '<div><dt>' + esc(x.title) + '</dt><dd>' + esc(x.text) + '</dd></div></div>';
    }).join('') + '</dl>';
    html += apiKey()
      ? '<div class="ai-more"><button type="button" class="ai-btn ai-btn-sm" id="ai-deeper">' + esc(L('Get an AI explanation')) + '</button><div class="ai-deeper-out" id="ai-deeper-out"></div></div>'
      : '<p class="ai-note">' + esc(L('This summary is built in and works offline. For a fuller AI explanation and free-form questions, add an OpenAI API key in the AI chat settings.')) + '</p>';
    card.innerHTML = html;
    var deeper = $('ai-deeper');
    if (deeper) deeper.addEventListener('click', function () {
      var out = $('ai-deeper-out');
      deeper.disabled = true;
      out.innerHTML = '<p class="ai-typing">' + esc(L('Thinking…')) + '</p>';
      askOpenAI([
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: caseMessage() + '\n\n' + L('Explain this result to a secondary-school student in 4 short bullet points: what changed, whether it is real, how big it is compared with normal variation, and one thing to be careful about.') }
      ], function (t) { out.innerHTML = fmtReply(t); })
        .catch(function (e) { out.innerHTML = '<p class="ai-err">' + esc(e.message) + '</p>'; })
        .finally(function () { deeper.disabled = false; });
    });
  }

  // ---- chat panel --------------------------------------------------------------------

  function buildChat() {
    if ($('ai-chat')) return;
    var fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'ai-fab'; fab.id = 'ai-fab';
    fab.setAttribute('aria-controls', 'ai-chat'); fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = ICON.spark + '<span class="ai-fab-label"></span>';
    var box = document.createElement('section');
    box.className = 'ai-chat'; box.id = 'ai-chat'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'ai-chat-title');
    box.innerHTML =
      '<header class="ai-chat-head"><span class="ai-avatar">' + ICON.spark + '</span><strong id="ai-chat-title"></strong><span class="ai-mode" id="ai-mode"></span>' +
        '<button type="button" class="ai-icon" id="ai-gear" aria-expanded="false" aria-controls="ai-settings">⚙</button>' +
        '<button type="button" class="ai-icon" id="ai-close">✕</button></header>' +
      '<form class="ai-settings" id="ai-settings" hidden>' +
        '<label><span id="ai-key-label"></span><input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..."></label>' +
        '<label><span id="ai-model-label"></span><input id="ai-model" type="text" autocomplete="off" spellcheck="false" placeholder="' + DEFAULT_MODEL + '"></label>' +
        '<p class="ai-note" id="ai-key-note"></p>' +
        '<div class="ai-row"><button type="submit" class="ai-btn ai-btn-sm" id="ai-save"></button><button type="button" class="ai-link" id="ai-forget"></button></div>' +
      '</form>' +
      '<div class="ai-log" id="ai-log" aria-live="polite"></div>' +
      '<div class="ai-chips" id="ai-chips"></div>' +
      '<form class="ai-input" id="ai-form"><input id="ai-q" type="text" autocomplete="off" enterkeyhint="send" maxlength="300">' +
        '<button type="submit" class="ai-send" id="ai-send" aria-label="Send">↑</button></form>';
    document.body.appendChild(fab);
    document.body.appendChild(box);

    fab.addEventListener('click', function () { box.hidden ? openChat() : closeChat(); });
    $('ai-close').addEventListener('click', closeChat);
    $('ai-gear').addEventListener('click', function () {
      var s = $('ai-settings'); s.hidden = !s.hidden;
      this.setAttribute('aria-expanded', String(!s.hidden));
      if (!s.hidden) { $('ai-key').value = apiKey(); $('ai-model').value = store(MODEL_STORE) || ''; $('ai-key').focus(); }
    });
    $('ai-settings').addEventListener('submit', function (e) {
      e.preventDefault();
      var k = $('ai-key').value.trim(), m = $('ai-model').value.trim();
      store(KEY_STORE, k || null); store(MODEL_STORE, m || null);
      $('ai-settings').hidden = true; $('ai-gear').setAttribute('aria-expanded', 'false');
      labelChat(); if (!$('ai-explain').hidden) fillExplain();
      addMsg('bot', k ? L('Saved. I will now answer using OpenAI (' + model() + ').', 'Disimpan. Saya kini akan menjawab menggunakan OpenAI (' + model() + ').')
        : L('No key saved. I will use the built-in explainer.'));
    });
    $('ai-forget').addEventListener('click', function () {
      store(KEY_STORE, null); $('ai-key').value = '';
      labelChat(); addMsg('bot', L('Key removed from this browser.'));
    });
    $('ai-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('ai-q').value.trim();
      if (!q || busy) return;
      $('ai-q').value = '';
      send(q);
    });
    $('ai-chips').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-q]'); if (b && !busy) send(b.getAttribute('data-q'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) closeChat(); });
    labelChat();
  }
  function labelChat() {
    var f = document.querySelector('#ai-fab .ai-fab-label'); if (f) f.textContent = L('Ask AI');
    if (!$('ai-chat-title')) return;
    $('ai-chat-title').textContent = L('Trend Detective AI');
    $('ai-mode').textContent = apiKey() ? 'OpenAI · ' + model() : L('built-in');
    $('ai-gear').setAttribute('aria-label', L('AI settings'));
    $('ai-close').setAttribute('aria-label', L('Close'));
    $('ai-key-label').textContent = L('OpenAI API key (optional)');
    $('ai-model-label').textContent = L('Model');
    $('ai-key-note').textContent = L('Stored only in this browser and sent only to OpenAI. Usage is billed to this key. Leave it empty to use the free built-in explainer.');
    $('ai-save').textContent = L('Save');
    $('ai-forget').textContent = L('Remove key');
    $('ai-q').placeholder = L('Ask about this result…');
    var chips = [L('Explain this result simply'), L('What does the p-value mean?'),
      L('Is this change big?'), L('Why might this be happening?')];
    $('ai-chips').innerHTML = chips.map(function (c) { return '<button type="button" data-q="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
  }
  function openChat() {
    var box = $('ai-chat'); if (!box) return;
    box.hidden = false; $('ai-fab').setAttribute('aria-expanded', 'true'); document.body.classList.add('ai-open');
    if (!$('ai-log').children.length) {
      addMsg('bot', res
        ? L('Hi! I can explain the result for ' + TD.vname(res.variable).toLowerCase() + ' around ' + res.placeName + ' in plain words. Ask anything, or tap a suggestion.',
            'Hai! Saya boleh terangkan keputusan untuk ' + TD.vname(res.variable).toLowerCase() + ' di sekitar ' + res.placeName + ' dalam bahasa mudah. Tanya apa sahaja, atau tekan cadangan.')
        : L('Hi! Pick a place and something to investigate, then ask me what the numbers mean.'));
    }
    setTimeout(function () { $('ai-q').focus(); }, 30);
  }
  function closeChat() {
    var box = $('ai-chat'); if (!box) return;
    box.hidden = true; $('ai-fab').setAttribute('aria-expanded', 'false'); document.body.classList.remove('ai-open');
    if (ctrl) ctrl.abort();
  }
  function addMsg(who, text) {
    var el = document.createElement('div');
    el.className = 'ai-msg ai-' + who;
    el.innerHTML = who === 'user' ? '<p>' + esc(text) + '</p>' : fmtReply(text);
    $('ai-log').appendChild(el);
    $('ai-log').scrollTop = $('ai-log').scrollHeight;
    return el;
  }
  function send(q) {
    addMsg('user', q);
    if (!apiKey()) { addMsg('bot', safeAnswer(q)); return; }
    busy = true; $('ai-send').disabled = true;
    var el = addMsg('bot', L('Thinking…')); el.classList.add('ai-typing');
    history.push({ role: 'user', content: q });
    var msgs = [{ role: 'system', content: systemPrompt() }, { role: 'system', content: caseMessage() }].concat(history.slice(-10));
    askOpenAI(msgs, function (t) {
      el.classList.remove('ai-typing'); el.innerHTML = fmtReply(t);
      $('ai-log').scrollTop = $('ai-log').scrollHeight;
    }).then(function (t) {
      history.push({ role: 'assistant', content: t || '' });
    }).catch(function (e) {
      history.pop();
      el.classList.remove('ai-typing');
      el.innerHTML = e.name === 'AbortError' ? '<p class="ai-err">' + esc(L('Stopped.')) + '</p>'
        : '<p class="ai-err">' + esc(e.message || L('Could not reach OpenAI.')) + '</p>' +
          '<p class="ai-note">' + esc(L('Built-in answer instead:')) + '</p>' + fmtReply(safeAnswer(q));
    }).finally(function () { busy = false; $('ai-send').disabled = false; });
  }

  // Other parts of the page (the question wizard) can open the chat with a question.
  window.TDAI = {
    settings: function () {
      openChat();
      var s = $('ai-settings'); if (s && s.hidden) $('ai-gear').click();
    },
    hasKey: function () { return !!apiKey(); },
    ask: function (q) { openChat(); if (!busy) send(q); }
  };

  // ---- wiring ------------------------------------------------------------------------

  function init() {
    TD = window.TD;
    if (!TD) return;
    buildExplainUI();
    buildChat();
    if (TD.current) res = TD.current;
    // a case that failed: forget the old one, so the AI cannot answer about it
    document.addEventListener('td:clear', function () {
      res = null; history = [];
      var card = $('ai-explain'); if (card) card.hidden = true;
    });
    document.addEventListener('td:result', function (e) {
      var changed = !res || !e.detail || res.variable.id !== e.detail.variable.id || res.placeName !== e.detail.placeName;
      res = e.detail;
      if (changed) history = [];   // a new case: start the AI conversation fresh
      var card = $('ai-explain'); if (card && !card.hidden) fillExplain();
    });
    document.addEventListener('td:lang', function () {
      labelExplain(); labelChat();
      var card = $('ai-explain'); if (card && !card.hidden) fillExplain();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
