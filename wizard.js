/*
 * Trend Detective: "Help me choose" question wizard.
 * Three short questions (what kind of place, what you are curious about, where)
 * lead to suggested variables, each with a reason that fits that kind of place.
 * Rule-based and offline; with an OpenAI key the AI chat can add more ideas.
 */
(function () {
  'use strict';

  var TD;
  function $(id) { return document.getElementById(id); }
  function bm() { return window.TDi18n && window.TDi18n.lang === 'bm'; }
  function L(en, ms) { var t = window.TDi18n ? window.TDi18n.tr(en) : en; return (bm() && t === en && ms !== undefined) ? ms : t; }
  function esc(s) { return TD.esc(s); }

  // Kinds of place, with example regions and the variables that matter most there.
  // Each suggestion: [variable id, reason EN, reason BM].
  var KINDS = [
    { id: 'city', icon: '🏙️', en: 'A big city',
      where: [{ place: 'klang' }, { place: 'delhi' }],
      vars: [
        ['T2M_MIN', 'Concrete and roads store heat and release it after dark, so city nights often warm fastest.', 'Konkrit dan jalan menyimpan haba dan melepaskannya selepas gelap, jadi malam di bandar selalunya paling cepat memanas.'],
        ['AOD_55', 'Traffic, industry and smoke from fires nearby make city air hazy.', 'Kenderaan, industri dan asap kebakaran berdekatan menjadikan udara bandar berjerebu.'],
        ['T2M_MAX', 'Hotter afternoons mean more heat stress and higher power use for cooling.', 'Petang yang lebih panas bermaksud lebih banyak tekanan haba dan penggunaan elektrik untuk penyejukan.'],
        ['PRECTOTCORR', 'Paved ground cannot soak up heavy rain, so changes in rainfall show up as flash floods.', 'Tanah berturap tidak dapat menyerap hujan lebat, jadi perubahan hujan muncul sebagai banjir kilat.'],
        ['RH2M', 'Humid heat feels worse, because sweat cannot cool the body as well.', 'Haba lembap terasa lebih teruk kerana peluh tidak dapat menyejukkan badan dengan baik.']
      ] },
    { id: 'forest', icon: '🌳', en: 'A rainforest',
      where: [{ place: 'amazon' }, { lat: 1.0, lon: 114.0, size: 6, en: 'Borneo' }],
      vars: [
        ['PRECTOTCORR', 'Rainforests need rain almost every month; a drier trend stresses the trees.', 'Hutan hujan memerlukan hujan hampir setiap bulan; tren lebih kering menekan pokok.'],
        ['GWETROOT', 'Water deep in the soil is what the trees actually drink during dry spells.', 'Air jauh dalam tanah ialah air yang sebenarnya diminum pokok semasa musim kering.'],
        ['EVLAND', 'Forests pump water back into the air, which helps make the next rain.', 'Hutan mengepam air kembali ke udara, yang membantu menghasilkan hujan seterusnya.'],
        ['AOD_55', 'Forest and peat fires show up as smoke in dry years.', 'Kebakaran hutan dan tanah gambut muncul sebagai asap pada tahun kering.'],
        ['T2M_MAX', 'Hotter days dry out the forest and raise the risk of fire.', 'Hari yang lebih panas mengeringkan hutan dan meningkatkan risiko kebakaran.']
      ] },
    { id: 'desert', icon: '🏜️', en: 'A desert or dry land',
      where: [{ place: 'sahel' }, { place: 'aral' }],
      vars: [
        ['PRECTOTCORR', 'Where rain is scarce, a small change decides whether crops and grazing survive.', 'Di tempat yang kurang hujan, perubahan kecil menentukan sama ada tanaman dan ragutan bertahan.'],
        ['AOD_55', 'Dry, bare ground lifts dust into the air.', 'Tanah kering dan gondol menerbangkan debu ke udara.'],
        ['GWETTOP', 'Topsoil wetness shows whether the ground is drying out.', 'Kebasahan tanah atas menunjukkan sama ada tanah semakin kering.'],
        ['T2M_MAX', 'Deserts already sit near the limits of heat that people and animals can bear.', 'Gurun sudah hampir dengan had haba yang boleh ditanggung manusia dan haiwan.'],
        ['ALLSKY_SFC_SW_DWN', 'Strong sunshine makes deserts good places for solar power; dust and cloud can reduce it.', 'Cahaya matahari yang kuat menjadikan gurun sesuai untuk tenaga solar; debu dan awan boleh mengurangkannya.']
      ] },
    { id: 'coast', icon: '🌊', en: 'A coast or river mouth',
      where: [{ place: 'penang' }, { place: 'eastcoast' }, { lat: 10.0, lon: 106.0, size: 2, en: 'Mekong delta, Vietnam' }],
      vars: [
        ['SST', 'A warmer sea feeds stronger storms and stresses coral and fish.', 'Laut yang lebih panas menyuburkan ribut yang lebih kuat dan menekan terumbu karang serta ikan.'],
        ['PRECTOTCORR', 'Heavy rain upstream floods low-lying river mouths.', 'Hujan lebat di hulu membanjiri muara sungai yang rendah.'],
        ['WS10M', 'Wind drives waves and storm surge onto the coast.', 'Angin menolak ombak dan air pasang ribut ke pantai.'],
        ['PS', 'Air pressure drops sharply when storms pass; a change in average pressure can hint at a change in storms.', 'Tekanan udara jatuh mendadak apabila ribut melintas; perubahan tekanan purata boleh membayangkan perubahan ribut.'],
        ['RH2M', 'Sea air is humid; more humidity makes heat feel worse.', 'Udara laut lembap; kelembapan lebih tinggi menjadikan haba terasa lebih teruk.']
      ] },
    { id: 'farm', icon: '🌾', en: 'Farmland',
      where: [{ place: 'california' }, { place: 'murray' }],
      vars: [
        ['GWETROOT', 'Root-zone soil water is what crops live on between rains.', 'Air tanah di zon akar ialah sumber hidup tanaman di antara hujan.'],
        ['PRECTOTCORR', 'Rain sets how much water farms get without irrigation.', 'Hujan menentukan berapa banyak air yang diterima ladang tanpa pengairan.'],
        ['EVLAND', 'More evaporation means fields lose water faster.', 'Lebih banyak penyejatan bermaksud ladang kehilangan air lebih cepat.'],
        ['T2M_MAX', 'Very hot days cut crop yields.', 'Hari yang sangat panas mengurangkan hasil tanaman.'],
        ['ALLSKY_SFC_SW_DWN', 'Crops grow on sunlight; haze and cloud reduce it.', 'Tanaman tumbuh dengan cahaya matahari; jerebu dan awan mengurangkannya.']
      ] },
    { id: 'cold', icon: '❄️', en: 'A cold or snowy place',
      where: [{ place: 'utqiagvik' }, { place: 'greenland' }, { place: 'wisconsin' }],
      vars: [
        ['T2M', 'The Arctic is warming faster than almost anywhere else on Earth.', 'Artik memanas lebih cepat daripada hampir semua tempat lain di Bumi.'],
        ['SNODP', 'Less snow means less water stored for spring and summer.', 'Kurang salji bermaksud kurang air disimpan untuk musim bunga dan panas.'],
        ['TS', 'Ground temperature shows whether frozen ground may be thawing.', 'Suhu permukaan tanah menunjukkan sama ada tanah beku mungkin mencair.'],
        ['PRECTOTCORR', 'Warmer air can carry more moisture, so snowfall can change too.', 'Udara lebih panas boleh membawa lebih banyak lembapan, jadi salji juga boleh berubah.'],
        ['CLOUD_AMT', 'Clouds trap heat in polar winters.', 'Awan memerangkap haba pada musim sejuk kutub.']
      ] },
    { id: 'sea', icon: '🐟', en: 'The open sea',
      where: [{ lat: 6.0, lon: 109.0, size: 4, en: 'South China Sea' }, { lat: 3.0, lon: 100.5, size: 2, en: 'Strait of Malacca' }],
      vars: [
        ['SST', 'Sea temperature drives coral bleaching, fish movement and storms.', 'Suhu laut mempengaruhi pelunturan karang, pergerakan ikan dan ribut.'],
        ['WS10M', 'Wind over the sea matters for shipping, fishing and waves.', 'Angin di atas laut penting untuk perkapalan, perikanan dan ombak.'],
        ['TQV', 'A warmer sea puts more water vapour into the air above it.', 'Laut lebih panas memasukkan lebih banyak wap air ke udara di atasnya.'],
        ['CLOUD_AMT', 'Clouds over the sea shade the water and reflect sunlight.', 'Awan di atas laut meneduhkan air dan memantulkan cahaya matahari.'],
        ['PS', 'Pressure falls as storms form over warm water.', 'Tekanan jatuh apabila ribut terbentuk di atas air panas.']
      ] },
    { id: 'mountain', icon: '⛰️', en: 'Mountains',
      where: [{ lat: 32.0, lon: 88.0, size: 4, en: 'Tibetan Plateau' }, { lat: 46.5, lon: 8.5, size: 2, en: 'Swiss Alps' }],
      vars: [
        ['SNODP', 'Mountain snow feeds rivers that millions of people downstream depend on.', 'Salji gunung mengisi sungai yang menjadi sumber air berjuta orang di hilir.'],
        ['T2M', 'High mountains are warming faster than the lowlands around them.', 'Gunung tinggi memanas lebih cepat daripada tanah rendah di sekelilingnya.'],
        ['PRECTOTCORR', 'Rain or snow decides how much water reaches the rivers.', 'Hujan atau salji menentukan berapa banyak air sampai ke sungai.'],
        ['CLOUD_AMT', 'Clouds change how much sun melts the snow.', 'Awan mengubah berapa banyak cahaya matahari mencairkan salji.']
      ] }
  ];

  // What the person is curious about, as variable topics (see TOPICS in app.js).
  var INTERESTS = [
    { id: 'any', icon: '🔍', en: 'Show me what matters most', topics: null },
    { id: 'heat', icon: '🌡️', en: 'Is it getting hotter?', topics: ['heat'] },
    { id: 'water', icon: '💧', en: 'Wetter or drier?', topics: ['water', 'soil'] },
    { id: 'air', icon: '🌫️', en: 'Air, haze and wind', topics: ['air'] },
    { id: 'sky', icon: '☀️', en: 'Sun and clouds', topics: ['sky'] }
  ];

  var pick = { kind: null, interest: null, where: null }, step = 0, lastFocus = null;

  function placeLabel(w) {
    if (w.place) { var p = TD.place(w.place); return p ? TD.T(p.short) : w.place; }
    return L(w.en, w.ms);
  }
  function currentLabel() {
    var s = TD.state;
    return s.placeId === 'custom' ? TD.coordLabel(s.lat, s.lon) : TD.T((TD.place(s.placeId) || {}).short || '');
  }

  /** Suggested variables for the chosen kind of place and interest, best first. */
  function suggestions() {
    var kind = pick.kind, topics = pick.interest.topics;
    // Sea surface temperature answers "is it getting hotter?" as well as water questions.
    var fits = function (id) { var t = TD.variable(id).topic; return !topics || topics.indexOf(t) >= 0 || (id === 'SST' && topics.indexOf('heat') >= 0); };
    var out = kind.vars.filter(function (v) { return fits(v[0]); });
    // Too few for this place? Add the other variables on the topic, with their plain definition.
    if (topics && out.length < 2) {
      TD.VARIABLES.forEach(function (vr) {
        if (out.length >= 3 || topics.indexOf(vr.topic) < 0) return;
        if (out.some(function (v) { return v[0] === vr.id; })) return;
        out.push([vr.id, vr.def, TD.T(vr.def)]);
      });
    }
    return out.slice(0, 3);
  }

  function opt(attr, val, icon, label, sub) {
    return '<button type="button" class="wz-opt" ' + attr + '="' + esc(val) + '">' +
      (icon ? '<span class="wz-ico" aria-hidden="true">' + icon + '</span>' : '') +
      '<span><strong>' + esc(label) + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
  }

  function render() {
    var box = $('wz'), body;
    var titles = [L('What kind of place?'), L('What are you curious about?'),
      L('Where exactly?'), L('Try one of these')];
    if (step === 0) {
      body = '<div class="wz-grid">' + KINDS.map(function (k) { return opt('data-kind', k.id, k.icon, L(k.en, k.ms)); }).join('') + '</div>';
    } else if (step === 1) {
      body = '<div class="wz-list">' + INTERESTS.map(function (x) { return opt('data-int', x.id, x.icon, L(x.en, x.ms)); }).join('') + '</div>';
    } else if (step === 2) {
      body = '<div class="wz-list">' + pick.kind.where.map(function (w, i) {
        return opt('data-where', String(i), '📍', placeLabel(w), L('Example'));
      }).join('') +
        opt('data-where', 'here', '🎯', L('The place I have open now'), currentLabel()) +
        opt('data-where', 'globe', '🌍', L('I will click a place on the globe'), '') + '</div>';
    } else {
      var sug = suggestions();
      body = '<p class="wz-lead">' + esc(L('For ' + L(pick.kind.en, pick.kind.ms).toLowerCase() + ', these NASA records are worth testing:',
        'Untuk ' + L(pick.kind.en).toLowerCase() + ', rekod NASA ini wajar diuji:')) + '</p>' +
        '<div class="wz-list">' + sug.map(function (v) {
          var vr = TD.variable(v[0]);
          return '<button type="button" class="wz-opt wz-sug" data-var="' + vr.id + '"><span><strong>' + esc(TD.vname(vr)) +
            '</strong><small>' + esc(L(v[1], v[2])) + '</small></span><span class="wz-go" aria-hidden="true">›</span></button>';
        }).join('') + '</div>' +
        (window.TDAI && window.TDAI.hasKey() ? '<button type="button" class="wz-ai" id="wz-ai">✨ ' + esc(L('Ask AI for more ideas')) + '</button>' : '');
    }
    box.querySelector('.wz-title').textContent = titles[step];
    box.querySelector('.wz-steps').textContent = L('Question {a} of 3').replace('{a}', Math.min(step + 1, 3));
    box.querySelector('.wz-steps').hidden = step > 2;
    box.querySelector('.wz-body').innerHTML = body;
    $('wz-back').hidden = step === 0;
    $('wz-back').textContent = L('Back');
    $('wz-x').setAttribute('aria-label', L('Close'));
    var first = box.querySelector('.wz-body button');
    if (first) first.focus();
  }

  function finish(varId) {
    var w = pick.where, cfg = { v: varId, compare: '' };
    if (varId === 'AOD_55') cfg.y0 = 2001;    // the aerosol record starts in 2001
    if (w === 'globe') {
      cfg.investigate = false;
      close();
      TD.apply(cfg);
      TD.toast(L('Now click a place on the globe to test it.'));
      return;
    }
    if (w !== 'here') {
      if (w.place) cfg.place = w.place;
      else { cfg.lat = w.lat; cfg.lon = w.lon; cfg.size = w.size; }
    }
    close();
    if (window.TDStories) window.TDStories.exit();
    TD.apply(cfg);
  }

  function open() {
    lastFocus = document.activeElement;
    pick = { kind: null, interest: null, where: null }; step = 0;
    $('wz-wrap').hidden = false;
    document.body.classList.add('wz-on');
    render();
  }
  function close() {
    $('wz-wrap').hidden = true;
    document.body.classList.remove('wz-on');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'wz-wrap'; wrap.id = 'wz-wrap'; wrap.hidden = true;
    wrap.innerHTML = '<section class="wz" id="wz" role="dialog" aria-modal="true" aria-labelledby="wz-title">' +
      '<header class="wz-head"><button type="button" class="wz-back" id="wz-back"></button>' +
      '<span class="wz-steps"></span><button type="button" class="ai-icon" id="wz-x">✕</button></header>' +
      '<h2 class="wz-title" id="wz-title"></h2><div class="wz-body"></div></section>';
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) { close(); return; }
      var b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'wz-x') return close();
      if (b.id === 'wz-back') { step = Math.max(0, step - 1); return render(); }
      if (b.id === 'wz-ai') {
        var names = suggestions().map(function (v) { return TD.vname(TD.variable(v[0])); }).join(', ');
        var where = pick.where === 'here' || pick.where === 'globe' ? currentLabel() : placeLabel(pick.where);
        close();
        window.TDAI.ask(L('I want to investigate ' + pick.kind.en.toLowerCase() + ' (' + where + '). Besides ' + names +
          ', which NASA climate variables in this app would be worth testing there, and why? Keep it short.',
          'Saya mahu menyiasat ' + L(pick.kind.en).toLowerCase() + ' (' + where + '). Selain ' + names +
          ', pemboleh ubah iklim NASA mana dalam aplikasi ini yang wajar diuji di sana, dan mengapa? Ringkaskan.'));
        return;
      }
      var a;
      if ((a = b.getAttribute('data-kind'))) { pick.kind = KINDS.filter(function (k) { return k.id === a; })[0]; step = 1; render(); }
      else if ((a = b.getAttribute('data-int'))) { pick.interest = INTERESTS.filter(function (x) { return x.id === a; })[0]; step = 2; render(); }
      else if ((a = b.getAttribute('data-where'))) { pick.where = a === 'here' || a === 'globe' ? a : pick.kind.where[+a]; step = 3; render(); }
      else if ((a = b.getAttribute('data-var'))) finish(a);
    });
    document.addEventListener('keydown', function (e) {
      if (wrap.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {   // keep focus inside the dialog
        var f = Array.prototype.filter.call(wrap.querySelectorAll('button'), function (x) { return !x.hidden && x.offsetParent; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    // the link under the question box
    var link = document.createElement('button');
    link.type = 'button'; link.className = 'wz-open'; link.id = 'wz-open';
    var out = $('ask-out');
    out.parentNode.insertBefore(link, out);
    link.addEventListener('click', open);
    label();
  }
  function label() {
    var l = $('wz-open');
    if (l) l.innerHTML = '<span aria-hidden="true">🧭</span> ' + esc(L('Not sure what to ask? Help me choose'));
    if (!$('wz-wrap').hidden) render();
  }

  function init() {
    TD = window.TD;
    if (!TD || !$('ask-out')) return;
    build();
    document.addEventListener('td:lang', label);
  }

  window.TDWizard = { open: open, kinds: KINDS, suggestions: function (kind, interest) {
    var keep = pick; pick = { kind: KINDS.filter(function (k) { return k.id === kind; })[0], interest: INTERESTS.filter(function (x) { return x.id === interest; })[0] };
    var out = suggestions(); pick = keep; return out;
  } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
