(() => {
  "use strict";

  if (window.ScanwordClosedFill && window.ScanwordSolver?.attachValidationReport) {
    window.ScanwordClosedFill.attachValidationReport = window.ScanwordSolver.attachValidationReport;
  }
})();
