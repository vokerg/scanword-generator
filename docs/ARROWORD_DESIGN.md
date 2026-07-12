# Arrowword Construction Notes

This document records the construction rules used by the generator.

## Terminology

The puzzle type is commonly called an **arrowword**, **Swedish-style crossword**, **Scandinavian crossword**, or **scanword**. Clues are embedded in non-answer cells, and arrows indicate the direction of each answer.

## Observed conventions

The implementation follows these conventions:

- clues are placed inside the grid rather than in a separate numbered list;
- arrows identify the answer direction;
- clue numbering is unnecessary;
- a clue cell may contain one clue or be split for two clues;
- answers run horizontally to the right or vertically downward;
- the grid is normally asymmetric;
- high density is expected;
- illustrations or graphic panels may replace blocks of ordinary cells;
- the visible grid should contain clue cells, answer cells, or intentional graphic cells—not unexplained blank answer cells.

## Generator invariants

### 1. No accidental runs

Every contiguous horizontal or vertical sequence containing at least two letter cells must correspond exactly to one assigned answer.

A letter that belongs only to a perpendicular answer may appear as a one-cell run in the other direction. Two adjacent letters in an unassigned direction are forbidden because they visually form an unintended answer.

### 2. Valid crossings

A crossing cell may belong to one horizontal and one vertical answer. Both answers must require the same letter.

### 3. Clue-cell validity

A clue cell may contain:

- one right clue;
- one down clue;
- one right clue and one down clue.

Duplicate directions in one clue cell are invalid.

### 4. Explicit panels

Cells unused by answers are rendered as explicit graphic panels. They are not treated as empty answer cells or blank clue cells. Panel frequency is a quality metric and should be minimized.

### 5. Connectivity

The active puzzle should preferably form one connected component through adjacent clue and answer cells. Disconnected layouts receive a major score penalty.

## Quality metrics

The generator reports:

- assigned answer count;
- crossing count;
- active-cell percentage;
- panel-cell count and ratio;
- accidental run count;
- letter conflicts;
- orphan letter count;
- clue-direction conflicts;
- overall structural validity.

Structural validity is a hard requirement. Density is optimized only among valid candidates.

## Research references

- Wikipedia, “Crossword”, section on Swedish-style grids: https://en.wikipedia.org/wiki/Crossword
- Russian Wikipedia, “Кроссворд”, section on Scandinavian crosswords: https://ru.wikipedia.org/wiki/Кроссворд

The sources describe the defining characteristics of arrowwords: clues inside the grid, direction arrows, high crossing density, asymmetric layouts, and optional image blocks.