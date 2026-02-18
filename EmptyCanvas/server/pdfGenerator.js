const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");

// Helper بسيط جدًا عشان نحسّن شكل العربي في PDFKit
function fixRTL(text) {
  if (!text) return text;
  // لو مفيش حروف عربية رجّع النص زي ما هو
  if (!/[\u0600-\u06FF]/.test(text)) return text;
  // نقلب الحروف علشان pdfkit بيرسم من الشمال لليمين
  return text.split("").reverse().join("");
}

function generateExpensePDF({ userName, userId, items, dateFrom, dateTo }, callback) {
  const rows = Array.isArray(items) ? items : [];

  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => callback(null, Buffer.concat(buffers)));
    doc.on("error", (err) => callback(err));

    // Page numbering (helps ordering when printing/sharing)
    // IMPORTANT: attach after data listeners, so we don't miss any chunks.
    attachPageNumbers(doc);

    // ---------------- LOGO ----------------
    try {
      const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");
      doc.image(logoPath, 45, 45, { width: 95 });
    } catch (err) {
      console.error("Logo failed:", err.message);
    }

    // ---------------- HEADER BOX & TITLE ----------------
    doc.roundedRect(30, 30, 540, 120, 14).stroke("#CFCFCF");
    doc.font("Helvetica-Bold").fontSize(22).text("Expenses Report", 160, 50);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
    const leftX = 160, rightX = 380, row1Y = 100, row2Y = 122;

    doc.fontSize(12);
    doc.font("Helvetica-Bold").text("User Name ", leftX, row1Y, { continued: true }).font("Helvetica").text(userName || "-");
    doc.font("Helvetica-Bold").text("Type ",      rightX, row1Y, { continued: true }).font("Helvetica").text("All");
    doc.font("Helvetica-Bold").text("User ID ",   leftX, row2Y, { continued: true }).font("Helvetica").text(userId || "-");
    doc.font("Helvetica-Bold").text("Date ",      rightX, row2Y, { continued: true }).font("Helvetica").text(timestamp);

    // ---------------- DURATION ----------------
    function formatDisplayDate(dateStr) {
      if (!dateStr) return "-";
      if (/^\d{2} [A-Za-z]{3} \d{2}$/.test(dateStr)) return dateStr;
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d
        .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
        .replace(/ /g, " ");
    }

    let fromText = formatDisplayDate(dateFrom);
    let toText   = formatDisplayDate(dateTo);

    if ((!dateFrom || !dateTo) && rows.length > 0) {
      const dates = rows.map(r => r.date).filter(Boolean).sort();
      fromText = formatDisplayDate(dates[0]);
      toText   = formatDisplayDate(dates[dates.length - 1]);
    }

    const durationY = 170;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("Duration:", 40, durationY);

    doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
    doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");

    doc.font("Helvetica").fontSize(13).fillColor("#000").text(fromText, 140, durationY + 5);
    doc.text(toText, 330, durationY + 5);

    // ---------------- SUMMARY BOXES ----------------
    const totalIn = rows.reduce((s, i) => s + (i.cashIn || 0), 0);
    const totalOut = rows.reduce((s, i) => s + (i.cashOut || 0), 0);
    const balance = totalIn - totalOut;

    const summaryY = durationY + 50;

    doc.roundedRect(40, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash in", 50, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#16A34A").text(`${totalIn.toLocaleString()} EGP`, 50, summaryY + 38);

    doc.roundedRect(210, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash out", 220, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#DC2626").text(`${totalOut.toLocaleString()} EGP`, 220, summaryY + 38);

    doc.roundedRect(380, summaryY, 150, 70, 12).stroke("#D9D9D9");
    doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Final Balance", 390, summaryY + 15);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#2563EB").text(`${balance.toLocaleString()} EGP`, 390, summaryY + 38);

    // ---------------- Total No. of entries ----------------
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000")
       .text(`Total No. of entries: ${rows.length}`, 40, summaryY + 90);

    // ======================================================
    // ================   MODERN TABLE  ======================
    // ======================================================

    const tableTop     = summaryY + 120;
    const tableLeft    = 40;
    const tableRight   = 560;
    const tableWidth   = tableRight - tableLeft;
    const headerHeight = 24;
    const cellPaddingX = 6;

    // تعريف الأعمدة (x + width + align)
const columns = [
  { key: "date",      label: "Date",     width: 60,  align: "left"   },
  { key: "fundsType", label: "Type",     width: 75,  align: "left"   },   // أصغر شوية
  { key: "reason",    label: "Reason",   width: 115, align: "left"   },   // أصغر شوية
  { key: "from",      label: "From",     width: 45,  align: "center" },
  { key: "to",        label: "To",       width: 45,  align: "center" },
  { key: "kilometer", label: "KM",       width: 30,  align: "center" },
  { key: "cashIn",    label: "Cash In",  width: 70,  align: "right"  },   // وسّعناه
  { key: "cashOut",   label: "Cash Out", width: 80,  align: "right"  },   // زي ما هو واسع
];

    // حساب الـ x لكل عمود
    let accX = tableLeft;
    columns.forEach((col) => {
      col.x = accX;
      accX += col.width;
    });

    let y = tableTop;

    // إطار كامل حوالين الجدول
    const tableTotalHeight = 300; // تقريبًا
    doc.roundedRect(tableLeft, y, tableWidth, tableTotalHeight, 6).stroke("#E5E7EB");

    // --- Header background ---
    doc.rect(tableLeft, y, tableWidth, headerHeight).fill("#F5F5F5");
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10);

    columns.forEach((col) => {
      const opts = {
        width: col.width - 2 * cellPaddingX,
        align: "left",
      };
      doc.text(col.label, col.x + cellPaddingX, y + 6, opts);
    });

    // خط تحت الهيدر
    doc.moveTo(tableLeft, y + headerHeight)
       .lineTo(tableRight, y + headerHeight)
       .lineWidth(0.8)
       .stroke("#E5E7EB");

    y += headerHeight;

    // --- Rows ---
    doc.font("Helvetica").fontSize(9);

    rows.forEach((item, index) => {
      const rowData = {
        date:       formatDisplayDate(item.date),
        fundsType:  item.fundsType || "-",
        reason:     fixRTL(item.reason || "-"),
        from:       fixRTL(item.from || "-"),
        to:         fixRTL(item.to || "-"),
        kilometer:  item.kilometer != null ? String(item.kilometer) : "-",
        cashIn:     item.cashIn > 0 ? item.cashIn.toLocaleString() : "-",
        cashOut:    item.cashOut > 0 ? item.cashOut.toLocaleString() : "-",
      };

      const cellHeights = columns.map((col) => {
        const txt = rowData[col.key];
        return doc.heightOfString(txt, {
          width: col.width - 2 * cellPaddingX,
          align: "left",
        });
      });

      let rowHeight = Math.max(...cellHeights) + 6;
      if (rowHeight < 18) rowHeight = 18;

      if (index % 2 === 0) {
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill("#FAFAFA");
      }

      doc.lineWidth(0.4).strokeColor("#E5E7EB");
      columns.forEach((col, i) => {
        if (i > 0) {
          doc.moveTo(col.x, y).lineTo(col.x, y + rowHeight).stroke();
        }
      });
      doc.moveTo(tableRight, y).lineTo(tableRight, y + rowHeight).stroke();

      columns.forEach((col) => {
        const txt  = rowData[col.key];
        const opts = {
          width: col.width - 2 * cellPaddingX,
          align: "left",
        };
        const textY = y + 4;

        if (col.key === "cashIn") {
          if (item.cashIn > 0) {
            doc.fillColor("#16A34A").font("Helvetica-Bold");
          } else {
            doc.fillColor("#9CA3AF").font("Helvetica");
          }
        } else if (col.key === "cashOut") {
          if (item.cashOut > 0) {
            doc.fillColor("#DC2626").font("Helvetica-Bold");
          } else {
            doc.fillColor("#9CA3AF").font("Helvetica");
          }
        } else {
          doc.fillColor("#111827").font("Helvetica");
        }

        doc.text(txt, col.x + cellPaddingX, textY, opts);
      });

      y += rowHeight;
      doc.moveTo(tableLeft, y)
         .lineTo(tableRight, y)
         .lineWidth(0.4)
         .stroke("#E5E7EB");
    });

    // مفيش footer ولا Generated تحت
    doc.end();
  } catch (err) {
    console.error("generateExpensePDF error:", err);
    callback(err);
  }
}

module.exports = generateExpensePDF;
