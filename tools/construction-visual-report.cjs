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
  "words.js",
  "short-words.js",
  "clues.js",
  "extra-dictionary.js",
  "two-letter-words.js",
  "core.js",
  "dictionary-policy.js",
  "lexical-policy-v2.js",
  "solver.js",
  "closed-fill.js",
  "closed-fill-rollback.js",
  "construction-v2-runtime.js",
  "construction-v2.js",
  "construction-victim.js",
  "construction-victim-depth2.js",
  "construction-portfolio.js",
  "construction-polish.js",
  "construction-clue-repack.js",
  "construction-guard.js",
  "renderer.js",
]) require(path.join(root, file));

const rows = fs.readFileSync(reportPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const samples = rows.filter((row) => row.type === "seed");
const summary = rows.find((row) => row.type === "summary");
if (!samples.length || !summary) throw new Error("The report has no seed samples or summary.");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function compactSeed(seed) {
  return seed.replace(/^construction-portfolio-/, "#");
}

function selectedSamples() {
  const picks = [
    [...samples].sort((a, b) => a.panelDelta - b.panelDelta || a.seed.localeCompare(b.seed))[0],
    [...samples].sort((a, b) => b.v2Panels - a.v2Panels || a.panelDelta - b.panelDelta || a.seed.localeCompare(b.seed))[0],
    [...samples].sort((a, b) => a.v2Panels - b.v2Panels || a.seed.localeCompare(b.seed))[Math.floor(samples.length / 2)],
  ];
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Legacy and portfolio residual panels by seed">`,
    `<rect width="${width}" height="${height}" rx="18" fill="#fbfcfe"/>`,
    `<text x="${margin.left}" y="30" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#172033">Residual panels by deterministic seed</text>`,
    `<text x="${margin.left}" y="50" font-family="Arial, sans-serif" font-size="13" fill="#667085">Paired comparison. Lower is better; dashed line is checkpoint target ≤ 8.</text>`,
  ];
  for (let tick = 0; tick <= maxValue; tick += 2) {
    const yy = y(tick);
    parts.push(`<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#e4e7ec" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 10}" y="${yy + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#667085">${tick}</text>`);
  }
  const targetY = y(8);
  parts.push(`<line x1="${margin.left}" y1="${targetY}" x2="${width - margin.right}" y2="${targetY}" stroke="#d92d20" stroke-width="2" stroke-dasharray="7 6"/>`);
  parts.push(`<text x="${width - margin.right}" y="${targetY - 7}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#d92d20">target 8</text>`);

  samples.forEach((sample, index) => {
    const center = margin.left + groupWidth * (index + 0.5);
    const legacyX = center - barWidth - 2;
    const v2X = center + 2;
    const legacyY = y(sample.legacyPanels);
    const v2Y = y(sample.v2Panels);
    parts.push(`<rect x="${legacyX.toFixed(2)}" y="${legacyY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + chartHeight - legacyY).toFixed(2)}" rx="3" fill="#98a2b3"/>`);
    parts.push(`<rect x="${v2X.toFixed(2)}" y="${v2Y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(margin.top + chartHeight - v2Y).toFixed(2)}" rx="3" fill="#12b76a"/>`);
    parts.push(`<text x="${center.toFixed(2)}" y="${height - 43}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#475467">${escapeXml(compactSeed(sample.seed))}</text>`);
  });

  parts.push(`<rect x="${margin.left}" y="${height - 25}" width="12" height="12" rx="2" fill="#98a2b3"/><text x="${margin.left + 18}" y="${height - 15}" font-family="Arial, sans-serif" font-size="12" fill="#475467">legacy</text>`);
  parts.push(`<rect x="${margin.left + 88}" y="${height - 25}" width="12" height="12" rx="2" fill="#12b76a"/><text x="${margin.left + 106}" y="${height - 15}" font-family="Arial, sans-serif" font-size="12" fill="#475467">portfolio + victim + exact repack</text>`);
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
  return withMode(mode, () => window.ScanwordSolver.generateBest(
    seed,
    window.RUSSIAN_WORDS.length,
    17,
    13,
    30,
    27,
  ));
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
    repackAccepted: Boolean(portfolio.constructionV2?.clueRepack?.accepted),
    victimDepth: Number(portfolio.constructionV2?.selectedVictimReplacement?.depth || 0),
  });
}

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanword construction visual checkpoint</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#172033;background:#f2f4f7}body{margin:0;padding:28px}.shell{max-width:1320px;margin:auto}.hero,.card,.chart{background:#fff;border:1px solid #e4e7ec;border-radius:18px;box-shadow:0 8px 24px rgba(16,24,40,.06)}.hero{padding:24px 28px}.hero h1{margin:0 0 8px;font-size:28px}.hero p{margin:0;color:#667085}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.stat{padding:14px;background:#f8fafc;border-radius:12px}.stat strong{display:block;font-size:24px}.stat span{font-size:12px;color:#667085}.chart{margin-top:18px;padding:14px}.chart img{width:100%;height:auto;display:block}.grid{display:grid;gap:18px;margin-top:18px}.card{padding:18px}.card h2{margin:0 0 6px;font-size:19px}.meta{color:#667085;font-size:13px;margin-bottom:14px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel{background:#f8fafc;border-radius:14px;padding:10px}.panel h3{margin:0 0 8px;font-size:14px}.panel img{display:block;width:100%;max-height:620px;object-fit:contain;background:white;border-radius:8px}@media(max-width:800px){body{padding:12px}.stats,.pair{grid-template-columns:1fr}.hero{padding:18px}}
</style>
</head>
<body><main class="shell">
<section class="hero"><h1>Визуальный checkpoint генератора</h1><p>${escapeHtml(summary.diagnostic)}</p>
<div class="stats">
<div class="stat"><strong>${summary.averageLegacyPanels}</strong><span>средние панели legacy</span></div>
<div class="stat"><strong>${summary.averageV2Panels}</strong><span>средние панели нового режима</span></div>
<div class="stat"><strong>${summary.maximumV2Panels}</strong><span>максимум панелей</span></div>
<div class="stat"><strong>${summary.improvedSeeds}/${summary.runs}</strong><span>seed улучшены</span></div>
</div></section>
<section class="chart"><img src="${chartName}" alt="Сравнение числа остаточных панелей по seed"/></section>
<section class="grid">${cards.map((card) => `<article class="card"><h2>${escapeHtml(card.seed)}</h2><div class="meta">Панели ${card.legacyPanels} → ${card.portfolioPanels}; буквы ${card.legacyLetters} → ${card.portfolioLetters}; victim depth ${card.victimDepth}; repack ${card.repackAccepted ? "принят" : "не понадобился"}.</div><div class="pair"><div class="panel"><h3>Legacy</h3><img src="${card.legacyName}" alt="Legacy grid ${escapeHtml(card.seed)}"/></div><div class="panel"><h3>Portfolio / exact repack</h3><img src="${card.portfolioName}" alt="Portfolio grid ${escapeHtml(card.seed)}"/></div></div></article>`).join("")}</section>
</main></body></html>`;

fs.writeFileSync(path.join(outputDir, "index.html"), html);
fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify({ summary, cards }, null, 2));
console.log(JSON.stringify({ outputDir, chart: chartName, visualSeeds: cards.map((card) => card.seed), summary }));
