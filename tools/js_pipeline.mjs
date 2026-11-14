// Runs the website's own data pipeline (app.js) and statistics (stats.js) on raw
// NASA POWER answers, for tools/check_variables.py.
// Input (stdin):  { "cases": [ { "json": <POWER answer>, "param": "T2M", "y0": 1981, "y1": 2025, "month": 0 } ] }
//                 or { "vars": true } to list the variables.
// Output (stdout): JSON.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const S = require('../stats.js');

// app.js in a sandbox with just enough of a browser to define window.TD
const window = { TDStats: S, TDChart: { init() {} }, matchMedia() { return { matches: false }; } };
const document = { readyState: 'loading', addEventListener() {} };
const ctx = { window, document, location: { hash: '' }, history: {}, Date, Math, Array, Object, String, Number, isNaN, JSON };
vm.runInNewContext(readFileSync(path.join(here, '..', 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
const TD = window.TD;

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.vars) {
  process.stdout.write(JSON.stringify(TD.VARIABLES.map((v) => ({ id: v.id, param: v.param || v.id, name: v.name, unit: v.unit }))));
} else {
  const out = input.cases.map((c) => {
    const mt = TD.monthlyTable(c.json, c.param);
    const ser = TD.seriesOf(mt.table, { y0: c.y0, y1: c.y1, month: c.month, step: 'year' });
    const r = ser.years.length >= 10 ? S.analyze(ser.years, ser.values) : null;
    return {
      cells: mt.cells, ocean: mt.ocean || 0, years: ser.years, values: ser.values,
      senPerDecade: r && r.sen ? r.sen.slope * 10 : null, p: r && r.mk ? r.mk.pAdj : null, verdict: r ? r.verdict : 'too-few'
    };
  });
  process.stdout.write(JSON.stringify(out));
}
