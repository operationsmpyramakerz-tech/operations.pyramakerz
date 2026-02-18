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

      // Default Y: safe area inside the bottom margin
      const y = Number.isFinite(Number(opts.y)) ? Number(opts.y) : doc.page.height - 24;

      doc.save();
      doc.fillColor(color).font("Helvetica").fontSize(fontSize);
      doc.text(render(n), 0, y, { width: doc.page.width, align });
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
