const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");
const { drawStocktakingHeader } = require("./pdfHeader");
const { enableArabicPdf, ensurePdfArabicSupport } = require("./pdfArabicSupport");

function formatDateTime(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date || "-");
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
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("www.")) return `https://${value}`;
  return "";
}

async function readRemoteImageBuffer(url) {
  const normalized = normalizeUrl(url);
  if (!normalized || typeof fetch !== "function") return null;

  try {
    const response = await fetch(normalized);
    if (!response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const pathname = (() => {
      try {
        return new URL(normalized).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();

    const isSupported =
      contentType.includes("image/png") ||
      contentType.includes("image/jpeg") ||
      /\.(png|jpe?g)$/.test(pathname);

    if (!isSupported) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function ensureText(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toUniqueTextList(value) {
  const out = [];
  const seen = new Set();

  const push = (entry) => {
    const text = String(entry || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };

  if (Array.isArray(value)) value.forEach((entry) => push(entry));
  else push(value);

  return out;
}

function drawFieldCard(doc, x, y, w, label, value, options = {}) {
  const COLORS = options.colors;
  const valueText = ensureText(value);
  const labelH = 12;

  doc.font("Helvetica").fontSize(11);
  const valueH = doc.heightOfString(valueText, {
    width: w - 24,
    align: "left",
    lineGap: 1,
  });

  const h = Math.max(62, 14 + labelH + 8 + valueH + 14);

  doc.save();
  doc.roundedRect(x, y, w, h, 12).lineWidth(1).strokeColor(COLORS.border).fillAndStroke("#FFFFFF", COLORS.border);
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(String(label || "").trim(), x + 12, y + 12, {
    width: w - 24,
    align: "left",
  });
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(11).text(valueText, x + 12, y + 12 + labelH + 8, {
    width: w - 24,
    align: "left",
    lineGap: 2,
  });
  doc.restore();

  return h;
}

async function pipeMaintenanceReceiptPDF(params = {}, stream) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  doc.pipe(stream);
  attachPageNumbers(doc);

  const COLORS = {
    text: "#111827",
    muted: "#6B7280",
    border: "#E5E7EB",
    soft: "#F9FAFB",
    accentBg: "#EEF2FF",
    accentBorder: "#C7D2FE",
  };

  const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");

  const metrics = () => {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const mL = doc.page.margins.left;
    const mR = doc.page.margins.right;
    const mT = doc.page.margins.top;
    const mB = doc.page.margins.bottom;
    return {
      pageW,
      pageH,
      mL,
      mR,
      mT,
      mB,
      contentW: pageW - mL - mR,
      maxY: pageH - mB - 18,
    };
  };

  const drawHeader = (compact = false) => {
    drawStocktakingHeader(doc, {
      title: "Maintenance Receipt",
      subtitle: `Order: ${ensureText(params.orderId)}`,
      variant: compact ? "compact" : "default",
      logoPath,
      colors: COLORS,
    });
  };

  const ensureSpace = (height = 24) => {
    const { maxY } = metrics();
    if (doc.y + height <= maxY) return;
    doc.addPage();
    drawHeader(true);
  };

  const drawSectionTitle = (title) => {
    ensureSpace(30);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12).text(String(title || "").trim(), doc.page.margins.left, doc.y, {
      width: metrics().contentW,
      align: "left",
    });
    doc.moveDown(0.4);
  };

  const drawTextBlock = (label, value, minHeight = 82) => {
    ensureSpace(minHeight + 20);
    const { mL, contentW } = metrics();
    const y = doc.y;
    const text = ensureText(value);

    doc.font("Helvetica").fontSize(11);
    const textHeight = doc.heightOfString(text, {
      width: contentW - 24,
      align: "left",
      lineGap: 2,
    });
    const boxH = Math.max(minHeight, 16 + 12 + 10 + textHeight + 16);

    doc.save();
    doc.roundedRect(mL, y, contentW, boxH, 14).lineWidth(1).strokeColor(COLORS.border).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(String(label || "").trim(), mL + 12, y + 12, {
      width: contentW - 24,
      align: "left",
    });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(11).text(text, mL + 12, y + 34, {
      width: contentW - 24,
      align: "left",
      lineGap: 2,
    });
    doc.restore();
    doc.y = y + boxH + 12;
  };

  const drawComponentsTable = (rows) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      drawTextBlock("Components", "No components found.", 62);
      return;
    }

    const { mL, contentW } = metrics();
    const colId = 92;
    const colQty = 70;
    const colComponent = contentW - colId - colQty;

    const drawHeaderRow = () => {
      ensureSpace(46);
      const y = doc.y;
      doc.save();
      doc.roundedRect(mL, y, contentW, 34, 12).fillAndStroke(COLORS.accentBg, COLORS.accentBorder);
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10);
      doc.text("ID code", mL + 12, y + 11, { width: colId - 16, align: "left" });
      doc.text("Component", mL + colId, y + 11, { width: colComponent - 16, align: "left" });
      doc.text("Qty", mL + colId + colComponent, y + 11, { width: colQty - 12, align: "right" });
      doc.restore();
      doc.y = y + 42;
    };

    drawHeaderRow();

    safeRows.forEach((row, idx) => {
      doc.font("Helvetica").fontSize(10);
      const componentText = ensureText(row?.component, "Unknown");
      const rowHeight = Math.max(
        34,
        doc.heightOfString(componentText, { width: colComponent - 16, lineGap: 1 }) + 18,
      );

      ensureSpace(rowHeight + 14);
      if (doc.y + rowHeight > metrics().maxY) {
        doc.addPage();
        drawHeader(true);
        drawHeaderRow();
      }

      const y = doc.y;
      doc.save();
      doc.roundedRect(mL, y, contentW, rowHeight, 12).fillAndStroke(idx % 2 === 0 ? "#FFFFFF" : COLORS.soft, COLORS.border);
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);
      doc.text(ensureText(row?.idCode, "—"), mL + 12, y + 10, { width: colId - 16, align: "left" });
      doc.text(componentText, mL + colId, y + 10, { width: colComponent - 16, align: "left", lineGap: 1 });
      doc.text(String(row?.qty ?? 0), mL + colId + colComponent, y + 10, { width: colQty - 12, align: "right" });
      doc.restore();
      doc.y = y + rowHeight + 8;
    });
  };

  drawHeader(false);

  const { mL, contentW } = metrics();
  const metaY = doc.y;
  const metaW = (contentW - 12) / 2;

  const metaHeights = [
    drawFieldCard(doc, mL, metaY, metaW, "Order", params.orderId, { colors: COLORS }),
    drawFieldCard(doc, mL + metaW + 12, metaY, metaW, "Date", formatDateTime(params.createdAt), { colors: COLORS }),
  ];
  const metaY2 = metaY + Math.max(...metaHeights) + 12;
  const metaHeights2 = [
    drawFieldCard(doc, mL, metaY2, metaW, "Requested by", params.requestedBy, { colors: COLORS }),
    drawFieldCard(doc, mL + metaW + 12, metaY2, metaW, "Operations", params.operationsBy, { colors: COLORS }),
  ];
  doc.y = metaY2 + Math.max(...metaHeights2) + 18;

  drawSectionTitle("Issue Overview");
  drawTextBlock("Issue Description", params.issueDescription, 76);
  drawTextBlock("The Actual Issue Description", params.actualIssueDescription, 92);
  drawTextBlock("Repair Action", params.repairAction, 92);

  drawSectionTitle("Resolution Summary");
  const summaryY = doc.y;
  const summaryW = (contentW - 12) / 2;
  const sparePartsText = toUniqueTextList(params.sparePartsReplacedList || params.sparePartsReplaced).join(", ");
  const summaryHeights = [
    drawFieldCard(doc, mL, summaryY, summaryW, "Resolution Method", params.resolutionMethod, { colors: COLORS }),
    drawFieldCard(doc, mL + summaryW + 12, summaryY, summaryW, "Spare parts replaced", sparePartsText, { colors: COLORS }),
  ];
  doc.y = summaryY + Math.max(...summaryHeights) + 18;

  drawSectionTitle("Components");
  drawComponentsTable(params.rows);

  drawSectionTitle("Attached Maintenance Receipt");
  const receiptFiles = Array.isArray(params.maintenanceReceiptFiles) && params.maintenanceReceiptFiles.length
    ? params.maintenanceReceiptFiles
    : [{ name: params.maintenanceReceiptName, url: params.maintenanceReceiptUrl }].filter((item) => item?.name || item?.url);

  if (!receiptFiles.length) {
    drawTextBlock("Receipt file", "No maintenance receipt image uploaded.", 64);
  } else {
    let renderedAny = false;
    for (let index = 0; index < receiptFiles.length; index += 1) {
      const file = receiptFiles[index] || {};
      const fileLabel = file?.name || `Receipt ${index + 1}`;
      const imageBuffer = await readRemoteImageBuffer(file?.url);

      if (imageBuffer) {
        ensureSpace(336);
        const startY = doc.y;
        const boxH = 312;
        doc.save();
        doc.roundedRect(mL, startY, contentW, boxH, 14).fillAndStroke("#FFFFFF", COLORS.border);
        doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(fileLabel, mL + 12, startY + 12, {
          width: contentW - 24,
        });
        try {
          doc.image(imageBuffer, mL + 12, startY + 36, {
            fit: [contentW - 24, boxH - 48],
            align: "center",
            valign: "center",
          });
        } catch {
          doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11).text("The attached maintenance receipt could not be embedded in the PDF.", mL + 12, startY + 48, {
            width: contentW - 24,
          });
        }
        doc.restore();
        doc.y = startY + boxH + 12;
        renderedAny = true;
        continue;
      }

      drawTextBlock(fileLabel, file?.url || file?.name || "Receipt image unavailable.", 64);
      renderedAny = true;
    }

    if (!renderedAny) {
      const fallbackText = params.maintenanceReceiptName || params.maintenanceReceiptUrl || "No maintenance receipt image uploaded.";
      drawTextBlock("Receipt file", fallbackText, 64);
    }
  }

  return await new Promise((resolve, reject) => {
    const done = () => resolve();
    const fail = (err) => reject(err);
    stream.once("finish", done);
    stream.once("close", done);
    stream.once("error", fail);
    doc.once("error", fail);
    doc.end();
  });
}

module.exports = {
  pipeMaintenanceReceiptPDF,
};
