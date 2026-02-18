/**
 * PDFKit helper: page numbering
 *
 * Adds a simple "Page X" label to every page (bottom-center by default).
 * This does NOT buffer pages and does NOT require knowing the total page count.
 *
 * Why: users download PDFs and need a clear page order when printing/sharing.
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

  let pageNo = Number.isFinite(Number(opts.startAt)) ? Number(opts.startAt) : 1;
  const template = typeof opts.template === "string" ? opts.template : "Page {page}";
  const fontSize = Number.isFinite(Number(opts.fontSize)) ? Number(opts.fontSize) : 9;
  const color = typeof opts.color === "string" ? opts.color : "#6B7280"; // gray-500
  const align = opts.align === "left" || opts.align === "right" ? opts.align : "center";

  const render = (n) => template.replace("{page}", String(n));

  const draw = (n) => {
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
      const bottomMargin = Number(doc.page?.margins?.bottom) || 0;
      const maxY = (Number(doc.page?.height) || 0) - bottomMargin;
      const lineH = doc.currentLineHeight(true) || 12;

      // Default Y: inside the printable area (just above the bottom margin)
      const desiredY = Number.isFinite(Number(opts.y))
        ? Number(opts.y)
        : maxY - lineH - 2;

      // Clamp so we NEVER exceed maxY (prevents auto page breaks)
      const y = Math.min(desiredY, maxY - lineH - 1);

      doc.text(render(n), 0, y, {
        width: doc.page.width,
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

  // First page exists immediately
  draw(pageNo);

  // Subsequent pages
  doc.on("pageAdded", () => {
    pageNo += 1;
    draw(pageNo);
  });
}

module.exports = { attachPageNumbers };
