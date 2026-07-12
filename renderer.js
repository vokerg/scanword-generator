(() => {
  "use strict";

  const { DIRECTIONS } = window.ScanwordCore;

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function wrapText(text, maxChars, maxLines) {
    const queue = String(text).split(/\s+/).filter(Boolean);
    const tokens = [];

    for (const rawWord of queue) {
      let word = rawWord;
      while (word.length > maxChars) {
        const cut = Math.max(2, maxChars - 1);
        tokens.push(`${word.slice(0, cut)}-`);
        word = word.slice(cut);
      }
      if (word) tokens.push(word);
    }

    const lines = [];
    let current = "";
    let consumed = 0;

    for (const token of tokens) {
      const test = current ? `${current} ${token}` : token;
      if (test.length <= maxChars) {
        current = test;
      } else {
        if (current) {
          lines.push(current);
          consumed += 1;
        }
        current = token;
      }
      if (lines.length >= maxLines) break;
    }

    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && tokens.length > consumed + 1) {
      const last = lines[maxLines - 1].replace(/[.…,;:!?-]+$/, "");
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`;
    }
    return lines.slice(0, maxLines);
  }

  function svgTextLines(lines, x, startY, fontSize, lineHeight, options = {}) {
    const anchor = options.anchor || "middle";
    const weight = options.weight || "400";
    return `<text x="${x.toFixed(3)}" y="${startY.toFixed(3)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize.toFixed(3)}" font-weight="${weight}" fill="#111">${lines
      .map((line, index) => `<tspan x="${x.toFixed(3)}" dy="${index === 0 ? 0 : lineHeight.toFixed(3)}">${escapeXml(line)}</tspan>`)
      .join("")}</text>`;
  }

  function renderArrow(x, y, cell, direction, dual = false) {
    if (direction === "right") {
      const yy = y + cell * (dual ? 0.46 : 0.82);
      const x1 = x + cell * (dual ? 0.59 : 0.6);
      const x2 = x + cell * 0.94;
      return `<path d="M ${x1.toFixed(3)} ${yy.toFixed(3)} L ${x2.toFixed(3)} ${yy.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.18, cell * 0.025).toFixed(3)}" marker-end="url(#arrowhead)"/>`;
    }

    const xx = x + cell * (dual ? 0.46 : 0.82);
    const y1 = y + cell * (dual ? 0.59 : 0.6);
    const y2 = y + cell * 0.94;
    return `<path d="M ${xx.toFixed(3)} ${y1.toFixed(3)} L ${xx.toFixed(3)} ${y2.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.18, cell * 0.025).toFixed(3)}" marker-end="url(#arrowhead)"/>`;
  }

  function renderClueContent(data, x, y, cell) {
    if (!data.clues.length) return "";

    if (data.clues.length === 1) {
      const clue = data.clues[0];
      const fontSize = Math.max(1.25, cell * 0.17);
      const maxChars = Math.max(7, Math.floor(cell / (fontSize * 0.53)));
      const lines = wrapText(clue.text, maxChars, 4);
      const text = svgTextLines(lines, x + cell * 0.48, y + cell * 0.18, fontSize, fontSize * 1.08);
      return `${text}${renderArrow(x, y, cell, clue.direction)}`;
    }

    const rightClue = data.clues.find((clue) => clue.direction === "right") || data.clues[0];
    const downClue = data.clues.find((clue) => clue.direction === "down") || data.clues[1];
    const fontSize = Math.max(1.02, cell * 0.118);
    const rightLines = wrapText(rightClue.text, 9, 3);
    const downLines = wrapText(downClue.text, 9, 3);
    const diagonal = `<path d="M ${x.toFixed(3)} ${(y + cell).toFixed(3)} L ${(x + cell).toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#111" stroke-width="${Math.max(0.16, cell * 0.02).toFixed(3)}"/>`;
    const topText = svgTextLines(rightLines, x + cell * 0.36, y + cell * 0.12, fontSize, fontSize * 1.03);
    const bottomText = svgTextLines(downLines, x + cell * 0.65, y + cell * 0.61, fontSize, fontSize * 1.03);
    return `${diagonal}${topText}${bottomText}${renderArrow(x, y, cell, "right", true)}${renderArrow(x, y, cell, "down", true)}`;
  }

  function renderSvg(result, showAnswers) {
    const pageWidth = 148;
    const pageHeight = 210;
    const margin = 4;
    const cell = Math.min((pageWidth - margin * 2) / result.cols, (pageHeight - margin * 2) / result.rows);
    const gridWidth = cell * result.cols;
    const gridHeight = cell * result.rows;
    const left = (pageWidth - gridWidth) / 2;
    const top = (pageHeight - gridHeight) / 2;
    const lineWidth = Math.max(0.18, cell * 0.025);
    const letterSize = cell * 0.48;

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210" role="img" aria-label="Сгенерированный сканворд">`,
      `<defs><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" fill="#111"/></marker></defs>`,
      `<rect width="148" height="210" fill="#fff"/>`,
    ];

    for (let row = 0; row < result.rows; row += 1) {
      for (let col = 0; col < result.cols; col += 1) {
        const x = left + col * cell;
        const y = top + row * cell;
        const data = result.grid[row][col];
        const fill = data.type === "clue" ? "#e4e4e4" : "#fff";

        parts.push(
          `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}" fill="${fill}" stroke="#111" stroke-width="${lineWidth.toFixed(3)}"/>`,
        );

        if (data.type === "letter" && showAnswers) {
          parts.push(
            `<text x="${(x + cell / 2).toFixed(3)}" y="${(y + cell * 0.68).toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${letterSize.toFixed(3)}" font-weight="700" fill="#111">${escapeXml(data.char)}</text>`,
          );
        }

        if (data.clues.length) parts.push(renderClueContent(data, x, y, cell));
      }
    }

    parts.push("</svg>");
    return parts.join("");
  }

  window.ScanwordRenderer = { renderSvg, escapeXml };
})();
