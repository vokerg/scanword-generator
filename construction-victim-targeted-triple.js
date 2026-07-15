(() => {
"use strict";
const solver = window.ScanwordSolver;
const closedFill = window.ScanwordClosedFill;
if (!solver?.generateTargetedVictimVariants
|| !solver?.stripClueLayoutForTargetedVictim
|| !solver?.rollbackInlineWord
|| !closedFill?.enumerateRegionSlots
|| solver.__constructionTargetedTripleInstalled) return;
const previousGenerateVariants = solver.generateTargetedVictimVariants.bind(solver);
const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function cellKey(row, col) {
return `${row}:${col}`;
}
function cloneCell(cell) {
return {
...cell,
slotIds: [...(cell.slotIds || [])],
directions: [...(cell.directions || [])],
clues: (cell.clues || []).map((clue) => ({
...clue,
textCells: clue.textCells?.map((target) => ({ ...target })),
})),
};
}
function cloneState(state) {
return {
...state,
grid: state.grid.map((row) => row.map(cloneCell)),
placed: (state.placed || []).map((word) => ({
...word,
cells: (word.cells || []).map((cell) => ({ ...cell })),
})),
usedAnswers: new Set((state.placed || []).map((word) => word.answer)),
clueFootprints: (state.clueFootprints || []).map((footprint) => ({
...footprint,
cells: (footprint.cells || []).map((cell) => ({ ...cell })),
})),
};
}
function entryQuality(entry) {
return Number(entry?.lexicalQuality || 50)
- (entry?.weakFill ? 90 : 0)
- (entry?.answer?.length === 2 ? 20 : 0);
}
function weakCount(state, poolByAnswer) {
return (state.placed || []).reduce((sum, word) => {
const metadata = poolByAnswer.get(word.answer);
return sum + Number(Boolean(word.weakFill || metadata?.weakFill));
}, 0);
}
function stateSignature(state) {
return (state.placed || [])
.map((word) => `${word.direction}:${word.clueRow},${word.clueCol}:${word.answer}`)
.sort()
.join("|");
}
function unresolvedTargetCells(state, targetKeys) {
let unresolved = 0;
for (const key of targetKeys) {
const [row, col] = key.split(":").map(Number);
if (state.grid[row]?.[col]?.type === "panel") unresolved += 1;
}
return unresolved;
}
function buildFocusRegion(state, region, victims, radius, maxCells) {
const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
const freed = victims.flatMap((victim) => [
{ row: victim.clueRow, col: victim.clueCol },
...(victim.cells || []),
]);
const sources = [...region.cells, ...freed];
const cells = [];
for (let row = 0; row < state.rows; row += 1) {
for (let col = 0; col < state.cols; col += 1) {
if (state.grid[row][col].type !== "panel") continue;
let distance = Infinity;
for (const source of sources) {
distance = Math.min(distance, Math.abs(row - source.row) + Math.abs(col - source.col));
if (distance === 0) break;
}
if (distance <= radius) cells.push({ row, col, distance });
}
}
cells.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
const selected = cells.slice(0, maxCells).map(({ row, col }) => ({ row, col }));
const selectedKeys = new Set(selected.map((cell) => cellKey(cell.row, cell.col)));
const boundary = new Map();
for (const current of selected) {
for (const [dr, dc] of ORTHOGONAL) {
const row = current.row + dr;
const col = current.col + dc;
if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) continue;
const key = cellKey(row, col);
if (selectedKeys.has(key)) continue;
const cell = state.grid[row][col];
if (cell.type === "panel") continue;
boundary.set(key, {
row,
col,
type: cell.type,
char: cell.char || null,
slotIds: [...(cell.slotIds || [])],
directions: [...(cell.directions || [])],
clueDirections: (cell.clues || []).map((clue) => clue.direction).sort(),
});
}
}
return {
id: region.id,
cells: selected,
boundaryCells: [...boundary.values()].sort((a, b) => a.row - b.row || a.col - b.col),
targetKeys,
freedKeys: new Set(freed.map((cell) => cellKey(cell.row, cell.col))),
};
}
function augmentPool(pool) {
const byAnswer = new Map((pool || []).map((entry) => [entry.answer, entry]));
for (const entry of window.SCANWORD_TARGETED_SHORT_FILL || []) {
if (!byAnswer.has(entry.answer)) byAnswer.set(entry.answer, entry);
}
return [...byAnswer.values()];
}
function slotRelation(a, b) {
if (a.clueKey === b.clueKey && a.direction === b.direction) return null;
const aPositions = new Map(a.cells.map((cell, index) => [cellKey(cell.row, cell.col), index]));
const bPositions = new Map(b.cells.map((cell, index) => [cellKey(cell.row, cell.col), index]));
if (aPositions.has(b.clueKey) || bPositions.has(a.clueKey)) return null;
if ((a.forbiddenLetterKeys || []).some((key) => bPositions.has(key))) return null;
if ((b.forbiddenLetterKeys || []).some((key) => aPositions.has(key))) return null;
const shared = [];
for (const [key, aPosition] of aPositions) {
if (bPositions.has(key)) shared.push({ key, aPosition, bPosition: bPositions.get(key) });
}
if (shared.length > 1) return null;
if (shared.length === 1) {
if (a.direction === b.direction) return null;
return { type: "crossing", ...shared[0] };
}
return { type: "disjoint" };
}
function buildWordComponentIndex(state) {
const ids = (state.placed || []).map((word) => word.id);
const parent = new Map(ids.map((id) => [id, id]));
const find = (id) => {
let root = parent.get(id);
if (root == null) return null;
while (root !== parent.get(root)) root = parent.get(root);
let current = id;
while (current !== root) {
const next = parent.get(current);
parent.set(current, root);
current = next;
}
return root;
};
const union = (left, right) => {
const a = find(left);
const b = find(right);
if (a == null || b == null || a === b) return;
parent.set(b, a);
};
for (const row of state.grid) {
for (const cell of row) {
const slotIds = (cell.type === "letter" ? cell.slotIds : null) || [];
for (let index = 1; index < slotIds.length; index += 1) union(slotIds[0], slotIds[index]);
}
}
const rootToComponent = new Map();
const byWordId = new Map();
for (const id of ids) {
const root = find(id);
if (!rootToComponent.has(root)) rootToComponent.set(root, rootToComponent.size);
byWordId.set(id, rootToComponent.get(root));
}
return { count: rootToComponent.size, byWordId };
}
function slotTouchedComponents(state, slot, componentIndex) {
const touched = new Set();
for (const target of slot.cells) {
const cell = state.grid[target.row]?.[target.col];
if (cell?.type !== "letter") continue;
for (const slotId of cell.slotIds || []) {
const component = componentIndex.byWordId.get(slotId);
if (component != null) touched.add(component);
}
}
return touched;
}
function tripleCanReconnect(componentIndex, ranked, relations) {
const componentCount = componentIndex.count;
const total = componentCount + 3;
const parent = Array.from({ length: total }, (_, index) => index);
const find = (value) => {
while (parent[value] !== value) {
parent[value] = parent[parent[value]];
value = parent[value];
}
return value;
};
const union = (left, right) => {
const a = find(left);
const b = find(right);
if (a !== b) parent[b] = a;
};
ranked.forEach((item, slotIndex) => {
for (const component of item.touchedComponents) union(component, componentCount + slotIndex);
});
relations.forEach(({ left, right, relation }) => {
if (relation.type === "crossing") union(componentCount + left, componentCount + right);
});
if (total === 0) return false;
const root = find(0);
return Array.from({ length: total }, (_, index) => index).every((index) => find(index) === root);
}
function applySlotRaw(state, slot, entry) {
const id = state.placed.reduce((maximum, word) => Math.max(maximum, Number(word.id || 0)), 0) + 1;
const clueCell = state.grid[slot.clueRow]?.[slot.clueCol];
if (!clueCell || (clueCell.type !== "panel" && clueCell.type !== "clue")) return false;
if ((clueCell.clues || []).some((clue) => clue.direction === slot.direction)) return false;
if ((clueCell.clues || []).length >= 2) return false;
if (clueCell.type === "panel") {
clueCell.type = "clue";
clueCell.char = null;
clueCell.slotIds = [];
clueCell.directions = [];
clueCell.clues = [];
}
clueCell.clues.push({ slotId: id, direction: slot.direction, text: entry.clue, answer: entry.answer });
const cells = [];
let intersections = 0;
for (let position = 0; position < slot.cells.length; position += 1) {
const target = slot.cells[position];
const cell = state.grid[target.row]?.[target.col];
const char = entry.answer[position];
if (!cell) return false;
if (cell.type === "letter") {
if (cell.char !== char || (cell.directions || []).includes(slot.direction) || (cell.directions || []).length >= 2) return false;
intersections += 1;
} else if (cell.type === "panel") {
cell.type = "letter";
cell.char = char;
cell.clues = [];
cell.slotIds = [];
cell.directions = [];
} else {
return false;
}
cell.slotIds.push(id);
cell.directions.push(slot.direction);
cells.push({ row: target.row, col: target.col });
}
state.placed.push({
id,
answer: entry.answer,
clue: entry.clue,
hasExactClue: Boolean(entry.hasExactClue),
lexicalQuality: entry.lexicalQuality,
lexicalSource: entry.lexicalSource,
weakFill: Boolean(entry.weakFill),
direction: slot.direction,
length: entry.answer.length,
clueRow: slot.clueRow,
clueCol: slot.clueCol,
startRow: slot.startRow,
startCol: slot.startCol,
cells,
intersections,
});
state.usedAnswers.add(entry.answer);
return true;
}
function compareStates(a, b, targetKeys, poolByAnswer) {
const unresolvedA = unresolvedTargetCells(a, targetKeys);
const unresolvedB = unresolvedTargetCells(b, targetKeys);
if (unresolvedA !== unresolvedB) return unresolvedA - unresolvedB;
const coverageA = closedFill.measureCoverage(a.grid);
const coverageB = closedFill.measureCoverage(b.grid);
if (coverageA.panelCells !== coverageB.panelCells) return coverageA.panelCells - coverageB.panelCells;
if (coverageA.letterCells !== coverageB.letterCells) return coverageB.letterCells - coverageA.letterCells;
const weakA = weakCount(a, poolByAnswer);
const weakB = weakCount(b, poolByAnswer);
if (weakA !== weakB) return weakA - weakB;
if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
return stateSignature(a).localeCompare(stateSignature(b));
}
function valuesForSlot(item, rolled, excludedAnswers, limit) {
return [...item.slot.baseDomain]
.filter((entry) => !excludedAnswers.has(entry.answer)
&& entry.hasExactClue
&& !rolled.usedAnswers.has(entry.answer))
.sort((left, right) => entryQuality(right) - entryQuality(left) || left.answer.localeCompare(right.answer, "ru"))
.slice(0, limit);
}
function crossingValuesMatch(entries, relations) {
for (const { left, right, relation } of relations) {
if (relation.type !== "crossing") continue;
if (entries[left].answer[relation.aPosition] !== entries[right].answer[relation.bPosition]) return false;
}
return true;
}
function generateAtomicTripleVariants(baseResult, pool, options, telemetry) {
if (Number(baseResult.panelCells || 0) < options.atomicTripleMinimumPanels) return [];
const structural = solver.stripClueLayoutForTargetedVictim(baseResult);
const baselineAnswers = structural.placed.length;
const augmentedPool = augmentPool(pool);
const poolByAnswer = new Map(augmentedPool.map((entry) => [entry.answer, entry]));
const baselineWeak = weakCount(structural, poolByAnswer);
const patternIndex = closedFill.buildPatternIndex(augmentedPool);
const regions = closedFill.extractResidualRegions(baseResult)
.filter((region) => region.size === 1 && region.boundaryWords?.length >= 2)
.sort((a, b) => b.boundaryWords.length - a.boundaryWords.length || a.id - b.id)
.slice(0, options.atomicTripleMaxRegions);
const collected = new Map();
telemetry.regionsConsidered = regions.length;
for (const region of regions) {
const targetKeys = new Set(region.cells.map((cell) => cellKey(cell.row, cell.col)));
const victimIds = [...region.boundaryWords].slice(0, options.atomicTripleVictims);
for (let leftVictimIndex = 0; leftVictimIndex < victimIds.length; leftVictimIndex += 1) {
for (let rightVictimIndex = leftVictimIndex + 1; rightVictimIndex < victimIds.length; rightVictimIndex += 1) {
telemetry.victimPairsConsidered += 1;
const victimA = structural.placed.find((word) => word.id === victimIds[leftVictimIndex]);
const victimB = structural.placed.find((word) => word.id === victimIds[rightVictimIndex]);
if (!victimA || !victimB) continue;
const first = solver.rollbackInlineWord(structural, victimA.id);
const rolled = first && solver.rollbackInlineWord(first, victimB.id);
if (!rolled) {
telemetry.rollbackRejected += 1;
continue;
}
rolled.usedAnswers = new Set(rolled.placed.map((word) => word.answer));
rolled.clueFootprints = [];
const rolledMetrics = solver.resultMetrics(rolled);
if (!rolledMetrics.validation.valid) {
telemetry.rollbackInvalid += 1;
continue;
}
telemetry.victimPairsRolledBack += 1;
telemetry.maximumRollbackComponents = Math.max(telemetry.maximumRollbackComponents, Number(rolledMetrics.components || 0));
const focus = buildFocusRegion(rolled, region, [victimA, victimB], options.focusRadius, options.maxFocusCells);
if (!focus.cells.length) {
telemetry.emptyFocus += 1;
continue;
}
const componentIndex = buildWordComponentIndex(rolled);
const queryStats = { lookups: 0, checks: 0 };
const slots = closedFill.enumerateRegionSlots(rolled, focus, patternIndex, rolled.usedAnswers, {
maxSlotCandidates: options.atomicTripleSlotCandidates,
maxDomainSize: options.maxDomainSize,
}, queryStats);
telemetry.patternLookups += queryStats.lookups;
telemetry.patternChecks += queryStats.checks;
telemetry.slotsEnumerated += slots.length;
const rankedSlots = slots.map((slot) => ({
slot,
targetHits: slot.regionLetterKeys.filter((key) => targetKeys.has(key)).length,
freedHits: slot.regionLetterKeys.filter((key) => focus.freedKeys.has(key)).length,
touchedComponents: slotTouchedComponents(rolled, slot, componentIndex),
})).filter((item) => item.targetHits > 0 || item.freedHits > 0 || item.touchedComponents.size > 0)
.sort((a, b) => b.targetHits - a.targetHits
|| b.touchedComponents.size - a.touchedComponents.size
|| b.freedHits - a.freedHits
|| b.slot.existingIntersections - a.slot.existingIntersections
|| b.slot.regionLetterKeys.length - a.slot.regionLetterKeys.length
|| a.slot.signature.localeCompare(b.slot.signature))
.slice(0, options.atomicTripleMaxSlots);
for (let aIndex = 0; aIndex < rankedSlots.length; aIndex += 1) {
for (let bIndex = aIndex + 1; bIndex < rankedSlots.length; bIndex += 1) {
const relationAB = slotRelation(rankedSlots[aIndex].slot, rankedSlots[bIndex].slot);
if (!relationAB) continue;
for (let cIndex = bIndex + 1; cIndex < rankedSlots.length; cIndex += 1) {
telemetry.slotTriplesConsidered += 1;
const selected = [rankedSlots[aIndex], rankedSlots[bIndex], rankedSlots[cIndex]];
if (selected.reduce((sum, item) => sum + item.targetHits, 0) <= 0) continue;
const relationAC = slotRelation(selected[0].slot, selected[2].slot);
const relationBC = slotRelation(selected[1].slot, selected[2].slot);
if (!relationAC || !relationBC) continue;
const relations = [
{ left: 0, right: 1, relation: relationAB },
{ left: 0, right: 2, relation: relationAC },
{ left: 1, right: 2, relation: relationBC },
];
if (!tripleCanReconnect(componentIndex, selected, relations)) {
telemetry.componentPrunedTriples += 1;
continue;
}
telemetry.compatibleSlotTriples += 1;
const excludedAnswers = new Set([victimA.answer, victimB.answer]);
const domains = selected.map((item) => valuesForSlot(item, rolled, excludedAnswers, options.atomicTripleValuesPerSlot));
if (domains.some((domain) => !domain.length)) continue;
for (const entryA of domains[0]) {
for (const entryB of domains[1]) {
if (entryA.answer === entryB.answer) continue;
for (const entryC of domains[2]) {
telemetry.entryTriplesConsidered += 1;
const entries = [entryA, entryB, entryC];
if (new Set(entries.map((entry) => entry.answer)).size !== 3) continue;
if (!crossingValuesMatch(entries, relations)) continue;
const candidate = cloneState(rolled);
if (!applySlotRaw(candidate, selected[0].slot, entryA)
|| !applySlotRaw(candidate, selected[1].slot, entryB)
|| !applySlotRaw(candidate, selected[2].slot, entryC)) {
telemetry.applyRejected += 1;
continue;
}
const metrics = solver.resultMetrics(candidate);
if (!metrics.validation.valid || metrics.components !== 1 || candidate.placed.some((word) => !word.hasExactClue)) {
telemetry.validationRejected += 1;
continue;
}
if (weakCount(candidate, poolByAnswer) > baselineWeak) {
telemetry.weakBudgetRejected += 1;
continue;
}
if (candidate.placed.length < baselineAnswers) {
telemetry.answerCountRejected += 1;
continue;
}
const unresolved = unresolvedTargetCells(candidate, targetKeys);
if (unresolved >= region.size) {
telemetry.targetRejected += 1;
continue;
}
candidate.targetedVictimMeta = {
regionId: region.id,
regionSize: region.size,
victimSlotIds: [victimA.id, victimB.id],
victimAnswers: [victimA.answer, victimB.answer].sort(),
unresolvedTargetCells: unresolved,
depth: 3,
atomicTriple: true,
tripleAnswers: entries.map((entry) => entry.answer).sort(),
crossingRelations: relations.filter((item) => item.relation.type === "crossing").length,
supplementalShortFill: entries
.filter((entry) => (window.SCANWORD_TARGETED_SHORT_FILL || []).some((item) => item.answer === entry.answer))
.map((entry) => entry.answer)
.sort(),
baselineWeakFill: baselineWeak,
candidateWeakFill: weakCount(candidate, poolByAnswer),
};
const signature = stateSignature(candidate);
const existing = collected.get(signature);
if (!existing || compareStates(candidate, existing, targetKeys, poolByAnswer) < 0) collected.set(signature, candidate);
}
}
}
}
}
}
}
}
}
const states = [...collected.values()]
.sort((a, b) => compareStates(a, b, new Set(), poolByAnswer))
.slice(0, options.atomicTripleMaxVariants)
.map(cloneState);
telemetry.statesAccepted = states.length;
return states;
}
solver.generateTargetedVictimVariants = (result, pool, suppliedOptions = {}) => {
const previous = previousGenerateVariants(result, pool, suppliedOptions);
const options = {
maxRegions: 3,
focusRadius: 2,
maxFocusCells: 32,
maxDomainSize: 128,
atomicTripleMinimumPanels: 9,
atomicTripleMaxRegions: 2,
atomicTripleVictims: 5,
atomicTripleSlotCandidates: 180,
atomicTripleMaxSlots: 14,
atomicTripleValuesPerSlot: 2,
atomicTripleMaxVariants: 4,
atomicTripleFinalists: 1,
...suppliedOptions,
};
const telemetry = {
mode: "targeted-atomic-triple-v1",
minimumPanels: options.atomicTripleMinimumPanels,
regionsConsidered: 0,
victimPairsConsidered: 0,
victimPairsRolledBack: 0,
rollbackRejected: 0,
rollbackInvalid: 0,
maximumRollbackComponents: 0,
emptyFocus: 0,
slotsEnumerated: 0,
slotTriplesConsidered: 0,
componentPrunedTriples: 0,
compatibleSlotTriples: 0,
entryTriplesConsidered: 0,
applyRejected: 0,
validationRejected: 0,
weakBudgetRejected: 0,
answerCountRejected: 0,
targetRejected: 0,
patternLookups: 0,
patternChecks: 0,
statesAccepted: 0,
finalistsReserved: 0,
};
const tripleStates = generateAtomicTripleVariants(result, pool, options, telemetry);
const merged = new Map();
for (const state of previous.states || []) {
const signature = stateSignature(state);
if (!merged.has(signature)) merged.set(signature, state);
}
const reserved = tripleStates.slice(0, options.atomicTripleFinalists);
telemetry.finalistsReserved = reserved.length;
for (const state of reserved) {
const signature = stateSignature(state);
if (!merged.has(signature)) merged.set(signature, state);
}
const states = [...merged.values()];
return {
states,
telemetry: {
...(previous.telemetry || {}),
atomicTriple: telemetry,
statesAccepted: states.length,
},
};
};
Object.assign(solver, {
generateAtomicTargetedTripleVariants: generateAtomicTripleVariants,
__constructionTargetedTripleInstalled: true,
});
})();
