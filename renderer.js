(() => {
  "use strict";

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function wrapText(text, maxChars, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) current = next;
      else {
        if (current) lines.push(current);
        current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines.slice(0, maxLines);
  }

  function svgTextLines(lines, x, startY, fontSize, lineHeight) {
    return `<text x="${x.toFixed(3)}" y="${startY.toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize.toFixed(3)}" fill="#111">${lines
      .map((line, index) => `<tspan x="${x.toFixed(3)}" dy="${index === 0 ? 0 : lineHeight.toFixed(3)}">${escapeXml(line)}</tspan>`)
      .join("")}</text>`;
  }

  function renderArrow(x, y, cell, direction, dual = false) {
    const stroke = Math.max(0.18, cell * 0.025).toFixed(3);
    if (direction === "right") {
      const yy = y + cell * (dual ? 0.46 : 0.82);
      return `<path d="M ${(x + cell * 0.58).toFixed(3)} ${yy.toFixed(3)} L ${(x + cell * 0.94).toFixed(3)} ${yy.toFixed(3)}" fill="none" stroke="#111" stroke-width="${stroke}" marker-end="url(#arrowhead)"/>`;
    }
    const xx = x + cell * (dual ? 0.46 : 0.82);
    return `<path d="M ${xx.toFixed(3)} ${(y + cell * 0.58).toFixed(3)} L ${xx.toFixed(3)} ${(y + cell * 0.94).toFixed(3)}" fill="none" stroke="#111" stroke-width="${stroke}" marker-end="url(#arrowhead)"/>`;
  }

  function renderClueTextCell(data, x, y, cell) {
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

  function renderPanel(x, y, cell, row, col) {
    const inset = cell * 0.16;
    const alternating = (row + col) % 2 === 0;
    return `<rect x="${(x + inset).toFixed(3)}" y="${(y + inset).toFixed(3)}" width="${(cell - inset * 2).toFixed(3)}" height="${(cell - inset * 2).toFixed(3)}" rx="${(cell * 0.08).toFixed(3)}" fill="${alternating ? "#c8c8c8" : "#bdbdbd"}"/>`;
  }


  function footprintPath(cells, left, top, cell) {
    return cells.map((item) => {
      const x = left + item.col * cell;
      const y = top + item.row * cell;
      return `M ${x.toFixed(3)} ${y.toFixed(3)} h ${cell.toFixed(3)} v ${cell.toFixed(3)} h ${(-cell).toFixed(3)} Z`;
    }).join(" ");
  }

  function footprintBorder(cells, left, top, cell, lineWidth) {
    const keys = new Set(cells.map((item) => `${item.row}:${item.col}`));
    const segments = [];
    for (const item of cells) {
      const x = left + item.col * cell;
      const y = top + item.row * cell;
      if (!keys.has(`${item.row - 1}:${item.col}`)) segments.push(`M ${x.toFixed(3)} ${y.toFixed(3)} H ${(x + cell).toFixed(3)}`);
      if (!keys.has(`${item.row + 1}:${item.col}`)) segments.push(`M ${x.toFixed(3)} ${(y + cell).toFixed(3)} H ${(x + cell).toFixed(3)}`);
      if (!keys.has(`${item.row}:${item.col - 1}`)) segments.push(`M ${x.toFixed(3)} ${y.toFixed(3)} V ${(y + cell).toFixed(3)}`);
      if (!keys.has(`${item.row}:${item.col + 1}`)) segments.push(`M ${(x + cell).toFixed(3)} ${y.toFixed(3)} V ${(y + cell).toFixed(3)}`);
    }
    return `<path d="${segments.join(" ")}" fill="none" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`;
  }

  function largestFootprintRectangle(cells) {
    const keys = new Set(cells.map((item) => `${item.row}:${item.col}`));
    const rows = cells.map((item) => item.row);
    const cols = cells.map((item) => item.col);
    let best = null;
    for (let minRow = Math.min(...rows); minRow <= Math.max(...rows); minRow += 1) {
      for (let maxRow = minRow; maxRow <= Math.max(...rows); maxRow += 1) {
        for (let minCol = Math.min(...cols); minCol <= Math.max(...cols); minCol += 1) {
          for (let maxCol = minCol; maxCol <= Math.max(...cols); maxCol += 1) {
            let complete = true;
            for (let row = minRow; row <= maxRow && complete; row += 1) {
              for (let col = minCol; col <= maxCol; col += 1) {
                if (!keys.has(`${row}:${col}`)) { complete = false; break; }
              }
            }
            if (!complete) continue;
            const width = maxCol - minCol + 1;
            const height = maxRow - minRow + 1;
            const area = width * height;
            const score = area * 100 + width * 3 - height;
            if (!best || score > best.score) best = { minRow, maxRow, minCol, maxCol, width, height, area, score };
          }
        }
      }
    }
    return best;
  }

  function wrapAllText(text, maxChars) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const original of words) {
      let word = original;
      while (word.length > maxChars) {
        if (current) { lines.push(current); current = ""; }
        lines.push(`${word.slice(0, Math.max(2, maxChars - 1))}…`);
        word = word.slice(Math.max(2, maxChars - 1));
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function fitFootprintText(text, width, height, cell) {
    const padding = cell * 0.10;
    const usableWidth = Math.max(cell * 0.65, width - padding * 2);
    const usableHeight = Math.max(cell * 0.65, height - padding * 2);
    const maximum = Math.max(1.15, cell * 0.165);
    const minimum = Math.max(0.82, cell * 0.095);
    for (let fontSize = maximum; fontSize >= minimum; fontSize -= Math.max(0.04, cell * 0.006)) {
      const maxChars = Math.max(4, Math.floor(usableWidth / (fontSize * 0.53)));
      const lines = wrapAllText(text, maxChars);
      const lineHeight = fontSize * 1.06;
      if (lines.length * lineHeight <= usableHeight) return { lines, fontSize, lineHeight, truncated: false };
    }
    const fontSize = minimum;
    const lineHeight = fontSize * 1.04;
    const maxChars = Math.max(4, Math.floor(usableWidth / (fontSize * 0.53)));
    const maxLines = Math.max(1, Math.floor(usableHeight / lineHeight));
    const allLines = wrapAllText(text, maxChars);
    const lines = allLines.slice(0, maxLines);
    if (allLines.length > maxLines && lines.length) {
      const last = lines.length - 1;
      lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 1))}…`;
    }
    return { lines, fontSize, lineHeight, truncated: allLines.length > maxLines };
  }

  function renderFootprint(result, footprint, left, top, cell, lineWidth) {
    if (!footprint?.cells?.length) return "";
    const arrowCell = result.grid[footprint.arrowRow]?.[footprint.arrowCol];
    const clue = arrowCell?.clues?.find((item) => item.slotId === footprint.slotId);
    if (!clue) return "";
    const textRect = largestFootprintRectangle(footprint.cells);
    if (!textRect) return "";
    const boxX = left + textRect.minCol * cell;
    const boxY = top + textRect.minRow * cell;
    const boxWidth = textRect.width * cell;
    const boxHeight = textRect.height * cell;
    const clipId = `clue-footprint-${footprint.id}`;
    const fitted = fitFootprintText(clue.text, boxWidth, boxHeight, cell);
    const totalHeight = Math.max(1, fitted.lines.length) * fitted.lineHeight;
    const startY = boxY + Math.max(fitted.fontSize, (boxHeight - totalHeight) / 2 + fitted.fontSize * 0.78);
    const fill = `<path d="${footprintPath(footprint.cells, left, top, cell)}" fill="#f1f1f1"/>`;
    const text = `<g clip-path="url(#${clipId})">${svgTextLines(fitted.lines, boxX + boxWidth / 2, startY, fitted.fontSize, fitted.lineHeight)}</g>`;
    return `${fill}${footprintBorder(footprint.cells, left, top, cell, lineWidth)}${text}`;
  }

  function renderSvg(result, showAnswers) {
    const pageWidth = 148;
    const pageHeight = 210;
    const margin = 4;
    const cell = Math.min((pageWidth - margin * 2) / result.cols, (pageHeight - margin * 2) / result.rows);
    const left = (pageWidth - cell * result.cols) / 2;
    const top = (pageHeight - cell * result.rows) / 2;
    const lineWidth = Math.max(0.18, cell * 0.025);
    const letterSize = cell * 0.48;
    const valid = result.validation?.valid !== false;

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210" role="img" aria-label="Generated arrowword">`,
      `<defs><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" fill="#111"/></marker>${(result.clueFootprints || []).map((footprint) => `<clipPath id="clue-footprint-${footprint.id}">${footprint.cells.map((item) => `<rect x="${(left + item.col * cell).toFixed(3)}" y="${(top + item.row * cell).toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}"/>`).join("")}</clipPath>`).join("")}</defs>`,
      `<metadata>structurally-valid=${valid}; words=${result.placed.length}; accidental-runs=${result.validation?.accidentalRuns?.length || 0}</metadata>`,
      `<rect width="148" height="210" fill="#fff"/>`,
    ];

    for (let row = 0; row < result.rows; row += 1) {
      for (let col = 0; col < result.cols; col += 1) {
        const x = left + col * cell;
        const y = top + row * cell;
        const data = result.grid[row][col];
        const fill = data.type === "clue" || data.type === "clueText" || data.type === "clueTextContinuation" ? "#f1f1f1" : data.type === "panel" ? "#d2d2d2" : "#fff";
        parts.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="${fill}" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`);
        if (data.type === "clueText" && !(result.clueFootprints || []).length) parts.push(renderClueTextCell(data, x, y, cell));
        if (data.type === "letter" && showAnswers) {
          parts.push(`<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.68).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${letterSize.toFixed(3)}" font-weight="700" fill="#111">${escapeXml(data.char)}</text>`);
        }
        if (data.type === "clue") parts.push(renderClueContent(data, x, y, cell));
      }
    }

    for (const footprint of result.clueFootprints || []) {
      parts.push(renderFootprint(result, footprint, left, top, cell, lineWidth));
    }

    parts.push("</svg>");
    return parts.join("");
  }

  window.ScanwordRenderer = { renderSvg, escapeXml };
})();