# ONINNA — MVP Build Prompts (Day 1)

Feed each prompt below to your AI tool of choice, one file at a time, in
the order given — later files depend on earlier ones existing with the
exact interface described. Do not skip ahead.

---

## MVP scope (commander's cut)

**In scope today:**
- Browse categories and communities with no account (Explore/Trending)
- Full community info (invite link, etc.) only visible when signed in
- Sign up / log in / log out
- Postgres-backed, served by your existing plain-Node `server.js`

**Explicitly deferred — do not build these today:**
- Public submission form ("Create a Listing")
- Internal admin panel
- Telegram bot CSV/Excel ingestion pipeline
- Verification tiers (ping + human tester)
- Location/language filtering

These stay exactly as documented in `oninna-sourcing-problems.md` — they're
real, they're just not day-1. Building them now risks finishing nothing.
A working browse-and-signin flow you can demo beats five half-built
features.

**New dependencies to install before starting:**
```
npm install bcryptjs jsonwebtoken
```
`bcryptjs` (pure JS, no native compilation — matters for a 1-day deadline
where a broken native build could eat an hour) hashes passwords.
`jsonwebtoken` signs/verifies the auth token. No session store, no
Redis — the JWT lives in an httpOnly cookie, which is the fastest path to
real auth that isn't fake.

**Build order:**
1. `src/db/schema.sql`
2. `src/db/seed.sql`
3. `src/db/pool.js`
4. `src/utils/auth.js`
5. `src/middleware/attachUser.js`
6. `src/middleware/requireAuth.js`
7. `src/routes/categories.js`
8. `src/routes/communities.js`
9. `src/routes/auth.js`
10. `server.js` (rewire the router — last, because it imports everything above)

---

## 1. `src/db/schema.sql`

```
Write src/db/schema.sql for a PostgreSQL 16 database.

Role in the system: defines every table the MVP needs. Run manually via
`docker exec -it oninna-postgres psql -U oninna -d oninna -f /path/to/schema.sql`
or piped in — this file is not executed automatically by any app code.

Tables required, exact names and columns:

1. categories
   - id SERIAL PRIMARY KEY
   - slug TEXT UNIQUE NOT NULL        (e.g. "gaming", "careers" — used in URLs)
   - name TEXT NOT NULL               (e.g. "Gaming Communities")
   - icon TEXT                        (an emoji, matches the homepage cards)

2. communities
   - id SERIAL PRIMARY KEY
   - category_id INTEGER NOT NULL REFERENCES categories(id)
   - name TEXT NOT NULL
   - description TEXT
   - platform TEXT NOT NULL           (e.g. "telegram", "discord", "whatsapp")
   - member_count INTEGER DEFAULT 0
   - invite_link TEXT NOT NULL        (this is the sensitive field — only
                                        ever sent to authenticated users,
                                        enforced in route code, NOT here)
   - image_url TEXT
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()

3. users
   - id SERIAL PRIMARY KEY
   - email TEXT UNIQUE NOT NULL
   - password_hash TEXT NOT NULL      (bcrypt hash, never the raw password)
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Constraints:
- Every foreign key must specify ON DELETE CASCADE for category_id, so
  deleting a category during testing doesn't leave orphaned rows.
- Add an index on communities(category_id) since that's the main filter
  the MVP queries by.

Output: plain .sql, CREATE TABLE statements only, no application code, no
comments longer than one line each.
```

---

## 2. `src/db/seed.sql`

```
Write src/db/seed.sql for the schema defined in src/db/schema.sql.

Role in the system: gives local dev something to look at immediately
after `docker compose up`. Not run automatically — same manual psql
invocation as schema.sql, run after it.

Insert:
- 5 rows into categories, matching these exact slugs so they line up
  with the existing homepage cards: "gaming", "careers", "technology",
  "dating", "education". Use real names/icons matching those on the
  homepage (💼 Careers & Professional Networking, etc.).
- 2-3 communities per category (10-15 rows total), realistic but clearly
  fake data (invite links can be placeholder URLs like
  "https://t.me/example-fake-link" — do not invent working invite links).
  Vary platform values across telegram/discord/whatsapp.

Use INSERT INTO ... VALUES with explicit column names on every statement.
Do not use SERIAL id values manually — let them auto-increment.
```

---

## 3. `src/db/pool.js`

```
Write src/db/pool.js as an ES module (the project's package.json has
"type": "module" — use import/export, not require/module.exports).

Role in the system: the ONE place a `pg` Pool is created. Every route
file imports { pool } from here instead of creating its own connection.
This already exists inline in server.js today — this file is that same
Pool setup, extracted so route files can reuse it without importing
server.js itself (which would create a circular import once server.js
imports the route files).

Exact interface required:
- Must import { Pool } from "pg" and "dotenv/config" at the top (dotenv
  must be loaded here too, since this module may be imported before
  server.js runs its own dotenv.config(), and Node ES module imports are
  hoisted/cached — loading it defensively in both places is intentional,
  not a mistake).
- Construct the pool with these exact env vars and fallbacks, matching
  server.js and docker-compose.yml precisely:
  host: process.env.DB_HOST || "localhost"
  port: process.env.DB_PORT || 5432
  user: process.env.DB_USER || "oninna"
  password: process.env.DB_PASSWORD || "oninna_dev_password"
  database: process.env.DB_NAME || "oninna"
- Export it as: export const pool = new Pool({...})
- No other exports. No query logic lives here — only the connection pool
  itself.
```

---

## 4. `src/utils/auth.js`

```
Write src/utils/auth.js as an ES module.

Role in the system: the only file that touches bcryptjs or jsonwebtoken
directly. Route files call these functions instead of using those
libraries themselves, so the hashing/signing logic exists in exactly one
place.

Import bcryptjs as bcrypt and jsonwebtoken as jwt.

Export exactly these four named functions:

1. export async function hashPassword(plainTextPassword)
   - Uses bcrypt.hash with a salt round count of 10.
   - Returns the resulting hash string.

2. export async function comparePassword(plainTextPassword, hash)
   - Uses bcrypt.compare.
   - Returns a boolean.

3. export function signToken(payload)
   - payload will be an object like { userId: 1, email: "..." }
   - Signs with jwt.sign using process.env.JWT_SECRET (read this at call
     time, not at module load time, so it works even if dotenv loads
     slightly after this module is first imported).
   - Uses { expiresIn: "7d" }.
   - Returns the signed token string.

4. export function verifyToken(token)
   - Uses jwt.verify with process.env.JWT_SECRET.
   - Returns the decoded payload on success.
   - Must NOT swallow errors silently — let jwt.verify throw naturally;
     the caller (middleware) is responsible for the try/catch, not this
     function.

Also add a line near the top noting that JWT_SECRET must be added to
.env and .env.example — do not hardcode a fallback secret string
anywhere in this file, including as a "|| " default. A missing
JWT_SECRET should cause a loud failure, not a silent insecure one.
```

**Before moving on:** add `JWT_SECRET=` (pick any long random string) to
both your `.env` and `.env.example`.

---

## 5. `src/middleware/attachUser.js`

```
Write src/middleware/attachUser.js as an ES module.

Role in the system: runs on EVERY request (wired into server.js's main
router, before the route-specific logic). It's a "soft" check — it never
blocks a request. Its only job is: if a valid auth cookie is present,
attach the decoded user info to the request object so route handlers can
check `req.user` and decide what data to include (e.g. communities.js
uses this to decide whether to include invite_link in a response).

Import { verifyToken } from "../utils/auth.js" (relative path — this file
lives in src/middleware/, auth.js lives in src/utils/).

Export one function:

export function attachUser(req, res) {
  - Read cookies manually from req.headers.cookie (plain Node has no
    built-in cookie parser — do NOT add a cookie-parsing library
    dependency for this; write a small manual parser: split the cookie
    header string on "; ", then split each piece on the first "=" to
    build a plain object of cookie name -> value).
  - Look for a cookie named "token".
  - If present, try verifyToken() on it inside a try/catch.
    - On success: set req.user = the decoded payload.
    - On failure (expired/invalid token): set req.user = null. Do NOT
      throw, do NOT send a response — this function never ends the
      request, it only annotates it.
  - If no "token" cookie exists at all: set req.user = null.
  - This function returns nothing (undefined) — it mutates `req`
    directly and the caller continues to the next step in server.js's
    router manually (there's no next() callback chain like Express uses;
    server.js will call this function then continue its own if/else
    routing afterward).
}
```

---

## 6. `src/middleware/requireAuth.js`

```
Write src/middleware/requireAuth.js as an ES module.

Role in the system: a "hard" gate, used only by routes that must reject
unauthenticated requests outright (contrast with attachUser.js, which
never blocks anything). For the MVP scope, this is used by
src/routes/auth.js's own logic is exempt (you can always hit login/signup
logged out) — this guard exists for future use (e.g. a "join" action)
and should be written now even if the MVP doesn't call it from anywhere
yet, since the folder plan documents it as a needed piece.

Export one function:

export function requireAuth(req, res) {
  - Assumes attachUser() has already run earlier in the same request
    (server.js's router must call attachUser before any route that uses
    this), so req.user is already either an object or null.
  - If req.user is null: write a 401 status with
    { "Content-Type": "application/json" } header, end the response with
    JSON.stringify({ error: "Sign in required" }), and return false.
  - If req.user is set: return true.
  - The caller (a route handler) is expected to do:
      if (!requireAuth(req, res)) return;
    i.e. this function's boolean return value tells the caller whether
    to continue handling the request or stop (since the response was
    already sent inside requireAuth when it returns false).
}
```

---

## 7. `src/routes/categories.js`

```
Write src/routes/categories.js as an ES module.

Role in the system: handles GET /api/categories — powers the category
list on Explore/Trending pages. No auth required, no sensitive fields
involved.

Import { pool } from "../db/pool.js".

Export one async function:

export async function handleGetCategories(req, res) {
  - Run: SELECT id, slug, name, icon FROM categories ORDER BY name ASC
  - On success: write 200 status, Content-Type application/json, and end
    with JSON.stringify(result.rows).
  - On failure (wrap the query in try/catch): log the error with
    console.error, write 500 status, Content-Type application/json, end
    with JSON.stringify({ error: "Failed to load categories" }).
  - Match the exact error-handling shape already used in server.js's
    handleHealthCheck function — same status code and header pattern,
    for consistency across the codebase.
}
```

---

## 8. `src/routes/communities.js`

```
Write src/routes/communities.js as an ES module.

Role in the system: the core browse feature. Handles two GET routes:
list communities (optionally filtered by category) and get one
community's detail. This is the file where the "browse freely, but full
info requires sign-in" rule is actually enforced — the requirement lives
HERE, not in requireAuth.js, because unauthenticated users must still get
a 200 response with partial data, not a 401.

Import { pool } from "../db/pool.js".

Export two async functions:

1. export async function handleListCommunities(req, res, query)
   - `query` is a URLSearchParams object already parsed by server.js
     from the request URL (server.js's router is responsible for
     extracting this — document that assumption in a comment).
   - If query has a "category" param, filter:
       SELECT communities.id, communities.name, communities.description,
              communities.platform, communities.member_count,
              communities.image_url, categories.slug AS category_slug
       FROM communities
       JOIN categories ON categories.id = communities.category_id
       WHERE categories.slug = $1
       ORDER BY communities.member_count DESC
     using a parameterized query with the category slug as $1 — never
     string-concatenate user input into SQL.
   - If no "category" param, run the same SELECT without the WHERE
     clause, no parameters.
   - Deliberately do NOT include invite_link in this query at all — not
     even conditionally. The list view never needs it.
   - Same success/error response shape as categories.js.

2. export async function handleGetCommunityDetail(req, res, communityId)
   - `communityId` is already extracted and parsed as an integer by
     server.js's router (document this assumption).
   - Query:
       SELECT id, name, description, platform, member_count, image_url,
              invite_link, category_id
       FROM communities WHERE id = $1
     parameterized, id as $1.
   - If no row found: 404 status, JSON { error: "Community not found" }.
   - If a row is found:
       - If req.user is truthy (attachUser.js already ran and set this):
         return the full row including invite_link, 200 status.
       - If req.user is null: return the same row but with invite_link
         deleted from the object before sending (delete row.invite_link)
         and add a field locked: true so the frontend can show a
         "sign in to view" prompt instead of just silently missing data.
   - Same try/catch error shape as the other functions.
}
```

---

## 9. `src/routes/auth.js`

```
Write src/routes/auth.js as an ES module.

Role in the system: handles POST /api/auth/signup, POST /api/auth/login,
POST /api/auth/logout. This is the only file that sets or clears the
"token" cookie.

Import { pool } from "../db/pool.js".
Import { hashPassword, comparePassword, signToken } from
"../utils/auth.js".

All three functions receive (req, res, body) where `body` is an
already-parsed JSON object — server.js's router is responsible for
reading the request stream and JSON.parse-ing it before calling these
(document this assumption in a comment at the top of the file, since
plain Node's http module does NOT parse request bodies automatically).

Export three async functions:

1. export async function handleSignup(req, res, body)
   - Expects body.email and body.password (strings).
   - If either is missing/empty: 400 status, JSON
     { error: "Email and password are required" }.
   - Check for an existing user with that email first
     (SELECT id FROM users WHERE email = $1). If found: 409 status,
     JSON { error: "An account with that email already exists" }.
   - Otherwise: hash the password with hashPassword(), then
     INSERT INTO users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email
   - Sign a token via signToken({ userId: row.id, email: row.email }).
   - Set the cookie: res.setHeader("Set-Cookie",
     `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`)
     — 604800 seconds = 7 days, matching the JWT's own expiresIn.
   - Respond 201 status, JSON { id: row.id, email: row.email } — never
     send the token or password_hash back in the response body itself,
     only via the cookie.

2. export async function handleLogin(req, res, body)
   - Expects body.email and body.password.
   - SELECT id, email, password_hash FROM users WHERE email = $1
   - If no row: 401 status, JSON { error: "Invalid email or password" }
     — deliberately the same generic message whether the email doesn't
     exist or the password is wrong, so responses don't reveal which
     emails are registered.
   - If row exists: comparePassword(body.password, row.password_hash).
     If false: same 401 + generic message as above.
   - If true: same signToken + Set-Cookie + response shape as signup,
     but 200 status instead of 201.

3. export async function handleLogout(req, res)
   - No body needed.
   - Clear the cookie: res.setHeader("Set-Cookie",
     "token=; HttpOnly; Path=/; Max-Age=0")
   - Respond 200 status, JSON { success: true }.

Wrap all database/bcrypt/jwt calls in try/catch; on unexpected error,
500 status, JSON { error: "Something went wrong" } — do not leak the raw
error message to the client in these three functions specifically, since
they handle credentials (contrast with categories.js/communities.js
where logging detail is less sensitive).
```

---

## 10. `server.js` (rewire, don't rewrite from scratch)

```
Modify the existing server.js. Do not change serveStaticFile, MIME_TYPES,
or the Pool setup's env var fallbacks — those stay exactly as they are
conceptually, though the Pool creation itself should now be DELETED from
server.js and replaced with an import, since it lives in src/db/pool.js
now.

Add these imports at the top, alongside the existing ones:
  import { pool } from "./src/db/pool.js";   // replaces the inline Pool
  import { attachUser } from "./src/middleware/attachUser.js";
  import { handleGetCategories } from "./src/routes/categories.js";
  import { handleListCommunities, handleGetCommunityDetail } from "./src/routes/communities.js";
  import { handleSignup, handleLogin, handleLogout } from "./src/routes/auth.js";

Remove the old inline `const pool = new Pool({...})` block entirely —
pool.js now owns that.

Add a small helper function above the router, since plain Node doesn't
parse JSON bodies automatically:

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => { data += chunk; });
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }

Rewrite the main http.createServer callback to become an async function
(it currently isn't — it needs to be, since route handlers use await),
and restructure the routing as follows, checked in this order:

1. Call attachUser(req, res) first, unconditionally, before any route
   check — every request gets req.user set (possibly null) before
   anything else happens.

2. Parse the URL and query string once at the top using:
     const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
     const pathname = parsedUrl.pathname;
     const query = parsedUrl.searchParams;
   Use `pathname` for all route matching below instead of raw req.url.

3. GET /api/health -> existing handleHealthCheck (unchanged).

4. GET /api/categories -> handleGetCategories(req, res).

5. GET /api/communities -> handleListCommunities(req, res, query).

6. A dynamic route: GET /api/communities/:id — match this with:
     const communityMatch = pathname.match(/^\/api\/communities\/(\d+)$/);
   If it matches, call:
     handleGetCommunityDetail(req, res, parseInt(communityMatch[1], 10))

7. POST /api/auth/signup, POST /api/auth/login -> these need the request
   body. Before calling the handler, `await readJsonBody(req)` inside a
   try/catch; on JSON parse failure, respond 400 with
   { error: "Invalid JSON body" } and return before calling the handler.
   Then call handleSignup(req, res, body) or handleLogin(req, res, body)
   depending on pathname.

8. POST /api/auth/logout -> handleLogout(req, res) (no body needed).

9. Anything else falls through to the existing serveStaticFile(req, res)
   call, exactly as today.

Keep the final server.listen(...) block and its console.log lines
completely unchanged.
```

---

## After all 10 files exist

Run the schema and seed SQL against the running container, then
`npm run dev`, then check in order:
1. `GET /api/categories` — should return your 5 seeded categories
2. `GET /api/communities` — should return all seeded communities
3. `GET /api/communities?category=gaming` — should return only that category
4. `GET /api/communities/1` — should return the community WITHOUT invite_link, with `locked: true`
5. `POST /api/auth/signup` with a JSON body `{ "email": "...", "password": "..." }` — should return 201 and set a cookie
6. `GET /api/communities/1` again, this time sending the cookie you got back — should now include `invite_link`, no `locked` field

If step 6 doesn't show the invite link, the bug is almost certainly in
`attachUser.js`'s cookie parsing or `communities.js`'s `req.user` check —
that handoff is the one piece of this whole build with no existing
reference to copy from.
