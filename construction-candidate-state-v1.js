(() => {
  "use strict";

  if (window.ScanwordCandidateStateV1) return;

  function cloneValue(value, seen = new Map()) {
    if (value == null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof Set) {
      const copy = new Set();
      seen.set(value, copy);
      for (const item of value) copy.add(cloneValue(item, seen));
      return copy;
    }
    if (value instanceof Map) {
      const copy = new Map();
      seen.set(value, copy);
      for (const [key, item] of value) copy.set(cloneValue(key, seen), cloneValue(item, seen));
      return copy;
    }
    if (Array.isArray(value)) {
      const copy = [];
      seen.set(value, copy);
      for (const item of value) copy.push(cloneValue(item, seen));
      return copy;
    }
    const copy = {};
    seen.set(value, copy);
    for (const [key, item] of Object.entries(value)) copy[key] = cloneValue(item, seen);
    return copy;
  }

  function stableValue(value, seen = new Set()) {
    if (value == null || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    let normalized;
    if (value instanceof Set) {
      normalized = [...value].map((item) => stableValue(item, seen)).sort(compareStable);
    } else if (value instanceof Map) {
      normalized = [...value.entries()]
        .map(([key, item]) => [stableValue(key, seen), stableValue(item, seen)])
        .sort(compareStable);
    } else if (Array.isArray(value)) {
      normalized = value.map((item) => stableValue(item, seen));
    } else {
      normalized = {};
      for (const key of Object.keys(value).sort()) normalized[key] = stableValue(value[key], seen);
    }
    seen.delete(value);
    return normalized;
  }

  function compareStable(first, second) {
    return JSON.stringify(first).localeCompare(JSON.stringify(second));
  }

  function hashString(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function answerGraph(answers) {
    const graph = new Map();
    const byCell = new Map();
    for (const answer of answers || []) {
      graph.set(answer.id, new Set());
      for (const cell of answer.cells || []) {
        const key = `${cell.row}:${cell.col}`;
        if (!byCell.has(key)) byCell.set(key, []);
        byCell.get(key).push(answer.id);
      }
    }
    for (const ids of byCell.values()) {
      if (ids.length < 2) continue;
      for (const first of ids) {
        for (const second of ids) {
          if (first !== second) graph.get(first)?.add(second);
        }
      }
    }
    return graph;
  }

  function clueAnchors(grid) {
    const anchors = [];
    for (let row = 0; row < (grid || []).length; row += 1) {
      for (let col = 0; col < (grid[row] || []).length; col += 1) {
        const cell = grid[row][col];
        if (cell?.type !== "clue") continue;
        anchors.push({
          row,
          col,
          clues: (cell.clues || []).map((clue) => ({
            slotId: clue.slotId,
            direction: clue.direction,
            text: clue.text,
            answer: clue.answer,
          })),
        });
      }
    }
    return anchors;
  }

  function structuralMetrics(result) {
    return {
      valid: Boolean(result?.validation?.valid),
      components: Number(result?.components || 0),
      panels: Number(result?.panelCells || 0),
      answers: Number(result?.placed?.length || 0),
      crossings: Number(result?.intersections || 0),
      activeCoverage: Number(result?.fillRatio || 0),
      answerCoverage: Number(result?.answerCoverage || 0),
      rawLetterCoverage: Number(result?.rawLetterCoverage || 0),
      exactCluesOnly: Boolean(result?.placed?.every((entry) => entry.hasExactClue)),
    };
  }

  function lexicalMetrics(result) {
    const policy = window.ScanwordEditorialLexicalPolicyV3;
    return typeof policy?.summarize === "function"
      ? cloneValue(policy.summarize(result?.placed || []))
      : {};
  }

  function residualRegions(result) {
    const extractor = window.ScanwordClosedFill?.extractResidualRegions;
    if (typeof extractor !== "function") return [];
    try {
      return cloneValue(extractor(result) || []);
    } catch {
      return [];
    }
  }

  function create(result, context = {}) {
    if (!result?.grid || !Array.isArray(result.placed)) {
      throw new TypeError("CandidateState requires a legacy result with grid and placed answers");
    }
    const answers = result.placed;
    const provenance = {
      pipeline: "explicit-pipeline-v1",
      sourceStage: context.sourceStage || "legacy-production-generator",
      seed: context.seed ?? null,
      arguments: cloneValue(context.arguments || []),
      transitions: cloneValue(context.transitions || []),
    };
    const state = {
      schemaVersion: 1,
      rows: Number(result.rows || result.grid.length || 0),
      cols: Number(result.cols || result.grid[0]?.length || 0),
      grid: result.grid,
      answers,
      usedAnswers: new Set(answers.map((entry) => entry.answer)),
      answerGraph: answerGraph(answers),
      clueAnchors: clueAnchors(result.grid),
      clueFootprints: result.clueFootprints || [],
      residualRegions: residualRegions(result),
      sourcePool: result.pool || [],
      hotWorkingSet: result.pool || [],
      structuralMetrics: structuralMetrics(result),
      lexicalMetrics: lexicalMetrics(result),
      clueMetrics: cloneValue(result.constructionV2?.selectedGridClues || {}),
      provenance,
      budgets: {
        attemptBudget: Number(result.attemptBudget || 0),
        selectedAttempt: Number(result.attempt || 0),
        activePoolLimit: result.constructionV2?.vocabularyPortfolio?.selectedLimit || null,
      },
      result,
    };
    assertState(state);
    return state;
  }

  function assertState(state) {
    const required = [
      "rows", "cols", "grid", "answers", "usedAnswers", "answerGraph", "clueAnchors",
      "clueFootprints", "residualRegions", "sourcePool", "hotWorkingSet", "structuralMetrics",
      "lexicalMetrics", "clueMetrics", "provenance", "budgets", "result",
    ];
    for (const key of required) {
      if (!(key in (state || {}))) throw new TypeError(`CandidateState is missing ${key}`);
    }
    if (!(state.usedAnswers instanceof Set)) throw new TypeError("CandidateState.usedAnswers must be a Set");
    if (!(state.answerGraph instanceof Map)) throw new TypeError("CandidateState.answerGraph must be a Map");
    return state;
  }

  function transition(state, name, updates = {}) {
    assertState(state);
    const next = {
      ...state,
      ...updates,
      provenance: {
        ...state.provenance,
        ...(updates.provenance || {}),
        transitions: [
          ...(state.provenance.transitions || []),
          { name, at: Date.now() },
        ],
      },
    };
    assertState(next);
    return next;
  }

  function clone(state) {
    assertState(state);
    return cloneValue(state);
  }

  function signature(state) {
    assertState(state);
    const payload = {
      rows: state.rows,
      cols: state.cols,
      grid: state.grid,
      answers: state.answers,
      structuralMetrics: state.structuralMetrics,
      clueFootprints: state.clueFootprints,
    };
    return `candidate-v1:${hashString(JSON.stringify(stableValue(payload)))}`;
  }

  window.ScanwordCandidateStateV1 = {
    create,
    clone,
    transition,
    assert: assertState,
    signature,
    stableValue,
    cloneValue,
    toLegacyResult(state) {
      return assertState(state).result;
    },
  };
})();
