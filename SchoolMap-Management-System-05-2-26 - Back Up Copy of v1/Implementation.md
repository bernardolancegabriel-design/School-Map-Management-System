# SchoolMap Cleanup and Implementation Roadmap

## Scope

This roadmap is the planning pass for cleaning and stabilizing the School Map Management System. It covers the active public map, admin dashboard, super-admin dashboard, shared frontend helpers, backend API, CSS, HTML structure, and database-related behavior.

The main goal is to make the database the clear source of truth, remove duplicate and legacy code, simplify the project structure, and make the system easier to maintain without breaking the current map, pins, legends, floors, routes, admin tools, and login flows.

## Current State

The project is currently a mixed system. Some features now use the MySQL database through `backend/api.php`, while other parts still keep localStorage-style helpers, legacy backup logic, and older code paths. The UI has been updated many times, so there are duplicate functions, overlapping modal systems, repeated API helpers, and CSS blocks that serve similar purposes.

The active files that need the most attention are:

- `backend/api.php`
- `assets/js/core.js`
- `assets/js/map.js`
- `assets/js/admin-dashboard.js`
- `assets/js/super-admin-dashboard.js`
- `assets/js/login.js`
- `assets/js/app.js`
- `assets/css/style.css`
- `assets/css/admin.css`
- `html/map.html`
- `html/admin-dashboard.html`
- `html/super-admin-dashboard.html`
- `html/login.html`

## Critical Issues

1. `assets/js/map.js` contains duplicated global functions, including repeated logout and guest flow functions. Because JavaScript uses the latest function definition with the same name, earlier functions can silently stop being used.

2. `html/admin-dashboard.html` contains an inline admin verification script with nested duplicate functions and unreachable code. This makes the admin loading and verification flow fragile and difficult to debug.

3. `assets/js/admin-dashboard.js` still has localStorage-oriented data structures while also saving data to the database. This creates a dual-source-of-truth problem where the UI may believe data is unsaved even after the database has already changed.

4. The admin dashboard save model is inconsistent. Some changes are sent to the database immediately, while the UI still shows a `Save All` workflow. This can confuse the admin and can cause wrong assumptions about whether changes are already saved.

5. `html/map.html` appears to contain duplicate toast elements. Duplicate IDs can cause JavaScript to update the wrong element or only the first matching element.

6. `backend/api.php` performs schema changes at runtime through helper functions that add columns or modify tables. The API should not need schema-altering permissions during normal use.

7. `assets/js/app.js` appears to be a legacy all-in-one script with many old localStorage-era flows that overlap with the current `map.js`, `login.js`, and admin dashboard code. Even if it is not loaded by current pages, keeping it active in the repo can confuse future maintenance.

## Risks and Conflicts

1. The project currently has a dirty working tree with many recent edits. Cleanup should be done in small steps so useful working behavior is not accidentally removed.

2. The frontend has multiple API helpers: `apiGet`, `apiRequest`, `apiLogin`, and shared helpers in `core.js`. These helpers do similar work but handle URLs, errors, and sessions differently.

3. Many functions are global because the HTML uses inline handlers such as `onclick` and `onsubmit`. This increases the chance of naming conflicts between files.

4. Some data comparisons use numbers while others use strings. IDs from HTML attributes, JSON, and database responses can mismatch unless normalized consistently.

5. Cache-busting query strings are updated manually. This can make browser caching problems hard to diagnose.

6. Super-admin backup, restore, archive, and settings features still appear to rely heavily on localStorage-style behavior instead of the database.

7. Route, pin, legend, and floor data are tightly connected, but their save and delete flows are scattered across different functions. This increases the chance of orphaned data or stale UI.

## Security Problems

1. `backend/api.php` currently keeps database credentials directly in the file. The app should use environment-based configuration or a separate protected config file.

2. The database connection uses a highly privileged account style. The app should use a dedicated database user with only the permissions needed for normal CRUD operations.

3. The API sends broad CORS headers. `Access-Control-Allow-Origin: *` should not be combined with credential-based sessions.

4. Session cookie settings should be hardened. The app should explicitly set secure session flags such as `HttpOnly`, `SameSite`, and `Secure` when HTTPS is available.

5. Admin POST, PUT, and DELETE actions do not appear to use CSRF protection. Because the app uses sessions, state-changing requests should include a CSRF token.

6. Some API errors expose raw database exception messages. Production responses should return safe messages while logging details server-side.

7. Base64 image upload handling needs stricter validation. It should enforce size limits, validate MIME type using server-side inspection, and reject unsupported files before writing to disk.

8. Files such as `cookie.txt` and `backend/cookie_test.txt` contain session-like data and should not be kept in the project or committed.

9. The frontend uses `innerHTML` in many places. Some values are escaped, but the project should consistently use safe rendering helpers or DOM creation for user-controlled content.

## Structural Problems

1. `assets/js/admin-dashboard.js` is too large and handles too many responsibilities: API calls, state management, map rendering, form editing, route drawing, drag behavior, modals, unsaved-change tracking, and UI rendering.

2. `assets/js/map.js` mixes public map rendering, route display, search, guest entry, user dropdown, admin routing, zoom controls, toast behavior, and logout handling.

3. `backend/api.php` is a monolithic backend file. It contains configuration, session setup, routing, schema updates, database helpers, authentication logic, and every API resource handler.

4. `core.js` still contains localStorage-style storage helpers even though it now behaves mostly like a shared session and utility file.

5. CSS is split between `style.css` and `admin.css`, but responsibilities overlap. There are also many inline styles inside HTML and generated JavaScript.

6. The HTML files rely on inline JavaScript handlers. This makes behavior harder to search, test, and refactor.

7. Modal, toast, confirmation, and logout UI patterns are duplicated across pages instead of using one shared system.

## Architecture Problems

1. There is no single frontend data service. Each page talks to the API in its own way, so error handling and session behavior are inconsistent.

2. The database is not yet treated as the only source of truth. Some parts of the app still behave as if localStorage is an active persistence layer.

3. Backend schema migration is mixed into request handling. Database changes should be handled by SQL migration scripts, not by API requests.

4. Stored procedures and direct SQL fallback behavior are mixed together. The backend should choose one consistent approach for each resource.

5. The super-admin dashboard is not fully aligned with the database-backed system. Several important actions appear to happen only in local frontend storage.

6. There is no clear testing structure for API endpoints, browser flows, or regression checks.

7. There is no clear module boundary for floors, legends, pins, routes, users, visitor logs, and admin logs.

## Missing Features or Functional Gaps

1. A central confirmation modal system is needed for logout, back navigation, route reset, delete actions, and unsaved-change warnings.

2. Unsaved-change tracking needs to match the real save behavior. If a change is saved immediately to the database, the UI should not imply it still needs saving.

3. The admin route editor and public map route preview should share the same route rendering rules so route lines appear in the same place.

4. Public map pins, admin dashboard pins, and route points should share the same coordinate system and map-stage sizing rules.

5. Backup and restore should become database-backed features instead of localStorage-only exports.

6. Admin logs should be connected to real database actions and should show meaningful activity history.

7. Modals need consistent accessibility behavior, including keyboard close behavior, focus handling, and clear button states.

8. Upload features need better validation messages and limits.

9. Environment configuration is needed for database credentials, API base paths, and deployment paths.

10. The project needs a repeatable setup checklist for database imports, required columns, uploads folder permissions, and local XAMPP URL usage.

## Cleanup Plan

### Phase 1: Stabilize the Current Behavior

Before deleting or simplifying code, verify the current working flows. The login page, public map, admin dashboard, super-admin dashboard, pins, legends, floors, routes, logout confirmation, back confirmation, and database API should be checked with a small manual test list.

The purpose of this phase is to avoid cleaning blindly. Once the current behavior is documented, every cleanup step can be checked against the same baseline.

### Phase 2: Remove Dead and Duplicate Code

Remove duplicate functions in `map.js`, especially repeated logout and guest flow functions. Remove unreachable duplicate admin verification code from `admin-dashboard.html`. Remove duplicate DOM elements such as repeated toast containers. Identify whether `assets/js/app.js` is still loaded anywhere; if not, mark it as legacy or remove it from the active system after confirmation.

This phase should focus only on duplicate and unreachable code so the risk stays low.

### Phase 3: Centralize Shared Frontend Helpers

Create one shared API client in `core.js` or a new dedicated file. It should handle API base URL detection, JSON parsing, error messages, session expiration, and request methods. Then update `map.js`, `admin-dashboard.js`, `super-admin-dashboard.js`, and `login.js` to use the same helper.

Create one shared modal and toast helper so each page does not need its own confirmation and notification logic.

### Phase 4: Make the Database the Source of Truth

Remove localStorage as a persistence layer for floors, pins, legends, routes, users, logs, and settings. If temporary UI state is needed, keep it clearly separate from stored system data.

The admin dashboard should have one clear save model. Either edits save immediately, or they stay pending until `Save All`. The UI should not mix both meanings.

### Phase 5: Split Large Frontend Files

Break `admin-dashboard.js` into smaller modules or clear sections. Good boundaries would be API/data loading, admin state, panel rendering, map-stage rendering, pin editor, legend editor, floor editor, route editor, confirmation modals, and navigation guards.

Break `map.js` into smaller modules or clear sections. Good boundaries would be map data loading, pin rendering, legend filtering, route preview, zoom controls, guest entry, user menu, and page initialization.

### Phase 6: Refactor the Backend API

Move database configuration out of `api.php`. Remove runtime schema changes and replace them with SQL migration instructions. Split handlers by resource when possible: auth, floors, legends, pins, routes, users, visitor logs, and admin logs.

Standardize response formats so every success and error response has the same shape.

### Phase 7: Security Hardening

Add proper session cookie settings, remove broad CORS behavior, add CSRF protection for state-changing requests, validate uploads more strictly, avoid raw database error output, and use a dedicated database user.

Remove local session test artifacts from the project.

### Phase 8: CSS Cleanup

Separate public map styles from admin dashboard styles. Remove duplicate CSS rules and move inline styles from HTML and JavaScript into CSS classes. Keep component styles predictable for buttons, modals, toasts, map stage, pins, legends, and route overlays.

### Phase 9: Add Comments After the Structure Is Clean

Comments should be added after duplicate code is removed and the structure is clearer. The comments should explain what a block is responsible for and why it exists. They should be written as short paragraph-style explanations before important blocks, not as line-by-line descriptions.

### Phase 10: Add Testing and Maintenance Checks

Add a small API smoke test list for login, current user, floors, legends, pins, routes, and logout. Add a browser checklist for the public map, admin dashboard, and super-admin dashboard. Add PHP syntax checking and JavaScript linting if the environment supports it.

## Per-File Action List

### `backend/api.php`

Move configuration out of the file, remove runtime schema migration helpers, standardize API responses, protect state-changing routes with CSRF, harden session cookies, improve upload validation, and avoid exposing raw database errors.

### `assets/js/core.js`

Turn this into the real shared frontend foundation. Keep session helpers, API helpers, escaping helpers, modal helpers, toast helpers, and page navigation helpers here. Remove storage helpers that pretend to persist data but no longer do.

### `assets/js/map.js`

Remove duplicate global functions, consolidate logout and guest flow logic, keep public map rendering separate from user/session UI, remove remaining localStorage assumptions, and make route preview rendering match the admin dashboard coordinate system.

### `assets/js/admin-dashboard.js`

Separate API/data logic from UI rendering. Fix the save model so it matches the database behavior. Remove misleading localStorage comments and storage persistence. Consolidate pin, legend, floor, and route save/delete behavior.

### `assets/js/super-admin-dashboard.js`

Move admin management fully to the database. Replace localStorage backup, restore, archive, and settings behavior with real backend endpoints or clearly mark them as local-only until backend support exists.

### `assets/js/login.js`

Use the shared API helper. Remove hard-coded fallback behavior where possible. Recheck the email retry behavior because it currently assumes a default domain that may not match the school email domain.

### `assets/js/app.js`

Confirm whether this file is still loaded by any active page. If it is unused, archive or remove it from the active project to avoid confusion. If parts are still useful, move only those parts into the correct active files.

### HTML Files

Remove inline event handlers and move behavior into JavaScript initialization blocks. Remove duplicate IDs, inline styles, and page-specific modal code that can use shared modal helpers.

### CSS Files

Audit `style.css` and `admin.css` for duplicate button, modal, toast, map-stage, pin, and panel styles. Move repeated patterns into reusable classes and keep page-specific styles in the correct file.

### Database and Documentation

Create SQL migration notes for all required columns, including route names, pin image fields, admin disabled status, visitor log timeout fields, and coordinate fields. Keep setup documentation aligned with the actual database and API behavior.

## Recommended Cleanup Order

1. Fix duplicate IDs and duplicate JavaScript functions.
2. Remove unreachable inline admin verification code.
3. Decide the final save model for the admin dashboard.
4. Centralize the API helper.
5. Make database data the only persistent source for active system data.
6. Move repeated modal, toast, and confirmation behavior into shared helpers.
7. Split large frontend files into smaller responsibility areas.
8. Move backend configuration and schema changes out of request handling.
9. Clean CSS and remove inline styles.
10. Add paragraph-style comments to the cleaned code.

## Commenting Rule

Comments should explain the purpose of a block and the reason for the structure. They should not repeat what the code already says. For example, a good comment explains that a route-rendering block converts saved percentage coordinates into SVG points that match the map image. A bad comment says that a variable is being assigned to another variable.

## Next Step

The safest first cleanup step is to remove duplicate functions and duplicate DOM IDs without changing behavior. After that, the admin save model should be clarified because it affects pins, legends, floors, routes, back navigation, and database consistency.
