(() => {
  "use strict";

  const entries = [
    ["ад", "Место мучений в религиозных представлениях"],
    ["ар", "Мера площади в сто квадратных метров"],
    ["ас", "Выдающийся мастер своего дела"],
    ["го", "Древняя настольная игра на доске"],
    ["до", "Первая ступень музыкальной гаммы"],
    ["ёж", "Колючий лесной зверёк"],
    ["ил", "Мягкий осадок на дне водоёма"],
    ["ля", "Шестая ступень музыкальной гаммы"],
    ["ми", "Третья ступень музыкальной гаммы"],
    ["ом", "Единица электрического сопротивления"],
    ["па", "Отдельное движение в танце"],
    ["ре", "Вторая ступень музыкальной гаммы"],
    ["си", "Седьмая ступень музыкальной гаммы"],
    ["уж", "Неядовитая змея"],
    ["ум", "Способность мыслить"],
    ["ус", "Волос над верхней губой"],
    ["фа", "Четвёртая ступень музыкальной гаммы"],
    ["юг", "Сторона света"],
    ["яд", "Отравляющее вещество"],
    ["як", "Крупное горное животное"],
  ];

  window.RUSSIAN_WORDS.push(...entries.map(([word]) => word));
  window.RUSSIAN_CLUES = { ...(window.RUSSIAN_CLUES || {}) };
  for (const [word, clue] of entries) {
    window.RUSSIAN_CLUES[word.toLowerCase().replaceAll("ё", "е")] = clue;
  }
  window.TWO_LETTER_WORDS = entries.map(([word]) => word);

  // Browser paths load corpus chunks explicitly in index.html. Node research tools
  // load two-letter-words.js directly; the environment switch enables true A/B runs.
  const bulkDisabled = typeof process !== "undefined"
    && String(process?.env?.SCANWORD_BULK_LEXICON || "on").toLowerCase() === "off";
  if (typeof require === "function" && !bulkDisabled) {
    require("./bulk-lexicon-runtime.js");
    for (const file of [
      "ruwordnet-common-01.js",
      "ruwordnet-common-02.js",
      "ruwordnet-common-03.js",
      "ruwordnet-common-04.js",
      "ruwordnet-common-05.js",
      "ruwordnet-common-06.js",
      "proper-names-01.js",
      "geography-01.js",
      "geography-02.js",
    ]) require(`./bulk-lexicon/${file}`);
  }
})();
