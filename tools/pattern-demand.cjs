"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const worker = path.join(__dirname, "pattern-demand-seed.cjs");
const runCount = Number.parseInt(process.env.RUN_COUNT || "20", 10);
const prefix = process.env.SEED_PREFIX || "pattern-demand";
const aggregate = new Map();
const samples = [];

for (let index = 0; index < runCount; index += 1) {
  const seed = `${prefix}-${index}`;
  const child = spawnSync(process.execPath, [worker, seed], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Pattern worker failed for ${seed}: ${child.stderr || child.stdout}`);
  const sample = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  samples.push(sample);
  for (const demand of sample.demands) {
    const key = `${demand.direction}:${demand.pattern}`;
    const current = aggregate.get(key) || {
      direction: demand.direction,
      pattern: demand.pattern,
      length: demand.length,
      occurrences: 0,
      panelOpportunity: 0,
      zeroMatchOccurrences: 0,
      minimumMatches: Infinity,
      examples: new Set(),
    };
    current.occurrences += 1;
    current.panelOpportunity += demand.panels;
    if (demand.matches === 0) current.zeroMatchOccurrences += 1;
    current.minimumMatches = Math.min(current.minimumMatches, demand.matches);
    demand.examples.forEach((entry) => current.examples.add(entry));
    aggregate.set(key, current);
  }
  console.log(`${seed}: ${sample.panelCells} panels, ${sample.demands.length} scarce placement patterns`);
}

const ranked = [...aggregate.values()].map((item) => ({
  direction: item.direction,
  pattern: item.pattern,
  length: item.length,
  occurrences: item.occurrences,
  panelOpportunity: item.panelOpportunity,
  zeroMatchOccurrences: item.zeroMatchOccurrences,
  minimumMatches: item.minimumMatches,
  examples: [...item.examples].slice(0, 8).join(", "),
  score: item.panelOpportunity * 10 + item.zeroMatchOccurrences * 25 + item.occurrences,
})).sort((a, b) => b.score - a.score || b.panelOpportunity - a.panelOpportunity || a.pattern.localeCompare(b.pattern));

console.table(ranked.slice(0, 30));
const average = (values) => +(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2);
console.log({
  runs: samples.length,
  averagePanels: average(samples.map((sample) => sample.panelCells)),
  distinctScarcePatterns: ranked.length,
  zeroMatchPatternFamilies: ranked.filter((item) => item.zeroMatchOccurrences > 0).length,
});
