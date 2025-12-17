
# Vercel + Upstash Redis Patch (EmptyCanvas/)

**What changed**
- Added Serverless entry: `api/index.js`
- Extracted server app: `server/app.js` (no `app.listen`, fixed static paths)
- Redis session store: `server/session-redis.js`
- Local dev runner: `server/local.js`
- Vercel rewrites: `vercel.json`
- Updated `package.json` to include `redis` & `connect-redis` and local scripts

**Environment variables (Vercel Project → Settings → Environment Variables)**
- `Notion_API_Key`
- `Products_Database`
- `Products_list`
- `Team_Members`
- `School_Stocktaking_DB_ID`
- `Funds`
- `SESSION_SECRET` (32+ chars random)
- `UPSTASH_REDIS_URL` (from Upstash dashboard, e.g. `rediss://:PASSWORD@HOST:PORT`)

**Deploy**
1. Push these files into your repo under `EmptyCanvas/` (keep your `public/` as-is).
2. On Vercel → New Project → Import your repo → Root Directory = `EmptyCanvas/`.
3. Add the env vars above and Deploy.
4. Local dev: `npm install` then `npm run dev` inside `EmptyCanvas/`.
