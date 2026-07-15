(() => {
  "use strict";

  const solver = window.ScanwordSolver;
  if (!solver || solver.__constructionGuardInstalled) return;
  if (typeof require === "function" && typeof module !== "undefined") {
    if (!solver.__constructionClueTailInstalled) {
      try {
        require("./construction-clue-tail.js");
      } catch (error) {
        solver.__constructionClueTailLoadError = String(error?.stack || error);
      }
    }
    if (!solver.__constructionClueReflowInstalled) {
      try {
        require("./construction-clue-reflow.js");
      } catch (error) {
        solver.__constructionClueReflowLoadError = String(error?.stack || error);
      }
    }
    if (!solver.__constructionCluePairReflowInstalled) {
      try {
        require("./construction-clue-pair-reflow.js");
      } catch (error) {
        solver.__constructionCluePairReflowLoadError = String(error?.stack || error);
      }
    }
    if (!solver.__constructionTargetedTripleInstalled) {
      try {
        require("./construction-victim-targeted-triple.js");
      } catch (error) {
        solver.__constructionTargetedTripleLoadError = String(error?.stack || error);
      }
    }
  }
  const previousGenerateBest = solver.generateBest.bind(solver);

  function modeFromEnvironment() {
    if (typeof process !== "undefined" && process?.env?.SCANWORD_CONSTRUCTION_MODE) {
      return process.env.SCANWORD_CONSTRUCTION_MODE;
    }
    return window.SCANWORD_CONSTRUCTION_MODE || "legacy";
  }

  function setMode(value) {
    if (typeof process !== "undefined" && process?.env) process.env.SCANWORD_CONSTRUCTION_MODE = value;
    else window.SCANWORD_CONSTRUCTION_MODE = value;
  }

  function weakFillCount(result) {
    const poolByAnswer = new Map((result.pool || []).map((entry) => [entry.answer, entry]));
    return result.placed.reduce((sum, word) => sum + Number(Boolean(poolByAnswer.get(word.answer)?.weakFill)), 0);
  }

  function compareResults(a, b) {
    if (a.panelCells !== b.panelCells) return a.panelCells - b.panelCells;
    if (a.letterCells !== b.letterCells) return b.letterCells - a.letterCells;
    const weakA = weakFillCount(a);
    const weakB = weakFillCount(b);
    if (weakA !== weakB) return weakA - weakB;
    if (a.clueTextCells !== b.clueTextCells) return a.clueTextCells - b.clueTextCells;
    if (a.intersections !== b.intersections) return b.intersections - a.intersections;
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    return 0;
  }

  solver.generateBest = (...args) => {
    const requestedMode = modeFromEnvironment();
    if (requestedMode !== "portfolio") return previousGenerateBest(...args);

    const portfolio = previousGenerateBest(...args);
    let legacy;
    try {
      setMode("legacy");
      legacy = previousGenerateBest(...args);
    } finally {
      setMode(requestedMode);
    }

    const selectedPortfolio = compareResults(portfolio, legacy) <= 0;
    const result = selectedPortfolio ? portfolio : legacy;
    result.constructionV2 = {
      ...(portfolio.constructionV2 || {}),
      baselineGuard: {
        selected: selectedPortfolio ? "portfolio" : "legacy",
        portfolioPanels: portfolio.panelCells,
        legacyPanels: legacy.panelCells,
        portfolioLetters: portfolio.letterCells,
        legacyLetters: legacy.letterCells,
        portfolioWeakFill: weakFillCount(portfolio),
        legacyWeakFill: weakFillCount(legacy),
      },
    };
    return result;
  };

  solver.__constructionGuardInstalled = true;
})();
