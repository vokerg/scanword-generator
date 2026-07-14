"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const reportPath = path.resolve(process.argv[2] || "construction-v2-report.jsonl");
const outputDir = path.resolve(process.argv[3] || "construction-visuals");
if (!fs.existsSync(reportPath)) throw new Error(`Report not found: ${reportPath}`);
fs.mkdirSync(outputDir, { recursive: true });

global.window = global;
for (const file of [
  "words.js", "short-words.js", "clues.js", "extra-dictionary.js", "two-letter-words.js",
  "core.js", "dictionary-policy.js", "lexical-policy-v2.js", "solver.js", "closed-fill.js",
  "closed-fill-rollback.js", "construction-v2-runtime.js", "construction-v2.js",
  "construction-victim.js", "construction-victim-depth2.js", "construction-portfolio.js",
  "construction-polish.js", "construction-clue-repack.js", "construction-clue-adaptive.js",
  "construction-clue-tail.js", "construction-clue-reflow.js", "construction-clue-pair-reflow.js",
  "targeted-short-fill.js", "construction-victim-targeted.js", "construction-victim-targeted-demand.js",
  "construction-victim-targeted-pair.js", "construction-victim-targeted-exact.js",
  "construction-guard.js", "renderer.js",
]) require(path.join(root, file));

const rows = fs.readFileSync(reportPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const samples = rows.filter((row) => row.type === "seed");
const summary = rows.find((row) => row.type === "summary");
if (!samples.length || !summary) throw new Error("The report has no seed samples or summary.");

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const compactSeed = (seed) => seed.replace(/^construction-portfolio-/, "#");

function selectedSamples() {
  const exact = samples.filter((sample) => sample.targetedExactVictimAccepted)
    .sort((a, b) => b.targetedExactVictimGain - a.targetedExactVictimGain || a.v2Panels - b.v2Panels || a.seed.localeCompare(b.seed))[0];
  const targeted = samples.filter((sample) => sample.targetedVictimAccepted)
    .sort((a, b) => b.targetedVictimGain - a.targetedVictimGain || a.v2Panels - b.v2Panels || a.seed.localeCompare(b.seed))[0];
  const picks = [
    exact,
    targeted,
    [...samples].sort((a, b) => a.panelDelta - b.panelDelta || a.seed.localeCompare(b.seed))[0],
    [...samples].sort((a, b) => b.v2Panels - a.v2Panels || a.panelDelta - b.panelDelta || a.seed.localeCompare(b.seed))[0],
    [...samples].sort((a, b) => a.v2Panels - b.v2Panels || a.seed.localeCompare(b.seed))[Math.floor(samples.length / 2)],
  ].filter(Boolean);
  return [...new Map(picks.map((sample) => [sample.seed, sample])).values()];
}

function renderComparisonChart() {
  const width = 1160;
  const height = 520;
  const margin = { left: 58, right: 24, top: 62, bottom: 70 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(20, ...samples.flatMap((sample) => [sample.legacyPanels, sample.v2Panels]));
  const groupWidth = chartWidth / samples.length;
  const barWidth = Math.max(7, groupWidth * 0.29);
  const y = (value) => margin.top + chartHeight - (value / maxValue) * chartHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="18" fill="#fbfcfe"/>`,
    `<text x="${margin.left}" y="30" font-family="Arial" font-size="22" font-weight="700">Residual panels by deterministic seed</text>`,
    `<text x="${margin.left}" y="50" font-family="Arial" font-size="13" fill="#667085">Lower is better; dashed line is checkpoint target ≤ 8.</text>`,
  ];
  for (let tick = 0; tick <= maxValue; tick += 2) {
    const yy = y(tick);
    parts.push(`<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#e4e7ec"/>`);
    parts.push(`<text x="${margin.left - 10}" y="${yy + 4}" text-anchor="end" font-family="Arial" font-size="11" fill="#667085">${tick}</text>`);
  }
  const targetY = y(8);
  parts.push(`<line x1="${margin.left}" y1="${targetY}" x2="${width - margin.right}" y2="${targetY}" stroke="#d92d20" stroke-width="2" stroke-dasharray="7 6"/>`);
  samples.forEach((sample, index) => {
    const center = margin.left + groupWidth * (index + 0.5);
    for (const [offset, value, fill] of [[-barWidth - 2, sample.legacyPanels, "#98a2b3"], [2, sample.v2Panels, "#12b76a"]]) {
      const yy = y(value);
      parts.push(`<rect x="${(center + offset).toFixed(2)}" y="${yy.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + chartHeight - yy).toFixed(2)}" rx="3" fill="${fill}"/>`);
    }
    parts.push(`<text x="${center.toFixed(2)}" y="${height - 43}" text-anchor="middle" font-family="Arial" font-size="10" fill="#475467">${escapeXml(compactSeed(sample.seed))}</text>`);
  });
  parts.push("</svg>");
  return parts.join("");
}

function withMode(mode, callback) {
  const previous = process.env.SCANWORD_CONSTRUCTION_MODE;
  process.env.SCANWORD_CONSTRUCTION_MODE = mode;
  try { return callback(); }
  finally {
    if (previous === undefined) delete process.env.SCANWORD_CONSTRUCTION_MODE;
    else process.env.SCANWORD_CONSTRUCTION_MODE = previous;
  }
}

function generate(seed, mode) {
  return withMode(mode, () => window.ScanwordSolver.generateBest(seed, window.RUSSIAN_WORDS.length, 17, 13, 30, 27));
}

const chartName = "seed-panels.svg";
fs.writeFileSync(path.join(outputDir, chartName), renderComparisonChart());
const cards = [];
for (const sample of selectedSamples()) {
  const safe = sample.seed.replace(/[^a-z0-9_-]+/gi, "-");
  const legacy = generate(sample.seed, "legacy");
  const portfolio = generate(sample.seed, "portfolio");
  if (!legacy.validation?.valid || !portfolio.validation?.valid) throw new Error(`Invalid visual sample: ${sample.seed}`);
  const legacyName = `${safe}-legacy.svg`;
  const portfolioName = `${safe}-portfolio.svg`;
  fs.writeFileSync(path.join(outputDir, legacyName), window.ScanwordRenderer.renderSvg(legacy, true));
  fs.writeFileSync(path.join(outputDir, portfolioName), window.ScanwordRenderer.renderSvg(portfolio, true));
  cards.push({
    seed: sample.seed,
    legacyName,
    portfolioName,
    legacyPanels: legacy.panelCells,
    portfolioPanels: portfolio.panelCells,
    legacyLetters: legacy.letterCells,
    portfolioLetters: portfolio.letterCells,
    targetedAccepted: Boolean(portfolio.constructionV2?.targetedVictim?.accepted),
    targetedVictim: portfolio.constructionV2?.targetedVictim?.selected?.victimAnswer || null,
    targetedExactAccepted: Boolean(portfolio.constructionV2?.targetedExactVictim?.accepted),
    targetedExactVictim: portfolio.constructionV2?.targetedExactVictim?.selected?.victimAnswer || null,
    victimDepth: Number(portfolio.constructionV2?.selectedVictimReplacement?.depth || 0),
  });
}

const cardHtml = cards.map((card) => `<article class="card"><h2>${escapeXml(card.seed)}</h2><p>Панели ${card.legacyPanels} → ${card.portfolioPanels}; буквы ${card.legacyLetters} → ${card.portfolioLetters}; targeted ${card.targetedAccepted ? `принят (${escapeXml(card.targetedVictim || "—")})` : "не принят"}; targeted exact ${card.targetedExactAccepted ? `принят (${escapeXml(card.targetedExactVictim || "—")})` : "не принят"}; victim depth ${card.victimDepth}.</p><div class="pair"><div><h3>Legacy</h3><img src="${card.legacyName}"/></div><div><h3>Portfolio</h3><img src="${card.portfolioName}"/></div></div></article>`).join("");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Scanword construction visual checkpoint</title><style>body{font-family:Arial,sans-serif;background:#f2f4f7;margin:0;padding:24px;color:#172033}.shell{max-width:1320px;margin:auto}.hero,.card,.chart{background:white;border:1px solid #e4e7ec;border-radius:16px;padding:18px;margin-bottom:18px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{background:#f8fafc;padding:12px;border-radius:10px}.stat strong{display:block;font-size:24px}.chart img,.pair img{width:100%;height:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:800px){.stats,.pair{grid-template-columns:1fr}}</style></head><body><main class="shell"><section class="hero"><h1>Визуальный checkpoint генератора</h1><p>${escapeXml(summary.diagnostic)}</p><div class="stats"><div class="stat"><strong>${summary.averageLegacyPanels}</strong>legacy avg</div><div class="stat"><strong>${summary.averageV2Panels}</strong>portfolio avg</div><div class="stat"><strong>${summary.maximumV2Panels}</strong>portfolio max</div><div class="stat"><strong>${summary.improvedSeeds}/${summary.runs}</strong>improved</div></div></section><section class="chart"><img src="${chartName}"/></section>${cardHtml}</main></body></html>`;
fs.writeFileSync(path.join(outputDir, "index.html"), html);
fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify({ summary, cards }, null, 2));
console.log(JSON.stringify({ outputDir, chart: chartName, visualSeeds: cards.map((card) => card.seed), summary }));
