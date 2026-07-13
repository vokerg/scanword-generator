(() => {
  "use strict";

  const originalGenerateWordPool = window.ScanwordCore.generateWordPool;

  window.ScanwordCore.generateWordPool = function generateReviewedWordPool(count, random) {
    const allEntries = originalGenerateWordPool(window.RUSSIAN_WORDS.length, random);
    const reviewed = allEntries.filter((entry) => entry.hasExactClue);
    return reviewed.slice(0, Math.min(count, reviewed.length));
  };
})();
