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

  /**
   * Stamp a page footer like: 1|5
   * - current page (left side) in bold
   * - total pages normal
   * - placed in the footer area (below content), far right
   *
   * @param {number} page
   * @param {number} total
   * @param {number} [footerBottomMargin] original bottom margin to position within
   */
  const draw = (page, total, footerBottomMargin) => {
    try {
      const prevX = doc.x;
      const prevY = doc.y;

      doc.save();
      doc.fillColor(color).fontSize(fontSize);

      // IMPORTANT:
      // PDFKit will automatically add a new page if you draw text below its
      // internal "maxY" (page height - bottom margin). If that happens,
      // our pageAdded listener fires again, which can create an infinite loop
      // (slow downloads + damaged PDFs).
      const margins = doc.page?.margins || {};
      const leftMargin = Number(margins.left) || 0;
      const rightMargin = Number(margins.right) || 0;

      const pageW = Number(doc.page?.width) || 0;
      const pageH = Number(doc.page?.height) || 0;

      // IMPORTANT:
      // We stamp numbers during finalize() with bottom margin temporarily set to 0,
      // so we are allowed to draw inside the original footer margin area without
      // triggering implicit page breaks.
      const bottomMarginNow = Number(margins.bottom) || 0;
      const maxY = pageH - bottomMarginNow;

      // Use normal font for metrics
      doc.font("Helvetica");
      const lineH = doc.currentLineHeight(true) || 12;

      const footerMargin = Number.isFinite(Number(footerBottomMargin))
        ? Number(footerBottomMargin)
        : bottomMarginNow;

      // Default Y: in the footer area (a little BELOW the content boundary)
      const footerTop = pageH - footerMargin;
      const footerInset = Math.min(12, Math.max(6, Math.round(footerMargin * 0.25)));

      const desiredY = Number.isFinite(Number(opts.y))
        ? Number(opts.y)
        : footerTop + footerInset;

      // Clamp so we NEVER exceed maxY (prevents auto page breaks)
      const y = Math.min(Math.max(0, desiredY), maxY - lineH - 1);

      // Build "1|5" with bold "1"
      const currentStr = String(page);
      const restStr = `|${String(total)}`;

      // Measure widths to right-align precisely
      doc.font("Helvetica-Bold");
      const wBold = doc.widthOfString(currentStr);
      doc.font("Helvetica");
      const wNormal = doc.widthOfString(restStr);
      const totalW = wBold + wNormal;

      const xRight = pageW - rightMargin;
      const xStart = Math.max(leftMargin, xRight - totalW);

      // Draw
      doc.font("Helvetica-Bold");
      doc.text(currentStr, xStart, y, { continued: true, lineBreak: false });
      doc.font("Helvetica");
      doc.text(restStr, { continued: false, lineBreak: false });

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

        // Temporarily remove bottom margin while stamping,
        // so we can draw inside the original footer area safely.
        const m = doc.page?.margins || {};
        const originalBottom = Number(m.bottom) || 0;
        let restored = false;

        try {
          if (m && typeof m === "object") {
            m.bottom = 0;
            restored = true;
          }
        } catch {
          // ignore
        }

        draw(current, total, originalBottom);

        // Restore bottom margin
        if (restored) {
          try {
            m.bottom = originalBottom;
          } catch {
            // ignore
          }
        }
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
