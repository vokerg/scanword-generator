(() => {
  "use strict";

  if (window.ScanwordConstructionPipelineTelemetryV1) return;

  function now() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function normalizeStates(value) {
    if (Array.isArray(value)) return value;
    return value == null ? [] : [value];
  }

  function signatures(states) {
    const stateApi = window.ScanwordCandidateStateV1;
    return normalizeStates(states).map((state) => stateApi.signature(state));
  }

  function create(context = {}) {
    const records = [];
    const started = now();

    function record(name, before, after, elapsedMs, status = "ok", details = {}) {
      const beforeStates = normalizeStates(before);
      const afterStates = normalizeStates(after);
      const item = {
        index: records.length,
        name,
        status,
        elapsedMs: +Number(elapsedMs || 0).toFixed(3),
        candidateCountBefore: beforeStates.length,
        candidateCountAfter: afterStates.length,
        signaturesBefore: signatures(beforeStates),
        signaturesAfter: signatures(afterStates),
        ...details,
      };
      records.push(item);
      return item;
    }

    function runSource(name, callback, details = {}) {
      const stageStarted = now();
      try {
        const result = callback();
        record(name, [], result, now() - stageStarted, "ok", details);
        return result;
      } catch (error) {
        record(name, [], [], now() - stageStarted, "error", {
          ...details,
          error: String(error?.message || error),
        });
        throw error;
      }
    }

    function runStage(name, input, callback, details = {}) {
      const stageStarted = now();
      try {
        const output = callback(input);
        record(name, input, output, now() - stageStarted, "ok", details);
        return output;
      } catch (error) {
        record(name, input, [], now() - stageStarted, "error", {
          ...details,
          error: String(error?.message || error),
        });
        throw error;
      }
    }

    function summary(extra = {}) {
      return {
        schemaVersion: 1,
        mode: "explicit-pipeline-v1",
        context: { ...context },
        stageCount: records.length,
        totalElapsedMs: +Number(now() - started).toFixed(3),
        stages: records.map((recordItem) => ({ ...recordItem })),
        ...extra,
      };
    }

    return { runSource, runStage, record, summary, records };
  }

  function attach(result, summary) {
    if (!result || typeof result !== "object") return result;
    result.constructionPipelineV1 = summary;
    return result;
  }

  window.ScanwordConstructionPipelineTelemetryV1 = { create, attach };
})();
