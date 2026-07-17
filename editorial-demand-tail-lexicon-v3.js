(() => {
  "use strict";

  const normalize = (value) => String(value || "").trim().toUpperCase().replaceAll("Ё", "Е");
  const RAW_ENTRIES = Object.freeze([
    ["МЫ", "Личное местоимение первого лица множественного числа", 82],
    ["МУ", "Передача коровьего мычания", 72],
    ["ГАРАНТ", "Тот, кто обеспечивает выполнение обязательств", 90],
    ["ГАРАЖИ", "Помещения для хранения автомобилей", 82],
    ["ГОРАЛЫ", "Азиатские горные козлы", 74],
    ["ПЕТУХ", "Самец домашней курицы", 90],
    ["МАТРОС", "Рядовой служащий морского флота", 90],
    ["ЦИТРУС", "Растение, дающее лимоны, апельсины или мандарины", 88],
    ["КОМПАС", "Прибор для определения сторон света", 90],
    ["КАРКАС", "Несущая основа сооружения или изделия", 90],
    ["КОСМОС", "Пространство за пределами земной атмосферы", 90],
    ["КАКТУС", "Колючее растение, запасающее влагу", 90],
    ["СТАТУС", "Правовое или общественное положение", 90],
    ["АНАНАС", "Тропический плод с жёсткой кожурой и хохолком", 90],
    ["ПАТРОН", "Боеприпас для стрелкового оружия или покровитель", 86],
    ["КАТРАН", "Колючая акула или пряное растение", 82],
    ["НИЗ", "Нижняя часть предмета или пространства", 88],
    ["НЕТ", "Слово отрицательного ответа", 86],
    ["НЮХ", "Способность различать запахи", 84],
    ["ПЕРО", "Роговое образование, покрывающее тело птицы", 90],
    ["ПИВО", "Слабоалкогольный напиток из солода и хмеля", 82],
    ["СЕЛО", "Крупный сельский населённый пункт", 88],
    ["БЮРО", "Учреждение, контора или письменный стол", 88],
    ["МЯСО", "Пищевая мышечная ткань животного", 90],
    ["РОСА", "Капли влаги на поверхности после охлаждения воздуха", 90],
    ["ВЕСЫ", "Прибор для определения массы", 90],
    ["ОДНО", "Форма среднего рода числительного один", 78],
    ["МАТРАС", "Мягкая подстилка для кровати", 90],
    ["ДВОРЕЦ", "Большое парадное здание", 90],
    ["РУЛОН", "Материал, свёрнутый в цилиндр", 88],
  ]);

  const ENTRIES = Object.freeze(RAW_ENTRIES.map(([answer, clue, lexicalQuality]) => Object.freeze({
    id: `editorial-demand-tail-v3:${normalize(answer)}`,
    answer: normalize(answer),
    clue,
    hasExactClue: true,
    weakFill: false,
    lexicalQuality,
    lexicalSource: "editorial-demand-tail-lexicon-v3",
  })));

  function extendPool(result) {
    if (!result || !Array.isArray(result.pool)) return result;
    const existing = new Set(result.pool.map((entry) => normalize(entry?.answer)));
    const added = [];
    let skippedDuplicateEntries = 0;
    for (const entry of ENTRIES) {
      if (existing.has(entry.answer)) {
        skippedDuplicateEntries += 1;
        continue;
      }
      existing.add(entry.answer);
      added.push({ ...entry });
    }
    if (added.length) result.pool.push(...added);
    result.constructionV2 = {
      ...(result.constructionV2 || {}),
      editorialDemandTailLexicon: {
        mode: "repair-only-demand-tail-lexicon-v3",
        availableEntries: ENTRIES.length,
        addedEntries: added.length,
        skippedDuplicateEntries,
      },
    };
    return result;
  }

  window.ScanwordEditorialDemandTailLexiconV3 = Object.freeze({ entries: ENTRIES, extendPool });
})();
