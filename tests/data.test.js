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
  source = source.replace(initHook, "  window.__test = { readHash: readHash, writeHash: writeHash, downloadCsv: downloadCsv, setCurrent: function (v) { current = v; }, cellShare: cellShare, place: place };\n" + initHook);
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
  // Months are weighted by their number of days, as NASA POWER does for its own annual
  // value (checked against POWER's published annual figures). 2020 is a leap year:
  // (1·31 + 2·29 + 3·31 + 4·30 + 5·31 + 6·30 + 7·31 + 8·31 + 9·30 + 10·31 + 11·30 + 12·31) / 366
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const expected = days.reduce((s, d, i) => s + (i + 1) * d, 0) / 366;
  assert.ok(Math.abs(result.values[0] - expected) < 1e-12);
  assert.ok(Math.abs(result.values[0] - 6.5136612) < 1e-7);
});

test('yearlySeries returns the selected month, not the annual mean', () => {
  const result = TD.yearlySeries({ 202001: 2, 202002: 20 }, 2020, 2020, 2);
  assert.deepEqual(Array.from(result.years), [2020]);
  assert.deepEqual(Array.from(result.values), [20]);
});

test('yearlySeries averages a three-month season', () => {
  const result = TD.yearlySeries({ 202006: 3, 202007: 6, 202008: 9 }, 2020, 2020, 13);
  assert.deepEqual(Array.from(result.years), [2020]);
  // weighted by days: (3·30 + 6·31 + 9·31) / 92
  assert.ok(Math.abs(result.values[0] - 555 / 92) < 1e-12);
});

test('December-to-February season uses December from the prior year', () => {
  const result = TD.yearlySeries({ 202012: 12, 202101: 1, 202102: 2 }, 2021, 2021, 15);
  assert.deepEqual(Array.from(result.years), [2021]);
  // December 2020 (31 days), January 2021 (31), February 2021 (28): (12·31 + 1·31 + 2·28) / 90
  assert.ok(Math.abs(result.values[0] - 459 / 90) < 1e-12);
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
    // a perfect fit (residual SE 0), so the band and prediction interval equal the line
    stats: { ols: { intercept: -1990, slope: 1, n: 2, meanX: 2005, sxx: 50, residualSE: 0, tCrit: 2, tCritPlain: 2, resid: [0, 0] },
      sen: { intercept: -1990, slope: 1 } }
  });
  hooks.downloadCsv();
  const csv = await getDownloadedBlob().text();
  assert.equal(csv,
    '"year","T2M (°C)","trend_line","band_low_95","band_high_95","prediction_low_95","prediction_high_95","residual","sen_line"\n' +
    '"2000","10.0000","10.0000","10.0000","10.0000","10.0000","10.0000","0.0000","10.0000"\n' +
    '"2010","20.0000","20.0000","20.0000","20.0000","20.0000","20.0000","0.0000","20.0000"\n');
});

test('open-ocean topsoil wetness (NASA gives 1 in every month) is left out, not averaged', () => {
  const months = (v) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2020${String(i + 1).padStart(2, '0')}`, typeof v === 'function' ? v(i) : v]));
  const cell = (lon, lat, table) => ({ geometry: { coordinates: [lon, lat] }, properties: { parameter: { GWETTOP: table } } });
  // one point over open ocean: no data at all
  const point = TD.monthlyTable({ properties: { parameter: { GWETTOP: months(1) } } }, 'GWETTOP');
  assert.equal(point.cells, 0);
  assert.equal(point.ocean, 1);
  assert.deepEqual(Object.keys(point.table), []);
  // a coastal box: two land cells and one ocean cell; the ocean cell must not pull the mean towards 1
  const box = TD.monthlyTable({ features: [cell(100, 0, months(0.5)), cell(100.625, 0, months(0.7)), cell(101.25, 0, months(1))] }, 'GWETTOP');
  assert.equal(box.cells, 2);
  assert.equal(box.ocean, 1);
  assert.ok(Math.abs(box.table['202001'] - 0.6) < 1e-9);
  // a wet land cell that only sometimes reaches 1 is real data and stays
  const wet = TD.monthlyTable({ properties: { parameter: { GWETTOP: months((i) => (i < 6 ? 1 : 0.95)) } } }, 'GWETTOP');
  assert.equal(wet.cells, 1);
  // other variables are never treated this way
  assert.equal(TD.isOceanFill('T2M', months(1)), false);
});

test('Malaysian state weights add up to the real state area', () => {
  const states = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'malaysia-states.json'), 'utf8')).states;
  // official land areas in km² (Department of Statistics Malaysia)
  const official = { pahang: 36137, sarawak: 124450, sabah: 73904, johor: 19166, selangor: 8104, kualalumpur: 243, putrajaya: 49, melaka: 1664, perlis: 821, labuan: 92 };
  const R = 6371, rad = Math.PI / 180;
  for (const id of Object.keys(official)) {
    const p = hooks.place(id);
    assert.ok(p && p.state, id + ' is a place');
    p.outline = states[id]; p.weights = {};
    let km2 = 0;
    // NASA POWER grid: cell centres every 0.625° of longitude and 0.5° of latitude
    for (let lat = 0.25; lat < 8; lat += 0.5) {
      for (let lon = 99.375; lon < 120; lon += 0.625) {
        const share = hooks.cellShare(p, lon, lat);
        if (share) km2 += share * (0.625 * rad * R * Math.cos(lat * rad)) * (0.5 * rad * R);
      }
    }
    const err = Math.abs(km2 - official[id]) / official[id];
    assert.ok(err < 0.12, id + ': weighted cells cover ' + Math.round(km2) + ' km², official ' + official[id] + ' km²');
  }
});
