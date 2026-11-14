/*
 * Builds data/global/<PARAM>.json: the trend of every 5° × 5° block of the globe,
 * for the whole-globe trend map. A live map can only ask NASA POWER for one 10° box
 * at a time (about 3 MB each, 648 boxes for the globe), so this is done once here.
 *
 *   node tools/build_global_trends.mjs T2M PRECTOTCORR
 *
 * For every 0.5° × 0.625° NASA POWER cell: one value per year, the twelve months
 * weighted by their number of days (as app.js does). Cells are averaged into 5°
 * blocks weighted by cos(latitude) (as app.js averages an area). Each block is then
 * tested with stats.js itself, and the false discovery rate correction (5%) is applied
 * across all blocks of the globe. Downloads are cached in tools/.cache so an
 * interrupted run picks up where it stopped.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = require(join(ROOT, 'stats.js'));

const START = 1981, END = 2025;   // same full record as the app
const BLOCK = 5;                  // degrees
const BOX = 10;                   // the biggest box NASA POWER serves in one request
const FILL = -900;                // POWER uses -999 for missing
const CONCURRENCY = 5;
const NLAT = 180 / BLOCK, NLON = 360 / BLOCK;

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** One value per year, months weighted by days; null for a year with a month missing. */
function yearly(table) {
  const out = {};
  for (let y = START; y <= END; y++) {
    let s = 0, d = 0, ok = true;
    for (let m = 1; m <= 12; m++) {
      const x = table[y + (m < 10 ? '0' : '') + m];
      if (x === undefined || x === null || x < FILL) { ok = false; break; }
      s += x * daysInMonth(y, m); d += daysInMonth(y, m);
    }
    if (ok) out[y] = s / d;
  }
  return out;
}

async function fetchBox(param, lat0, lon0) {
  const url = 'https://power.larc.nasa.gov/api/temporal/monthly/regional?parameters=' + param +
    `&community=AG&latitude-min=${lat0}&latitude-max=${lat0 + BOX}&longitude-min=${lon0}&longitude-max=${lon0 + BOX}` +
    `&start=${START}&end=${END}&format=JSON`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (attempt >= 6) throw new Error('HTTP ' + r.status);
    } catch (e) {
      if (attempt >= 6) throw new Error(`box ${lat0},${lon0}: ${e.message}`);
    }
    await sleep(5000 * attempt);
  }
}

/**
 * Sums for one 10° box: for each 5° block and year, the cos(latitude)-weighted sum
 * of cell values and the total weight. A cell on a shared edge belongs only to the
 * box whose lower-left corner is at or below it, so no cell is counted twice.
 */
function boxSums(json, param, lat0, lon0) {
  const sums = {};
  for (const f of json.features || []) {
    let [lon, lat] = f.geometry.coordinates;
    if (lon >= 180) lon -= 360;
    const inLat = lat >= lat0 && (lat < lat0 + BOX || (lat0 + BOX === 90 && lat <= 90));
    const inLon = lon >= lon0 && lon < lon0 + BOX;
    if (!inLat || !inLon) continue;
    const w = Math.cos(lat * Math.PI / 180);
    const bi = Math.min(NLAT - 1, Math.floor((lat + 90) / BLOCK));
    const bj = Math.min(NLON - 1, Math.floor((lon + 180) / BLOCK));
    const key = bi * NLON + bj;
    const ys = yearly(f.properties.parameter[param] || {});
    const b = sums[key] || (sums[key] = {});
    for (const y in ys) {
      const e = b[y] || (b[y] = [0, 0]);
      e[0] += ys[y] * w; e[1] += w;
    }
  }
  return sums;
}

async function build(param) {
  const cacheDir = join(ROOT, 'tools', '.cache', 'global', param);
  mkdirSync(cacheDir, { recursive: true });
  const boxes = [];
  for (let lat0 = -90; lat0 < 90; lat0 += BOX) for (let lon0 = -180; lon0 < 180; lon0 += BOX) boxes.push([lat0, lon0]);
  const blocks = {};
  let done = 0, next = 0;
  const t0 = Date.now();
  async function worker() {
    while (next < boxes.length) {
      const [lat0, lon0] = boxes[next++];
      const file = join(cacheDir, `${lat0}_${lon0}.json`);
      let sums;
      if (existsSync(file)) sums = JSON.parse(readFileSync(file, 'utf8'));
      else {
        sums = boxSums(await fetchBox(param, lat0, lon0), param, lat0, lon0);
        writeFileSync(file, JSON.stringify(sums));
      }
      for (const key in sums) {
        const b = blocks[key] || (blocks[key] = {});
        for (const y in sums[key]) {
          const e = b[y] || (b[y] = [0, 0]);
          e[0] += sums[key][y][0]; e[1] += sums[key][y][1];
        }
      }
      if (++done % 36 === 0 || done === boxes.length) {
        console.log(`${param}: ${done}/${boxes.length} boxes (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // a block-year counts only if (almost) all of the block's cells have that year
  const cells = [];
  for (const key in blocks) {
    const b = blocks[key];
    const wMax = Math.max(...Object.values(b).map(e => e[1]));
    const years = [], values = [];
    for (let y = START; y <= END; y++) {
      if (b[y] && b[y][1] >= 0.9 * wMax) { years.push(y); values.push(b[y][0] / b[y][1]); }
    }
    if (years.length < 10) continue;
    const a = S.analyze(years, values);
    const bi = Math.floor(key / NLON), bj = key % NLON;
    cells.push({ lat0: -90 + bi * BLOCK, lon0: -180 + bj * BLOCK, n: years.length,
      rate: a.slopePerDecade, lo: a.sen.ciLow * 10, hi: a.sen.ciHigh * 10, p: a.p, mean: S.mean(values) });
  }
  const sig = S.fdr(cells.map(c => c.p), 0.05);
  const r = x => Number(x.toPrecision(4));
  const out = {
    param, start: START, end: END, block: BLOCK, made: new Date().toISOString().slice(0, 10),
    method: 'NASA POWER monthly, days-weighted yearly means, cos(latitude)-weighted 5° blocks; ' +
      'stats.js: Sen slope per decade, memory-adjusted Mann-Kendall p; Benjamini-Hochberg FDR 5% across all blocks',
    fields: ['lat0', 'lon0', 'years', 'ratePerDecade', 'rangeLow', 'rangeHigh', 'p', 'significant', 'mean'],
    cells: cells.map((c, i) => [c.lat0, c.lon0, c.n, r(c.rate), r(c.lo), r(c.hi), r(c.p), sig[i] ? 1 : 0, r(c.mean)])
  };
  mkdirSync(join(ROOT, 'data', 'global'), { recursive: true });
  writeFileSync(join(ROOT, 'data', 'global', param + '.json'), JSON.stringify(out));
  const nsig = sig.filter(Boolean).length;
  console.log(`${param}: wrote data/global/${param}.json, ${cells.length} blocks, ${nsig} significant after FDR`);
}

const params = process.argv.slice(2);
if (!params.length) { console.log('usage: node tools/build_global_trends.mjs T2M PRECTOTCORR'); process.exit(1); }
for (const p of params) await build(p);
