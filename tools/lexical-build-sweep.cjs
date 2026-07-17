"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const probePath = path.join(__dirname, "lexical-build-attempt-probe.cjs");
const seed = process.argv[2] || "lexical-build-sweep";
const attempts = Math.max(1, Number(process.argv[3]) || 40);

const configurations = [
  { name: "control", budget: 99, excess: 0, dense: 0, weak: 0, two: 0, three: 0, quality: 0 },
  { name: "b5-e18", budget: 5, excess: 18, dense: 0.65, weak: 12, two: 8, three: 4, quality: 0.25 },
  { name: "b5-e36", budget: 5, excess: 36, dense: 0.75, weak: 12, two: 8, three: 4, quality: 0.25 },
  { name: "b4-e24", budget: 4, excess: 24, dense: 0.75, weak: 12, two: 8, three: 4, quality: 0.25 },
  { name: "b4-e48", budget: 4, excess: 48, dense: 0.80, weak: 12, two: 8, three: 4, quality: 0.25 },
  { name: "b3-e36", budget: 3, excess: 36, dense: 0.75, weak: 12, two: 8, three: 4, quality: 0.25 },
  { name: "b3-e72", budget: 3, excess: 72, dense: 1.00, weak: 12, two: 8, three: 4, quality: 0.25 },
];

function runConfiguration(configuration) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SCANWORD_WEAK_PLACEMENT_PENALTY: String(configuration.weak),
      SCANWORD_TWO_LETTER_PLACEMENT_PENALTY: String(configuration.two),
      SCANWORD_THREE_LETTER_PLACEMENT_PENALTY: String(configuration.three),
      SCANWORD_LEXICAL_QUALITY_PENALTY: String(configuration.quality),
      SCANWORD_GROWTH_LEXICAL_MULTIPLIER: "0",
      SCANWORD_DENSE_LEXICAL_MULTIPLIER: String(configuration.dense),
      SCANWORD_TWO_LETTER_DENSE_BUDGET: String(configuration.budget),
      SCANWORD_TWO_LETTER_EXCESS_PENALTY: String(configuration.excess),
      SCANWORD_LENGTH_PLACEMENT_BONUS: "0",
    };
    const child = spawn(process.execPath, [probePath, seed, String(attempts)], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out: ${configuration.name}`));
    }, 360_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${configuration.name} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const payload = JSON.parse(line);
        resolve({ configuration, payload });
      } catch (error) {
        reject(new Error(`${configuration.name}: ${error.message}`));
      }
    });
  });
}

function finiteOrInfinity(value) {
  return Number.isFinite(Number(value)) ? Number(value) : Infinity;
}

(async () => {
  try {
    const results = [];
    for (const configuration of configurations) {
      const result = await runConfiguration(configuration);
      const baseline = result.payload.baseline;
      const lexical = result.payload.lexical;
      const compact = {
        type: "configuration",
        name: configuration.name,
        parameters: configuration,
        baseline: {
          passed: baseline.passed,
          passingAverageWeak: baseline.passingAverageWeak,
          passingMinimumWeak: baseline.passingMinimumWeak,
          passingAveragePanels: baseline.passingAveragePanels,
          passingAverageAnswers: baseline.passingAverageAnswers,
        },
        lexical: {
          passed: lexical.passed,
          passingAverageWeak: lexical.passingAverageWeak,
          passingMinimumWeak: lexical.passingMinimumWeak,
          passingMaximumWeak: lexical.passingMaximumWeak,
          passingAveragePanels: lexical.passingAveragePanels,
          passingMinimumPanels: lexical.passingMinimumPanels,
          passingAverageAnswers: lexical.passingAverageAnswers,
          allAttemptAverageWeak: lexical.averageWeak,
          allAttemptAverageAnswers: lexical.averageAnswers,
          bestPassingLexical: lexical.bestPassingLexical,
        },
        delta: {
          passed: lexical.passed - baseline.passed,
          passingAverageWeak: lexical.passingAverageWeak == null || baseline.passingAverageWeak == null
            ? null
            : +(lexical.passingAverageWeak - baseline.passingAverageWeak).toFixed(2),
          passingAveragePanels: lexical.passingAveragePanels == null || baseline.passingAveragePanels == null
            ? null
            : +(lexical.passingAveragePanels - baseline.passingAveragePanels).toFixed(2),
          passingAverageAnswers: lexical.passingAverageAnswers == null || baseline.passingAverageAnswers == null
            ? null
            : +(lexical.passingAverageAnswers - baseline.passingAverageAnswers).toFixed(2),
        },
      };
      results.push(compact);
      console.log(JSON.stringify(compact));
    }

    const baselinePassed = results[0]?.baseline?.passed || 0;
    const viable = results
      .filter((result) => result.name !== "control")
      .filter((result) => result.lexical.passed >= baselinePassed)
      .filter((result) => result.lexical.passingAverageWeak != null)
      .sort((a, b) =>
        finiteOrInfinity(a.lexical.passingAverageWeak) - finiteOrInfinity(b.lexical.passingAverageWeak)
        || finiteOrInfinity(a.lexical.passingAveragePanels) - finiteOrInfinity(b.lexical.passingAveragePanels)
        || finiteOrInfinity(b.lexical.passingAverageAnswers) - finiteOrInfinity(a.lexical.passingAverageAnswers)
        || a.name.localeCompare(b.name));
    const best = viable[0] || null;
    console.log(JSON.stringify({
      type: "summary",
      seed,
      attempts,
      configurations: configurations.length,
      baselinePassed,
      viableConfigurations: viable.length,
      best,
      recommendation: best && Number(best.delta.passingAverageWeak) < 0
        ? "run-full-paired-gate"
        : "replace-local-penalty-with-frontier-search",
    }));
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
})();
