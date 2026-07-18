(() => {
  "use strict";

  window.RUSSIAN_LEXICAL_META = { ...(window.RUSSIAN_LEXICAL_META || {}) };
  for (const word of window.TWO_LETTER_WORDS || []) {
    const key = String(word).toLowerCase().replaceAll("ё", "е");
    window.RUSSIAN_LEXICAL_META[key] = {
      lexicalQuality: 42,
      weakFill: true,
      source: "reviewed-two-letter-fill",
    };
  }
})();
