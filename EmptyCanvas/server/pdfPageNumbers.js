/**
 * PDFKit helper: page numbering
 *
 * Requirements from ops:
 *  - Page number must be on the far right (footer)
 *  - Format must be: "{page}|{total}" (e.g. "1|5")
 *  - Must work for ALL generated PDFs
 *
 * Implementation notes:
 *  - To know the TOTAL page count, PDFKit must be created with { bufferPages: true }.
 *  - We avoid doc.on('pageAdded') because drawing below maxY can trigger an implicit
 *    page break and cause an infinite loop (slow downloads + damaged PDFs).
 *  - Instead we patch doc.end() to stamp numbers onto all buffered pages right
 *    before the document is finalized.
 */

/**
 * @param {import('pdfkit')} doc
 * @param {{
 *   startAt?: number,
 *   template?: string,
 *   fontSize?: number,
 *   color?: string,
 *   y?: number,
 *   align?: 'left'|'center'|'right'
 * }} [opts]
 */
function attachPageNumbers(doc, opts = {}) {
  if (!doc) return;

  // Prevent attaching multiple times to the same document.
  // Double listeners can duplicate numbers and slow generation.
  if (doc.__pageNumbersAttached) return;
  doc.__pageNumbersAttached = true;

  const template = typeof opts.template === "string" ? opts.template : "{page}|{total}";
  const fontSize = Number.isFinite(Number(opts.fontSize)) ? Number(opts.fontSize) : 9;
  const color = typeof opts.color === "string" ? opts.color : "#6B7280"; // gray-500
  // Default: far right
  const align = opts.align === "left" || opts.align === "center" || opts.align === "right" ? opts.align : "right";

  const render = (page, total) =>
    template
      .replace("{page}", String(page))
      .replace("{total}", String(total));

  const draw = (page, total) => {
    try {
      const prevX = doc.x;
      const prevY = doc.y;

      doc.save();
      doc.fillColor(color).font("Helvetica").fontSize(fontSize);

      // IMPORTANT:
      // PDFKit will automatically add a new page if you draw text below its
      // internal "maxY" (page height - bottom margin). If that happens,
      // our pageAdded listener fires again, which can create an infinite loop
      // (slow downloads + damaged PDFs).
      const margins = doc.page?.margins || {};
      const leftMargin = Number(margins.left) || 0;
      const rightMargin = Number(margins.right) || 0;
      const bottomMargin = Number(margins.bottom) || 0;
      const maxY = (Number(doc.page?.height) || 0) - bottomMargin;
      const lineH = doc.currentLineHeight(true) || 12;

      // Default Y: inside the printable area (just above the bottom margin)
      const desiredY = Number.isFinite(Number(opts.y))
        ? Number(opts.y)
        : maxY - lineH - 2;

      // Clamp so we NEVER exceed maxY (prevents auto page breaks)
      const y = Math.min(desiredY, maxY - lineH - 1);

      const x = leftMargin;
      const width = Math.max(0, (Number(doc.page?.width) || 0) - leftMargin - rightMargin);

      doc.text(render(page, total), x, y, {
        width,
        align,
        lineBreak: false,
      });

      doc.restore();

      // Keep the caller layout intact
      doc.x = prevX;
      doc.y = prevY;
    } catch {
      // Never break PDF generation due to footer rendering.
    }
  };

  const finalize = () => {
    if (doc.__pageNumbersFinalized) return;
    doc.__pageNumbersFinalized = true;

    // bufferPages MUST be enabled on the PDFDocument instance.
    if (typeof doc.bufferedPageRange !== "function" || typeof doc.switchToPage !== "function") {
      return;
    }

    const range = doc.bufferedPageRange();
    const total = Number(range?.count) || 0;
    const start = Number(range?.start) || 0;

    if (!total) return;

    for (let i = start; i < start + total; i += 1) {
      try {
        doc.switchToPage(i);
        const current = i - start + 1;
        draw(current, total);
      } catch {
        // ignore per-page errors
      }
    }

    // Write buffered pages to the output stream
    try {
      if (typeof doc.flushPages === "function") doc.flushPages();
    } catch {
      // ignore
    }
  };

  // Patch end() so every PDF is numbered automatically, without changing call-sites.
  const originalEnd = doc.end.bind(doc);
  doc.end = (...args) => {
    try {
      finalize();
    } catch {
      // ignore
    }
    return originalEnd(...args);
  };

  // Also expose explicit finalize if a caller prefers (optional)
  doc.finalizePageNumbers = finalize;
}

module.exports = { attachPageNumbers };
