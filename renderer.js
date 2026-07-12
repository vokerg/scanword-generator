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

  function renderClueContent(data, x, y, cell) {
    if (!data.clues.length) return "";
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

  function renderPanel(x, y, cell, row, col) {
    const inset = cell * 0.16;
    const alternating = (row + col) % 2 === 0;
    return `<rect x="${(x + inset).toFixed(3)}" y="${(y + inset).toFixed(3)}" width="${(cell - inset * 2).toFixed(3)}" height="${(cell - inset * 2).toFixed(3)}" rx="${(cell * 0.08).toFixed(3)}" fill="${alternating ? "#c8c8c8" : "#bdbdbd"}"/>`;
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
      `<defs><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" fill="#111"/></marker></defs>`,
      `<metadata>structurally-valid=${valid}; words=${result.placed.length}; accidental-runs=${result.validation?.accidentalRuns?.length || 0}</metadata>`,
      `<rect width="148" height="210" fill="#fff"/>`,
    ];

    for (let row = 0; row < result.rows; row += 1) {
      for (let col = 0; col < result.cols; col += 1) {
        const x = left + col * cell;
        const y = top + row * cell;
        const data = result.grid[row][col];
        const fill = data.type === "clue" ? "#e4e4e4" : data.type === "panel" ? "#d2d2d2" : "#fff";
        parts.push(`<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="${fill}" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`);
        if (data.type === "panel") parts.push(renderPanel(x, y, cell, row, col));
        if (data.type === "letter" && showAnswers) {
          parts.push(`<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.68).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${letterSize.toFixed(3)}" font-weight="700" fill="#111">${escapeXml(data.char)}</text>`);
        }
        if (data.type === "clue") parts.push(renderClueContent(data, x, y, cell));
      }
    }

    parts.push("</svg>");
    return parts.join("");
  }

  window.ScanwordRenderer = { renderSvg, escapeXml };
})();