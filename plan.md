# ONINNA MVP implementation log

## 2026-09-11 02:33:03 +01:00 — Task 1 complete: database schema

- Added `src/db/schema.sql` with the required PostgreSQL tables, cascading category cleanup, and the category query index.
- Kept schema execution deferred until the ordered Day 1 implementation is complete.

### Next step

2026-09-11 02:33:03 +01:00 — Create local development seed data.

## 2026-09-11 20:55:46 +01:00 — Task 2 complete: development seed data

- Added `src/db/seed.sql` with five homepage-aligned categories and 15 clearly fake community listings.
- Used explicit-column inserts, generated serial IDs, category lookup by slug, and Telegram, Discord, and WhatsApp placeholder links.

### Next step

2026-09-11 20:55:46 +01:00 — Create the shared PostgreSQL pool.

## 2026-09-19 20:27:31 +01:00 — Task 3 complete: shared database pool

- Added `src/db/pool.js`, loaded dotenv configuration, exported only `pool`, and retained all prescribed database environment fallbacks.
- Deferred the `server.js` import replacement to Task 10, as required by the build order.

### Next step

2026-09-19 20:27:31 +01:00 — Add centralized password and JWT helpers.

## 2026-09-19 20:47:33 +01:00 — Task 4 complete: authentication helpers

- Installed `bcryptjs` and `jsonwebtoken`; npm reported zero audit vulnerabilities.
- Added bcrypt password hashing/comparison and seven-day JWT signing/verification in `src/utils/auth.js`.
- Added an ignored local `.env`, a safe `.env.example`, and `.gitignore` protection for the local JWT secret.
- Password and JWT smoke tests passed.

### Next step

2026-09-19 20:47:33 +01:00 — Add soft request authentication.

## 2026-09-19 20:51:39 +01:00 — Task 5 complete: soft user attachment middleware

- Added `src/middleware/attachUser.js` to manually parse cookies and set `req.user` from a valid token, or to `null` otherwise, without blocking a request.
- Verified no-token, valid-token, and invalid-token paths.

### Next step

2026-09-19 20:51:39 +01:00 — Add the hard authentication gate.

## 2026-09-19 21:08:46 +01:00 — Task 6 complete: hard authentication gate

- Added `src/middleware/requireAuth.js`; it sends the exact JSON 401 response for `req.user === null`, otherwise returns `true`.
- Kept it unwired pending routes that actually need a hard sign-in requirement.
- Verified both allowed and rejected request paths.

### Next step

2026-09-19 21:08:46 +01:00 — Create the public categories route.

## 2026-09-19 21:53:59 +01:00 — Mobile presentation repair complete

- Diagnosed the reported mobile styling issue without altering desktop/tablet rules, JavaScript, assets, markup, or API work.
- Confirmed the source has a valid mobile viewport declaration and valid UTF-8; terminal character corruption was not a browser encoding defect.
- Added one isolated `@media (max-width: 639px)` block to `public/styles/style.css`; existing `min-width` tablet and desktop breakpoints remain intact.
- Refined phone-only navigation, menu panel, hero/body spacing, image-led cards, information panel, and call-to-action widths using the existing neon/glass visual language.
- Verified balanced CSS braces and separation between the new phone query and existing larger-screen breakpoints.

### Next step

2026-09-19 21:53:59 +01:00 — Review the deployed page at common phone widths, then resume the planned API build.

## 2026-09-19 22:48:06 +01:00 — GitHub Pages entry-point correction complete

- Reviewed the supplied mobile screenshot. It shows a `vscode-online` heading followed by the repository README content, proving GitHub Pages was rendering its README fallback instead of the ONINNA frontend.
- Confirmed the ONINNA application entry point, its stylesheets, scripts, and images are located under `public/`, while the GitHub Pages publishing root had no root-level `index.html` and no Pages workflow to redirect or build that path.
- Added a minimal root `index.html` solely for static GitHub Pages hosting.
- The root page immediately redirects to `./public/`, where the existing ONINNA `index.html` already resolves its relative `styles/`, `scripts/`, and `images/` assets correctly.
- Included a JavaScript redirect, a zero-delay HTML fallback redirect, and a visible link for clients with scripts/refresh disabled.
- Did not duplicate the frontend, move assets, alter the Node server, change the mobile CSS again, or modify existing desktop/tablet behavior.

### Next step

2026-09-19 22:48:06 +01:00 - Commit and publish this root `index.html` alongside the current changes, then reload the GitHub Pages URL. It should redirect to `./public/` and show the image-based ONINNA homepage instead of README text. After deployment verification, resume Task 7: create `src/routes/categories.js`.

## 2026-10-22 22:45:05 +01:00 - Task 10 Phase 1 complete: shared HTTP plumbing and routing

- Replaced the inline PostgreSQL pool usage with the shared pool through the extracted health route, added JSON response and request-body helpers, and centralized cookie parsing for request authentication.
- Added a small API router with parameter support, soft user attachment on every request, health route registration, and JSON 404 responses for unknown API paths.
- Hardened static file serving against malformed URI encoding, traversal attempts, and dotfiles. Added request-level and process-level error logging so unexpected errors return a generic JSON 500 when possible.
- Verified live requests: health returned 200 with database time, an unknown API path returned JSON 404, encoded traversal returned 404, the homepage returned 200 HTML, and a dotfile returned 403.

### Next step

2026-10-22 22:45:05 +01:00 - Await approval to start Task 7 Phase 2: public categories route.

## 2026-10-23 00:01:25 +01:00 - Task 10 Phase 1 review fixes complete

- Returned a JSON 400 for malformed percent-encoding in API paths, restricted static handling to GET and HEAD, returned 404 for directories, and omitted bodies for HEAD responses.
- Limited health failure responses to `{ status: "error" }`, made production uncaught exceptions exit with code 1, and bound the server to `HOST` or `127.0.0.1` by default.
- Restored the 2026-09-19 GitHub Pages log entry's own next step and removed its orphaned duplicate.
- Verified malformed API paths, static POST and directory responses, HEAD behavior, and a forced health connection failure with live requests. Verified the production uncaught-exception exit behavior with a short Node process.

### Next step

2026-10-23 00:01:25 +01:00 - Add the public categories route.

## 2026-10-23 00:01:25 +01:00 - Task 7 Phase 2 complete: public categories route

- Added `GET /api/categories` using a LEFT JOIN and aggregate count, ordered by category ID so categories without communities remain visible.
- Verified the live endpoint returned the five seeded categories, each with the required public fields and a community count.

### Next step

2026-10-23 00:01:25 +01:00 - Await approval to start Phase 3: public community browsing and gated joining.

## 2026-10-23 00:38:54 +01:00 - Phase 3 complete: public community browsing and gated joining

- Added public list and detail routes with explicit public columns, validated query parameters, escaped parameterized ILIKE search, stable sort tie-breakers, and matching parameterized count queries.
- Added the authenticated join-link route using the existing hard authentication gate. Its successful response has `Cache-Control: no-store`; public routes never select or return invite links.
- Added a built-in Node regression test that fetches public list and detail responses and asserts every seeded invite URL and the `invite_link` field are absent.
- Verified list filters, invalid parameters, valid and missing details, unauthenticated and authenticated joins, and the regression test against the local database.

### Next step

2026-10-23 00:38:54 +01:00 - Await approval to start Phase 4: authentication routes.

## 2026-10-23 01:07:21 +01:00 - Phase 4 complete: authentication routes

- Added registration, login, logout, and current-user routes with normalized email validation, byte-accurate password limits, parameterized database access, secure JWT verification, and safe cookie settings.
- Added JSON-only POST and same-origin protection, bounded request-body handling, generic credential failures with a startup dummy bcrypt comparison, and in-memory IP and email rate limits with unref eviction timers.
- Added integration coverage for registration, duplicate and invalid input handling, login, session cookies, logout, join access, rate limiting, and password-hash omission. Test users are removed after each run.
- The in-memory rate limits reset when the server restarts and require a shared store before running multiple application servers.
- Verified the complete test suite and a manual cookie-session flow. No frontend wiring was added.

### Next step

2026-10-23 01:07:21 +01:00 - Await approval to start Phase 5: frontend data wiring.
