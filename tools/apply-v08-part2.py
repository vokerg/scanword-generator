from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)

# renderer.js
path = ROOT / "renderer.js"
text = path.read_text(encoding="utf-8")
start = text.index("  function renderClueContent")
end = text.index("\n  function renderPanel", start)
renderer_block = r'''  function renderClueTextCell(data, x, y, cell) {
    const clue = data.clues[0];
    const fontSize = Math.max(1.15, cell * 0.155);
    const maxChars = Math.max(7, Math.floor(cell / (fontSize * 0.52)));
    const lines = wrapText(clue.text, maxChars, 5);
    const totalHeight = Math.max(1, lines.length) * fontSize * 1.04;
    const startY = y + Math.max(fontSize, (cell - totalHeight) / 2 + fontSize * 0.72);
    return svgTextLines(lines, x + cell * 0.5, startY, fontSize, fontSize * 1.04);
  }

  function renderArrowOnly(x, y, cell, clues) {
    if (clues.length === 1) {
      const clue = clues[0];
      const stroke = Math.max(0.22, cell * 0.032).toFixed(3);
      if (clue.direction === "right") {
        return `<path d="M ${(x + cell * 0.12).toFixed(3)} ${(y + cell * 0.84).toFixed(3)} L ${(x + cell * 0.42).toFixed(3)} ${(y + cell * 0.54).toFixed(3)} L ${(x + cell * 0.88).toFixed(3)} ${(y + cell * 0.54).toFixed(3)}" fill="none" stroke="#111" stroke-width="${stroke}" marker-end="url(#arrowhead)"/>`;
      }
      return `<path d="M ${(x + cell * 0.14).toFixed(3)} ${(y + cell * 0.18).toFixed(3)} L ${(x + cell * 0.50).toFixed(3)} ${(y + cell * 0.18).toFixed(3)} L ${(x + cell * 0.50).toFixed(3)} ${(y + cell * 0.88).toFixed(3)}" fill="none" stroke="#111" stroke-width="${stroke}" marker-end="url(#arrowhead)"/>`;
    }
    const diagonal = `<path d="M ${(x + cell * 0.08).toFixed(3)} ${(y + cell * 0.92).toFixed(3)} L ${(x + cell * 0.92).toFixed(3)} ${(y + cell * 0.08).toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.18, cell * 0.025).toFixed(3)}"/>`;
    return `${diagonal}${renderArrow(x, y, cell, "right", true)}${renderArrow(x, y, cell, "down", true)}`;
  }

  function renderClueContent(data, x, y, cell) {
    if (!data.clues.length) return "";
    const external = data.clues.filter((clue) => clue.externalText);
    const internal = data.clues.filter((clue) => !clue.externalText);
    if (!internal.length) return renderArrowOnly(x, y, cell, external);
    if (!external.length) {
      if (data.clues.length === 1) {
        const clue = data.clues[0];
        const fontSize = Math.max(1.2, cell * 0.165);
        const lines = wrapText(clue.text, Math.max(7, Math.floor(cell / (fontSize * 0.52))), 4);
        return `${svgTextLines(lines, x + cell * 0.48, y + cell * 0.18, fontSize, fontSize * 1.08)}${renderArrow(x, y, cell, clue.direction)}`;
      }
      const rightClue = data.clues.find((clue) => clue.direction === "right") || data.clues[0];
      const downClue = data.clues.find((clue) => clue.direction === "down") || data.clues[1];
      const fontSize = Math.max(0.98, cell * 0.112);
      const diagonal = `<path d="M ${x.toFixed(3)} ${(y + cell).toFixed(3)} L ${(x + cell).toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.16, cell * 0.02).toFixed(3)}"/>`;
      return `${diagonal}${svgTextLines(wrapText(rightClue.text, 9, 3), x + cell * 0.35, y + cell * 0.12, fontSize, fontSize)}${svgTextLines(wrapText(downClue.text, 9, 3), x + cell * 0.65, y + cell * 0.61, fontSize, fontSize)}${renderArrow(x, y, cell, "right", true)}${renderArrow(x, y, cell, "down", true)}`;
    }
    const clue = internal[0];
    const fontSize = Math.max(0.95, cell * 0.112);
    const lines = wrapText(clue.text, 9, 3);
    const textX = clue.direction === "right" ? x + cell * 0.35 : x + cell * 0.65;
    const textY = clue.direction === "right" ? y + cell * 0.13 : y + cell * 0.61;
    const diagonal = `<path d="M ${x.toFixed(3)} ${(y + cell).toFixed(3)} L ${(x + cell).toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.16, cell * 0.02).toFixed(3)}"/>`;
    const arrows = data.clues.map((item) => renderArrow(x, y, cell, item.direction, true)).join("");
    return `${diagonal}${svgTextLines(lines, textX, textY, fontSize, fontSize)}${arrows}`;
  }
'''
text = text[:start] + renderer_block + text[end:]
text = replace_once(
    text,
    '        const fill = data.type === "clue" ? "#e4e4e4" : data.type === "panel" ? "#d2d2d2" : "#fff";',
    '        const fill = data.type === "clue" || data.type === "clueText" ? "#f1f1f1" : data.type === "panel" ? "#d2d2d2" : "#fff";',
    "renderer fills",
)
text = replace_once(
    text,
    '        if (data.type === "panel") parts.push(renderPanel(x, y, cell, row, col));',
    '        if (data.type === "panel") parts.push(renderPanel(x, y, cell, row, col));\n        if (data.type === "clueText") parts.push(renderClueTextCell(data, x, y, cell));',
    "renderer clue text cells",
)
path.write_text(text, encoding="utf-8")

# ui.js
path = ROOT / "ui.js"
text = path.read_text(encoding="utf-8")
text = replace_once(text, '[result.panelCells, "panel cells"],\n      [result.validation?.accidentalRuns?.length || 0, "accidental runs"],', '[result.clueTextCells || 0, "split clue cells"],\n      [result.panelCells, "residual panels"],\n      [result.components, "answer groups"],\n      [result.validation?.accidentalRuns?.length || 0, "accidental runs"],', "UI stats")
text = replace_once(text, 'version: "0.7.0"', 'version: "0.8.0"', "UI version")
text = replace_once(text, '        components: result.components,\n      },', '        components: result.components,\n        externalClueTexts: result.externalClueTexts || 0,\n        clueTextCells: result.clueTextCells || 0,\n        panelRegions: result.panelRegions || 0,\n        isolatedPanels: result.isolatedPanels || 0,\n      },', "UI export metrics")
text = replace_once(text, '        els.generationStatus.textContent = `attempt ${currentResult.attempt + 1}/8 · valid · ${currentResult.components} components · panels ${Math.round(currentResult.panelRatio * 100)}%`;', '        els.generationStatus.textContent = `attempt ${currentResult.attempt + 1}/12 · valid · ${currentResult.components} groups · active ${Math.round(currentResult.fillRatio * 100)}%`;', "UI status")
path.write_text(text, encoding="utf-8")

# index.html
path = ROOT / "index.html"
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'ARROWORD GENERATOR · R&amp;D 0.7', 'ARROWORD GENERATOR · R&amp;D 0.8', "index version")
text = replace_once(text, '        <p class="lead">\n          Builds a strict A5 arrowword from reviewed Russian answers, rejects every accidental\n          letter run, and continues filling the grid after the requested answer count is reached.\n        </p>', '        <p class="lead">\n          Separates clue text from arrow anchors, rejects accidental letter runs, and keeps\n          the densest valid A5 arrowword generated from reviewed Russian answers.\n        </p>', "index lead")
text = replace_once(text, 'value="arrowword-rnd-007"', 'value="arrowword-rnd-008"', "index seed")
text = replace_once(text, '        <div class="note">\n          <strong>Strict dense mode:</strong> eight seeded attempts are validated independently.\n          The engine may use several isolated answer groups to occupy otherwise dead regions, but\n          every horizontal and vertical letter run must still have its own clue.\n        </div>', '        <div class="note">\n          <strong>Split-clue topology:</strong> clue text occupies neighbouring cells where possible,\n          while arrow anchors remain attached to their exact answers. Twelve deterministic restarts\n          are scored only after every structural validation check passes.\n        </div>', "index note")
path.write_text(text, encoding="utf-8")

# benchmark
path = ROOT / "tools" / "benchmark.cjs"
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'if (result.components > 6)', 'if (result.components > 3)', "benchmark components")
text = replace_once(text, 'if (result.fillRatio < 0.65)', 'if (result.fillRatio < 0.78)', "benchmark coverage")
text = replace_once(text, '  if (result.placed.some((entry) => !entry.hasExactClue)) {\n    throw new Error(`Fallback clue used for seed ${seed}`);\n  }', '  if (result.externalClueTexts < 20) {\n    throw new Error(`Too few split clue footprints for seed ${seed}: ${result.externalClueTexts}`);\n  }\n  if (result.panelCells > 49) {\n    throw new Error(`Too many residual panel cells for seed ${seed}: ${result.panelCells}`);\n  }\n  if (result.placed.some((entry) => !entry.hasExactClue)) {\n    throw new Error(`Fallback clue used for seed ${seed}`);\n  }', "benchmark topology gates")
text = replace_once(text, '    components: result.components,\n    attempt: result.attempt + 1,', '    components: result.components,\n    clueTextCells: result.clueTextCells,\n    residualPanels: result.panelCells,\n    attempt: result.attempt + 1,', "benchmark output")
text = replace_once(text, 'maxComponentsAllowed: 6,', 'maxComponentsAllowed: 3,', "benchmark summary")
path.write_text(text, encoding="utf-8")

# README is replaced as a checkpoint document.
readme = '''# Arrowword Generator

A browser-based R&D prototype for generating Swedish-style crosswords (arrowwords / scanwords) on an A5 page.

## Current checkpoint

The `r-and-d/valid-arrowword-generator` branch contains version 0.8, a **split-clue topology engine**.

The generator:

- uses only Russian answers with reviewed, human-readable clues;
- includes reviewed two-letter and 3–12-letter answers;
- places answers algorithmically and validates every crossing;
- rejects accidental horizontal and vertical letter runs;
- supports right and down answers;
- supports one or two arrows in a shared arrow cell;
- moves clue text into neighbouring cells where space is available;
- keeps the original arrow cell attached to the exact answer start;
- uses no placeholder definitions or pseudo-words;
- exports an exact A5 SVG and a JSON project file;
- can reveal answers for visual validation.

## Why split clue cells matter

Printed arrowwords frequently devote one cell to clue text and an adjacent cell to the arrow anchor. Earlier checkpoints rendered clue text and the arrow inside one cell, leaving many unrelated panel cells elsewhere in the grid.

Version 0.8 performs a maximum matching pass after word placement:

1. each clue searches neighbouring unused cells;
2. clue-to-cell assignments are resolved without reusing a cell;
3. assigned cells become clue-text cells;
4. the original cell becomes an arrow anchor;
5. unmatched clues remain in compact combined cells.

This does not fake density. A converted cell contains a real clue linked to a real answer. The word layout and all crossing checks remain unchanged.

## Structural invariants

A generated grid is accepted only when:

1. Every contiguous letter run of length two or more is exactly one assigned answer.
2. Every letter cell belongs to at least one assigned answer.
3. Crossing letters agree.
4. An arrow cell contains at most one right arrow and one down arrow.
5. Every clue-text cell points to an existing arrow and answer.
6. Every used answer has a reviewed clue; placeholder clues are excluded.
7. Residual non-answer areas are explicit panel cells, never blank answer cells.

## Generation strategy

Version 0.8 is still word-first, but now has three phases:

1. reach the requested minimum answer count using intersecting placements;
2. continue filling valid answer groups in unused regions;
3. assign neighbouring panel cells to clue text with bipartite matching.

The engine runs twelve deterministic restarts and keeps the highest-scoring structurally valid result. The default grid allows at most three answer groups, down from six in version 0.7.

A closed-fill template CSP remains a separate R&D track. It is the path to eliminating the last residual panels, but it requires a substantially larger reviewed lexicon and stronger constraint propagation.

## Running locally

Open `index.html` directly in a modern browser, or run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Quality gates

Run the dictionary audit:

```bash
node tools/dictionary-audit.cjs
```

Run the deterministic 40-seed benchmark:

```bash
node tools/benchmark.cjs
```

The benchmark rejects any result that:

- fails structural validation;
- contains fewer than 40 answers on the default 13 × 17 grid;
- occupies less than 78% of grid cells with answers, arrow anchors, or real clue text;
- uses more than three answer groups;
- externalizes fewer than 20 clue texts;
- leaves more than 49 residual panel cells;
- uses a fallback placeholder clue.

## Files

```text
index.html                 Browser interface
styles.css                 Interface styling
words.js                   Main Russian answer dictionary
short-words.js             Three-letter compact answers
clues.js                   Original clue dictionary
extra-dictionary.js        Reviewed answer-and-clue expansion
two-letter-words.js        Reviewed two-letter answers
core.js                    Shared randomization and dictionary utilities
dictionary-policy.js       Restricts generation to reviewed clues
solver.js                  Word placement and split-clue topology
renderer.js                A5 SVG renderer
ui.js                      Browser UI and JSON export
tools/benchmark.cjs        Multi-seed structural regression benchmark
tools/dictionary-audit.cjs Dictionary validation and length audit
docs/                      Design notes and research summary
```

## Why PDF is deferred

SVG already preserves exact A5 dimensions and prints without raster quality loss. PDF export will be added after grid topology, clue typography, arrow placement, and the solution-page layout are stable.

## Next milestones

- reduce residual panel cells below 10% without inventing answers;
- expand the reviewed lexicon into the low thousands;
- add bent and offset arrow-anchor variants used by printed scanwords;
- develop the closed-fill template CSP;
- add print-ready PDF and solution-page export.
'''
(ROOT / "README.md").write_text(readme, encoding="utf-8")

# Remove the one-shot patch machinery from the resulting tree.
for temporary in [ROOT / "tools" / "apply-v08-part1.py", ROOT / "tools" / "apply-v08-part2.py", ROOT / ".github" / "workflows" / "apply-v08.yml"]:
    if temporary.exists():
        temporary.unlink()
