const fs = require("fs");
const path = require("path");

const DEFAULT_COLORS = {
  text: "#111827", // gray-900
  muted: "#6B7280", // gray-500
  border: "#E5E7EB", // gray-200
};

/**
 * Draw a header styled like the Stocktaking PDFs:
 * - Logo on the LEFT
 * - Title next to it
 * - Subtitle under the title
 * - A compact separator line UNDER the logo (between header and page body)
 *
 * Note:
 * This replaces the old divider line that used to appear under the subtitle.
 *
 * @param {import('pdfkit')} doc
 * @param {{
 *  title: string,
 *  subtitle?: string,
 *  variant?: 'default'|'compact',
 *  logoPath?: string,
 *  colors?: {text?:string, muted?:string, border?:string},
 * }} opts
 */
function drawStocktakingHeader(doc, opts = {}) {
  if (!doc) return;

  const title = String(opts.title || "").trim();
  const subtitle = opts.subtitle != null ? String(opts.subtitle) : "";
  const variant =
    String(opts.variant || "default").toLowerCase() === "compact"
      ? "compact"
      : "default";

  const colors = {
    ...DEFAULT_COLORS,
    ...(opts.colors || {}),
  };

  const logoPath =
    opts.logoPath || path.join(__dirname, "..", "public", "images", "logo.png");

  const logoW = variant === "compact" ? 36 : 42;
  const titleSize = variant === "compact" ? 16 : 18;
  const subtitleSize = variant === "compact" ? 9 : 10;

  const pageW = doc.page.width;
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const headerTopY = doc.y;

  // Logo (left)
  try {
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, mL, headerTopY, { width: logoW });
    }
  } catch {
    // Ignore logo errors.
  }

  const headerX = mL + logoW + 10;

  // Title
  doc
    .fillColor(colors.text)
    .font("Helvetica-Bold")
    .fontSize(titleSize)
    .text(title || " ", headerX, headerTopY);

  // Subtitle
  if (subtitle) {
    doc
      .fillColor(colors.muted)
      .font("Helvetica")
      .fontSize(subtitleSize)
      .text(subtitle, headerX, headerTopY + 22);
  }

  // 1) Make sure the writing cursor is at least after the subtitle.
  // (PDFKit's internal cursor depends on the last drawn text block.)
  const minTextBottomY = headerTopY + (variant === "compact" ? 34 : 38);
  if (doc.y < minTextBottomY) doc.y = minTextBottomY;

  // 2) Place the separator line under the logo (and below subtitle if it wraps).
  const logoBottomY = headerTopY + logoW;
  const contentBottomY = Math.max(logoBottomY, doc.y);
  const separatorY = contentBottomY + (variant === "compact" ? 2 : 3);

  doc
    .moveTo(mL, separatorY)
    .lineTo(pageW - mR, separatorY)
    .lineWidth(1)
    .strokeColor(colors.border)
    .stroke();

  // 3) Start body content shortly after the separator.
  // Keep it tight to preserve vertical space.
  doc.y = separatorY + (variant === "compact" ? 3 : 4);
}

module.exports = {
  drawStocktakingHeader,
};
