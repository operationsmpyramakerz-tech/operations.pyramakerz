const express = require("express");
const path = require("path");
const { Client } = require("@notionhq/client");
const PDFDocument = require("pdfkit"); // PDF

const app = express();
// IMPORTANT for Vercel reverse proxy so secure cookies are honored
app.set("trust proxy", 1);
// Initialize Notion Client using Env Vars
const notion = new Client({ auth: process.env.Notion_API_Key });
const componentsDatabaseId = process.env.Products_Database;
const ordersDatabaseId = process.env.Products_list;
const stocktakingDatabaseId = process.env.School_Stocktaking_DB_ID;
const fundsDatabaseId = process.env.Funds;
const damagedAssetsDatabaseId = process.env.Damaged_Assets;
const expensesDatabaseId = process.env.Expenses_Database;
const NOTION_VER = process.env.NOTION_VERSION || '2022-06-28'; // المطلوب في أمثلة Notion 
// Team Members DB (from ENV)
const teamMembersDatabaseId =
  process.env.Team_Members ||
  process.env.TEAM_MEMBERS ||
  process.env.TeamMembers ||
  null;

// ----- Hardbind: Received Quantity property name (Number) -----
const REC_PROP_HARDBIND = "Quantity received by operations";


// Middleware
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));


// --- Health FIRST (before session) so it works even if env is missing ---
app.get("/health", (req, res) => {
  res.json({ ok: true, region: process.env.VERCEL_REGION || "unknown" });
});

// Sessions (Redis/Upstash) — added after /health
const { sessionMiddleware } = require("./session-redis");
app.use(sessionMiddleware);
// Small trace to debug redirect loop
app.use((req, res, next) => {
  if (["/login", "/dashboard", "/api/login", "/api/account"].includes(req.path)) {
    console.log(
      "[trace]",
      req.method,
      req.path,
      "sid=" + (req.sessionID || "-"),
      "auth=" + (!!req.session?.authenticated)
    );
  }
  next();
});

// Helpers: Allowed pages control
const ALL_PAGES = [
  "Current Orders",
  "Requested Orders",
  "Assigned Schools Requested Orders",
  "Create New Order",
  "Stocktaking",
  "Funds",
  "Expenses",
  "Expenses Users",
  "Logistics",
  "S.V schools orders",
  "Damaged Assets",
  "S.V Schools Assets",
];

const norm = (s) => String(s || "").trim().toLowerCase();
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/gi, "");

// توحيد الأسماء القادمة من Notion
function normalizePages(names = []) {
  const set = new Set(names.map((n) => String(n || "").trim().toLowerCase()));
  const out = [];
  if (set.has("current orders")) out.push("Current Orders");
  if (set.has("requested orders") || set.has("schools requested orders")) {
    out.push("Requested Orders");
  }
  if (
    set.has("assigned schools requested orders") ||
    set.has("assigned requested orders") ||
    set.has("assigned orders") ||
    set.has("my assigned orders") ||
    set.has("storage") // alias: Storage
  ) {
    out.push("Assigned Schools Requested Orders");
  }
  if (set.has("create new order")) out.push("Create New Order");
  if (set.has("stocktaking")) out.push("Stocktaking");
  if (set.has("funds")) out.push("Funds");
  if (set.has("expenses")) out.push("Expenses");
  if (
    set.has("expenses users") ||
    set.has("expenses by user") ||
    set.has("team expenses")
  ) {
    out.push("Expenses Users");
  }
  if (set.has("logistics")) out.push("Logistics");  if (set.has("s.v schools orders") || set.has("sv schools orders")) out.push("S.V schools orders");
  if (set.has("damaged assets")) out.push("Damaged Assets");
  if (set.has("s.v schools assets") || set.has("sv schools assets")) 
  out.push("S.V Schools Assets");

  return out;
}

// توسيع الأسماء للواجهة حتى لا يحصل تضارب aliases
function expandAllowedForUI(list = []) {
  const set = new Set((list || []).map((s) => String(s)));
  if (set.has("Requested Orders") || set.has("Schools Requested Orders")) {
    set.add("Requested Orders");
    set.add("Schools Requested Orders");
  }
  if (set.has("Assigned Schools Requested Orders")) {
    set.add("Assigned Schools Requested Orders");
    set.add("Storage"); // الواجهة تعرض Storage
  }
  if (set.has("Funds")) {
    set.add("Funds");
  }
  if (set.has("Expenses")) {
    set.add("Expenses");
  }
  if (set.has("Expenses Users")) {
    set.add("Expenses Users");
  }
  if (set.has("Logistics")) {
    set.add("Logistics");
  }
  if (set.has("Damaged Assets")) { set.add("Damaged Assets"); }
  return Array.from(set);
}

function extractAllowedPages(props = {}) {
  // Try known property names first (case-sensitive)
  let candidates =
    props.Pages?.multi_select ||
    props["Allowed Pages"]?.multi_select ||
    props["Allowed pages"]?.multi_select ||
    props["Pages Allowed"]?.multi_select ||
    props["Access Pages"]?.multi_select ||
    [];

  // If still empty, look for any multi_select prop whose name matches /allowed.*pages|pages.*allowed/i
  if (!Array.isArray(candidates) || candidates.length === 0) {
    for (const [key, val] of Object.entries(props || {})) {
      if (val && val.type === "multi_select" && /allowed.*pages|pages.*allowed/i.test(String(key))) {
        candidates = val.multi_select || [];
        break;
      }
    }
  }

  const names = Array.isArray(candidates)
    ? candidates.map((x) => x?.name).filter(Boolean)
    : [];
  const allowed = normalizePages(names);
  return allowed;
}

function firstAllowedPath(allowed = []) {
  if (allowed.includes("Current Orders")) return "/orders";
  if (allowed.includes("Requested Orders")) return "/orders/requested";
  if (allowed.includes("Assigned Schools Requested Orders")) return "/orders/assigned";
  if (allowed.includes("Create New Order")) return "/orders/new";
  if (allowed.includes("Stocktaking")) return "/stocktaking";
  if (allowed.includes("Funds")) return "/funds";
  if (allowed.includes("Expenses")) return "/expenses";
   if (allowed.includes("Expenses Users")) return "/expenses/users";  // ⬅ الجديد
  if (allowed.includes("Logistics")) return "/logistics";
  return "/login";
}

// Helpers — Notion
async function getCurrentUserPageId(username) {
  const userQuery = await notion.databases.query({
    database_id: teamMembersDatabaseId,
    filter: { property: "Name", title: { equals: username } },
  });
  if (userQuery.results.length === 0) return null;
  return userQuery.results[0].id;
}

// === Helper: get current Team Member Notion ID from session username ===
async function getCurrentUserNotionId(req) {
  const username = req.session?.username;
  if (!username) return null;

  try {
    const q = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: username } }
    });

    if (q.results.length === 0) return null;
    return q.results[0].id;  // <-- Notion page ID of team member
  } catch (err) {
    console.error("Error fetching user Notion ID:", err.body || err);
    return null;
  }
}
async function getCurrentUserRelationPage(req) {
  const username = req.session?.username;
  if (!username) return null;

  try {
    const q = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: username } }
    });

    if (q.results.length === 0) return null;

    return q.results[0].id;   // page_id — اللى هيستخدم في relation
  } catch (err) {
    console.error("Relation user fetch error:", err.body || err);
    return null;
  }
}
async function getOrdersDBProps() {
  const db = await notion.databases.retrieve({ database_id: ordersDatabaseId });
  return db.properties || {};
}

// Expenses DB props helper
async function getExpensesDBProps() {
  const dbId = expensesDatabaseId || process.env.Expenses_Database;
  if (!dbId) return {};
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    return db.properties || {};
  } catch (err) {
    console.error("Expenses DB props retrieve error:", err?.body || err);
    return {};
  }
}

function firstTitlePropName(propsObj = {}) {
  for (const [k, v] of Object.entries(propsObj || {})) {
    if (v && v.type === "title") return k;
  }
  return null;
}

function looksLikeNotionId(val) {
  const s = String(val || "").trim();
  if (!s) return false;
  const noHyphen = s.replace(/-/g, "");
  return /^[0-9a-fA-F]{32}$/.test(noHyphen);
}

function toHyphenatedUUID(val) {
  const s = String(val || "").trim().replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(s)) return String(val || "").trim();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

// Normalize any Notion ID (page/database) to a comparable 32-hex string
// (no hyphens, lowercase). Some env vars are stored without hyphens while
// the Notion API returns hyphenated IDs — direct string compare will fail.
function normalizeNotionId(id) {
  const raw = String(id || "").trim();
  if (!raw) return "";

  // If the user stored a full Notion URL, extract the first 32-hex chunk.
  const m32 = raw.match(/[0-9a-fA-F]{32}/);
  if (m32) return m32[0].toLowerCase();

  // Or a standard UUID with hyphens.
  const muuid = raw.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
  );
  if (muuid) return muuid[0].replace(/-/g, "").toLowerCase();

  return raw.replace(/-/g, "").toLowerCase();
}

async function findOrCreatePageByTitle(databaseId, titleText) {
  const name = String(titleText || "").trim();
  if (!databaseId || !name) return null;

  // Detect title property name dynamically
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const titleProp = firstTitlePropName(db.properties || {});
  if (!titleProp) {
    throw new Error(`No title property found in related database ${databaseId}`);
  }

  // Try to find existing page by title
  const q = await notion.databases.query({
    database_id: databaseId,
    page_size: 1,
    filter: {
      property: titleProp,
      title: { equals: name },
    },
  });
  if (q.results && q.results.length) return q.results[0].id;

  // Otherwise create it
  const created = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      [titleProp]: {
        title: [{ text: { content: name } }],
      },
    },
  });
  return created?.id || null;
}

async function pageTitleById(pageId) {
  if (!pageId) return "";
  try {
    const p = await notion.pages.retrieve({ page_id: pageId });
    const props = p.properties || {};
    const titleProp = firstTitlePropName(props) || "Name";
    return props?.[titleProp]?.title?.[0]?.plain_text || "";
  } catch {
    return "";
  }
}

function pickPropName(propsObj, aliases = []) {
  const keys = Object.keys(propsObj || {});
  for (const k of keys) {
    if (aliases.some((a) => normKey(a) === normKey(k))) return k;
  }
  return null;
}

// نلقى اسم خاصية Assigned To من الـ DB Properties
async function detectAssignedPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Assigned To",
      "assigned to",
      "ِAssigned To",
      "Assigned_to",
      "AssignedTo",
    ]) || "Assigned To"
  );
}

// خاصية الكمية المتاحة في المخزن
async function detectAvailableQtyPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Available Quantity",
      "Available Qty",
      "In Stock Qty",
      "Qty Available",
      "Stock Available",
    ]) || null
  );
}

// خاصية Status (select) — لاستخدام زر Mark prepared
async function detectStatusPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Status",
      "Order Status",
      "Preparation Status",
      "Prepared Status",
      "state",
    ]) || "Status"
  );
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect("/login");
}

// Page-Access middleware
function requirePage(pageName) {
  return (req, res, next) => {
    const allowed = req.session?.allowedPages || ALL_PAGES;
    if (allowed.includes(pageName)) return next();
    return res.redirect(firstAllowedPath(allowed));
  };
}

// --- Page Serving Routes --- //

app.get("/login", (req, res) => {
  if (req.session?.authenticated)
    return res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/", (req, res) => {
  if (req.session?.authenticated)
    return res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.redirect(firstAllowedPath(req.session.allowedPages || ALL_PAGES));
});

app.get("/orders", requireAuth, requirePage("Current Orders"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "current-orders.html"));
});

app.get(
  "/orders/requested",
  requireAuth,
  requirePage("Requested Orders"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "requested-orders.html"));
  },
);

// صفحة جديدة: الطلبات المُسندة للمستخدم الحالي فقط
app.get(
  "/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "assigned-orders.html"));
  },
);

// 3-step order pages

app.get(
  "/orders/new",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    return res.redirect("/orders/new/products");
  }
);

app.get(
  "/orders/new/products",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "create-order-products.html"));
  },
);
app.get(
  "/orders/new/review",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const d = req.session.orderDraft || {};
    if (!Array.isArray(d.products) || d.products.length === 0) {
      return res.redirect("/orders/new/products");
    }
    res.sendFile(path.join(__dirname, "..", "public", "create-order-review.html"));
  },
);

app.get("/stocktaking", requireAuth, requirePage("Stocktaking"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "stocktaking.html"));
});

// Account page
app.get("/account", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "account.html"));
});

// Funds page
app.get("/funds", requireAuth, requirePage("Funds"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "funds.html"));
});

// Expenses page 
app.get("/expenses", requireAuth, requirePage("Expenses"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "expenses.html"));
});

// Expenses Users page (logistics / admin view)
app.get(
  "/expenses/users",
  requireAuth,
  requirePage("Expenses Users"),   // ✅ دي الصح
  (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "expenses-users.html"));
  }
);;

// Logistics page
app.get("/logistics", requireAuth, requirePage("Logistics"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "logistics.html"));
});
// Damaged Assets page
app.get("/damaged-assets", requireAuth, requirePage("Damaged Assets"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "damaged-assets.html"));
  });
app.get("/sv-assets", requireAuth, requirePage("S.V Schools Assets"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "sv-assets.html"));
});
app.get("/damaged-assets-reviewed", requireAuth, requirePage("Damaged Assets"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "damaged-assets-reviewed.html"));
});
// --- API Routes ---

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: username } },
    });
    if (response.results.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const user = response.results[0];
    const storedPassword = user.properties.Password?.number;

    if (storedPassword && storedPassword.toString() === password) {
      const allowedNormalized = extractAllowedPages(user.properties);
      req.session.authenticated = true;
      req.session.username = username;
      req.session.allowedPages = allowedNormalized;

      const allowedUI = expandAllowedForUI(allowedNormalized);

      req.session.save((err) => {
        if (err)
          return res.status(500).json({ error: "Session could not be saved." });
        res.json({
          success: true,
          message: "Login successful",
          allowedPages: allowedUI,
        });
      });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});
// === Helper: Received Quantity (number) — used to keep Rec visible on Logistics ===
async function detectReceivedQtyPropName() {
  const envName = (process.env.NOTION_REC_PROP || "").trim();
  const props = await getOrdersDBProps();
  if (envName && props[envName] && props[envName].type === "number") return envName;

  const candidate = pickPropName(props, [
    "Quantity received by operations",
    "Received Qty",
    "Rec",
  ]);
  if (candidate && props[candidate] && props[candidate].type === "number") return candidate;
  return null;
}

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Could not log out." });
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// Account info (returns fresh allowedPages)
app.get("/api/account", requireAuth, async (req, res) => {
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }
  try {
    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });

    if (response.results.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = response.results[0];
    const p = user.properties;

    // Try to extract an optional profile photo URL from Notion (files property).
    // Supported property names (if they exist in your Team_Members DB):
    // Photo / Personal Photo / Avatar / Profile Photo / Image
    function firstFileUrl(prop){
      const files = prop?.files;
      if (!Array.isArray(files) || files.length === 0) return "";
      const f = files[0];
      if (f?.type === "external") return f.external?.url || "";
      if (f?.type === "file") return f.file?.url || "";
      return "";
    }

    function extractProfilePhotoUrl(props){
      const preferred = [
        "Photo",
        "Personal Photo",
        "Avatar",
        "Profile Photo",
        "Profile",
        "Image",
      ];
      for (const key of preferred) {
        const prop = props?.[key];
        if (prop?.type === "files") {
          const url = firstFileUrl(prop);
          if (url) return url;
        }
      }
      // Fallback: scan any files properties that look like photo/avatar
      try {
        for (const [key, prop] of Object.entries(props || {})) {
          if (prop?.type !== "files") continue;
          if (!/photo|avatar|profile|image/i.test(key)) continue;
          const url = firstFileUrl(prop);
          if (url) return url;
        }
      } catch {}
      return "";
    }

    const freshAllowed = extractAllowedPages(p);
    req.session.allowedPages = freshAllowed;
    const allowedUI = expandAllowedForUI(freshAllowed);

    const data = {
      name: p?.Name?.title?.[0]?.plain_text || "",
      username: req.session.username || "",
      department: p?.Department?.select?.name || "",
      position: p?.Position?.select?.name || "",
      photoUrl: extractProfilePhotoUrl(p) || "",
      phone: p?.Phone?.phone_number || "",
      email: p?.Email?.email || "",
      employeeCode: p?.["Employee Code"]?.number ?? null,
      passwordSet: (p?.Password?.number ?? null) !== null,
      allowedPages: allowedUI,
    };

    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    console.error("Error fetching account from Notion:", error.body || error);
    res.status(500).json({ error: "Failed to fetch account info." });
  }
});

// Order Draft APIs — require Create New Order
app.get(
  "/api/order-draft",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    res.json(req.session.orderDraft || {});
  },
);
app.post(
  "/api/order-draft/products",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "No products provided." });
    }
    const clean = products
  .map((p) => ({
    id: String(p.id),
    quantity: Number(p.quantity) || 0,
    reason: String(p.reason || "").trim(),   // ← أضف هذا السطر
  }))
  .filter((p) => p.id && p.quantity > 0 && p.reason);

    if (clean.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid products after sanitization." });
    }
    req.session.orderDraft = req.session.orderDraft || {};
    req.session.orderDraft.products = clean;
    return res.json({ ok: true, count: clean.length });
  },
);
app.delete(
  "/api/order-draft",
  requireAuth,
  requirePage("Create New Order"),
  (req, res) => {
    delete req.session.orderDraft;
    return res.json({ ok: true });
  },
);

// Orders listing (Current Orders)
app.get(
  "/api/orders",
  requireAuth,
  requirePage("Current Orders"),
  async (req, res) => {
    if (!ordersDatabaseId || !teamMembersDatabaseId) {
      return res
        .status(500)
        .json({ error: "Database IDs are not configured." });
    }

    res.set("Cache-Control", "no-store");

    try {
      const userQuery = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userQuery.results.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      const userId = userQuery.results[0].id;

      const allOrders = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const response = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          filter: { property: "Teams Members", relation: { contains: userId } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of response.results) {
          const productRelation = page.properties.Product?.relation;
          let productName = "Unknown Product";
          if (productRelation && productRelation.length > 0) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRelation[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                "Unknown Product";
            } catch (e) {
              console.error(
                "Could not retrieve related product page:",
                e.body || e.message,
              );
            }
          }

          allOrders.push({
            id: page.id,
            reason:
              page.properties?.Reason?.title?.[0]?.plain_text || "No Reason",
            productName,
            quantity: page.properties?.["Quantity Requested"]?.number || 0,
            status:
              page.properties?.["Status"]?.select?.name || "Pending",
            createdTime: page.created_time,
          });
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      const TTL_MS = 10 * 60 * 1000;
      let recent = Array.isArray(req.session.recentOrders)
        ? req.session.recentOrders
        : [];
      recent = recent.filter(
        (r) => Date.now() - new Date(r.createdTime).getTime() < TTL_MS,
      );

      const ids = new Set(allOrders.map((o) => o.id));
      const extras = recent.filter((r) => !ids.has(r.id));
      const merged = allOrders
        .concat(extras)
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

      req.session.recentOrders = recent;

      res.json(merged);
    } catch (error) {
      console.error("Error fetching orders from Notion:", error.body || error);
      res.status(500).json({ error: "Failed to fetch orders from Notion." });
    }
  },
);

// Team members (for assignment) — requires Requested Orders
app.get(
  "/api/team-members",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    try {
      const result = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        sorts: [{ property: "Name", direction: "ascending" }],
      });
      const items = result.results.map((p) => ({
        id: p.id,
        name: p.properties?.Name?.title?.[0]?.plain_text || "Unnamed",
      }));
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load team members" });
    }
  },
);

// Requested orders for all users — requires Requested Orders
app.get(
  "/api/orders/requested",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    if (!ordersDatabaseId)
      return res.status(500).json({ error: "Orders DB not configured" });
    try {
      const all = [];
      let hasMore = true,
        startCursor;

      const nameCache = new Map();
      async function memberName(id) {
        if (!id) return "";
        if (nameCache.has(id)) return nameCache.get(id);
        try {
          const page = await notion.pages.retrieve({ page_id: id });
          const nm = page.properties?.Name?.title?.[0]?.plain_text || "";
          nameCache.set(id, nm);
          return nm;
        } catch {
          return "";
        }
      }

      const findAssignedProp = (props) => {
        const cand = [
          "Assigned To",
          "assigned to",
          "ِAssigned To",
          "Assigned_to",
          "AssignedTo",
        ];
        const keys = Object.keys(props || {});
        for (const k of keys) {
          if (cand.some((c) => normKey(c) === normKey(k))) return k;
        }
        return "Assigned To";
      };

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of resp.results) {
          const props = page.properties || {};

          // Product name
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRel[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                productName;
            } catch {}
          }

          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const qty = props["Quantity Requested"]?.number || 0;
          const status = props["Status"]?.select?.name || "Pending";
          const createdTime = page.created_time;
          // 🔥 Extract S.V Approval (select/status)
const svApproval =
  props["S.V Approval"]?.select?.name ||
  props["S.V Approval"]?.status?.name ||
  props["SV Approval"]?.select?.name ||
  props["SV Approval"]?.status?.name ||
  "";
          // ❗ Show only items where S.V Approval = Approved
if (svApproval !== "Approved") continue;

          // Created by (Teams Members relation)
          let createdById = "";
          let createdByName = "";
          const teamRel = props["Teams Members"]?.relation;
          if (Array.isArray(teamRel) && teamRel.length) {
            createdById = teamRel[0].id;
            createdByName = await memberName(createdById);
          }

          // Assigned To
          const assignedKey = findAssignedProp(props);
          let assignedToId = "";
          let assignedToName = "";
          const assignedRel = props[assignedKey]?.relation;
          if (Array.isArray(assignedRel) && assignedRel.length) {
            assignedToId = assignedRel[0].id;
            assignedToName = await memberName(assignedToId);
          }

          
all.push({
    id: page.id,
    reason,
    productName,
    quantity: qty,
    status,
    createdTime,
    createdById,
    createdByName,
    assignedToId,
    assignedToName,
    svApproval, // ⬅⬅⬅ مهم جداً
});
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      res.json(all);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch requested orders" });
    }
  },
);

// Assign member to multiple order items — requires Requested Orders
app.post(
  "/api/orders/assign",
  requireAuth,
  requirePage("Requested Orders"),
  async (req, res) => {
    try {
      let { orderIds, memberIds, memberId } = req.body || {};
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds required" });
      }
      if ((!Array.isArray(memberIds) || memberIds.length === 0) && !memberId)
        return res.status(400).json({ error: "memberIds or memberId required" });
      if (!Array.isArray(memberIds) || memberIds.length === 0) memberIds = memberId ? [memberId] : [];

      // Detect property name "Assigned To"
      const sample = await notion.pages.retrieve({ page_id: orderIds[0] });
      const props = sample.properties || {};
      const candidates = [
        "Assigned To",
        "assigned to",
        "ِAssigned To",
        "Assigned_to",
        "AssignedTo",
      ];
      let assignedProp = "Assigned To";
      for (const k of Object.keys(props)) {
        if (candidates.some((c) => normKey(c) === normKey(k))) {
          assignedProp = k;
          break;
        }
      }

      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [assignedProp]: { relation: (memberIds || []).map(id => ({ id })) } },
          }),
        ),
      );

      res.json({ success: true });
    } catch (e) {
      console.error("Assign error:", e.body || e);
      res.status(500).json({ error: "Failed to assign member" });
    }
  },
);

// ========== Assigned: APIs ==========
// 1) جلب الطلبات المسندة للمستخدم الحالي — مع reason + status
app.get(
  "/api/orders/assigned",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName(); // قد يكون null
      const statusProp   = await detectStatusPropName();        // غالبًا "Status"
      // Received Quantity property (Number)
      const receivedProp = (await (async()=>{
        const props = await getOrdersDBProps();
        if (props[REC_PROP_HARDBIND] && props[REC_PROP_HARDBIND].type === "number") return REC_PROP_HARDBIND;
        return await detectReceivedQtyPropName();
      })());

      const items = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: ordersDatabaseId,
          start_cursor: startCursor,
          filter: { property: assignedProp, relation: { contains: userId } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });

        for (const page of resp.results) {
          const props = page.properties || {};

          // Product name
          let productName = "Unknown Product";
          const productRel = props.Product?.relation;
          if (Array.isArray(productRel) && productRel.length) {
            try {
              const productPage = await notion.pages.retrieve({
                page_id: productRel[0].id,
              });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text ||
                productName;
            } catch {}
          }

          const requested = Number(props["Quantity Requested"]?.number || 0);
          const available = availableProp
            ? Number(props[availableProp]?.number || 0)
            : 0;
          const remaining = Math.max(0, requested - available);
          const reason = props.Reason?.title?.[0]?.plain_text || "No Reason";
          const status = statusProp ? (props[statusProp]?.select?.name || "") : "";
          const recVal = receivedProp ? Number(props[receivedProp]?.number || 0) : 0;

          items.push({
            id: page.id,
            productName,
            requested,
            available,
            remaining,
            quantityReceivedByOperations: recVal,
            rec: recVal,
            createdTime: page.created_time,
            reason,
            status,
          });
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      res.set("Cache-Control", "no-store");
      res.json(items);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch assigned orders" });
    }
  },
);

// 2) تعليم عنصر أنه "متوفر بالكامل" (تجعل المتاح = المطلوب)
app.post(
  "/api/orders/assigned/mark-in-stock",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderPageId } = req.body || {};
      if (!orderPageId) return res.status(400).json({ error: "orderPageId required" });

      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = requested;

      const statusProp = await detectStatusPropName();
      const updates = { [availableProp]: { number: newAvailable } };
      if (statusProp) {
        const t = page.properties?.[statusProp]?.type || 'select';
        if (t === 'status') updates[statusProp] = { status: { name: 'Prepared' } };
        else updates[statusProp] = { select: { name: 'Prepared' } };
      }

      await notion.pages.update({
        page_id: orderPageId,
        properties: updates,
      });

      res.json({
        success: true,
        available: newAvailable,
        remaining: 0,
      });
    } catch (e) {
      console.error(e.body || e);
      res.status(500).json({ error: "Failed to update availability" });
    }
  },
);

// 3) إدخال كمية متاحة جزئيًا
app.post(
  "/api/orders/assigned/available",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderPageId, available } = req.body || {};
      const availNum = Number(available);
      if (!orderPageId) return res.status(400).json({ error: "orderPageId required" });
      if (Number.isNaN(availNum) || availNum < 0) {
        return res.status(400).json({ error: "available must be a non-negative number" });
      }

      const availableProp = await detectAvailableQtyPropName();
      if (!availableProp) {
        return res.status(400).json({
          error:
            'Please add a Number property "Available Quantity" (or alias) to the Orders database.',
        });
      }

      const page = await notion.pages.retrieve({ page_id: orderPageId });
      const requested = Number(page.properties?.["Quantity Requested"]?.number || 0);
      const newAvailable = Math.min(requested, Math.max(0, Math.floor(availNum)));
      const remaining = Math.max(0, requested - newAvailable);

      const statusProp = await detectStatusPropName();
      const updates = { [availableProp]: { number: newAvailable } };
      if (statusProp && newAvailable === requested) {
        const t = page.properties?.[statusProp]?.type || 'select';
        if (t === 'status') updates[statusProp] = { status: { name: 'Prepared' } };
        else updates[statusProp] = { select: { name: 'Prepared' } };
      }

      await notion.pages.update({
        page_id: orderPageId,
        properties: updates,
      });

      res.json({ success: true, available: newAvailable, remaining });
    } catch (e) {
      console.error(e.body || e);
      res.status(500).json({ error: "Failed to update available quantity" });
    }
  },
);

// 3-b) تحويل حالة مجموعة عناصر طلب إلى Prepared (زر في الكارت)
app.post(
  "/api/orders/assigned/mark-prepared",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const { orderIds } = req.body || {};
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds required" });
      }
      const statusProp = await detectStatusPropName();
      if (!statusProp) {
        return res.status(400).json({ error: 'Please add a Select property "Status" to the Orders database.' });
      }

      await Promise.all(
        orderIds.map((id) =>
          notion.pages.update({
            page_id: id,
            properties: { [statusProp]: { select: { name: "Prepared" } } },
          }),
        ),
      );

      res.json({ success: true, updated: orderIds.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to mark as Prepared" });
    }
  },
);

// --- Logistics: mark-received (Status + Quantity received by operations) ---
app.post('/api/logistics/mark-received', requireAuth, async (req, res) => {
  try {
    const { itemIds = [], statusById = {}, recMap = {} } = req.body || {};
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No itemIds' });
    }

    const STATUS_PROP_ENV = (process.env.NOTION_STATUS_PROP || '').trim(); // e.g. "Status"
    const REQ_PROP_ENV    = (process.env.NOTION_REQ_PROP    || '').trim(); // e.g. "Quantity Requested"
    const REC_PROP_ENV    = (process.env.NOTION_REC_PROP    || '').trim(); // "Quantity received by operations"
    const AVAIL_PROP_ENV  = (process.env.NOTION_AVAIL_PROP  || '').trim(); // e.g. "Available"

    const REC_HARDBIND = (typeof REC_PROP_HARDBIND !== 'undefined' && REC_PROP_HARDBIND)
      ? REC_PROP_HARDBIND
      : (REC_PROP_ENV || 'Quantity received by operations');

    const pickProp = (props, preferredName, typeWanted, aliases = [], regexHint = null) => {
      if (preferredName && props[preferredName] && (!typeWanted || props[preferredName].type === typeWanted)) {
        return preferredName;
      }
      for (const n of aliases) {
        if (n && props[n] && (!typeWanted || props[n].type === typeWanted)) return n;
      }
      if (regexHint) {
        const rx = new RegExp(regexHint, 'i');
        for (const k of Object.keys(props || {})) {
          if ((!typeWanted || props[k]?.type === typeWanted) && rx.test(k)) return k;
        }
      }
      if (typeWanted) {
        const any = Object.keys(props || {}).find(k => props[k]?.type === typeWanted);
        if (any) return any;
      }
      return null;
    };

    const results = [];

    for (const pageId of itemIds) {
      const page  = await notion.pages.retrieve({ page_id: pageId });
      const props = page?.properties || {};

      const statusPropName = pickProp(
        props,
        STATUS_PROP_ENV,
        null,
        ['Status', 'Order Status', 'Operations Status']
      );
      const requestedPropName = pickProp(
        props,
        REQ_PROP_ENV,
        'number',
        ['Quantity Requested', 'Requested Qty', 'Req', 'Request Qty'],
        '(request|req)'
      );
      const availablePropName = pickProp(
        props,
        AVAIL_PROP_ENV,
        'number',
        ['Available', 'Quantity Available', 'Avail'],
        '(avail|available)'
      );
      let recPropName = pickProp(
        props,
        REC_HARDBIND,
        'number',
        ['Quantity received by operations', 'Received Qty', 'Received Quantity', 'Quantity Received', 'Rec', 'REC'],
        '(received|rec\\b)'
      );

      const reqNow   = Number(props?.[requestedPropName]?.number ?? NaN);
      const availNow = Number(props?.[availablePropName]?.number ?? NaN);

      let recValue = Number(recMap[pageId]);
      if (Number.isFinite(availNow)) recValue = availNow;

      const missing = (Number.isFinite(reqNow) && Number.isFinite(availNow))
        ? Math.max(0, reqNow - availNow)
        : NaN;

      const forceFullyPrepared =
        Number.isFinite(reqNow) && Number.isFinite(availNow) &&
        reqNow === availNow && Number.isFinite(recValue) && recValue < reqNow && missing === 0;

      const updateProps = {};

      if (Number.isFinite(recValue)) {
        if (recPropName && props[recPropName]?.type === 'number') {
          updateProps[recPropName] = { number: recValue };
        } else if (props['Quantity received by operations']?.type === 'number') {
          updateProps['Quantity received by operations'] = { number: recValue };
        }
      }

      const nextStatusName = forceFullyPrepared ? 'Prepared' : String(statusById[pageId] || '').trim();
      if (nextStatusName && statusPropName && props[statusPropName]) {
        const t = props[statusPropName].type;
        if (t === 'select') {
          updateProps[statusPropName] = { select: { name: nextStatusName } };
        } else if (t === 'status') {
          updateProps[statusPropName] = { status: { name: nextStatusName } };
        }
      }

      if (Object.keys(updateProps).length === 0) {
        results.push({ pageId, skipped: true, reason: 'No matching properties on page' });
        continue;
      }

      await notion.pages.update({ page_id: pageId, properties: updateProps });
      results.push({ pageId, ok: true, forcedFullyPrepared: !!forceFullyPrepared });
    }

    return res.json({ ok: true, updated: results });
  } catch (e) {
    console.error('logistics/mark-received error:', e?.body || e);
    return res.status(500).json({ ok: false, error: 'Failed to mark received' });
  }
});

// 4-b) PDF استلام المكونات (Receipt) لمجموعة عناصر طلب (ids)
// يستخدم ids=pageId1,pageId2,...
app.get(
  "/api/orders/assigned/receipt",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp  = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();
      const statusProp    = await detectStatusPropName();

      const ids = String(req.query.ids || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (!ids.length) {
        return res.status(400).json({ error: "ids query is required" });
      }

      const items = [];
      let reasonTitle = "";
      let createdAt = null;

      for (const id of ids) {
        try {
          const page = await notion.pages.retrieve({ page_id: id });
          const props = page.properties || {};

          const rel = props[assignedProp]?.relation || [];
          const isMine = Array.isArray(rel) && rel.some(r => r.id === userId);
          if (!isMine) continue;

          let productName = "Unknown Product";
          const relP = props.Product?.relation;
          if (Array.isArray(relP) && relP.length) {
            try {
              const productPage = await notion.pages.retrieve({ page_id: relP[0].id });
              productName =
                productPage.properties?.Name?.title?.[0]?.plain_text || productName;
            } catch {}
          }

          const requested = Number(props["Quantity Requested"]?.number || 0);
          const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
          const status    = statusProp ? (props[statusProp]?.select?.name || "") : "";

          items.push({
            productName,
            requested,
            available,
            status
          });

          if (!reasonTitle) {
            reasonTitle = props.Reason?.title?.[0]?.plain_text || "";
            createdAt = page.created_time || null;
          }
        } catch {}
      }

      if (!items.length) {
        return res.status(404).json({ error: "No items found for this receipt." });
      }

      const fname = `Receipt-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      doc.font("Helvetica-Bold").fontSize(18).text("Components Receipt", { align: "left" });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#555")
        .text(`Generated: ${new Date().toLocaleString()}`, { continued: true })
        .text(`   •   User: ${req.session.username || "-"}`);

      if (reasonTitle) {
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(11).fillColor("#111")
          .text(`Reason: ${reasonTitle}`);
      }
      if (createdAt) {
        doc.font("Helvetica").fontSize(10).fillColor("#777")
          .text(`Order created: ${new Date(createdAt).toLocaleString()}`);
      }

      doc.moveDown(0.8);
      const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const colNameW = Math.floor(pageInnerWidth * 0.60);
      const colReqW  = Math.floor(pageInnerWidth * 0.18);
      const colAvailW= pageInnerWidth - colNameW - colReqW;

      const drawHead = () => {
        const y = doc.y, h = 22;
        doc.save();
        doc.roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor("#F3F4F6").strokeColor("#E5E7EB").lineWidth(1).fillAndStroke();
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 10, y + 6, { width: colNameW });
        doc.text("Quantity",  doc.page.margins.left + 10 + colNameW, y + 6, {
          width: colReqW - 10, align: "right",
        });
        doc.text("Available", doc.page.margins.left + colNameW + colReqW, y + 6, {
          width: colAvailW - 10, align: "right",
        });
        doc.restore();
        doc.moveDown(1.2);
      };

      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) { doc.addPage(); drawHead(); }
      };

      drawHead();
      doc.font("Helvetica").fontSize(11).fillColor("#111");

      items.forEach((it) => {
        ensureSpace(24);
        const y = doc.y, h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, { width: colNameW });
        doc.text(String(it.requested || 0), doc.page.margins.left + colNameW, y, {
          width: colReqW - 10, align: "right",
        });
        doc.text(String(it.available ?? ""), doc.page.margins.left + colNameW + colReqW, y, {
          width: colAvailW - 10, align: "right",
        });
        doc.moveTo(doc.page.margins.left, y + h + 4)
          .lineTo(doc.page.margins.left + pageInnerWidth, y + h + 4)
          .strokeColor("#EEE").lineWidth(1).stroke();
        doc.y = y + h + 6;
      });

      doc.moveDown(1.2);
      doc.font("Helvetica").fontSize(10).fillColor("#555")
        .text("Signature:", { continued: true })
        .text(" _________________________________", { align: "left" });

      doc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to generate receipt PDF" });
    }
  },
);

// 4-c) PDF النواقص للطلبات المسندة (Shortage List)
app.get(
  "/api/orders/assigned/pdf",
  requireAuth,
  requirePage("Assigned Schools Requested Orders"),
  async (req, res) => {
    try {
      const userId = await getCurrentUserPageId(req.session.username);
      if (!userId) return res.status(404).json({ error: "User not found." });

      const assignedProp  = await detectAssignedPropName();
      const availableProp = await detectAvailableQtyPropName();

      const idsStr = String(req.query.ids || "").trim();
      const items = [];

      if (idsStr) {
        const ids = idsStr.split(",").map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
          try {
            const page = await notion.pages.retrieve({ page_id: id });
            const props = page.properties || {};

            const rel = props[assignedProp]?.relation || [];
            const isMine = Array.isArray(rel) && rel.some((r) => r.id === userId);
            if (!isMine) continue;

            let productName = "Unknown Product";
            const productRel = props.Product?.relation;
            if (Array.isArray(productRel) && productRel.length) {
              try {
                const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
                productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
              } catch {}
            }

            const requested = Number(props["Quantity Requested"]?.number || 0);
            const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
            const remaining = Math.max(0, requested - available);
            if (remaining > 0) items.push({ productName, requested, available, remaining });
          } catch {}
        }
      } else {
        let hasMore = true, startCursor;
        while (hasMore) {
          const resp = await notion.databases.query({
            database_id: ordersDatabaseId,
            start_cursor: startCursor,
            filter: { property: assignedProp, relation: { contains: userId } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          });

          for (const page of resp.results) {
            const props = page.properties || {};
            let productName = "Unknown Product";
            const productRel = props.Product?.relation;
            if (Array.isArray(productRel) && productRel.length) {
              try {
                const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
                productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
              } catch {}
            }
            const requested = Number(props["Quantity Requested"]?.number || 0);
            const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
            const remaining = Math.max(0, requested - available);
            if (remaining > 0) items.push({ productName, requested, available, remaining });
          }

          hasMore = resp.has_more;
          startCursor = resp.next_cursor;
        }
      }

      const fname = `Assigned-Shortage-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      doc.font("Helvetica-Bold").fontSize(16).text("Assigned Orders — Shortage List", { align: "left" });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colNameW = Math.floor(pageInnerWidth * 0.5);
      const colReqW  = Math.floor(pageInnerWidth * 0.15);
      const colAvailW= Math.floor(pageInnerWidth * 0.15);
      const colRemW  = pageInnerWidth - colNameW - colReqW - colAvailW;

      const drawHead = () => {
        const y = doc.y;
        const h = 20;
        doc.save();
        doc.rect(doc.page.margins.left, y, pageInnerWidth, h).fill("#F3F4F6");
        doc.fillColor("#111").font("Helvetica-Bold").fontSize(10);
        doc.text("Component", doc.page.margins.left + 6, y + 5, { width: colNameW });
        doc.text("Requested", doc.page.margins.left + 6 + colNameW, y + 5, { width: colReqW, align: "right" });
        doc.text("Available", doc.page.margins.left + 6 + colNameW + colReqW, y + 5, { width: colAvailW, align: "right" });
        doc.text("Missing", doc.page.margins.left + 6 + colNameW + colReqW + colAvailW, y + 5, { width: colRemW, align: "right" });
        doc.restore();
        doc.moveDown(1);
      };
      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + need > bottom) { doc.addPage(); drawHead(); }
      };
      drawHead();

      doc.font("Helvetica").fontSize(11).fillColor("#111");
      items.forEach((it) => {
        ensureSpace(22);
        const y = doc.y;
        const h = 18;
        doc.text(it.productName || "-", doc.page.margins.left + 2, y, { width: colNameW });
        doc.text(String(it.requested || 0), doc.page.margins.left + colNameW, y, { width: colReqW, align: "right" });
        doc.text(String(it.available || 0), doc.page.margins.left + colNameW + colReqW, y, { width: colAvailW, align: "right" });
        doc.text(String(it.remaining || 0), doc.page.margins.left + colNameW + colReqW + colAvailW, y, { width: colRemW, align: "right" });
        doc.moveTo(doc.page.margins.left, y + h).lineTo(doc.page.margins.left + pageInnerWidth, y + h).strokeColor("#EEE").lineWidth(1).stroke();
        doc.y = y + h + 2;
      });

      doc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);
      
// Components list — requires Create New Order
app.get(
  "/api/components",
  requireAuth,
  requirePage("Create New Order"),
  async (req, res) => {
    if (!componentsDatabaseId) {
      return res
        .status(500)
        .json({ error: "Products_Database ID is not configured." });
    }
    const allComponents = [];
    let hasMore = true;
    let startCursor = undefined;
    try {
      while (hasMore) {
        const response = await notion.databases.query({
          database_id: componentsDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const componentsFromPage = response.results
          .map((page) => {
            const titleProperty = page.properties?.Name;
            const urlProperty = page.properties?.URL;
            if (titleProperty?.title?.length > 0) {
              return {
                id: page.id,
                name: titleProperty.title[0].plain_text,
                url: urlProperty ? urlProperty.url : null,
              };
            }
            return null;
          })
          .filter(Boolean);
        allComponents.push(...componentsFromPage);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }
      res.json(allComponents);
    } catch (error) {
      console.error("Error fetching from Notion:", error.body || error);
      res.status(500).json({ error: "Failed to fetch data from Notion API." });
    }
  },
);
// == Damaged Assets: Products options (works even if title prop isn't named "Name")
app.get(
  '/api/damaged-assets/options',
  requireAuth,
  requirePage('Damaged Assets'),
  async (req, res) => {
    try {
      // DB بتاع الـ relation "Products"
      const dbId = componentsDatabaseId || process.env.Products_Database || null;
      if (!dbId) {
        return res
          .status(500)
          .json({ options: [], error: 'Products_Database is not set' });
      }

      const q = String(req.query.q || '').trim(); // فلترة اختيارية

      const options = [];
      let startCursor = undefined;
      let hasMore = true;

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: dbId,
          start_cursor: startCursor,
          // نحاول نفلتر بالاسم لو فيه q، ولو اسم العمود مختلف مافيش مشكلة: هنفلتر بعد السحب
          ...(q
            ? {
                filter: {
                  or: [
                    { property: 'Name', title: { contains: q } },
                    { property: 'Title', title: { contains: q } },
                  ],
                },
              }
            : {}),
          sorts: [{ property: 'Name', direction: 'ascending' }],
          page_size: 50,
        });

        for (const page of resp.results) {
          // استخرج أول عمود type=title ديناميكيًا مهما كان اسمه
          let titleText = '';
          const props = page.properties || {};
          for (const key in props) {
            const p = props[key];
            if (p?.type === 'title') {
              titleText = (p.title || [])
                .map((t) => t.plain_text || '')
                .join('')
                .trim();
              break;
            }
          }
          // fallback لو فاضي
          if (!titleText) titleText = 'Untitled';

          options.push({ id: page.id, name: titleText });
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      // فلترة إضافية في السيرفر لو اسم العمود مش "Name"
      const filtered =
        q ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : options;

      res.set('Cache-Control', 'no-store');
      return res.json({ options: filtered });
    } catch (e) {
      console.error('GET /api/damaged-assets/options:', e?.body || e);
      return res.status(500).json({ options: [], error: 'Failed to load products' });
    }
  }
);
// Submit Order — requires Create New Order
app.post(
  "/api/submit-order",
  requireAuth,
  requirePage("Create New Order"),
  async (req, res) => {
    if (!ordersDatabaseId || !teamMembersDatabaseId) {
      return res
        .status(500)
        .json({ success: false, message: "Database IDs are not configured." });
    }
let { products } = req.body || {};
if (!Array.isArray(products) || products.length === 0) {
  const d = req.session.orderDraft;
  if (d && Array.isArray(d.products) && d.products.length > 0) {
    products = d.products;
  }
}

if (!Array.isArray(products) || products.length === 0) {
  return res.status(400).json({ success: false, message: "Missing products." });
}

// الآن نتأكد أن كل منتج معه reason خاص به
const cleanedProducts = products
  .map(p => ({
    id: String(p.id),
    quantity: Number(p.quantity),
    reason: String(p.reason || "").trim()
  }))
  .filter(p => p.id && p.quantity > 0);

if (cleanedProducts.some(p => !p.reason)) {
  return res.status(400).json({ success: false, message: "Each product must include a reason." });
}
    

    try {
      const userQuery = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });

      if (userQuery.results.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      const userId = userQuery.results[0].id;

      const creations = await Promise.all(
  cleanedProducts.map(async (product) => {
          const created = await notion.pages.create({
            parent: { database_id: ordersDatabaseId },
            properties: {
              Reason: { title: [{ text: { content: product.reason } }] },
              "Quantity Requested": { number: Number(product.quantity) },
              Product: { relation: [{ id: product.id }] },
              "Status": { select: { name: "Pending" } },
              "Teams Members": { relation: [{ id: userId }] },
            },
          });

          let productName = "Unknown Product";
          try {
            const productPage = await notion.pages.retrieve({
              page_id: product.id,
            });
            productName =
              productPage.properties?.Name?.title?.[0]?.plain_text ||
              productName;
          } catch {}

          return {
            orderPageId: created.id,
            productId: product.id,
            productName,
            quantity: Number(product.quantity),
            reason: product.reason, 
            createdTime: created.created_time,
          };
        }),
      );

      const recentOrders = creations.map((c) => ({
  id: c.orderPageId,
  reason: c.reason,
  productName: c.productName,
  quantity: c.quantity,
  status: "Pending",
  createdTime: c.createdTime,
}));
      req.session.recentOrders = (req.session.recentOrders || []).concat(
        recentOrders,
      );
      if (req.session.recentOrders.length > 50) {
        req.session.recentOrders = req.session.recentOrders.slice(-50);
      }

      delete req.session.orderDraft;

      res.json({
        success: true,
        message: "Order submitted and saved to Notion successfully!",
        orderItems: creations.map((c) => ({
          orderPageId: c.orderPageId,
          productId: c.productId,
        })),
      });
    } catch (error) {
      console.error("Error creating page in Notion:", error.body || error);
      res
        .status(500)
        .json({ success: false, message: "Failed to save order to Notion." });
    }
  },
);

// Update Status — requires Current Orders
app.post(
  "/api/update-received",
  requireAuth,
  requirePage("Current Orders"),
  async (req, res) => {
    const { orderPageId } = req.body;
    if (!orderPageId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing orderPageId" });
    }
    try {
      await notion.pages.update({
        page_id: orderPageId,
        properties: { "Status": { select: { name: "Received" } } },
      });
      res.json({ success: true });
    } catch (error) {
      console.error(
        "Error updating status:",
        error.body || error.message,
      );
      res
        .status(500)
        .json({ success: false, error: "Failed to update status" });
    }
  },
);

// ===== Stocktaking data (JSON) — requires Stocktaking =====
app.get(
  "/api/stock",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    if (!teamMembersDatabaseId || !stocktakingDatabaseId) {
      return res
        .status(500)
        .json({ error: "Database IDs are not configured." });
    }
    try {
      const userResponse = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userResponse.results.length === 0)
        return res.status(404).json({ error: "User not found." });

      const user = userResponse.results[0];
      const schoolProp = user.properties.School || {};
      const schoolName =
        schoolProp?.select?.name ||
        (Array.isArray(schoolProp?.rich_text) &&
          schoolProp.rich_text[0]?.plain_text) ||
        (Array.isArray(schoolProp?.title) && schoolProp.title[0]?.plain_text) ||
        null;

      if (!schoolName)
        return res
          .status(404)
          .json({ error: "Could not determine school name for the user." });

      const allStock = [];
      let hasMore = true;
      let startCursor = undefined;

      const numberFrom = (prop) => {
        if (!prop) return undefined;
        if (typeof prop.number === "number") return prop.number;
        if (prop.formula && typeof prop.formula.number === "number")
          return prop.formula.number;
        return undefined;
      };
      const firstDefinedNumber = (...props) => {
        for (const p of props) {
          const n = numberFrom(p);
          if (typeof n === "number") return n;
        }
        return 0;
      };

      while (hasMore) {
        const stockResponse = await notion.databases.query({
          database_id: stocktakingDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Name", direction: "ascending" }],
        });

        const stockFromPage = stockResponse.results
          .map((page) => {
            const props = page.properties || {};
            const componentName =
              props.Name?.title?.[0]?.plain_text ||
              props.Component?.title?.[0]?.plain_text ||
              "Untitled";

            const quantity = firstDefinedNumber(props[schoolName]);
            const oneKitQuantity = firstDefinedNumber(
              props["One Kit Quantity"],
              props["One Kit Qty"],
              props["One kit qty"],
              props["Kit Qty"],
              props["OneKitQuantity"],
            );

            let tag = null;
            if (props.Tag?.select) {
              tag = {
                name: props.Tag.select.name,
                color: props.Tag.select.color || "default",
              };
            } else if (
              Array.isArray(props.Tag?.multi_select) &&
              props.Tag.multi_select.length > 0
            ) {
              const t = props.Tag.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            } else if (
              Array.isArray(props.Tags?.multi_select) &&
              props.Tags.multi_select.length > 0
            ) {
              const t = props.Tags.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            }

            return {
              id: page.id,
              name: componentName,
              quantity: Number(quantity) || 0,
              oneKitQuantity: Number(oneKitQuantity) || 0,
              tag,
            };
          })
          .filter(Boolean);

        allStock.push(...stockFromPage);
        hasMore = stockResponse.has_more;
        startCursor = stockResponse.next_cursor;
      }

      res.json(allStock);
    } catch (error) {
      console.error("Error fetching stock data:", error.body || error);
      res
        .status(500)
        .json({ error: "Failed to fetch stock data from Notion." });
    }
  },
);

// ===== Stocktaking PDF download — requires Stocktaking =====
app.get(
  "/api/stock/pdf",
  requireAuth,
  requirePage("Stocktaking"),
  async (req, res) => {
    try {
      const userResponse = await notion.databases.query({
        database_id: teamMembersDatabaseId,
        filter: { property: "Name", title: { equals: req.session.username } },
      });
      if (userResponse.results.length === 0)
        return res.status(404).json({ error: "User not found." });

      const user = userResponse.results[0];
      const schoolProp = user.properties.School || {};
      const schoolName =
        schoolProp?.select?.name ||
        (Array.isArray(schoolProp?.rich_text) &&
          schoolProp.rich_text[0]?.plain_text) ||
        (Array.isArray(schoolProp?.title) && schoolProp.title[0]?.plain_text) ||
        null;

      if (!schoolName)
        return res
          .status(404)
          .json({ error: "Could not determine school name for the user." });

      const allStock = [];
      let hasMore = true;
      let startCursor = undefined;

      const numberFrom = (prop) => {
        if (!prop) return undefined;
        if (typeof prop.number === "number") return prop.number;
        if (prop.formula && typeof prop.formula.number === "number")
          return prop.formula.number;
        return undefined;
      };
      const firstDefinedNumber = (...props) => {
        for (const p of props) {
          const n = numberFrom(p);
          if (typeof n === "number") return n;
        }
        return 0;
      };

      while (hasMore) {
        const stockResponse = await notion.databases.query({
          database_id: stocktakingDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Name", direction: "ascending" }],
        });

        const stockFromPage = stockResponse.results
          .map((page) => {
            const props = page.properties || {};
            const componentName =
              props.Name?.title?.[0]?.plain_text ||
              props.Component?.title?.[0]?.plain_text ||
              "Untitled";

            const quantity = firstDefinedNumber(props[schoolName]);
            const oneKitQuantity = firstDefinedNumber(
              props["One Kit Quantity"],
              props["One Kit Qty"],
              props["One kit qty"],
              props["Kit Qty"],
              props["OneKitQuantity"],
            );

            let tag = null;
            if (props.Tag?.select) {
              tag = {
                name: props.Tag.select.name,
                color: props.Tag.select.color || "default",
              };
            } else if (
              Array.isArray(props.Tag?.multi_select) &&
              props.Tag.multi_select.length > 0
            ) {
              const t = props.Tag.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            } else if (
              Array.isArray(props.Tags?.multi_select) &&
              props.Tags.multi_select.length > 0
            ) {
              const t = props.Tags.multi_select[0];
              tag = { name: t.name, color: t.color || "default" };
            }

            return {
              id: page.id,
              name: componentName,
              quantity: Number(quantity) || 0,
              oneKitQuantity: Number(oneKitQuantity) || 0,
              tag,
            };
          })
          .filter(Boolean);

        allStock.push(...stockFromPage);
        hasMore = stockResponse.has_more;
        startCursor = stockResponse.next_cursor;
      }

      // Grouping + PDF layout (كما هو)
      const groupsMap = new Map();
      (allStock || []).forEach((it) => {
        const name = it?.tag?.name || "Untagged";
        const color = it?.tag?.color || "default";
        const key = `${String(name).toLowerCase()}|${color}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { name, color, items: [] });
        groupsMap.get(key).items.push(it);
      });
      let groups = Array.from(groupsMap.values()).sort((a, b) =>
        String(a.name).localeCompare(String(b.name)),
      );
      const untagged = groups.filter(
        (g) => String(g.name).toLowerCase() === "untagged" || g.name === "-",
      );
      groups = groups
        .filter(
          (g) =>
            !(String(g.name).toLowerCase() === "untagged" || g.name === "-"),
        )
        .concat(untagged);

      const fname = `Stocktaking-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

      const doc = new PDFDocument({ size: "A4", margin: 36 });
      doc.pipe(res);

      const palette = {
        default: { fill: "#F3F4F6", border: "#E5E7EB", text: "#111827" },
        gray: { fill: "#F3F4F6", border: "#E5E7EB", text: "#374151" },
        brown: { fill: "#EFEBE9", border: "#D7CCC8", text: "#4E342E" },
        orange: { fill: "#FFF7ED", border: "#FED7AA", text: "#9A3412" },
        yellow: { fill: "#FEFCE8", border: "#FDE68A", text: "#854D0E" },
        green: { fill: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
        blue: { fill: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
        purple: { fill: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" },
        pink: { fill: "#FDF2F8", border: "#FBCFE8", text: "#9D174D" },
        red: { fill: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
      };
      const getPal = (c = "default") => palette[c] || palette.default;

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#111827")
        .text("Stocktaking", { align: "left" });
      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#6B7280")
        .text(`School: ${schoolName}`, { continued: true })
        .text(`   •   Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(0.6);

      const pageInnerWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const gap = 10;
      const colKitW = 120;
      const colQtyW = 90;
      const colNameW = pageInnerWidth - colKitW - colQtyW - gap * 2;

      const drawGroupHeader = (gName, pal, count, cont = false) => {
        const y = doc.y + 2;
        const h = 22;
        doc.save();
        doc
          .roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor("#6B7280")
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Tag", doc.page.margins.left + 10, y + 6);
        const pillText = cont ? `${gName} (cont.)` : gName;
        const pillPadX = 10,
          pillH = 16;
        const pillW = Math.max(
          40,
          doc.widthOfString(pillText, { font: "Helvetica-Bold", size: 10 }) +
            pillPadX * 2,
        );
        const pillX = doc.page.margins.left + 38;
        const pillY = y + (h - pillH) / 2;
        doc
          .roundedRect(pillX, pillY, pillW, pillH, 8)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor(pal.text)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(pillText, pillX + pillPadX, pillY + 3);
        const countTxt = `${count} items`;
        doc
          .fillColor("#111827")
          .font("Helvetica-Bold")
          .text(countTxt, doc.page.margins.left, y + 5, {
            width: pageInnerWidth - 10,
            align: "right",
          });
        doc.restore();
        doc.moveDown(1.4);
      };

      const drawTableHead = (pal) => {
        const y = doc.y;
        const h = 20;
        doc.save();
        doc
          .roundedRect(doc.page.margins.left, y, pageInnerWidth, h, 6)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc.fillColor(pal.text).font("Helvetica-Bold").fontSize(10);

        doc.text("Component", doc.page.margins.left + 10, y + 5, {
          width: colNameW,
        });
        doc.text(
          "One Kit Quantity",
          doc.page.margins.left + 10 + colNameW + gap,
          y + 5,
          { width: colKitW - 10, align: "right" },
        );
        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc.text("In Stock", lastX, y + 5, {
          width: colQtyW - 10,
          align: "right",
        });

        doc.restore();
        doc.moveDown(1.2);
      };

      const ensureSpace = (needH, onNewPage) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + needH > bottom) {
          doc.addPage();
          onNewPage?.();
        }
      };

      const drawRow = (item, pal) => {
        const y = doc.y;
        const nameHeight = doc.heightOfString(item.name || "-", {
          width: colNameW,
        });
        const rowH = Math.max(18, nameHeight);
        ensureSpace(rowH + 8);

        doc.font("Helvetica").fontSize(11).fillColor("#111827");
        doc.text(item.name || "-", doc.page.margins.left + 2, doc.y, {
          width: colNameW,
        });

        const text = String(Number(item.oneKitQuantity ?? 0));
        const pillPadX = 8,
          pillH = 16;
        const pillW = Math.max(
          32,
          doc.widthOfString(text, { font: "Helvetica-Bold", size: 10 }) +
            pillPadX * 2,
        );
        const pillX =
          doc.page.margins.left + colNameW + gap + (colKitW - pillW - 10);
        const pillY = y + (rowH - pillH) / 2;
        doc
          .roundedRect(pillX, pillY, pillW, pillH, 8)
          .fillColor(pal.fill)
          .strokeColor(pal.border)
          .lineWidth(1)
          .fillAndStroke();
        doc
          .fillColor(pal.text)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(text, pillX + pillPadX, pillY + 3);

        const lastX = doc.page.margins.left + colNameW + gap + colKitW + gap;
        doc
          .fillColor("#111827")
          .font("Helvetica")
          .fontSize(11)
          .text(String(Number(item.quantity ?? 0)), lastX, y, {
            width: colQtyW - 10,
            align: "right",
          });

        doc
          .moveTo(doc.page.margins.left, y + rowH + 4)
          .lineTo(doc.page.margins.left + pageInnerWidth, y + rowH + 4)
          .strokeColor("#F3F4F6")
          .lineWidth(1)
          .stroke();

        doc.y = y + rowH + 6;
      };

      const ensureGroupStartSpace = () => ensureSpace(22 + 20 + 18);

      for (const g of groups) {
        const pal = getPal(g.color);

        ensureGroupStartSpace();
        drawGroupHeader(g.name, pal, g.items.length, false);
        drawTableHead(pal);

        g.items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        for (const item of g.items) {
          ensureSpace(40, () => {
            drawGroupHeader(g.name, pal, g.items.length, true);
            drawTableHead(pal);
          });
          drawRow(item, pal);
        }
      }

      doc.end();
    } catch (e) {
      console.error("PDF generation error:", e);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

// Update account info (PATCH) — اختيارى
// Update account info (PATCH) — requires current password confirmation
app.patch("/api/account", requireAuth, async (req, res) => {
  if (!teamMembersDatabaseId) {
    return res
      .status(500)
      .json({ error: "Team_Members database ID is not configured." });
  }

  try {
    const {
      currentPassword,
      name,
      department,
      position,
      phone,
      email,
      employeeCode,
      password,
    } = req.body || {};

    // Fetch current user (by session username)
    const response = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });

    if (response.results.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = response.results[0];
    const storedPassword = user.properties?.Password?.number;

    const provided = String(currentPassword ?? "").trim();

    if (storedPassword === null || typeof storedPassword === "undefined") {
      return res.status(400).json({ error: "No password set for this account." });
    }

    if (!provided) {
      return res.status(400).json({ error: "Current password is required." });
    }

    if (String(storedPassword) !== provided) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const updateProps = {};

    if (typeof phone !== "undefined") {
      updateProps["Phone"] = { phone_number: (phone || "").trim() || null };
    }

    if (typeof email !== "undefined") {
      updateProps["Email"] = { email: (email || "").trim() || null };
    }

    if (typeof department !== "undefined") {
      const d = String(department || "").trim();
      updateProps["Department"] = d ? { select: { name: d } } : { select: null };
    }

    if (typeof position !== "undefined") {
      const pos = String(position || "").trim();
      updateProps["Position"] = pos ? { select: { name: pos } } : { select: null };
    }

    if (typeof employeeCode !== "undefined") {
      if (employeeCode === null || String(employeeCode).trim() === "") {
        updateProps["Employee Code"] = { number: null };
      } else {
        const n = Number(employeeCode);
        if (Number.isNaN(n)) {
          return res.status(400).json({ error: "Employee Code must be a number." });
        }
        updateProps["Employee Code"] = { number: n };
      }
    }

    if (typeof password !== "undefined") {
      if (password === null || String(password).trim() === "") {
        return res.status(400).json({ error: "Password cannot be empty." });
      }
      const n = Number(password);
      if (Number.isNaN(n)) {
        return res.status(400).json({ error: "Password must be a number." });
      }
      updateProps["Password"] = { number: n };
    }

    if (typeof name !== "undefined") {
      const n = String(name || "").trim();
      if (!n) return res.status(400).json({ error: "Name cannot be empty." });
      updateProps["Name"] = { title: [{ text: { content: n } }] };
    }

    if (Object.keys(updateProps).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const userPageId = user.id;

    await notion.pages.update({
      page_id: userPageId,
      properties: updateProps,
    });

    // Keep session username in sync if Name changed
    if (updateProps["Name"]) {
      req.session.username = String(name || "").trim();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating account:", error.body || error);
    res.status(500).json({ error: "Failed to update account." });
  }
});

// بعد pickPropName() والدوال المشابهة
async function detectOrderIdPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Order ID",
      "Order Code",
      "Order Group",
      "Batch ID",
      "OrderId",
      "Order_Code"
    ]) || null
  );
}


// ===== Logistics listing — requires Logistics =====
app.get("/api/logistics", requireAuth, requirePage("Logistics"), async (req, res) => {
  try {
    const statusFilter = String(req.query.status || "Prepared");
    const statusProp = await detectStatusPropName();
    const availableProp = await detectAvailableQtyPropName();
    const receivedProp = await (async()=>{
      const props = await getOrdersDBProps();
      if (props[REC_PROP_HARDBIND] && props[REC_PROP_HARDBIND].type === 'number') return REC_PROP_HARDBIND;
      return await detectReceivedQtyPropName();
    })();
    const items = [];
    let hasMore = true, cursor;

    while (hasMore) {
      const q = await notion.databases.query({
        database_id: ordersDatabaseId,
        start_cursor: cursor,
        filter: { property: statusProp, select: { equals: statusFilter } },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      for (const page of q.results) {
        const props = page.properties || {};
        let productName = "Unknown Product";
        const productRel = props.Product?.relation;
        if (Array.isArray(productRel) && productRel.length) {
          try {
            const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
            productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
          } catch {}
        }
        const requested = Number(props["Quantity Requested"]?.number || 0);
        const available = availableProp ? Number(props[availableProp]?.number || 0) : 0;
        // For Prepared tab we only show fully available
        if (statusFilter === "Prepared" && requested > 0 && available < requested) continue;

        const recVal = receivedProp ? Number(props[receivedProp]?.number || 0) : (props[REC_PROP_HARDBIND]?.type === 'number' ? Number(props[REC_PROP_HARDBIND]?.number || 0) : 0);
        items.push({
          id: page.id,
          reason: props.Reason?.title?.[0]?.plain_text || "No Reason",
          productName,
          requested,
          available,
          quantityReceivedByOperations: recVal,
          status: props[statusProp]?.select?.name || statusFilter,
        });
      }
      hasMore = q.has_more;
      cursor = q.next_cursor;
    }
    res.set("Cache-Control", "no-store");
    res.json(items);
  } catch (e) {
    console.error("Logistics list error:", e.body || e);
    res.status(500).json({ error: "Failed to fetch logistics list" });
  }
});

// ================== EXPENSES API ==================

// Get Funds Type Options
app.get("/api/expenses/types", async (req, res) => {
  try {
    const response = await notion.databases.retrieve({
      database_id: process.env.Expenses_Database,
    });

    const options = response.properties["Funds Type"].select.options
      .map(opt => opt.name);

    res.json({ success: true, options });
  } catch (err) {
    console.error("Error loading Funds Type:", err);
    res.json({
      success: false,
      options: [],
      error: "Cannot load Funds Type"
    });
  }
});

// Cash In From Options (Relation)
// The Notion property "Cash in from" in the Expenses DB is a Relation.
// This endpoint returns dropdown options (id + name) from the related database.
app.get(
  "/api/expenses/cash-in-from/options",
  requireAuth,
  requirePage("Expenses"),
  async (req, res) => {
    try {
      const expProps = await getExpensesDBProps();
      const cashInFromKey =
        pickPropName(expProps, ["Cash in from", "Cash In From", "Cash In from"]) ||
        "Cash in from";

      const cashInFromProp = expProps?.[cashInFromKey];
      if (!cashInFromProp || cashInFromProp.type !== "relation") {
        return res.json({ success: true, options: [] });
      }

      const relDbId = cashInFromProp?.relation?.database_id;
      if (!relDbId) {
        return res.json({ success: true, options: [] });
      }

      // Detect title property in the related DB
      const relDb = await notion.databases.retrieve({ database_id: relDbId });
      const titleProp = firstTitlePropName(relDb.properties || {});

      const options = [];
      let hasMore = true;
      let cursor = undefined;

      while (hasMore) {
        const q = await notion.databases.query({
          database_id: relDbId,
          start_cursor: cursor,
          page_size: 100,
          ...(titleProp
            ? { sorts: [{ property: titleProp, direction: "ascending" }] }
            : {}),
        });

        for (const p of q.results || []) {
          const name =
            (titleProp && p.properties?.[titleProp]?.title?.[0]?.plain_text) ||
            "Unnamed";
          options.push({ id: p.id, name });
        }

        hasMore = q.has_more;
        cursor = q.next_cursor;
      }

      res.json({ success: true, options });
    } catch (err) {
      console.error("Cash in from options error:", err?.body || err);
      res.json({ success: false, options: [], error: "Cannot load options" });
    }
  },
);

app.post("/api/expenses/cash-out", async (req, res) => {
  const { fundsType, reason, date, from, to, amount, kilometer, screenshotDataUrl, screenshotName } = req.body;

  try {
    const teamMemberPageId = await getCurrentUserRelationPage(req);

    if (!fundsType || !reason || !date) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    const props = {
      "Team Member": {
        relation: teamMemberPageId ? [{ id: teamMemberPageId }] : []
      },

      "Funds Type": {
        select: { name: fundsType }
      },

      // 🔥 FIXED HERE — Reason must be title
      "Reason": {
        title: [{ text: { content: reason }}]
      },

      "Date": {
        date: { start: date }
      },

      "From": {
        rich_text: [{ type: "text", text: { content: from || "" }}]
      },

      "To": {
        rich_text: [{ type: "text", text: { content: to || "" }}]
      },

      "Cash out": {
        number: Number(amount) || 0
      }
    };

    if (fundsType === "Own car") {
      props["Kilometer"] = {
        number: Number(kilometer) || 0
      };
    }
// Optional Screenshot (Notion property: "Screenshot" - Files & media)
if (screenshotDataUrl) {
  const filename = (screenshotName && String(screenshotName).trim()) || `screenshot-${Date.now()}.png`;
  const url = await uploadToBlobFromBase64(screenshotDataUrl, filename);
  props["Screenshot"] = { files: [makeExternalFile(filename, url)] };
}
    await notion.pages.create({
      parent: { database_id: process.env.Expenses_Database },
      properties: props
    });

    res.json({ success: true, message: "Cash out saved successfully" });

  } catch (err) {
    console.error("Cash out error:", err.body || err);

    const raw = err?.body || err;
    const errorMessage =
      typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);

    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Cash In
app.post("/api/expenses/cash-in", async (req, res) => {
  const { date, amount, cashInFrom, receiptNumber } = req.body;

  try {
    const teamMemberPageId = await getCurrentUserRelationPage(req);

    if (!date || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum)) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount",
      });
    }

    const receipt = String(receiptNumber || "").trim();
    if (!receipt) {
      return res.status(400).json({
        success: false,
        error: "Missing receipt number",
      });
    }

    // Detect Expenses DB properties (title + optional Cash in from)
    const expProps = await getExpensesDBProps();
    const titleKey = firstTitlePropName(expProps) || "Reason";
    const cashInFromKey =
      pickPropName(expProps, ["Cash in from", "Cash In From", "Cash In from"]) ||
      "Cash in from";
    const cashInFromProp = expProps?.[cashInFromKey];

    let cashInFromValue = null;
    const fromVal = String(cashInFrom || "").trim();

    if (fromVal && cashInFromProp?.type === "relation") {
      // Notion expects: { relation: [{ id: "..." }] }
      const relDbId = cashInFromProp?.relation?.database_id;

      if (fromVal) {
        let relPageId = null;

        try {
          if (looksLikeNotionId(fromVal)) {
            relPageId = toHyphenatedUUID(fromVal);
          } else if (relDbId) {
            relPageId = await findOrCreatePageByTitle(relDbId, fromVal);
          }
        } catch (e) {
          // If integration doesn't have permission on the related DB, don't fail the whole request
          console.warn("Cash in from relation resolve failed:", e?.body || e);
          relPageId = null;
        }

        cashInFromValue = { relation: relPageId ? [{ id: relPageId }] : [] };
      } else {
        cashInFromValue = { relation: [] };
      }
    } else if (fromVal && cashInFromProp?.type === "rich_text") {
      // Old schema uses rich_text
      cashInFromValue = {
        rich_text: [{ type: "text", text: { content: fromVal } }],
      };
    }

    const propsToCreate = {
      "Team Member": {
        relation: teamMemberPageId ? [{ id: teamMemberPageId }] : [],
      },
      // Store receipt number in the DB title (same behavior as "Settled my account")
      [titleKey]: {
        title: [{ text: { content: receipt } }],
      },
      "Date": {
        date: { start: date },
      },
      "Cash in": {
        number: amountNum,
      },
    };

    if (cashInFromValue) {
      propsToCreate[cashInFromKey] = cashInFromValue;
    }

    await notion.pages.create({
      parent: { database_id: process.env.Expenses_Database },
      properties: propsToCreate,
    });

    res.json({ success: true, message: "Cash in recorded" });
} catch (err) {
  console.error("❌ Cash in error (RAW):", err);
  console.error("❌ Cash in error BODY:", err.body);

  res.status(500).json({
    success: false,
    error: err.body || err.message || "Failed to save cash in"
  });
}
});

// Settled my account
// Creates a balancing transaction for the current logged-in user so their
// total (Cash in - Cash out) becomes 0, and stores the receipt number in Reason.
app.post(
  "/api/expenses/settle",
  requireAuth,
  requirePage("Expenses"),
  async (req, res) => {
    try {
      const receiptNumber = String(req.body?.receiptNumber || "").trim();
      if (!receiptNumber) {
        return res.status(400).json({
          success: false,
          error: "Missing receipt number",
        });
      }

      const dbId = expensesDatabaseId || process.env.Expenses_Database;
      if (!dbId) {
        return res.status(500).json({
          success: false,
          error: "Expenses database not configured",
        });
      }

      const teamMemberPageId = await getCurrentUserRelationPage(req);
      if (!teamMemberPageId) {
        return res.status(400).json({
          success: false,
          error: "User not found",
        });
      }

      // 1) Compute current balance
      let totalCashIn = 0;
      let totalCashOut = 0;
      let hasMore = true;
      let cursor = undefined;

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: dbId,
          start_cursor: cursor,
          page_size: 100,
          filter: {
            property: "Team Member",
            relation: { contains: teamMemberPageId },
          },
        });

        for (const page of resp.results || []) {
          const props = page.properties || {};
          totalCashIn += Number(props["Cash in"]?.number || 0);
          totalCashOut += Number(props["Cash out"]?.number || 0);
        }

        hasMore = resp.has_more;
        cursor = resp.next_cursor;
      }

      const balance = Number(totalCashIn) - Number(totalCashOut);
      const settleAmount = Math.abs(balance);

      // 2) Create a balancing transaction
      const today = new Date().toISOString().slice(0, 10);
      const isPositive = balance > 0;

      const props = {
        "Team Member": {
          relation: [{ id: teamMemberPageId }],
        },
        "Funds Type": {
          select: { name: "Settled my account" },
        },
        "Reason": {
          title: [{ text: { content: receiptNumber } }],
        },
        "Date": {
          date: { start: today },
        },
        "From": {
          rich_text: [{ type: "text", text: { content: "" } }],
        },
        "To": {
          rich_text: [{ type: "text", text: { content: "" } }],
        },
        "Cash in": {
          number: isPositive ? 0 : settleAmount,
        },
        "Cash out": {
          number: isPositive ? settleAmount : 0,
        },
      };

      await notion.pages.create({
        parent: { database_id: dbId },
        properties: props,
      });

      return res.json({
        success: true,
        totalCashIn,
        totalCashOut,
        balance,
        settleAmount,
        direction: isPositive ? "cash_out" : "cash_in",
      });
    } catch (err) {
      console.error("/api/expenses/settle error:", err?.body || err);
      const raw = err?.body || err;
      const errorMessage =
        typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      return res.status(500).json({ success: false, error: errorMessage });
    }
  }
);

// Fetch All Expenses — FILTER BY CURRENT USER ONLY
app.get("/api/expenses", async (req, res) => {
  try {
    // Get current user's Team Member relation PAGE ID
    const teamMemberPageId = await getCurrentUserRelationPage(req);

    if (!teamMemberPageId) {
      return res.json({ success: true, items: [] });
    }

    // Query only expenses that belong to THIS user
    const list = await notion.databases.query({
      database_id: process.env.Expenses_Database,
      filter: {
        property: "Team Member",
        relation: {
          contains: teamMemberPageId
        }
      },
      sorts: [{ property: "Date", direction: "descending" }]
    });

    // Format results (support Reason as title OR rich_text)
    const expProps = await getExpensesDBProps();
    const cashInFromKey =
      pickPropName(expProps, ["Cash in from", "Cash In From", "Cash In from"]) ||
      "Cash in from";

    // If Cash in from is a relation in Notion, resolve related page titles once.
    const cashInFromTitleMap = new Map();
    const cashInFromIds = new Set();

    for (const page of list.results) {
      const p = page.properties?.[cashInFromKey];
      if (p?.type === "relation") {
        (p.relation || []).forEach((r) => r?.id && cashInFromIds.add(r.id));
      }
    }

    for (const id of cashInFromIds) {
      const t = await pageTitleById(id);
      cashInFromTitleMap.set(id, t);
    }

    const formatted = list.results.map((page) => {
      const props = page.properties || {};

      const reasonProp = props["Reason"]; // property name in Notion DB
      const reason =
        reasonProp?.title?.[0]?.plain_text ||
        reasonProp?.rich_text?.[0]?.plain_text ||
        "";

      // Cash in from can be rich_text OR relation
      const cashInFromProp = props?.[cashInFromKey];
      let cashInFrom = "";
      if (cashInFromProp?.type === "rich_text") {
        cashInFrom = cashInFromProp?.rich_text?.[0]?.plain_text || "";
      } else if (cashInFromProp?.type === "relation") {
        const names = (cashInFromProp?.relation || [])
          .map((r) => cashInFromTitleMap.get(r.id) || "")
          .filter(Boolean);
        cashInFrom = names.join(", ");
      }

      // Optional screenshot (Notion property: "Screenshot" - files)
      let screenshotUrl = "";
      let screenshotName = "";
      const screenshotProp = props?.["Screenshot"];
      if (screenshotProp?.type === "files") {
        const f = (screenshotProp.files || [])[0];
        if (f) {
          screenshotName = f.name || "";
          if (f.type === "external") screenshotUrl = f.external?.url || "";
          if (f.type === "file") screenshotUrl = f.file?.url || "";
        }
      }

      return {
        id: page.id,
        date: props["Date"]?.date?.start || null,
        reason,
        fundsType: props["Funds Type"]?.select?.name || "",
        from: props["From"]?.rich_text?.[0]?.plain_text || "",
        to: props["To"]?.rich_text?.[0]?.plain_text || "",
        kilometer: props["Kilometer"]?.number || 0,
        cashIn: props["Cash in"]?.number || 0,
        cashOut: props["Cash out"]?.number || 0,
        cashInFrom,
        screenshotUrl,
        screenshotName,
      };
    });

    res.json({ success: true, items: formatted });

  } catch (err) {
    console.error("Expenses load error:", err.body || err);
    res.json({ success: false, error: "Cannot load expenses" });
  }
});

// List users who have expenses (for logistics/admin view)
app.get(
  "/api/expenses/users",
  requireAuth,
  requirePage("Expenses Users"),
  async (req, res) => {
    try {
      if (!expensesDatabaseId) {
        return res.status(500).json({
          success: false,
          error: "Expenses database not configured",
        });
      }

      const perUser = new Map();
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const resp = await notion.databases.query({
          database_id: expensesDatabaseId,
          start_cursor: startCursor,
          sorts: [{ property: "Date", direction: "descending" }],
        });

        for (const page of resp.results) {
          const props = page.properties || {};
          const rel = props["Team Member"]?.relation;

          if (!Array.isArray(rel) || rel.length === 0) continue;

          const userId = rel[0].id;
          const cashIn = Number(props["Cash in"]?.number || 0);
          const cashOut = Number(props["Cash out"]?.number || 0);
          const delta = cashIn - cashOut;

          if (!perUser.has(userId)) {
            perUser.set(userId, {
              userId,
              total: 0,
              count: 0,
            });
          }
          const agg = perUser.get(userId);
          agg.total += delta;
          agg.count += 1;
        }

        hasMore = resp.has_more;
        startCursor = resp.next_cursor;
      }

      // Fetch user names
      const users = [];
      for (const [userId, agg] of perUser.entries()) {
        try {
          const page = await notion.pages.retrieve({ page_id: userId });
          const name =
            page.properties?.Name?.title?.[0]?.plain_text || "Unknown User";

          users.push({
            id: userId,
            name,
            total: agg.total,
            count: agg.count,
          });
        } catch (e) {
          console.error("Error loading team member name:", e.body || e);
        }
      }

      users.sort((a, b) => a.name.localeCompare(b.name));

      return res.json({ success: true, users });
    } catch (err) {
      console.error("/api/expenses/users error:", err.body || err);
      return res
        .status(500)
        .json({ success: false, error: "Failed to load expense users" });
    }
  }
);

// Get all expenses for a specific Team Member (by relation pageId)
app.get(
  "/api/expenses/user/:memberId",
  requireAuth,
  requirePage("Expenses Users"),
  async (req, res) => {
    try {
      if (!expensesDatabaseId) {
        return res.status(500).json({
          success: false,
          error: "Expenses database not configured",
        });
      }

      const memberId = String(req.params.memberId || "").trim();
      if (!memberId) {
        return res
          .status(400)
          .json({ success: false, error: "Missing memberId" });
      }

      const list = await notion.databases.query({
        database_id: expensesDatabaseId,
        filter: {
          property: "Team Member",
          relation: { contains: memberId },
        },
        sorts: [{ property: "Date", direction: "descending" }],
      });

            // Resolve Cash in from (rich_text OR relation) + support Reason as title/rich_text
      const expProps = await getExpensesDBProps();
      const cashInFromKey =
        pickPropName(expProps, ["Cash in from", "Cash In From", "Cash In from"]) ||
        "Cash in from";

      // If Cash in from is a relation in Notion, resolve related page titles once.
      const cashInFromTitleMap = new Map();
      const cashInFromIds = new Set();

      for (const page of list.results) {
        const p = page.properties?.[cashInFromKey];
        if (p?.type === "relation") {
          (p.relation || []).forEach((r) => r?.id && cashInFromIds.add(r.id));
        }
      }

      for (const id of cashInFromIds) {
        const t = await pageTitleById(id);
        cashInFromTitleMap.set(id, t);
      }

      const items = list.results.map((page) => {
        const props = page.properties || {};

        const reasonProp = props["Reason"]; // property name in Notion DB
        const reason =
          reasonProp?.title?.[0]?.plain_text ||
          reasonProp?.rich_text?.[0]?.plain_text ||
          "";

        // Cash in from can be rich_text OR relation
        const cashInFromProp = props?.[cashInFromKey];
        let cashInFrom = "";
        if (cashInFromProp?.type === "rich_text") {
          cashInFrom = cashInFromProp?.rich_text?.[0]?.plain_text || "";
        } else if (cashInFromProp?.type === "relation") {
          const names = (cashInFromProp?.relation || [])
            .map((r) => cashInFromTitleMap.get(r.id) || "")
            .filter(Boolean);
          cashInFrom = names.join(", ");
        }

        // Optional screenshot (Notion property: "Screenshot" - files)
        let screenshotUrl = "";
        let screenshotName = "";
        const screenshotProp = props?.["Screenshot"];
        if (screenshotProp?.type === "files") {
          const f = (screenshotProp.files || [])[0];
          if (f) {
            screenshotName = f.name || "";
            if (f.type === "external") screenshotUrl = f.external?.url || "";
            if (f.type === "file") screenshotUrl = f.file?.url || "";
          }
        }

        return {
          id: page.id,
          date: props["Date"]?.date?.start || null,
          reason,
          fundsType: props["Funds Type"]?.select?.name || "",
          from: props["From"]?.rich_text?.[0]?.plain_text || "",
          to: props["To"]?.rich_text?.[0]?.plain_text || "",
          kilometer: props["Kilometer"]?.number || 0,
          cashIn: props["Cash in"]?.number || 0,
          cashOut: props["Cash out"]?.number || 0,
          cashInFrom,
          screenshotUrl,
          screenshotName,
        };
      });

      res.json({ success: true, items });
    } catch (err) {
      console.error("/api/expenses/user/:memberId error:", err.body || err);
      res
        .status(500)
        .json({ success: false, error: "Failed to load user expenses" });
    }
  }
);

// ============================================
// Expenses: Screenshot proxy (Notion files expire)
// ============================================
// Notion "file" URLs are time-limited signed URLs (S3...Request has expired).
// If we put those URLs directly into Excel, they will stop working after a while.
//
// This endpoint returns a fresh URL at click-time by re-reading the Notion page and
// redirecting to the latest file URL.
//
// NOTE:
// - We keep it public (no requireAuth) so Excel links behave like the old signed links.
// - We still restrict it to ONLY pages that belong to the Expenses database.
// - If you prefer to lock it behind auth, add `requireAuth` as middleware.
app.get("/api/expenses/screenshot/:expenseId", async (req, res) => {
  try {
    const raw = String(req.params.expenseId || "").trim();
    if (!raw) return res.status(400).send("Missing expenseId");

    // Accept both hyphenated and non-hyphenated UUIDs
    if (!looksLikeNotionId(raw)) {
      // allow already-hyphenated UUIDs
      const noHyphen = raw.replace(/-/g, "");
      if (!looksLikeNotionId(noHyphen)) {
        return res.status(400).send("Invalid expenseId");
      }
    }

    const expenseId = toHyphenatedUUID(raw);
    const expDbId = expensesDatabaseId || process.env.Expenses_Database;
    if (!expDbId) return res.status(500).send("Expenses DB not configured");

    const page = await notion.pages.retrieve({ page_id: expenseId });
    const parentDbId = page?.parent?.type === "database_id" ? page.parent.database_id : null;

    // IMPORTANT: Notion may return IDs with hyphens, while env vars are often stored without hyphens.
    // Compare normalized 32-hex forms to avoid false "Not found".
    const parentNorm = normalizeNotionId(parentDbId);
    const expDbNorm = normalizeNotionId(expDbId);
    if (!parentNorm || !expDbNorm || parentNorm !== expDbNorm) {
      return res.status(404).send("Not found");
    }

    // Optional screenshot (Notion property: "Screenshot" - files)
    const props = page.properties || {};
    const screenshotProp = props?.["Screenshot"];
    if (!screenshotProp || screenshotProp.type !== "files") {
      return res.status(404).send("No screenshot");
    }

    const f = (screenshotProp.files || [])[0];
    if (!f) return res.status(404).send("No screenshot");

    let url = "";
    if (f.type === "external") url = f.external?.url || "";
    if (f.type === "file") url = f.file?.url || "";
    url = String(url || "").trim();

    if (!url) return res.status(404).send("No screenshot");

    // Avoid caching a potentially short-lived redirect
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(url);
  } catch (err) {
    console.error("/api/expenses/screenshot/:expenseId error:", err?.body || err);
    return res.status(500).send("Failed to open screenshot");
  }
});

// === Helper: upload base64 image to Vercel Blob (SDK v2) and return a public URL ===
async function uploadToBlobFromBase64(dataUrl, filenameHint = "receipt.jpg") {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_TOKEN_MISSING");
  const m = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("INVALID_DATA_URL");
  const contentType = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  const { put } = await import("@vercel/blob");
  const res = await put(filenameHint, buffer, {
    access: "public",
    token,
    contentType,
  });
  if (!res || !res.url) throw new Error("BLOB_PUT_FAILED");
  return res.url;
}

// ---- Helper: Parse DataURL (data:<mime>;base64,...) إلى { mime, buffer } ----
function parseDataUrlToBuffer(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error('INVALID_DATA_URL');
  const mime = m[1];
  const b64  = m[2];
  const buf  = Buffer.from(b64, 'base64');
  return { mime, buf };
}

// ---- Helper: جهّز عنصر "file" خارجي لخاصية Files & media في Notion ----
function makeExternalFile(name, url) {
  return { type: 'external', name: name || 'file', external: { url } };
}

// ---- Helper: رجّع اسم عمود Files & media وتحقق إنه فعلاً من نوع files ----
async function ensureFilesPropName(pageId, preferred = 'Files & media') {
  const page = await notion.pages.retrieve({ page_id: pageId });
  const props = page?.properties || {};
  // لو الاسم المفضّل موجود ونوعه files نستخدمه
  if (props[preferred]?.type === 'files') return preferred;
  // وإلا دوّر على أي عمود نوعه files
  const found = Object.keys(props).find(k => props[k]?.type === 'files');
  if (!found) throw new Error('FILES_PROP_MISSING');
  return found;
}

// ---- Helper: append / replace لمحتوى Files & media ----
async function writeFilesProp(pageId, propName, newFileObject, mode = 'append') {
  // هات الصفحة علشان تجيب أي ملفات حالية (هنحتفظ فقط بالـ external القديمة لتفادي مشاكل صلاحية Notion-hosted file)
  const pg = await notion.pages.retrieve({ page_id: pageId });
  const p  = pg?.properties?.[propName];
  if (!p || p.type !== 'files') throw new Error('FILES_PROP_NOT_FILES_TYPE');

  const existingExternal = Array.isArray(p.files)
    ? p.files
        .map(f => (f?.type === 'external' && f?.external?.url)
          ? { type: 'external', name: f.name || 'file', external: { url: f.external.url } }
          : null)
        .filter(Boolean)
    : [];

  const files = (mode === 'append')
    ? existingExternal.concat([ newFileObject ])
    : [ newFileObject ];

  await notion.pages.update({
    page_id: pageId,
    properties: { [propName]: { files } },
  });

  return { count: files.length };
}

// Export Express app for Vercel

// ====== S.V schools orders: helpers ======
async function detectSVSchoolsPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["S.V Schools","SV Schools","S V Schools","S.V schools"]) ||
    "S.V Schools"
  );
}
async function detectSVApprovalPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["S.V Approval","SV Approval"]) ||
    "S.V Approval"
  );
}
async function detectRequestedQtyPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, ["Quantity Requested","Requested Qty","Req"]) ||
    "Quantity Requested"
  );
}

// Detect the "Teams Members" relation column on the Orders DB
async function detectOrderTeamsMembersPropName() {
  const props = await getOrdersDBProps();
  return (
    pickPropName(props, [
      "Teams Members",
      "Team Members",
      "Teams_Members",
      "Teams members",
      "Members",
      "Created by",
      "User",
      "Owner"
    ]) || "Teams Members"
  );
}


// ====== Page route: S.V schools orders ======
app.get("/orders/sv-orders", requireAuth, requirePage("S.V schools orders"), (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "sv-orders.html"));
});


    // ====== API: update quantity (number only) ======
app.post("/api/sv-orders/:id/quantity", requireAuth, requirePage("S.V schools orders"), async (req, res) => {
  try {
    const pageId = req.params.id;
    const value = Number((req.body?.value ?? "").toString().trim());
    if (!pageId) return res.status(400).json({ error: "Missing id" });
    if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: "Invalid quantity" });

    const reqQtyProp = await detectRequestedQtyPropName();
    await notion.pages.update({ page_id: pageId, properties: { [reqQtyProp]: { number: Math.floor(value) } } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/sv-orders/:id/quantity error:", e?.body || e);
    return res.status(500).json({ error: "Failed to update quantity" });
  }
});

// ====== API: list S.V orders with tabs (Not Started / Approved / Rejected) ======
app.get("/api/sv-orders", requireAuth, requirePage("S.V schools orders"), async (req, res) => {
  try {
    // Map ?tab to S.V Approval label
    const tab = String(req.query.tab || "").toLowerCase();
    let label = "Not Started";
    if (tab === "approved") label = "Approved";
    else if (tab === "rejected") label = "Rejected";

    // Identify current Team Member (by session username)
    const userQuery = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: "Name", title: { equals: req.session.username } },
    });
    if (!userQuery.results.length) return res.status(404).json({ error: "User not found" });
    const userId = userQuery.results[0].id;

    // Resolve property names on Orders DB
    const reqQtyProp    = await detectRequestedQtyPropName();
    const approvalProp  = await detectSVApprovalPropName();
    const teamsProp     = await detectOrderTeamsMembersPropName();
    let   svRelProp     = await detectSVSchoolsPropName();

    const ordersProps   = await getOrdersDBProps();
    const approvalType  = ordersProps[approvalProp]?.type || "select";
    if (!ordersProps[svRelProp] || ordersProps[svRelProp].type !== "relation") {
      svRelProp = null; // if relation missing in schema, ignore
    }

    // Build Notion filter
    const andFilter = [
  { property: teamsProp, relation: { contains: userId } },
];

if (svRelProp) {
  andFilter.push({
    property: svRelProp,
    relation: { contains: userId }
  });
}
    if (label) {
      if (approvalType === "status") {
        andFilter.push({ property: approvalProp, status: { equals: label } });
      } else {
        andFilter.push({ property: approvalProp, select: { equals: label } });
      }
    }

    const items = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const resp = await notion.databases.query({
        database_id: ordersDatabaseId,
        start_cursor: startCursor,
        filter: { and: andFilter },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      for (const page of resp.results) {
        const props = page.properties || {};

        // Product name from relation if present
        let productName = "Item";
        const productRel = props.Product?.relation;
        if (Array.isArray(productRel) && productRel.length) {
          try {
            const productPage = await notion.pages.retrieve({ page_id: productRel[0].id });
            productName = productPage.properties?.Name?.title?.[0]?.plain_text || productName;
          } catch {}
        } else {
          productName = props.Name?.title?.[0]?.plain_text || productName;
        }

        items.push({
          id: page.id,
          reason: props.Reason?.title?.[0]?.plain_text || "",
          productName,
          quantity: Number(props[reqQtyProp]?.number || 0),
          approval: props[approvalProp]?.select?.name || props[approvalProp]?.status?.name || "",
          createdTime: page.created_time,
        });
      }

      hasMore = resp.has_more;
      startCursor = resp.next_cursor;
    }

    res.set("Cache-Control", "no-store");
    return res.json(items);
  } catch (e) {
    console.error("GET /api/sv-orders error:", e?.body || e);
    return res.status(500).json({ error: "Failed to load S.V orders" });
  }
});
// --- S.V schools orders: Approve/Reject (updates Notion "S.V Approval") ---
app.post(
  ["/api/sv-orders/:id/approval", "/sv-orders/:id/approval"],
  requireAuth,
  requirePage("S.V schools orders"),
  async (req, res) => {
    try {
      const pageId = req.params.id;
      const raw = String(req.body?.decision || "").toLowerCase();
      const decision =
        raw === "approved" ? "Approved" :
        raw === "rejected" ? "Rejected" :
        raw === "not started" ? "Not Started" : null;

      if (!pageId || !decision) {
        return res.status(400).json({ ok:false, error: "Invalid id or decision" });
      }

      const approvalProp = await detectSVApprovalPropName();
      const ordersProps  = await getOrdersDBProps();
      const type         = ordersProps[approvalProp]?.type || "select";

      const properties = type === "status"
        ? { [approvalProp]: { status: { name: decision } } }
        : { [approvalProp]: { select: { name: decision } } };

      await notion.pages.update({ page_id: pageId, properties });

      return res.json({ ok:true, id: pageId, decision });
    } catch (e) {
      console.error("POST /api/sv-orders/:id/approval error:", e?.body || e);
      return res.status(500).json({ ok:false, error: "Failed to update S.V Approval", details: e?.body || String(e) });
    }
  }
);
// === Damaged Assets: submit report (يدعم body.items[] أو النموذج القديم) ===
app.post("/api/damaged-assets", requireAuth, requirePage("Damaged Assets"), async (req, res) => {
  try {
    if (!damagedAssetsDatabaseId) {
      return res.status(500).json({ ok: false, error: "Damaged_Assets database ID is not configured." });
    }

    const productsDatabaseId =
      componentsDatabaseId ||
      process.env.Products_Database ||
      process.env.NOTION_PRODUCTS_DATABASE_ID ||
      process.env.PRODUCTS_DATABASE_ID ||
      null;

    // اقرأ خصائص قاعدة Damaged_Assets
    const db = await notion.databases.retrieve({ database_id: damagedAssetsDatabaseId });
    const props = db.properties || {};
    const titleKey = Object.keys(props).find(k => props[k]?.type === "title") || "Name";

    const findProp = (type, cands = [], hint = null) => {
      for (const c of cands) if (props[c]?.type === type) return c;
      if (hint) {
        const rx = new RegExp(hint, "i");
        for (const k of Object.keys(props)) if (props[k]?.type === type && rx.test(k)) return k;
      }
      for (const k of Object.keys(props)) if (props[k]?.type === type) return k;
      return null;
    };

    const descKey   = findProp("rich_text", ["Description of issue","Damage Description","Description","Details","Notes"], "(desc|issue|damage|note|detail)");
    const reasonKey = findProp("rich_text", ["Issue Reason","Reason"], "(reason)");
    const dateKey   = findProp("date",      ["Date","Reported On","Report Date"], "(date|report)");
    const filesKey  = Object.keys(props).find(k => props[k]?.type === "files");

    // Team Members relation
    let reporterKey = null;
    if (teamMembersDatabaseId) {
      for (const [k, v] of Object.entries(props)) {
        if (v?.type === "relation" && v?.relation?.database_id === teamMembersDatabaseId) { reporterKey = k; break; }
      }
    }
    if (!reporterKey) {
      for (const [k, v] of Object.entries(props)) {
        if (v?.type === "relation" && /team|member/i.test(k)) { reporterKey = k; break; }
      }
    }

    // Products relation
    let productsKey = null;
    for (const [k, v] of Object.entries(props)) {
      if (v?.type === "relation" && productsDatabaseId && v?.relation?.database_id === productsDatabaseId) { productsKey = k; break; }
      if (!productsKey && v?.type === "relation" && /product/i.test(k)) productsKey = k;
    }

    // هات صفحة المستخدم الحالي مرّة واحدة
    let currentUserId = null;
    if (teamMembersDatabaseId && req.session?.username) {
      try {
        const q = await notion.databases.query({
          database_id: teamMembersDatabaseId,
          filter: { property: "Name", title: { equals: String(req.session.username).trim() } },
          page_size: 1
        });
        currentUserId = q.results?.[0]?.id || null;
      } catch {}
    }
    if (!currentUserId && teamMembersDatabaseId) {
      try {
        const tmDb = await notion.databases.retrieve({ database_id: teamMembersDatabaseId });
        const tProps = tmDb.properties || {};
        const emailProp = Object.keys(tProps).find(k => tProps[k]?.type === "email") || null;
        const titleProp = Object.keys(tProps).find(k => tProps[k]?.type === "title") || "Name";
        const email = req.user?.email || req.session?.email || null;
        const name  = req.user?.name  || req.session?.username || req.session?.name || null;

        if (email && emailProp) {
          const q1 = await notion.databases.query({
            database_id: teamMembersDatabaseId,
            filter: { property: emailProp, email: { equals: String(email).trim() } },
            page_size: 1
          });
          currentUserId = q1.results?.[0]?.id || currentUserId;
        }
        if (!currentUserId && name && titleProp) {
          const q2 = await notion.databases.query({
            database_id: teamMembersDatabaseId,
            filter: { property: titleProp, title: { contains: String(name).trim() } },
            page_size: 1
          });
          currentUserId = q2.results?.[0]?.id || currentUserId;
        }
      } catch {}
    }

    // === V2: items[] ===
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (items && items.length) {
      const created = [];
      for (const it of items) {
        const productId = it?.product?.id || it?.productId || null;
        const title     = (it?.title || "").toString().trim();
        const reason    = (it?.reason || "").toString().trim();

        const properties = {};
        properties[titleKey] = { title: [{ text: { content: title || "Damaged asset" } }] };
        if (descKey)                     properties[descKey]   = { rich_text: [{ text: { content: title } }] };
        if (reasonKey && reason)         properties[reasonKey] = { rich_text: [{ text: { content: reason } }] };
        if (productsKey && productId)    properties[productsKey] = { relation: [{ id: productId }] };
        if (reporterKey && currentUserId)properties[reporterKey] = { relation: [{ id: currentUserId }] };
        if (dateKey) {
          const today = new Date().toISOString().slice(0, 10);
          properties[dateKey] = { date: { start: today } };
        }

        const page = await notion.pages.create({
          parent: { database_id: damagedAssetsDatabaseId },
          properties,
        });

        if (filesKey && Array.isArray(it?.files) && it.files.some(f => f?.url)) {
          const files = it.files.filter(f => !!f.url).slice(0,10)
            .map((f,i) => ({ type:"external", name: f.name || `file-${i+1}`, external:{ url:f.url } }));
          try { await notion.pages.update({ page_id: page.id, properties: { [filesKey]: { files } } }); } catch {}
        }

        created.push(page.id);
      }
      return res.json({ ok: true, created });
    }

    // === Legacy body ===
    const { assetName, damageDescription, location, severity, photos = [] } = req.body || {};
    const properties = {};
    properties[titleKey] = { title: [{ text: { content: (assetName || "Damaged asset").toString() } }] };
    if (descKey && (damageDescription || "") !== "") {
      properties[descKey] = { rich_text: [{ text: { content: damageDescription.toString() } }] };
    }
    const placeKey = findProp("rich_text", ["Location","Place","Area","Site"], "(locat|place|site|area)");
    if (placeKey && location) properties[placeKey] = { rich_text: [{ text: { content: location.toString() } }] };
    if (dateKey) {
      const today = new Date().toISOString().slice(0,10);
      properties[dateKey] = { date: { start: today } };
    }
    if (reporterKey && currentUserId) {
      properties[reporterKey] = { relation: [{ id: currentUserId }] };
    }
    const severityKey = findProp("select", ["Severity","Level","Priority"], "(severity|level|priority)");
    if (severityKey && severity) properties[severityKey] = { select: { name: severity.toString() } };

    const created = await notion.pages.create({
      parent: { database_id: damagedAssetsDatabaseId },
      properties,
    });

    if (filesKey && Array.isArray(photos) && photos.length) {
      const files = photos.slice(0,10).map((u,i) => ({ type:"external", name:`photo-${i+1}`, external:{ url:u } }));
      try { await notion.pages.update({ page_id: created.id, properties: { [filesKey]: { files } } }); } catch {}
    }

    return res.json({ ok: true, id: created.id });
  } catch (e) {
    console.error("Damaged Assets submit error:", e?.body || e);
    return res.status(500).json({ ok: false, error: "Failed to save damaged asset report", details: e?.body || String(e) });
  }
});

// === Notion: رفع صورة DataURL -> Vercel Blob -> ربطها في Files & media ===
app.post('/api/notion/upload-file', requireAuth, async (req, res) => {
  try {
    const { pageId, dataUrl, filename, propName, mode } = req.body || {};

    if (!pageId)  return res.status(400).json({ ok:false, error:'pageId required' });
    if (!dataUrl) return res.status(400).json({ ok:false, error:'dataUrl required' });

    // 1) Parse DataURL
    const { mime, buf } = parseDataUrlToBuffer(dataUrl);

    // 2) تأكد من الحد الأقصى 20MB (على الملف قبل Base64)
    if (buf.length > 20 * 1024 * 1024) {
      return res.status(413).json({ ok:false, error:'File > 20MB' });
    }

    // 3) ارفع الملف على Vercel Blob وخد رابط عام
    //    (الهيلبر uploadToBlobFromBase64 موجود عندك بالفعل)
    const publicUrl = await uploadToBlobFromBase64(`data:${mime};base64,${buf.toString('base64')}`, filename || 'upload.jpg');

    // 4) تأكد من اسم عمود Files & media (أو أي عمود files لو الاسم مختلف)
    const prop = await ensureFilesPropName(pageId, propName || 'Files & media');

    // 5) كوّن عنصر external file واكتبه في الخاصية (append افتراضيًا)
    const fileObj = makeExternalFile(filename || 'upload.jpg', publicUrl);
    const { count } = await writeFilesProp(pageId, prop, fileObj, (mode === 'replace' ? 'replace' : 'append'));

    return res.json({ ok: true, pageId, prop, url: publicUrl, totalFiles: count });
  } catch (e) {
    console.error('upload-file error:', e?.body || e);
    return res.status(500).json({ ok:false, error: e?.message || 'Upload failed' });
  }
});

// === API: List Damaged Assets for the logged-in user ===
app.get('/api/sv-assets', requireAuth, requirePage('S.V Schools Assets'), async (req, res) => {
  try {
    if (!damagedAssetsDatabaseId || !teamMembersDatabaseId) {
      return res.status(500).json({ error: 'Database IDs are not configured.' });
    }

    // 1. حدد المستخدم الحالي
    const userQuery = await notion.databases.query({
      database_id: teamMembersDatabaseId,
      filter: { property: 'Name', title: { equals: req.session.username } },
    });

    if (!userQuery.results.length) {
      return res.status(404).json({ error: 'User not found in Team Members.' });
    }

    const userId = userQuery.results[0].id;
    const items = [];
    let hasMore = true;
    let startCursor = undefined;

    // 2. جلب البيانات من Damaged_Assets المرتبطة بالمستخدم
    while (hasMore) {
      const resp = await notion.databases.query({
        database_id: damagedAssetsDatabaseId,
        start_cursor: startCursor,
        filter: { property: 'Teams Members', relation: { contains: userId } },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      });

      for (const page of resp.results) {
        const props = page.properties || {};

        // تحديد اسم العنوان والوصف والملفات لو موجودة
        const title =
          props.Name?.title?.[0]?.plain_text ||
          props['Title']?.title?.[0]?.plain_text ||
          'Untitled';
        const reason =
          props['Issue Reason']?.rich_text?.[0]?.plain_text ||
          props['Reason']?.rich_text?.[0]?.plain_text ||
          '';
        const createdTime = page.created_time;

        // استخراج الملفات
        let files = [];
        const fileProp = Object.values(props).find(p => p?.type === 'files');
        if (fileProp?.files?.length) {
          files = fileProp.files.map(f =>
            f?.type === 'external' ? f.external.url : f.file.url
          );
        }
// قراءة S.V Comment إن وجد
const svCommentKey = Object.keys(props).find(k =>
  k.toLowerCase().includes("s.v comment") || k.toLowerCase().includes("sv comment")
);
const svComment =
  svCommentKey && props[svCommentKey]?.rich_text?.length
    ? props[svCommentKey].rich_text.map(t => t.plain_text || "").join(" ").trim()
    : "";

items.push({
  id: page.id,
  title,
  reason,
  createdTime,
  files,
  "S.V Comment": svComment,
});
      }

      hasMore = resp.has_more;
      startCursor = resp.next_cursor;
    }

    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, rows: items });
  } catch (e) {
    console.error('GET /api/sv-assets error:', e?.body || e);
    res.status(500).json({ ok: false, error: 'Failed to load user assets' });
  }
});

// === API: Update S.V Comment for a specific asset ===
app.post('/api/sv-assets/:id/comment', requireAuth, requirePage('S.V Schools Assets'), async (req, res) => {
  try {
    const pageId = req.params.id;
    const comment = String(req.body?.comment || '').trim();
    if (!pageId) return res.status(400).json({ ok: false, error: 'Missing asset id' });

    // جلب خصائص قاعدة البيانات لتحديد اسم عمود S.V Comment
    const db = await notion.databases.retrieve({ database_id: damagedAssetsDatabaseId });
    const props = db.properties || {};
    const svCommentProp =
      Object.keys(props).find(k =>
        k.toLowerCase().includes('s.v comment') ||
        k.toLowerCase().includes('sv comment')
      ) || 'S.V Comment';

    await notion.pages.update({
      page_id: pageId,
      properties: {
        [svCommentProp]: { rich_text: [{ text: { content: comment } }] },
      },
    });

    res.json({ ok: true, id: pageId, comment });
  } catch (e) {
    console.error('POST /api/sv-assets/:id/comment error:', e?.body || e);
    res.status(500).json({ ok: false, error: 'Failed to save S.V Comment' });
  }
});
app.get('/api/damaged-assets/reviewed', requireAuth, requirePage('Damaged Assets'), async (req, res) => {
  try {
    if (!damagedAssetsDatabaseId) {
      return res.status(500).json({ error: 'Database ID not configured.' });
    }

    const all = [];
    let startCursor;
    let hasMore = true;

    while (hasMore) {
      const resp = await notion.databases.query({
        database_id: damagedAssetsDatabaseId,
        start_cursor: startCursor,
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      for (const page of resp.results) {
        const props = page.properties || {};
        const comment = props["S.V Comment"]?.rich_text?.[0]?.plain_text || "";
        if (!comment.trim()) continue; // فقط اللي عندهم comment

        const title =
          props.Name?.title?.[0]?.plain_text ||
          props.Title?.title?.[0]?.plain_text ||
          "Untitled";

        let files = [];
        const fileProp = Object.values(props).find(p => p?.type === 'files');
        if (fileProp?.files?.length) {
          files = fileProp.files.map(f =>
            f?.type === 'external' ? f.external.url : f.file.url
          );
        }

        all.push({
          id: page.id,
          title,
          comment,
          files,
          createdTime: page.created_time,
        });
      }

      hasMore = resp.has_more;
      startCursor = resp.next_cursor;
    }

    res.json({ ok: true, rows: all });
  } catch (e) {
    console.error('GET /api/damaged-assets/reviewed error:', e?.body || e);
    res.status(500).json({ ok: false, error: 'Failed to load reviewed assets' });
  }
});

// === API: Generate PDF for a reviewed damaged asset ===
// === Generate one PDF per report (ID), not per component ===
app.get('/api/damaged-assets/report/:reportId/pdf', requireAuth, requirePage('Damaged Assets'), async (req, res) => {
  try {
    const reportId = req.params.reportId;
    if (!reportId) return res.status(400).json({ error: 'Missing report ID' });

    // 1️⃣ Fetch all pages with this ID value
    const resp = await notion.databases.query({
      database_id: damagedAssetsDatabaseId,
      filter: {
        property: 'ID',
        rich_text: { equals: reportId }
      },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    });

    if (!resp.results.length) {
      return res.status(404).json({ error: 'No pages found for this report ID' });
    }

    // 2️⃣ Prepare PDF
    const fname = `${reportId}_Report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(18).text(`Damaged Report (${reportId})`, { align: 'left' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    for (const page of resp.results) {
      const props = page.properties || {};
      const title =
        props.Name?.title?.[0]?.plain_text ||
        props.Title?.title?.[0]?.plain_text ||
        'Untitled';
      const reason =
        props['Issue Reason']?.rich_text?.[0]?.plain_text ||
        props['Reason']?.rich_text?.[0]?.plain_text || '';
      const comment =
        props['S.V Comment']?.rich_text?.[0]?.plain_text ||
        props['SV Comment']?.rich_text?.[0]?.plain_text || '';

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111').text(`Component: ${title}`);
      if (reason) doc.font('Helvetica').fontSize(12).fillColor('#222').text(`Reason: ${reason}`);
      if (comment) doc.font('Helvetica').fontSize(12).fillColor('#333').text(`S.V Comment: ${comment}`);
      doc.moveDown(0.5);

      const fileProp = Object.values(props).find(p => p?.type === 'files');
      if (fileProp?.files?.length) {
        for (const f of fileProp.files) {
          try {
            const url = f.type === 'external' ? f.external.url : f.file.url;
            const response = await fetch(url);
            const buf = Buffer.from(await response.arrayBuffer());
            doc.image(buf, { fit: [400, 250], align: 'center', valign: 'center' });
            doc.moveDown(0.5);
          } catch {}
        }
      }

      doc.moveDown(1);
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(1);
    }

    doc.font('Helvetica').fontSize(10).fillColor('#555').text('Generated by Pyramakerz Dashboard');
    doc.end();
  } catch (e) {
    console.error('GET /api/damaged-assets/report/:reportId/pdf error:', e?.body || e);
    res.status(500).json({ error: 'Failed to generate report PDF' });
  }
});
// ================== Logistics: Verify User Password ==================
app.post("/api/logistics/verify-user", requireAuth, async (req, res) => {
  try {
    const { userId, password } = req.body || {};
    if (!userId || !password) {
      return res.status(400).json({ ok: false, error: "Missing userId or password" });
    }

    // Fetch page from Team Members DB
    const userPage = await notion.pages.retrieve({ page_id: userId });
    if (!userPage) return res.status(404).json({ ok: false, error: "User not found" });

    const props = userPage.properties || {};
    const name =
      props.Name?.title?.[0]?.plain_text ||
      props.Username?.title?.[0]?.plain_text ||
      "User";

    const storedPassword = props.Password?.number;

    if (!storedPassword) {
      return res.status(400).json({ ok: false, error: "Password not set for this user" });
    }

    if (storedPassword.toString() !== password.toString()) {
      return res.json({ ok: false, error: "Incorrect password" });
    }

    return res.json({ ok: true, name });
  } catch (e) {
    console.error("verify-user error:", e.body || e);
    return res.status(500).json({ ok: false, error: "Server error verifying user" });
  }
});
// ========= Get Relation users for "Received from" column =========
app.get("/api/logistics/receivers", requireAuth, async (req, res) => {
  try {
    if (!ordersDatabaseId) {
      return res.status(500).json({ ok:false, error:"Orders DB missing" });
    }

    // Get DB schema
    const db = await notion.databases.retrieve({ database_id: ordersDatabaseId });
    const props = db.properties || {};

    // Detect the Relation column "Received from"
    let receivedFromKey = Object.keys(props).find(k =>
      k.toLowerCase().includes("received from") ||
      k.toLowerCase().includes("received_from")
    );

    if (!receivedFromKey) return res.json({ ok:true, users:[] });

    // Get database ID of relation target
    const relDbId = props[receivedFromKey]?.relation?.database_id;
    if (!relDbId) return res.json({ ok:true, users:[] });

    // Fetch all users from relation target database
    const result = await notion.databases.query({
      database_id: relDbId,
      sorts: [{ property: "Name", direction: "ascending" }],
    });

    const users = result.results.map(p => ({
      id: p.id,
      name: p.properties?.Name?.title?.[0]?.plain_text || "Unnamed"
    }));

    return res.json({ ok:true, users });
  } catch (e) {
    console.error("GET /api/logistics/receivers error:", e.body || e);
    return res.status(500).json({ ok:false, error:"Failed to load receiver users" });
  }
});

const generateExpensePDF = require("./pdfGenerator");

app.post("/api/expenses/export/pdf", async (req, res) => {
  try {
    const { userName, items, dateFrom, dateTo, userId } = req.body;

    generateExpensePDF(
      { userName, items, dateFrom, dateTo, userId },
      (err, buffer) => {
        if (err) {
          console.error(err);
          return res.status(500).send("PDF generation failed");
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${userName.replace(/[^a-z0-9]/gi, "_")}_expenses.pdf"`
        );

        res.send(buffer);
      }
    );
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/expenses/export/excel", async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const { userName, items } = req.body;

    const safeItems = Array.isArray(items) ? items : [];

    // userName is coming from the UI as "Expenses — <Name>"
    const rawName = String(userName || "Expenses").trim();
    const displayName = (rawName.replace(/^Expenses\s*[—\-]\s*/i, "").trim() || rawName);

    // Base URL used for stable hyperlinks inside Excel.
    // (Notion file URLs expire, so we link to our proxy endpoint instead.)
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const totalCashIn = safeItems.reduce(
      (sum, it) => sum + Number(it?.cashIn || 0),
      0
    );
    const totalCashOut = safeItems.reduce(
      (sum, it) => sum + Number(it?.cashOut || 0),
      0
    );
    const totalBalance = totalCashIn - totalCashOut;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Operations Dashboard";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Expenses");

    // -------------------------
    // Styles / helpers
    // -------------------------
    const BORDER_COLOR = { argb: "FF9CA3AF" }; // gray-400
    const borderThin = {
      top: { style: "thin", color: BORDER_COLOR },
      left: { style: "thin", color: BORDER_COLOR },
      bottom: { style: "thin", color: BORDER_COLOR },
      right: { style: "thin", color: BORDER_COLOR },
    };
    // Numbers formatting (NO currency sign)
    // IMPORTANT:
    // Some Excel viewers (especially mobile) render a trailing "." when the format contains
    // optional decimals like "0.##" even if the value is an integer. To guarantee "150" (not "150.")
    // we use two formats and choose per-cell based on whether the value is integer-like.
    const numberFmtInt = '#,##0;-#,##0;0';
    const numberFmtDec = '#,##0.##;-#,##0.##;0';

    function isIntLike(n) {
      const num = Number(n);
      if (!Number.isFinite(num)) return true;
      return Math.abs(num - Math.round(num)) < 1e-9;
    }

    function numFmtFor(n) {
      return isIntLike(n) ? numberFmtInt : numberFmtDec;
    }

    // Funds Type cell colors (only the cell itself, NOT the whole row)
    // Prefer using the same colors configured in Notion for the "Funds Type" select options.
    // If we can't read Notion colors (or a type isn't found), we fall back to a high-contrast palette.
    const NOTION_COLOR_TO_FILL = {
      default: "FFF3F4F6", // light gray
      gray:    "FFE5E7EB",
      brown:   "FFF5E6D3",
      orange:  "FFFED7AA",
      yellow:  "FFFDE68A",
      green:   "FFBBF7D0",
      blue:    "FFBFDBFE",
      purple:  "FFE9D5FF",
      pink:    "FFFBCFE8",
      red:     "FFFECACA",
    };

    // Map: Funds Type name -> Notion color name
    const fundsTypeToNotionColor = new Map();
    try {
      const expProps = await getExpensesDBProps();
      const fundsTypeKey =
        pickPropName(expProps, ["Funds Type", "Funds type", "Fund Type", "Type"]) ||
        "Funds Type";

      const opts = expProps?.[fundsTypeKey]?.select?.options || [];
      for (const opt of opts) {
        if (!opt?.name) continue;
        fundsTypeToNotionColor.set(String(opt.name).trim(), opt.color || "default");
      }
    } catch (e) {
      console.warn(
        "Excel export: unable to load Notion Funds Type colors, using fallback palette.",
        e?.body || e
      );
    }

    // Fallback palette (very distinct pastel colors) to avoid similar-looking types.
    // Still deterministic via hashing so the same type always gets the same fallback color.
    const fundsTypePalette = [
      "FFFDE68A", // yellow-200
      "FFBFDBFE", // blue-200
      "FFBBF7D0", // green-200
      "FFFECACA", // red-200
      "FFE9D5FF", // purple-200
      "FFFBCFE8", // pink-200
      "FFFED7AA", // orange-200
      "FF99F6E4", // teal-200
      "FFC7D2FE", // indigo-200
      "FFD9F99D", // lime-200
      "FFA5F3FC", // cyan-200
      "FFF5E6D3", // light brown
    ];

    function hashStr(s) {
      // djb2
      let h = 5381;
      const str = String(s || "");
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    }

    function fundsTypeFill(typeName) {
      const t = String(typeName || "").trim();
      if (!t) return null;

      // 1) Prefer Notion option color (so export matches Notion)
      const notionColor = fundsTypeToNotionColor.get(t);
      const notionFill = notionColor ? NOTION_COLOR_TO_FILL[notionColor] : null;
      if (notionFill) return notionFill;

      // 2) Fallback: deterministic palette
      const idx = hashStr(t.toLowerCase()) % fundsTypePalette.length;
      return fundsTypePalette[idx];
    }


    function formatNumberForWidth(n) {
      const num = Number(n);
      if (Number.isNaN(num)) return "";
      const negative = num < 0;
      const abs = Math.abs(num);

      // Keep up to 2 decimals, trim trailing zeros
      let s = (abs % 1 === 0)
        ? abs.toString()
        : abs.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");

      // Add thousands separators to approximate the displayed string
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return negative ? `-${s}` : s;
    }

    function safeExcelFileName(name) {
      // Windows safe-ish + avoid empty filename
      const cleaned = String(name || "expenses")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[^a-z0-9\- _]/gi, "_")
        .slice(0, 120);
      return cleaned || "expenses";
    }

    function setRangeBorder(fromRow, toRow, fromCol, toCol) {
      for (let r = fromRow; r <= toRow; r++) {
        const row = sheet.getRow(r);
        for (let c = fromCol; c <= toCol; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
        }
      }
    }

    // -------------------------
    // Column layout
    // -------------------------
    const columns = [
      { header: "Date", width: 14 },
      { header: "Funds Type", width: 18 },
      { header: "Reason", width: 36 },
      { header: "From", width: 18 },
      { header: "To", width: 18 },
      { header: "Cash In", width: 14 },
      { header: "Cash Out", width: 14 },
      { header: "Screenshot", width: 18 },
    ];

    const lastCol = columns.length;

    columns.forEach((c, idx) => {
      sheet.getColumn(idx + 1).width = c.width;
    });

    // -------------------------
    // Title
    // -------------------------
    sheet.mergeCells(1, 1, 1, lastCol);
    const titleCell = sheet.getCell("A1");
    titleCell.value = `Expenses Report — ${displayName}`;
    titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" }, // gray-900
    };
    sheet.getRow(1).height = 26;

    sheet.mergeCells(2, 1, 2, lastCol);
    const metaCell = sheet.getCell("A2");
    metaCell.value = `Generated: ${new Date().toISOString().slice(0, 10)}`;
    metaCell.font = { italic: true, color: { argb: "FF6B7280" } };
    metaCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 18;

    // -------------------------
    // Summary box
    // -------------------------
    sheet.mergeCells("A3:B3");
    const summaryHead = sheet.getCell("A3");
    summaryHead.value = "Summary";
    summaryHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
    summaryHead.alignment = { horizontal: "center", vertical: "middle" };
    summaryHead.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E79" },
    };
    sheet.getRow(3).height = 18;

    const summaryRows = [
      { label: "Total Cash In", value: totalCashIn, valueColor: "FF16A34A" },
      { label: "Total Cash Out", value: totalCashOut, valueColor: "FFDC2626" },
      { label: "Total Balance", value: totalBalance, valueColor: "FF2563EB" },
    ];

    summaryRows.forEach((r, i) => {
      const rowIndex = 4 + i;
      const labelCell = sheet.getCell(`A${rowIndex}`);
      const valueCell = sheet.getCell(`B${rowIndex}`);

      labelCell.value = r.label;
      labelCell.font = { bold: true, color: { argb: "FF111827" } };
      // User requested center alignment across the exported file
      labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" }, // gray-100
      };

      valueCell.value = Number(r.value || 0);
      // No currency sign + keep decimals only when needed
      // (and never show a trailing dot for integers)
      valueCell.numFmt = numFmtFor(valueCell.value);
      valueCell.font = { bold: true, color: { argb: r.valueColor } };
      valueCell.alignment = { horizontal: "center", vertical: "middle" };

      sheet.getRow(rowIndex).height = 18;
    });

    // Border around summary box (A3:B6)
    setRangeBorder(3, 6, 1, 2);

    // Leave a blank row then start the table
    const startRow = 8;

    // -------------------------
    // Table header
    // -------------------------
    const headerRow = sheet.getRow(startRow);
    headerRow.height = 20;

    // Style only the used header columns (avoid coloring to end of sheet)
    columns.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF374151" }, // gray-700
      };
      cell.border = borderThin;
    });

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: startRow, column: 1 },
      to: { row: startRow, column: columns.length },
    };

    // Note: We intentionally DO NOT freeze panes here.
    // Freezing draws a line across the sheet, and the user requested to remove it.

    // -------------------------
    // Table rows
    // -------------------------
    safeItems.forEach((it) => {
      const d = it?.date ? new Date(it.date) : null;
      const dateVal = d && !Number.isNaN(d.getTime()) ? d : (it?.date || "");

      // Notion-hosted "file" URLs expire. Use a stable proxy URL (fresh redirect at click-time).
      const screenshotUrlRaw = String(it?.screenshotUrl || "").trim();
      const screenshotText = String(it?.screenshotName || "Open").trim() || "Open";

      const expenseId = String(it?.id || "").trim();
      const screenshotUrl = (screenshotUrlRaw && expenseId)
        ? `${baseUrl}/api/expenses/screenshot/${encodeURIComponent(expenseId)}`
        : screenshotUrlRaw;

      const row = sheet.addRow([
        dateVal,
        it?.fundsType || "",
        it?.reason || "",
        it?.from || "",
        it?.to || "",
        Number(it?.cashIn || 0),
        Number(it?.cashOut || 0),
        "", // hyperlink placeholder
      ]);

      // Screenshot hyperlink (if exists)
      if (screenshotUrl) {
        const linkCell = row.getCell(8);
        linkCell.value = { text: screenshotText, hyperlink: screenshotUrl };
        linkCell.font = { color: { argb: "FF2563EB" }, underline: true };
        linkCell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });

    // Body styling (borders, wrapping, number formats, zebra rows)
    const bodyStart = startRow + 1;
    const bodyEnd = sheet.rowCount;

    for (let r = bodyStart; r <= bodyEnd; r++) {
      const row = sheet.getRow(r);
      row.height = 18;

      const isZebra = (r - bodyStart) % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderThin;
        // Default alignment: center (requested)
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

        // Zebra fill for readability
        if (isZebra) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF9FAFB" }, // gray-50
          };
        }

        // Date column
        if (colNumber === 1) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          // If it's a Date object, apply date format
          if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd";
        }

        // Funds Type column: color ONLY this cell based on type (same type => same color)
        if (colNumber === 2) {
          const fillArgb = fundsTypeFill(cell.value);
          if (fillArgb) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillArgb },
            };
            // keep text readable
            cell.font = { color: { argb: "FF111827" }, bold: true };
          }
        }

        // Cash columns
        if (colNumber === 6) {
          cell.numFmt = numFmtFor(cell.value);
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { color: { argb: "FF16A34A" } };
        }
        if (colNumber === 7) {
          cell.numFmt = numFmtFor(cell.value);
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { color: { argb: "FFDC2626" } };
        }

        // Screenshot column (hyperlink)
        if (colNumber === 8) {
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
        }
      });
    }

    // -------------------------
    // Auto-fit column widths ("auto fill" requested)
    // Skip the big merged title row to avoid huge column widths.
    // -------------------------
    const AUTO_FROM_ROW = 3;
    const AUTO_TO_ROW = sheet.rowCount;
    const MAX_COL_WIDTH = 60;
    const MIN_COL_WIDTH = 10;

    function cellTextForWidth(cell) {
      const v = cell?.value;
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "number") return formatNumberForWidth(v);
      if (typeof v === "object") {
        if (typeof v.text === "string") return v.text;
        if (Array.isArray(v.richText)) {
          return v.richText.map((x) => x?.text || "").join("");
        }
      }
      return String(v);
    }

    for (let c = 1; c <= lastCol; c++) {
      let maxLen = 0;

      // Start with the table header label (if any)
      const headerLabel = columns?.[c - 1]?.header;
      if (headerLabel) maxLen = Math.max(maxLen, String(headerLabel).length);

      for (let r = AUTO_FROM_ROW; r <= AUTO_TO_ROW; r++) {
        // Skip title/meta rows (1-2) by starting from 3, but also ignore merged title cell remnants
        const cell = sheet.getRow(r).getCell(c);
        const txt = cellTextForWidth(cell);
        if (!txt) continue;
        maxLen = Math.max(maxLen, txt.length);
      }

      // Add a little padding
      const width = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxLen + 2));
      sheet.getColumn(c).width = width;
    }

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const filename = safeExcelFileName(`${displayName}_expenses_${new Date().toISOString().slice(0, 10)}`);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.xlsx"`
    );
    res.setHeader("Content-Length", buffer.length);

    res.end(buffer);

  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ error: "Failed to generate Excel file" });
  }
});

module.exports = app;
