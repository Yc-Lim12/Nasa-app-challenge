'use strict';

// Tests for the question box (ask.js): it should read the variable, place, month and
// years from a plain-English or Bahasa Malaysia question. Run with: node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIRST_YEAR = 1981;
const LAST_YEAR = 2025;

function loadAsk() {
  const places = {
    klang: { short: 'Klang Valley' }, penang: { short: 'Penang' }, eastcoast: { short: 'east coast' },
    malaysia: { short: 'Malaysia' }, peninsular: { short: 'Peninsular Malaysia' }, borneo: { short: 'Borneo' },
    sabah: { short: 'Sabah' }, kedah: { short: 'Kedah' }, kelantan: { short: 'Kelantan' }, johor: { short: 'Johor' }
  };
  const window = {
    TD: {
      FIRST_YEAR, LAST_YEAR, MIN_YEARS: 10,
      state: { v: 'T2M', placeId: 'klang', lat: 3.1, lon: 101.6 },
      place: id => places[id], coordLabel: (lat, lon) => lat + ', ' + lon,
      T: s => s, esc: s => String(s)
    }
  };
  const document = { readyState: 'complete', addEventListener() {}, getElementById() { return null; } };
  const source = fs.readFileSync(path.join(__dirname, '..', 'ask.js'), 'utf8');
  vm.runInNewContext(source, { window, document }, { filename: 'ask.js' });
  return window.TDAsk;
}

const ask = loadAsk();

// [question, expected] — place is a named place id, or [lat, lon] for a map point.
const QUESTIONS = [
  // English
  ['Is Kuala Lumpur getting hotter?', { v: 'T2M', place: 'klang', month: 0, y0: FIRST_YEAR, y1: LAST_YEAR }],
  ['Is Penang getting rainier in December since 2000?', { v: 'PRECTOTCORR', place: 'penang', month: 12, y0: 2000, y1: LAST_YEAR }],
  ['Are nights in Kota Bharu warmer than before?', { v: 'T2M_MIN', place: [6.13, 102.24] }],
  ['Has the haze in the Klang Valley got worse from 1990 to 2020?', { v: 'AOD_55', place: 'klang', y0: 2001, y1: 2020 }],
  ['Is the South China Sea warming?', { v: 'SST', place: [6.0, 109.0] }],
  ['Is Sabah getting windier in July?', { v: 'WS10M', place: 'sabah', month: 7 }],
  ['Is drought getting worse in Kedah over the last 20 years?', { v: 'GWETROOT', place: 'kedah', y0: LAST_YEAR - 19, y1: LAST_YEAR }],
  ['Is it getting cloudier over Kuching in August?', { v: 'CLOUD_AMT', place: [1.55, 110.35], month: 8 }],
  ['Is London getting hotter in summer?', { v: 'T2M', place: [51.5, -0.12], month: 13 }],
  ['Is Sydney getting hotter in summer?', { v: 'T2M', place: [-33.87, 151.21], month: 15 }],
  // Bahasa Malaysia
  ['Adakah Kuala Lumpur semakin panas?', { v: 'T2M', place: 'klang', month: 0 }],
  ['Adakah hujan di Pulau Pinang semakin lebat pada bulan Disember?', { v: 'PRECTOTCORR', place: 'penang', month: 12 }],
  ['Adakah malam di Kuching semakin panas sejak 2000?', { v: 'T2M_MIN', place: [1.55, 110.35], y0: 2000 }],
  ['Adakah jerebu di Lembah Klang semakin teruk?', { v: 'AOD_55', place: 'klang', y0: 2001 }],
  ['Adakah laut di sekitar Malaysia semakin panas?', { v: 'SST', place: 'malaysia' }],
  ['Adakah banjir di Kelantan semakin kerap dari 1990 hingga 2020?', { v: 'PRECTOTCORR', place: 'kelantan', y0: 1990, y1: 2020 }],
  ['Adakah angin di Sabah semakin kuat pada bulan Julai?', { v: 'WS10M', place: 'sabah', month: 7 }],
  ['Adakah tanah di Kedah semakin kering?', { v: 'GWETROOT', place: 'kedah' }],
  ['Adakah suhu di Pantai Timur meningkat dalam 10 tahun lepas?', { v: 'T2M', place: 'eastcoast', y0: LAST_YEAR - 9, y1: LAST_YEAR }],
  ['Adakah cuaca di Johor semakin mendung pada bulan Ogos?', { v: 'CLOUD_AMT', place: 'johor', month: 8 }]
];

function check(q, exp) {
  const r = ask.parse(q), c = r.cfg;
  assert.equal(c.v, exp.v, 'variable');
  if (typeof exp.place === 'string') assert.equal(c.place, exp.place, 'place');
  else if (exp.place) { assert.equal(c.place, undefined, 'no named place'); assert.equal(c.lat, exp.place[0], 'latitude'); assert.equal(c.lon, exp.place[1], 'longitude'); }
  if (exp.month !== undefined) assert.equal(c.month, exp.month, 'month');
  if (exp.y0 !== undefined) assert.equal(c.y0, exp.y0, 'first year');
  if (exp.y1 !== undefined) assert.equal(c.y1, exp.y1, 'last year');
  assert.deepEqual([...r.guessed], [], 'nothing guessed');
}

QUESTIONS.forEach(([q, exp], i) => {
  test(`${i < 10 ? 'EN' : 'BM'} ${String(i + 1).padStart(2, '0')}: ${q}`, () => check(q, exp));
});

test('"may be" is not read as the month of May', () => {
  assert.equal(ask.parse('Will Penang get more rain, may be?').cfg.month, 0);
  assert.equal(ask.parse('Is Penang getting rainier in May?').cfg.month, 5);
});

test('"Penang, Malaysia" means Penang, not the whole country', () => {
  assert.equal(ask.parse('Is Penang, Malaysia getting rainier?').cfg.place, 'penang');
});

test('a question with no variable or place says what it guessed', () => {
  const r = ask.parse('tell me a joke');
  assert.deepEqual([...r.guessed], ['variable', 'place']);
  assert.equal(r.cfg.v, 'T2M', 'keeps the current variable');
});

test('years are kept inside the NASA POWER record and in order', () => {
  for (const q of ['Is KL hotter from 2030 to 2040?', 'Is KL hotter since 2045?', 'Is KL hotter from 1970 to 1975?']) {
    const c = ask.parse(q).cfg;
    assert.ok(c.y0 >= FIRST_YEAR && c.y1 <= LAST_YEAR && c.y0 <= c.y1, q + ': inside the record, in order');
    assert.ok(c.y1 - c.y0 + 1 >= 10, q + ': beyond the record, so at least 10 real years are used');
  }
  const back = ask.parse('Is KL hotter from 2020 to 1990?').cfg;
  assert.equal(back.y0, 1990, 'years given backwards are put in order'); assert.equal(back.y1, 2020);
  const short = ask.parse('Is KL hotter since 2020?').cfg;
  assert.equal(short.y0, 2020, 'a short period that exists is kept, so the app can explain it is too short');
});

test('odd input never throws', () => {
  for (const q of ['', '   ', '?!?!', '🌧️🌧️', '你好', '<script>alert(1)</script>', 'x'.repeat(5000), '1990 2000 2010', 'NaN']) {
    assert.doesNotThrow(() => ask.parse(q), JSON.stringify(q).slice(0, 30));
  }
});
