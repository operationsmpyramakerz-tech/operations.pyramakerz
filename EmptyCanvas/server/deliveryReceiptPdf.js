const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");

function moneyGBP(n) {
  const num = Number(n) || 0;
  return `£${num.toFixed(2)}`;
}

function formatDateTime(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date || "-");
    // Matches UI style like: 8 Jan 2026, 09:36
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(date || "-");
  }
}

function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("www.")) return `https://${s}`;
  // Avoid creating broken links
  return null;
}


// Pastel palette (similar to Stocktaking tags UI)
const TAG_PALETTE = [
  { bg: "#FDF2F8", border: "#FBCFE8", text: "#9D174D", pill: "#FCE7F3" }, // pink
  { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", pill: "#D1FAE5" }, // green
  { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", pill: "#DBEAFE" }, // blue
  { bg: "#FEFCE8", border: "#FDE68A", text: "#92400E", pill: "#FEF3C7" }, // yellow
  { bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6", pill: "#EDE9FE" }, // purple
  { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412", pill: "#FFEDD5" }, // orange
  { bg: "#F0FDFA", border: "#99F6E4", text: "#115E59", pill: "#CCFBF1" }, // teal
];

function hashString(str) {
  const s = String(str || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return h;
}

function pickTagColors(key) {
  const idx = Math.abs(hashString(key)) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

function groupByReason(rows) {
  const map = new Map();
  const order = [];
  for (const r of rows || []) {
    const reasonRaw = String(r?.reason || "").trim();
    const reason = reasonRaw || "No Reason";
    if (!map.has(reason)) {
      map.set(reason, []);
      order.push(reason);
    }
    map.get(reason).push(r);
  }

  // Sort (keep No Reason at the end)
  const noReason = order.filter((x) => x === "No Reason");
  const others = order
    .filter((x) => x !== "No Reason")
    .sort((a, b) => String(a).localeCompare(String(b)));
  const sorted = others.concat(noReason);

  return sorted.map((reason) => ({ reason, rows: map.get(reason) || [] }));
}

/**
 * Generate Delivery Receipt PDF and pipe it to a writable stream (e.g. Express res).
 *
 * Notes (customizations requested):
 * - Signature (handover confirmation) appears on EVERY page.
 * - Items are grouped by Reason (each group styled like a "tag" section).
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {Date} params.createdAt
 * @param {string} params.teamMember
 * @param {string} params.preparedBy
 * @param {Array<{idCode?:string,component:string,reason:string,qty:number,unit:number,total:number}>} params.rows
 * @param {number} params.grandQty
 * @param {number} params.grandTotal
 * @param {import('stream').Writable} stream
 */
function pipeDeliveryReceiptPDF(
  {
    orderId,
    createdAt,
    teamMember,
    preparedBy,
    rows,
    grandQty,
    grandTotal,
    // Optional layout overrides
    metaLayout = "default", // "default" | "teamReasonFirst"
    groupByReason: groupByReasonOpt = true,
    showReasonTagBar: showReasonTagBarOpt = true,
    // Used for header colors when grouping is disabled
    headerColorKey = null,
  },
  stream,
) {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  doc.pipe(stream);
  // Page numbering (helps ordering when printing/sharing)
  // Attach after piping so the first page number is included in the output stream.
  attachPageNumbers(doc);

  const COLORS = {
    border: "#E5E7EB",
    muted: "#6B7280",
    text: "#111827",
    zebra: "#FAFAFA",
  };

  const safeRows = Array.isArray(rows) ? rows : [];

  // Default behavior keeps the original grouping by reason.
  // For Current Orders we can disable grouping & hide the reason tag bar.
  const singleKey =
    String(headerColorKey || preparedBy || orderId || "Order").trim() || "Order";
  const groups = groupByReasonOpt
    ? groupByReason(safeRows)
    : [{ reason: singleKey, rows: safeRows }];

  const logoPath = path.join(__dirname, "..", "public", "images", "Logo horizontal.png");

  // Footer (signature) layout constants
  const FOOTER = {
    titleFont: 12,
    titleLineH: 16,
    titleToBoxesGap: 10,
    boxH: 120,
    bottomGap: 10,
  };
  const FOOTER_RESERVED = FOOTER.titleLineH + FOOTER.titleToBoxesGap + FOOTER.boxH + FOOTER.bottomGap + 6;

  function metrics() {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const mL = doc.page.margins.left;
    const mR = doc.page.margins.right;
    const mT = doc.page.margins.top;
    const mB = doc.page.margins.bottom;
    const contentW = pageW - mL - mR;
    const bottomY = pageH - mB;
    const effectiveBottomY = bottomY - FOOTER_RESERVED;
    return { pageW, pageH, mL, mR, mT, mB, contentW, bottomY, effectiveBottomY };
  }

  function drawPageHeader({ compact = false } = {}) {
    const { pageW, mL, mR, mT, contentW } = metrics();
    const headerTop = mT;
    const headerH = compact ? 42 : 56;

    // Logo (top-right)
    try {
      const logoW = compact ? 140 : 170;
      const logoX = pageW - mR - logoW;
      const logoY = headerTop - 4;
      doc.image(logoPath, logoX, logoY, { width: logoW });
    } catch {
      // ignore logo errors (missing asset on env)
    }

    // Title (left)
    const titleX = mL;
    const titleY = headerTop + (compact ? 2 : 6);
    const titleW = contentW - (compact ? 150 : 180);
    doc
      .fillColor(COLORS.text)
      .font("Helvetica-Bold")
      .fontSize(compact ? 16 : 20)
      .text("Delivery Receipt", titleX, titleY, {
        width: Math.max(120, titleW),
        align: "left",
      });

    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(10)
      .text("Operations Hub", titleX, titleY + (compact ? 18 : 24), {
        width: Math.max(120, titleW),
        align: "left",
      });

    // Divider line
    const lineY = headerTop + headerH;
    doc
      .moveTo(mL, lineY)
      .lineTo(pageW - mR, lineY)
      .lineWidth(1)
      .strokeColor(COLORS.border)
      .stroke();

    doc.y = lineY + 14;
  }

  function drawFooterSignature() {
    const { pageH, mL, mR, mB, contentW, bottomY } = metrics();

    const prevY = doc.y;
    doc.save();

    const footerBottom = bottomY;
    const boxesBottom = footerBottom - FOOTER.bottomGap;
    const boxesY = boxesBottom - FOOTER.boxH;
    const titleY = boxesY - (FOOTER.titleLineH + FOOTER.titleToBoxesGap);

    // Title
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(FOOTER.titleFont);
    doc.text("Handover confirmation", mL, titleY, { width: contentW, align: "left" });

    const gap = 16;
    const boxW = (contentW - gap) / 2;
    const boxH = FOOTER.boxH;
    const leftX = mL;
    const rightX = mL + boxW + gap;

    function drawSignatureBox(title, x, y) {
      doc.roundedRect(x, y, boxW, boxH, 10).lineWidth(1).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10);
      doc.text(title, x + 12, y + 10, { width: boxW - 24, align: "left" });

      const lineStartX = x + 12;
      const lineEndX = x + boxW - 12;

      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9);

      doc.text("Name", lineStartX, y + 34);
      doc
        .moveTo(lineStartX + 40, y + 45)
        .lineTo(lineEndX, y + 45)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();

      doc.text("Signature", lineStartX, y + 58);
      doc
        .moveTo(lineStartX + 55, y + 69)
        .lineTo(lineEndX, y + 69)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();

      doc.text("Date", lineStartX, y + 82);
      doc
        .moveTo(lineStartX + 30, y + 93)
        .lineTo(lineStartX + 95, y + 93)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("/", lineStartX + 102, y + 84);
      doc
        .moveTo(lineStartX + 110, y + 93)
        .lineTo(lineStartX + 175, y + 93)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("/", lineStartX + 182, y + 84);
      doc
        .moveTo(lineStartX + 190, y + 93)
        .lineTo(lineEndX, y + 93)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
    }

    drawSignatureBox("Delivered to", leftX, boxesY);
    drawSignatureBox("Operations", rightX, boxesY);

    doc.restore();
    doc.y = prevY;
  }

  function ensureSpace(neededHeight, { onNewPage } = {}) {
    const { effectiveBottomY } = metrics();
    if (doc.y + neededHeight <= effectiveBottomY) return;

    doc.addPage();
    drawPageHeader({ compact: true });
    drawFooterSignature();
    if (typeof onNewPage === "function") onNewPage();
  }

  // ======== Header (page 1) + footer ========
  drawPageHeader({ compact: false });
  drawFooterSignature();

  // ======== Meta small table (page 1) ========
  const { pageW, pageH, mL, mR, mB, contentW } = metrics();
  const metaX = mL;
  const metaY = doc.y;
  const metaW = contentW;
  const metaRowH = 30;
  const metaH = metaRowH * 2;
  const metaColW = metaW / 2;

  doc
    .roundedRect(metaX, metaY, metaW, metaH, 8)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();
  // inner lines
  doc
    .moveTo(metaX + metaColW, metaY)
    .lineTo(metaX + metaColW, metaY + metaH)
    .strokeColor(COLORS.border)
    .stroke();
  doc
    .moveTo(metaX, metaY + metaRowH)
    .lineTo(metaX + metaW, metaY + metaRowH)
    .strokeColor(COLORS.border)
    .stroke();

  function drawMetaCell(label, value, x, y, w) {
    const padX = 10;
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(label, x + padX, y + 6, { width: w - padX * 2, align: "left" });
    doc
      .fillColor(COLORS.text)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(value || "—", x + padX, y + 16, { width: w - padX * 2, align: "left" });
  }

  if (String(metaLayout || "").toLowerCase() === "teamreasonfirst") {
    // Requested for Current Orders:
    // Team member | Reason
    // Order ID     | Date
    drawMetaCell("Team member", String(teamMember || "—"), metaX, metaY, metaColW);
    drawMetaCell("Reason", String(preparedBy || "—"), metaX + metaColW, metaY, metaColW);
    drawMetaCell("Order ID", String(orderId || "—"), metaX, metaY + metaRowH, metaColW);
    drawMetaCell("Date", formatDateTime(createdAt), metaX + metaColW, metaY + metaRowH, metaColW);
  } else {
    // Default (Operations Orders)
    drawMetaCell("Order ID", String(orderId || "—"), metaX, metaY, metaColW);
    drawMetaCell("Date", formatDateTime(createdAt), metaX + metaColW, metaY, metaColW);
    drawMetaCell("Team member", String(teamMember || "—"), metaX, metaY + metaRowH, metaColW);
    drawMetaCell(
      "Prepared by (Operations)",
      String(preparedBy || "—"),
      metaX + metaColW,
      metaY + metaRowH,
      metaColW,
    );
  }

  doc.y = metaY + metaH + 18;

  // ======== Items tables (grouped by Reason) ========
  const tableX = mL;
  const tableW = contentW;
  const headerH = 26;
  const cellPadX = 8;
  const tagBarH = 28;

  // columns (sum == tableW)
  const colWIdCode = Math.round(tableW * 0.18);
  const colWComponent = Math.round(tableW * 0.46);
  const colWQty = Math.round(tableW * 0.08);
  const colWUnit = Math.round(tableW * 0.14);
  const colWTotal = tableW - colWIdCode - colWComponent - colWQty - colWUnit;

  const columns = [
    { key: "idCode", label: "ID Code", width: colWIdCode, align: "left" },
    { key: "component", label: "Component", width: colWComponent, align: "left" },
    { key: "qty", label: "Qty", width: colWQty, align: "right" },
    { key: "unit", label: "Unit", width: colWUnit, align: "right" },
    { key: "total", label: "Total", width: colWTotal, align: "right" },
  ];

  let accX = tableX;
  columns.forEach((c) => {
    c.x = accX;
    accX += c.width;
  });

  function drawTagBar(reason, count, tagColors) {
    const y = doc.y;
    doc
      .roundedRect(tableX, y, tableW, tagBarH, 10)
      .fill(tagColors.bg)
      .strokeColor(tagColors.border)
      .lineWidth(1)
      .stroke();

    // Left label
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(10);
    const label = "Reason";
    doc.text(label, tableX + 12, y + 8, { width: 70, align: "left" });

    // Pill with reason name
    const pillText = String(reason || "No Reason");
    doc.font("Helvetica-Bold").fontSize(10);
    const pillW = Math.min(360, doc.widthOfString(pillText) + 26);
    const pillX = tableX + 70;
    doc
      .roundedRect(pillX, y + 5, pillW, 18, 9)
      .fill(tagColors.pill)
      .strokeColor(tagColors.border)
      .lineWidth(1)
      .stroke();
    doc.fillColor(tagColors.text).text(pillText, pillX + 12, y + 8, {
      width: pillW - 24,
      align: "left",
      ellipsis: true,
    });

    // Right count
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10);
    doc.text(`${Number(count) || 0} items`, tableX + 12, y + 8, {
      width: tableW - 24,
      align: "right",
    });

    doc.y = y + tagBarH + 8;
  }

  function drawTableHeader(tagColors) {
    const y = doc.y;

    // background
    doc.rect(tableX, y, tableW, headerH).fill(tagColors.bg);

    // border
    doc
      .rect(tableX, y, tableW, headerH)
      .lineWidth(1)
      .strokeColor(tagColors.border)
      .stroke();

    // labels
    doc.fillColor(tagColors.text).font("Helvetica-Bold").fontSize(10);
    columns.forEach((c) => {
      doc.text(c.label, c.x + cellPadX, y + 8, {
        width: c.width - cellPadX * 2,
        align: c.align,
      });
    });

    // bottom line
    doc
      .moveTo(tableX, y + headerH)
      .lineTo(tableX + tableW, y + headerH)
      .lineWidth(1)
      .strokeColor(tagColors.border)
      .stroke();

    doc.y = y + headerH;
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const tagColors = pickTagColors(g.reason);
    const items = (g.rows || []).slice().sort((a, b) =>
      String(a?.component || "").localeCompare(String(b?.component || "")),
    );

    const needsTagBar = Boolean(showReasonTagBarOpt);
    const groupHeaderHeight = (needsTagBar ? tagBarH + 8 : 0) + headerH + 6;
    ensureSpace(groupHeaderHeight);
    const drawGroupHeader = () => {
      if (needsTagBar) drawTagBar(g.reason, items.length, tagColors);
      drawTableHeader(tagColors);
    };
    drawGroupHeader();

    doc.font("Helvetica").fontSize(10).fillColor(COLORS.text);

    items.forEach((r, idx) => {
      const rowData = {
        idCode: String(r.idCode || ""),
        component: String(r.component || ""),
        qty: String(Number(r.qty) || 0),
        unit: moneyGBP(r.unit),
        total: moneyGBP(r.total),
      };

      const hId = doc.heightOfString(rowData.idCode, {
        width: colWIdCode - cellPadX * 2,
      });
      const hComponent = doc.heightOfString(rowData.component, {
        width: colWComponent - cellPadX * 2,
      });
      const rowH = Math.max(20, hId, hComponent) + 8;

      ensureSpace(rowH + 6, { onNewPage: drawGroupHeader });

      const y = doc.y;

      // zebra background
      if (idx % 2 === 0) {
        doc.rect(tableX, y, tableW, rowH).fill(COLORS.zebra);
        doc.fillColor(COLORS.text);
      }

      // grid
      doc.lineWidth(0.6).strokeColor(COLORS.border);
      // left / right borders
      doc.moveTo(tableX, y).lineTo(tableX, y + rowH).stroke();
      doc.moveTo(tableX + tableW, y).lineTo(tableX + tableW, y + rowH).stroke();
      for (let i = 1; i < columns.length; i++) {
        doc.moveTo(columns[i].x, y).lineTo(columns[i].x, y + rowH).stroke();
      }
      // row bottom line
      doc.moveTo(tableX, y + rowH).lineTo(tableX + tableW, y + rowH).stroke();

      // text
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);
      const componentLink = normalizeUrl(r.link || r.url || r.componentLink || r.href);

      columns.forEach((c) => {
        const opts = {
          width: c.width - cellPadX * 2,
          align: c.align,
        };

        // Make component name clickable (open component URL)
        if (c.key === "component" && componentLink) {
          opts.link = componentLink;
        }

        doc.text(rowData[c.key], c.x + cellPadX, y + 6, opts);
      });

      doc.y = y + rowH;
    });

    // space between groups
    doc.y += 14;
  }

  // ======== Totals summary (last page area, above footer) ========
  ensureSpace(90);
  doc.y += 10;

  const { mL: sumML, contentW: sumContentW } = metrics();
  const sumW = 220;
  const sumH = 54;
  const sumX = sumML + sumContentW - sumW;
  const sumY = doc.y;

  doc.roundedRect(sumX, sumY, sumW, sumH, 10).lineWidth(1).strokeColor(COLORS.border).stroke();

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9);
  doc.text("Total quantity", sumX + 12, sumY + 10, { width: sumW - 24, align: "left" });
  doc.text("Grand total", sumX + 12, sumY + 30, { width: sumW - 24, align: "left" });

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11);
  doc.text(String(Number(grandQty) || 0), sumX + 12, sumY + 8, { width: sumW - 24, align: "right" });
  doc.text(moneyGBP(grandTotal), sumX + 12, sumY + 28, { width: sumW - 24, align: "right" });

  doc.end();
}

module.exports = {
  pipeDeliveryReceiptPDF,
};
