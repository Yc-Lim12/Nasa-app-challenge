// Runs the website's own stats.js on many series at once, for the Python checks.
// Input (stdin):  JSON array of { x: [...], y: [...] }
// Output (stdout): JSON array of the analyze() results, one per series.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const S = require('../stats.js');

const cases = JSON.parse(readFileSync(0, 'utf8'));
const out = cases.map(function (c) {
  const r = S.analyze(c.x, c.y);
  return {
    ols: { slope: r.ols.slope, intercept: r.ols.intercept, se: r.ols.se, p: r.ols.p, df: r.ols.df,
      ciLow: r.ols.ciLow, ciHigh: r.ols.ciHigh, r2: r.ols.r2, lag1: r.ols.lag1,
      lag1Adj: r.ols.lag1Adj, nEff: r.ols.nEff, seAdj: r.ols.seAdj, pAdj: r.ols.pAdj },
    mk: { S: r.mk.S, varS: r.mk.varS, z: r.mk.z, p: r.mk.p, tau: r.mk.tau, varSAdj: r.mk.varSAdj, zAdj: r.mk.zAdj, pAdj: r.mk.pAdj },
    sen: { slope: r.sen.slope, intercept: r.sen.intercept, ciLow: r.sen.ciLow, ciHigh: r.sen.ciHigh },
    verdict: r.verdict
  };
});
process.stdout.write(JSON.stringify(out));
