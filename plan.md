# ONINNA MVP implementation log

## 2026-09-11 02:33:03 +01:00 — Task 1 complete: database schema

- Added `src/db/schema.sql` with the required PostgreSQL tables, cascade deletion for category-owned communities, and the category query index.
- Deferred database initialization until all Day 1 files exist, as directed by the build order.

### Next step

2026-09-11 02:33:03 +01:00 — Create development seed data.

## 2026-09-11 20:55:46 +01:00 — Task 2 complete: development seed data

- Added `src/db/seed.sql` with five homepage-aligned categories and 15 clearly fake community listings.
- Used explicit-column insert statements, generated serial IDs, category lookup by slug, and Telegram, Discord, and WhatsApp placeholders.

### Next step

2026-09-11 20:55:46 +01:00 — Create the shared PostgreSQL pool.

## 2026-09-19 20:27:31 +01:00 — Task 3 complete: shared database pool

- Added `src/db/pool.js`; it loads dotenv configuration, exports only `pool`, and retains all specified PostgreSQL environment fallbacks.
- Deferred the `server.js` import replacement to the prompt's Task 10.

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

- Added `src/middleware/requireAuth.js`; it returns `false` and sends the exact JSON 401 response for `req.user === null`, otherwise returns `true`.
- Kept it unwired pending the later routes that need a hard sign-in requirement.
- Verified allowed and rejected request paths.

### Next step

2026-09-19 21:08:46 +01:00 — Create the public categories route.

## 2026-09-19 21:53:59 +01:00 — Mobile presentation repair complete

- Diagnosed the reported mobile visual issue without changing desktop, tablet, JavaScript, HTML structure, or API work.
- Confirmed the document contains a valid mobile viewport declaration and that the source file is valid UTF-8; terminal mojibake was not a browser encoding defect.
- Added one isolated `@media (max-width: 639px)` block to `public/styles/style.css`. The pre-existing `min-width` rules in `style.css` and `style_large.css` therefore continue to control tablet and desktop layouts unchanged.
- Refined the sticky phone navigation with compact padding, a visible bordered hamburger control, and a properly surfaced menu panel with border, radius, spacing, and shadow.
- Refined phone-only hero and body spacing to reduce crowding without changing typography or content on larger displays.
- Restyled phone-sized community cards with tighter spacing, a slightly shorter but still image-led layout, violet-accented borders, image contrast, and a subtle elevation shadow consistent with the existing neon/glass visual identity.
- Contained and surfaced the search-information panel with side margins, a matching accent border, and shadow so it no longer reads as an unstyled full-width text block on phones.
- Made mobile calls to action use the available width while retaining their current desktop/tablet behavior.
- No unnecessary assets, dependencies, markup, JavaScript, or desktop CSS rules were changed.

### Next step

2026-09-19 21:53:59 +01:00 — Manually review the homepage at 320px, 375px, and 639px viewport widths. If approved, resume the planned MVP build with Task 7: create `src/routes/categories.js`.
