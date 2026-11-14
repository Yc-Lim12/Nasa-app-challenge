'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDataApi() {
  const window = {
    TDStats: {},
    TDChart: { init() {} },
    matchMedia() { return { matches: false }; }
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    body: { appendChild() {} },
    createElement() {
      return { click() { this.clicked = true; }, remove() {} };
    }
  };
  const location = { hash: '' };
  const history = { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf('#')); } };
  let downloadedBlob = null;
  const context = {
    window, document, location, history, Date, Math, Array, Object, String, Number, isNaN, Blob,
    URL: { createObjectURL(blob) { downloadedBlob = blob; return 'blob:test'; } }
  };
  let source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const initHook = "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);";
  source = source.replace(initHook, "  window.__test = { readHash: readHash, writeHash: writeHash, downloadCsv: downloadCsv, setCurrent: function (v) { current = v; } };\n" + initHook);
  assert.notEqual(source.indexOf('window.__test'), -1, 'test hooks were inserted');
  vm.runInNewContext(source, context, { filename: 'app.js' });
  return { TD: window.TD, hooks: window.__test, location, getDownloadedBlob: () => downloadedBlob };
}

const { TD, hooks, location, getDownloadedBlob } = loadDataApi();

test('box keeps sizes from 2° through 10° and stays within Earth bounds', () => {
  for (let size = 2; size <= 10; size++) {
    for (const [lat, lon] of [[0, 0], [89.9, 179.9], [-89.9, -179.9]]) {
      const box = TD.box(lat, lon, size);
      assert.equal(box.latMax - box.latMin, size);
      assert.equal(box.lonMax - box.lonMin, size);
      assert.ok(box.latMin >= -90 && box.latMax <= 90);
      assert.ok(box.lonMin >= -180 && box.lonMax <= 180);
    }
  }
});

test('yearlySeries averages all twelve months for a full year', () => {
  const months = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`2020${String(i + 1).padStart(2, '0')}`, i + 1])
  );
  const result = TD.yearlySeries(months, 2020, 2020, 0);
  assert.deepEqual(Array.from(result.years), [2020]);
  assert.deepEqual(Array.from(result.values), [6.5]);
});

test('yearlySeries returns the selected month, not the annual mean', () => {
  const result = TD.yearlySeries({ 202001: 2, 202002: 20 }, 2020, 2020, 2);
  assert.deepEqual(Array.from(result.years), [2020]);
  assert.deepEqual(Array.from(result.values), [20]);
});

test('yearlySeries averages a three-month season', () => {
  const result = TD.yearlySeries({ 202006: 3, 202007: 6, 202008: 9 }, 2020, 2020, 13);
  assert.deepEqual(Array.from(result.years), [2020]);
  assert.deepEqual(Array.from(result.values), [6]);
});

test('December-to-February season uses December from the prior year', () => {
  const result = TD.yearlySeries({ 202012: 12, 202101: 1, 202102: 2 }, 2021, 2021, 15);
  assert.deepEqual(Array.from(result.years), [2021]);
  assert.deepEqual(Array.from(result.values), [5]);
});

test('missing NASA fill values do not enter averages and incomplete years are skipped', () => {
  const result = TD.yearlySeries({
    202001: 4, 202002: -999, 202003: 8,
    202101: 2, 202102: 4
  }, 2020, 2021, 0);
  assert.deepEqual(Array.from(result.years), []);
  assert.deepEqual(Array.from(result.values), []);

  const monthly = TD.yearlySeries({ 202001: -999, 202002: 7 }, 2020, 2020, 2);
  assert.deepEqual(Array.from(monthly.years), [2020]);
  assert.deepEqual(Array.from(monthly.values), [7]);

  const seasonal = TD.yearlySeries({ 202006: 1, 202007: -999, 202008: 3 }, 2020, 2020, 13);
  assert.deepEqual(Array.from(seasonal.years), []);
});

test('invalid shared year and month settings fall back to the default period', () => {
  location.hash = '#v=T2M&lat=3.1&lon=101.6&size=4&y0=2030&y1=2020&m=99';
  assert.equal(hooks.readHash(), true);
  assert.equal(TD.state.y0, TD.FIRST_YEAR);
  assert.equal(TD.state.y1, TD.LAST_YEAR);
  assert.equal(TD.state.month, 0);

  location.hash = '#v=T2M&lat=%E0%A4%A';
  assert.equal(hooks.readHash(), false);
});

test('shared links round-trip comparison coordinates safely', () => {
  TD.state.v = 'T2M';
  TD.state.lat = 3.1;
  TD.state.lon = 101.6;
  TD.state.size = 2;
  TD.state.y0 = TD.FIRST_YEAR;
  TD.state.y1 = TD.LAST_YEAR;
  TD.state.month = 15;
  TD.state.placeId = 'klang';
  TD.state.compare = 'pt:5.35,100.40';
  hooks.writeHash();
  assert.match(location.hash, /c=pt%3A5\.35%2C100\.40/);
  TD.state.compare = '';
  hooks.readHash();
  assert.equal(TD.state.compare, 'pt:5.35,100.40');
});

test('CSV download contains the correct year, observation and trend values', async () => {
  hooks.setCurrent({
    variable: { id: 'T2M', unit: '°C' },
    years: [2000, 2010],
    values: [10, 20],
    stats: { ols: { intercept: -1990, slope: 1 } }
  });
  hooks.downloadCsv();
  const csv = await getDownloadedBlob().text();
  assert.equal(csv, '"year","T2M (°C)","trend_line"\n"2000","10.0000","10.0000"\n"2010","20.0000","20.0000"\n');
});
