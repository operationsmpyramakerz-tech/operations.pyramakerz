const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");

// Robust session config for Vercel (Upstash Redis) with safe fallback
const hasSecret = !!process.env.SESSION_SECRET;
const hasUrl = !!process.env.UPSTASH_REDIS_URL;

let store = null;
let redisClient = null;
if (hasSecret && hasUrl) {
  try {
    redisClient = createClient({
      url: process.env.UPSTASH_REDIS_URL, // must be rediss://
      socket: { tls: true, keepAlive: 30000 },
    });
    redisClient.on("error", (err) => console.error("[Redis] error", err?.message || err));
    redisClient.on("connect", () => console.log("[Redis] connecting..."));
    redisClient.on("ready", () => console.log("[Redis] ready ✓"));
    // connect lazily; don't await
    redisClient.connect().catch((e) => console.error("[Redis] connect failed:", e?.message || e));
    store = new RedisStore({ client: redisClient, prefix: "op:" });
  } catch (e) {
    console.error("[session-redis] Failed to init RedisStore:", e?.message || e);
  }
} else {
  console.warn("[session-redis] Missing env; using MemoryStore TEMPORARILY for debugging.", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_URL: hasUrl ? "OK" : "MISSING",
  });
}

const sessionMiddleware = session({
  store: store || undefined, // MemoryStore if not provided (not for production)
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  proxy: true, // trust reverse proxy for secure cookies
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: process.env.NODE_ENV === "production" ? "__Secure-op.sid" : "op.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto", // secure on HTTPS (Vercel), not on local HTTP
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
});

module.exports = { sessionMiddleware, redisClient };
