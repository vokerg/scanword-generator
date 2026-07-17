(() => {
  "use strict";

  const DIRECTIONS = {
    right: { dr: 0, dc: 1, arrow: "→", label: "вправо" },
    down: { dr: 1, dc: 0, arrow: "↓", label: "вниз" },
  };

  function xmur3(value) {
    let h = 1779033703 ^ value.length;
    for (let i = 0; i < value.length; i += 1) {
      h = Math.imul(h ^ value.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(seed) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRandom(seedText) {
    return mulberry32(xmur3(seedText)());
  }

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function normalizeWord(value) {
    return String(value).trim().toUpperCase().replaceAll("Ё", "Е");
  }

  function environmentOption(name, fallback) {
    const raw = typeof process !== "undefined" ? process?.env?.[name] : window[name];
    return raw == null || raw === "" ? fallback : raw;
  }

  function numericOption(name, fallback) {
    const value = Number(environmentOption(name, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  function lexicalMetadata(answer) {
    const key = answer.toLowerCase().replaceAll("ё", "е");
    return window.RUSSIAN_LEXICAL_META?.[key] || {};
  }

  function lexicalCategory(entry) {
    return lexicalMetadata(entry.answer).category || "core-reviewed";
  }

  function categoryPreference(category) {
    if (category === "common-noun") return 8;
    if (category === "country") return 4;
    if (category === "capital") return 3;
    if (category === "specialist-noun") return 0;
    if (category === "given-name") return -2;
    if (category === "city") return -4;
    if (category === "surname" || category === "patronymic") return -5;
    return 4;
  }

  function rankBucket(entries, random) {
    return entries.map((entry) => {
      const metadata = lexicalMetadata(entry.answer);
      const quality = Number(metadata.lexicalQuality || (entry.answer.length >= 4 ? 80 : 68));
      const category = metadata.category || null;
      return {
        entry,
        rank: quality + categoryPreference(category) + random() * 18,
      };
    }).sort((a, b) => b.rank - a.rank || a.entry.answer.localeCompare(b.entry.answer));
  }

  function categoryBalanceEnabled() {
    return String(environmentOption("SCANWORD_CATEGORY_BALANCE", "off")).toLowerCase() === "on";
  }

  function categoryCap(category, limit) {
    const shares = {
      "specialist-noun": 0.35,
      "given-name": 0.06,
      surname: 0.03,
      patronymic: 0.01,
      city: 0.05,
      capital: 0.012,
      country: 0.012,
    };
    return shares[category] == null ? Infinity : Math.max(8, Math.ceil(limit * shares[category]));
  }

  function selectBalancedWorkingSet(entries, requestedCount, random) {
    const total = entries.length;
    const defaultLimit = total > 5000 ? 5000 : total;
    const limit = Math.min(requestedCount, total, numericOption("SCANWORD_ACTIVE_POOL_LIMIT", defaultLimit));
    if (total <= limit) return shuffle(entries, random);

    const shares = new Map([
      [2, 0.04], [3, 0.15], [4, 0.18], [5, 0.21], [6, 0.18],
      [7, 0.13], [8, 0.07], [9, 0.025], [10, 0.012], [11, 0.006], [12, 0.003],
    ]);
    const byLength = new Map();
    for (const entry of entries) {
      const length = entry.answer.length;
      if (!byLength.has(length)) byLength.set(length, []);
      byLength.get(length).push(entry);
    }

    const balanceCategories = categoryBalanceEnabled();
    const selected = [];
    const selectedAnswers = new Set();
    const categoryCounts = new Map();

    function addEntry(entry, bypassCategoryCap = false) {
      if (selectedAnswers.has(entry.answer)) return false;
      const category = lexicalCategory(entry);
      if (balanceCategories && !bypassCategoryCap) {
        const count = categoryCounts.get(category) || 0;
        if (count >= categoryCap(category, limit)) return false;
      }
      selected.push(entry);
      selectedAnswers.add(entry.answer);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      return true;
    }

    for (let length = 2; length <= 12; length += 1) {
      const bucket = rankBucket(byLength.get(length) || [], random);
      let quota = Math.floor(limit * (shares.get(length) || 0));
      if (length === 2 || length === 3) quota = Math.max(quota, bucket.length);
      let added = 0;
      for (const item of bucket) {
        if (addEntry(item.entry, length <= 3)) added += 1;
        if (added >= Math.min(quota, bucket.length)) break;
      }
    }

    if (selected.length < limit) {
      const remainder = rankBucket(entries.filter((entry) => !selectedAnswers.has(entry.answer)), random);
      for (const item of remainder) {
        addEntry(item.entry, false);
        if (selected.length >= limit) break;
      }
    }

    // Category caps are editorial preferences, not hard feasibility constraints.
    if (selected.length < limit) {
      const relaxed = rankBucket(entries.filter((entry) => !selectedAnswers.has(entry.answer)), random);
      for (const item of relaxed) {
        addEntry(item.entry, true);
        if (selected.length >= limit) break;
      }
    }

    const result = shuffle(selected.slice(0, limit), random).map((entry, index) => ({ ...entry, id: index + 1 }));
    window.SCANWORD_LAST_POOL_SELECTION = {
      sourceEntries: total,
      requestedCount,
      activeEntries: result.length,
      categoryBalance: balanceCategories ? "on" : "off",
      lengths: Object.fromEntries([...new Set(result.map((entry) => entry.answer.length))]
        .sort((a, b) => a - b)
        .map((length) => [length, result.filter((entry) => entry.answer.length === length).length])),
      categories: Object.fromEntries([...new Set(result.map(lexicalCategory))]
        .sort()
        .map((category) => [category, result.filter((entry) => lexicalCategory(entry) === category).length])),
    };
    return result;
  }

  function generateWordPool(count, random) {
    const source = Array.isArray(window.RUSSIAN_WORDS) ? window.RUSSIAN_WORDS : [];
    const clues = window.RUSSIAN_CLUES || {};
    const unique = [];
    const seen = new Set();

    for (const rawWord of source) {
      const answer = normalizeWord(rawWord);
      if (!/^[А-Я]+$/.test(answer) || answer.length < 2 || answer.length > 12 || seen.has(answer)) continue;

      seen.add(answer);
      const key = String(rawWord).trim().toLowerCase().replaceAll("ё", "е");
      const exactClue = clues[key];
      unique.push({
        id: unique.length + 1,
        answer,
        clue: exactClue || `Ответ из ${answer.length} букв`,
        hasExactClue: Boolean(exactClue),
      });
    }

    const exact = unique.filter((entry) => entry.hasExactClue);
    const fallback = unique.filter((entry) => !entry.hasExactClue);
    const requested = Math.min(count, unique.length);
    if (exact.length > 5000) return selectBalancedWorkingSet(exact, requested, random);
    return [...shuffle(exact, random), ...shuffle(fallback, random)].slice(0, requested);
  }

  function createMask(rows, cols, random, densityPercent) {
    const mask = Array.from({ length: rows }, () => Array(cols).fill(false));
    const density = Math.max(0.16, Math.min(0.34, densityPercent / 100));
    const averageGap = Math.max(3, Math.min(7, Math.round(1 / density) - 1));

    for (let row = 0; row < rows; row += 1) {
      let col = row === 0 || random() < 0.56 ? 0 : randomInt(random, 1, Math.min(3, cols - 1));
      while (col < cols) {
        mask[row][col] = true;
        col += randomInt(random, Math.max(4, averageGap), Math.min(8, averageGap + 3));
      }

      const lastClue = mask[row].lastIndexOf(true);
      if (lastClue >= 0 && cols - lastClue - 1 > 10) {
        mask[row][lastClue + randomInt(random, 5, 8)] = true;
      }
    }

    for (let col = 0; col < cols; col += 1) {
      if (!mask[0][col] && random() < 0.3) mask[0][col] = true;
    }

    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        if (mask[row][col] && mask[row + 1][col] && mask[row][col + 1] && mask[row + 1][col + 1]) {
          const choices = [[row, col], [row + 1, col], [row, col + 1], [row + 1, col + 1]];
          const [clearRow, clearCol] = choices[randomInt(random, 0, choices.length - 1)];
          mask[clearRow][clearCol] = false;
        }
      }
    }

    return mask;
  }

  function slotCells(mask, clueRow, clueCol, direction) {
    const rows = mask.length;
    const cols = mask[0].length;
    const { dr, dc } = DIRECTIONS[direction];
    const cells = [];
    let row = clueRow + dr;
    let col = clueCol + dc;

    while (row >= 0 && row < rows && col >= 0 && col < cols && !mask[row][col]) {
      cells.push({ row, col });
      row += dr;
      col += dc;
    }
    return cells;
  }

  function extractSlots(mask, availableLengths) {
    const rows = mask.length;
    const cols = mask[0].length;
    const slots = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!mask[row][col]) continue;
        for (const direction of ["right", "down"]) {
          const cells = slotCells(mask, row, col, direction);
          if (cells.length < 3 || cells.length > 12 || !availableLengths.has(cells.length)) continue;
          slots.push({
            id: slots.length + 1,
            clueRow: row,
            clueCol: col,
            direction,
            cells,
            length: cells.length,
            crossings: [],
          });
        }
      }
    }

    const usage = new Map();
    slots.forEach((slot, slotIndex) => {
      slot.cells.forEach((cell, position) => {
        const key = `${cell.row}:${cell.col}`;
        if (!usage.has(key)) usage.set(key, []);
        usage.get(key).push({ slotIndex, position });
      });
    });

    for (const refs of usage.values()) {
      if (refs.length < 2) continue;
      for (let a = 0; a < refs.length; a += 1) {
        for (let b = a + 1; b < refs.length; b += 1) {
          const first = refs[a];
          const second = refs[b];
          slots[first.slotIndex].crossings.push({ otherSlotId: slots[second.slotIndex].id, ownPosition: first.position, otherPosition: second.position });
          slots[second.slotIndex].crossings.push({ otherSlotId: slots[first.slotIndex].id, ownPosition: second.position, otherPosition: first.position });
        }
      }
    }

    return slots;
  }

  window.ScanwordCore = { DIRECTIONS, makeRandom, randomInt, shuffle, normalizeWord, generateWordPool, createMask, extractSlots };
})();
