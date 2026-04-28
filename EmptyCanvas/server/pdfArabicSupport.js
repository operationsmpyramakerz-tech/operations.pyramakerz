const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");

const ARABIC_REGULAR_FONT = "PyramakerzArabicRegular";
const ARABIC_BOLD_FONT = "PyramakerzArabicBold";

const DEFAULT_ARABIC_FONT_URLS = [
  "https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf",
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf",
  "https://cdn.jsdelivr.net/fontsource/fonts/amiri@latest/arabic-400-normal.ttf",
  "https://cdn.jsdelivr.net/fontsource/fonts/amiri@latest/arabic-400-normal.woff2",
];
const DEFAULT_ARABIC_BOLD_FONT_URLS = [
  "https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Bold.ttf",
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf",
  "https://cdn.jsdelivr.net/fontsource/fonts/amiri@latest/arabic-700-normal.ttf",
  "https://cdn.jsdelivr.net/fontsource/fonts/amiri@latest/arabic-700-normal.woff2",
];

let cachedFontPaths = null;
let ensurePromise = null;

function safeStatFile(filePath) {
  try {
    if (!filePath) return false;
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 8 * 1024;
  } catch {
    return false;
  }
}

function projectRoot() {
  return path.join(__dirname, "..");
}

function splitEnvList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fontsourceCandidates(kind = "regular") {
  try {
    const pkgPath = require.resolve("@fontsource/amiri/package.json", {
      paths: [projectRoot(), __dirname, process.cwd()],
    });
    const dir = path.dirname(pkgPath);
    const weight = kind === "bold" ? "700" : "400";
    return [
      path.join(dir, "files", `amiri-arabic-${weight}-normal.woff2`),
      path.join(dir, "files", `amiri-arabic-${weight}-normal.woff`),
      path.join(dir, "files", `amiri-all-${weight}-normal.woff2`),
      path.join(dir, "files", `amiri-all-${weight}-normal.woff`),
    ];
  } catch {
    return [];
  }
}

function commonFontCandidates(kind = "regular", options = {}) {
  const root = projectRoot();
  const isBold = kind === "bold";
  const includeSystem = options.includeSystem !== false;
  const envPath = isBold
    ? (process.env.PDF_ARABIC_BOLD_FONT_PATH || process.env.ARABIC_BOLD_FONT_PATH)
    : (process.env.PDF_ARABIC_FONT_PATH || process.env.ARABIC_FONT_PATH);

  const tmpDir = path.join(os.tmpdir(), "pyramakerz-pdf-fonts");
  const downloadedName = isBold ? "Amiri-Bold.ttf" : "Amiri-Regular.ttf";

  const projectCandidates = [
    envPath,
    path.join(tmpDir, downloadedName),
    path.join(root, "fonts", downloadedName),
    path.join(root, "public", "fonts", downloadedName),
    path.join(root, "server", "fonts", downloadedName),
    ...fontsourceCandidates(kind),
  ];

  const systemCandidates = includeSystem
    ? [
        isBold ? "/usr/share/fonts/truetype/amiri/Amiri-Bold.ttf" : "/usr/share/fonts/truetype/amiri/Amiri-Regular.ttf",
        isBold ? "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf" : "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        isBold ? "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf" : "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        isBold ? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        isBold ? "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" : "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
      ]
    : [];

  return projectCandidates.concat(systemCandidates).filter(Boolean);
}

function findLocalFontPath(kind = "regular", options = {}) {
  for (const candidate of commonFontCandidates(kind, options)) {
    if (safeStatFile(candidate)) return candidate;
  }
  return null;
}

function downloadBufferWithHttps(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = Number(response.statusCode) || 0;
      if (status >= 300 && status < 400 && response.headers.location && redirects > 0) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadBufferWithHttps(nextUrl, redirects - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Font download failed with status ${status}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error("Font download timed out"));
    });
    request.on("error", reject);
  });
}

async function downloadBuffer(url) {
  if (!url) return null;

  if (typeof fetch === "function") {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller ? controller.signal : undefined,
      });
      if (response && response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch {
      // Fall back to https below.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return await downloadBufferWithHttps(url);
}

async function ensureFontDownloaded(kind = "regular") {
  // Prefer project-bundled / cached fonts first. System fonts are a final fallback
  // because Vercel/serverless images do not always include Arabic-capable fonts.
  const bundled = findLocalFontPath(kind, { includeSystem: false });
  if (bundled) return bundled;

  const isBold = kind === "bold";
  const urls = isBold
    ? splitEnvList(process.env.PDF_ARABIC_BOLD_FONT_URL).concat(DEFAULT_ARABIC_BOLD_FONT_URLS)
    : splitEnvList(process.env.PDF_ARABIC_FONT_URL || process.env.ARABIC_FONT_URL).concat(DEFAULT_ARABIC_FONT_URLS);

  const dir = path.join(os.tmpdir(), "pyramakerz-pdf-fonts");
  const filePath = path.join(dir, isBold ? "Amiri-Bold.ttf" : "Amiri-Regular.ttf");
  if (safeStatFile(filePath)) return filePath;

  for (const url of urls) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const buffer = await downloadBuffer(url);
      if (!buffer || buffer.length < 8 * 1024) continue;

      const tmpPath = `${filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, filePath);
      return filePath;
    } catch (err) {
      console.warn(`[pdf-arabic] Could not load ${kind} Arabic font from ${url}:`, err?.message || err);
    }
  }

  return findLocalFontPath(kind, { includeSystem: true });
}

async function ensurePdfArabicSupport() {
  if (cachedFontPaths && cachedFontPaths.regular) return cachedFontPaths;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const regular = await ensureFontDownloaded("regular");
    const bold = await ensureFontDownloaded("bold");
    cachedFontPaths = {
      regular: regular || findLocalFontPath("regular"),
      bold: bold || findLocalFontPath("bold") || regular || findLocalFontPath("regular"),
    };
    return cachedFontPaths;
  })();

  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

function getCachedArabicFontPaths() {
  if (cachedFontPaths && cachedFontPaths.regular) return cachedFontPaths;
  const regular = findLocalFontPath("regular");
  const bold = findLocalFontPath("bold") || regular;
  cachedFontPaths = { regular, bold };
  return cachedFontPaths;
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_LETTER_RE = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\uFB50-\uFDFF\uFE70-\uFEFF]/;

function containsArabic(value) {
  return ARABIC_RE.test(String(value || ""));
}

const FORMS = {
  "\u0621": ["\uFE80", null, null, null],
  "\u0622": ["\uFE81", "\uFE82", null, null],
  "\u0623": ["\uFE83", "\uFE84", null, null],
  "\u0624": ["\uFE85", "\uFE86", null, null],
  "\u0625": ["\uFE87", "\uFE88", null, null],
  "\u0626": ["\uFE89", "\uFE8A", "\uFE8B", "\uFE8C"],
  "\u0627": ["\uFE8D", "\uFE8E", null, null],
  "\u0628": ["\uFE8F", "\uFE90", "\uFE91", "\uFE92"],
  "\u0629": ["\uFE93", "\uFE94", null, null],
  "\u062A": ["\uFE95", "\uFE96", "\uFE97", "\uFE98"],
  "\u062B": ["\uFE99", "\uFE9A", "\uFE9B", "\uFE9C"],
  "\u062C": ["\uFE9D", "\uFE9E", "\uFE9F", "\uFEA0"],
  "\u062D": ["\uFEA1", "\uFEA2", "\uFEA3", "\uFEA4"],
  "\u062E": ["\uFEA5", "\uFEA6", "\uFEA7", "\uFEA8"],
  "\u062F": ["\uFEA9", "\uFEAA", null, null],
  "\u0630": ["\uFEAB", "\uFEAC", null, null],
  "\u0631": ["\uFEAD", "\uFEAE", null, null],
  "\u0632": ["\uFEAF", "\uFEB0", null, null],
  "\u0633": ["\uFEB1", "\uFEB2", "\uFEB3", "\uFEB4"],
  "\u0634": ["\uFEB5", "\uFEB6", "\uFEB7", "\uFEB8"],
  "\u0635": ["\uFEB9", "\uFEBA", "\uFEBB", "\uFEBC"],
  "\u0636": ["\uFEBD", "\uFEBE", "\uFEBF", "\uFEC0"],
  "\u0637": ["\uFEC1", "\uFEC2", "\uFEC3", "\uFEC4"],
  "\u0638": ["\uFEC5", "\uFEC6", "\uFEC7", "\uFEC8"],
  "\u0639": ["\uFEC9", "\uFECA", "\uFECB", "\uFECC"],
  "\u063A": ["\uFECD", "\uFECE", "\uFECF", "\uFED0"],
  "\u0641": ["\uFED1", "\uFED2", "\uFED3", "\uFED4"],
  "\u0642": ["\uFED5", "\uFED6", "\uFED7", "\uFED8"],
  "\u0643": ["\uFED9", "\uFEDA", "\uFEDB", "\uFEDC"],
  "\u0644": ["\uFEDD", "\uFEDE", "\uFEDF", "\uFEE0"],
  "\u0645": ["\uFEE1", "\uFEE2", "\uFEE3", "\uFEE4"],
  "\u0646": ["\uFEE5", "\uFEE6", "\uFEE7", "\uFEE8"],
  "\u0647": ["\uFEE9", "\uFEEA", "\uFEEB", "\uFEEC"],
  "\u0648": ["\uFEED", "\uFEEE", null, null],
  "\u0649": ["\uFEEF", "\uFEF0", null, null],
  "\u064A": ["\uFEF1", "\uFEF2", "\uFEF3", "\uFEF4"],
  "\u0671": ["\uFB50", "\uFB51", null, null],
  "\u067E": ["\uFB56", "\uFB57", "\uFB58", "\uFB59"],
  "\u0686": ["\uFB7A", "\uFB7B", "\uFB7C", "\uFB7D"],
  "\u0698": ["\uFB8A", "\uFB8B", null, null],
  "\u06A9": ["\uFB8E", "\uFB8F", "\uFB90", "\uFB91"],
  "\u06AF": ["\uFB92", "\uFB93", "\uFB94", "\uFB95"],
  "\u06CC": ["\uFBFC", "\uFBFD", "\uFBFE", "\uFBFF"],
};

const LAM_ALEF = {
  "\u0622": ["\uFEF5", "\uFEF6"],
  "\u0623": ["\uFEF7", "\uFEF8"],
  "\u0625": ["\uFEF9", "\uFEFA"],
  "\u0627": ["\uFEFB", "\uFEFC"],
};

function isArabicMark(ch) {
  const code = ch ? ch.codePointAt(0) : 0;
  return (
    (code >= 0x0610 && code <= 0x061A) ||
    (code >= 0x064B && code <= 0x065F) ||
    (code >= 0x0670 && code <= 0x0670) ||
    (code >= 0x06D6 && code <= 0x06ED)
  );
}

function canConnectToPrevious(ch) {
  const forms = FORMS[ch];
  return Boolean(forms && (forms[1] || forms[3]));
}

function canConnectToNext(ch) {
  const forms = FORMS[ch];
  return Boolean(forms && (forms[2] || forms[3]));
}

function previousBase(chars, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = chars[i];
    if (isArabicMark(ch)) continue;
    return ch;
  }
  return "";
}

function nextBase(chars, index) {
  for (let i = index + 1; i < chars.length; i += 1) {
    const ch = chars[i];
    if (isArabicMark(ch)) continue;
    return ch;
  }
  return "";
}

function shapedForm(ch, connectPrev, connectNext) {
  const forms = FORMS[ch];
  if (!forms) return ch;
  if (connectPrev && connectNext && forms[3]) return forms[3];
  if (connectPrev && forms[1]) return forms[1];
  if (connectNext && forms[2]) return forms[2];
  return forms[0] || ch;
}

function shapeArabicLogical(value) {
  const chars = Array.from(String(value || ""));
  let out = "";

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];

    if (isArabicMark(ch)) {
      out += ch;
      continue;
    }

    if (ch === "\u0644" && LAM_ALEF[chars[i + 1]]) {
      const prev = previousBase(chars, i);
      const connectPrev = Boolean(prev && canConnectToNext(prev) && canConnectToPrevious(ch));
      out += LAM_ALEF[chars[i + 1]][connectPrev ? 1 : 0];
      i += 1;
      continue;
    }

    if (!FORMS[ch]) {
      out += ch;
      continue;
    }

    const prev = previousBase(chars, i);
    const next = nextBase(chars, i);
    const connectPrev = Boolean(prev && canConnectToNext(prev) && canConnectToPrevious(ch));
    const connectNext = Boolean(next && canConnectToNext(ch) && canConnectToPrevious(next));
    out += shapedForm(ch, connectPrev, connectNext);
  }

  return out;
}

function reversePreservingLtrTokens(value) {
  const text = String(value || "");
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (/[A-Za-z0-9]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9._%+@:\/\\#-]/.test(text[j])) j += 1;
      tokens.push(text.slice(i, j));
      i = j;
      continue;
    }
    if (/[£$€]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[\s0-9.,-]/.test(text[j])) j += 1;
      tokens.push(text.slice(i, j));
      i = j;
      continue;
    }
    tokens.push(ch);
    i += 1;
  }

  return tokens.reverse().join("");
}

const LTR_LABEL_PREFIX_RE = /^([A-Za-z][A-Za-z0-9 ._()\/\[\]&+\-]*:\s*)([\s\S]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF][\s\S]*)$/;
const INLINE_SEPARATOR_RE = /(\s+[•|]\s+)/;

function prepareArabicSegmentForPdf(part) {
  if (!containsArabic(part)) return part;
  const shaped = shapeArabicLogical(part);
  const prefix = shaped.match(LTR_LABEL_PREFIX_RE);
  if (prefix) {
    return prefix[1] + reversePreservingLtrTokens(prefix[2]);
  }
  return reversePreservingLtrTokens(shaped);
}

function preparePdfTextForArabic(value) {
  const input = String(value ?? "");
  if (!containsArabic(input)) return input;

  return input
    .split(/(\r?\n)/)
    .map((line) => {
      if (/^\r?\n$/.test(line) || !containsArabic(line)) return line;
      return line
        .split(INLINE_SEPARATOR_RE)
        .map((part) => prepareArabicSegmentForPdf(part))
        .join("");
    })
    .join("");
}

function fontLooksBold(name) {
  return /bold|black|heavy|semi|demi/i.test(String(name || ""));
}

function coerceText(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function enableArabicPdf(doc) {
  if (!doc || doc.__pdfArabicSupportEnabled) return Boolean(doc && doc.__pdfArabicSupportEnabled);

  const paths = getCachedArabicFontPaths();
  if (!paths || !paths.regular) {
    return false;
  }

  try {
    doc.registerFont(ARABIC_REGULAR_FONT, paths.regular);
    doc.registerFont(ARABIC_BOLD_FONT, paths.bold || paths.regular);
  } catch (err) {
    console.warn("[pdf-arabic] Could not register Arabic font:", err?.message || err);
    return false;
  }

  const originalFont = doc.font;
  const originalText = doc.text;
  const originalWidthOfString = doc.widthOfString;
  const originalHeightOfString = doc.heightOfString;
  let requestedFont = "Helvetica";
  let arabicFontDepth = 0;

  function restoreRequestedFont() {
    try {
      originalFont.call(doc, requestedFont || "Helvetica");
    } catch {
      try {
        originalFont.call(doc, "Helvetica");
        requestedFont = "Helvetica";
      } catch {}
    }
  }

  function withArabicFontIfNeeded(value, fn) {
    const raw = coerceText(value);

    // PDFKit lays out text by calling widthOfString/heightOfString internally.
    // Keep the Arabic font during those nested calls and avoid preparing text twice.
    if (arabicFontDepth > 0) {
      return fn(raw);
    }

    if (!containsArabic(raw)) return fn(raw);

    const fontName = fontLooksBold(requestedFont) ? ARABIC_BOLD_FONT : ARABIC_REGULAR_FONT;
    const prepared = preparePdfTextForArabic(raw);

    try {
      originalFont.call(doc, fontName);
      arabicFontDepth += 1;
      return fn(prepared);
    } finally {
      arabicFontDepth = Math.max(0, arabicFontDepth - 1);
      restoreRequestedFont();
    }
  }

  doc.font = function patchedFont(fontName, ...args) {
    if (fontName) requestedFont = String(fontName);
    return originalFont.call(this, fontName, ...args);
  };

  doc.text = function patchedText(value, ...args) {
    return withArabicFontIfNeeded(value, (prepared) => originalText.call(this, prepared, ...args));
  };

  doc.widthOfString = function patchedWidthOfString(value, ...args) {
    return withArabicFontIfNeeded(value, (prepared) => originalWidthOfString.call(this, prepared, ...args));
  };

  doc.heightOfString = function patchedHeightOfString(value, ...args) {
    return withArabicFontIfNeeded(value, (prepared) => originalHeightOfString.call(this, prepared, ...args));
  };

  doc.__pdfArabicSupportEnabled = true;
  doc.__pdfArabicFontNames = {
    regular: ARABIC_REGULAR_FONT,
    bold: ARABIC_BOLD_FONT,
  };
  return true;
}

module.exports = {
  ARABIC_REGULAR_FONT,
  ARABIC_BOLD_FONT,
  containsArabic,
  enableArabicPdf,
  ensurePdfArabicSupport,
  preparePdfTextForArabic,
};
