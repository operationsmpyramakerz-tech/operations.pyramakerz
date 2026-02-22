const fs = require("fs");
const path = require("path");

const DEFAULT_COLORS = {
  text: "#111827", // gray-900
  muted: "#6B7280", // gray-500
  border: "#E5E7EB", // gray-200
};

/**
 * Draw a header styled exactly like the Stocktaking PDF header:
 * - Logo on the LEFT
 * - Title next to it
 * - Subtitle under the title
 * - (No divider line — kept compact to maximize table space)
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
  const variant = String(opts.variant || "default").toLowerCase() === "compact" ? "compact" : "default";

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

  const headerX = mL + logoW + 10; // matches the Stocktaking header spacing

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

  // Ensure we have enough vertical space after the subtitle.
  // (PDFKit's internal cursor depends on the last drawn text block.)
  const minY = headerTopY + (variant === "compact" ? 34 : 38);
  if (doc.y < minY) doc.y = minY;

  // IMPORTANT (layout optimization):
  // The user requested removing the horizontal divider line under the page title
  // to gain vertical space and fit more table rows per page.
  // Keep only a small breathing space after the header.
  doc.y += variant === "compact" ? 6 : 8;
}

module.exports = {
  drawStocktakingHeader,
};
