# Comprehensive Security Audit Report: Enterprise Invoice Manager (v2.0.0)

**Audit Run ID:** `audit-v2-20261114-01`  
**Profile:** Standard  
**Execution Policy:** Sandboxed Source-and-Local Only  
**Target Repository:** `c:\Users\kathu\OneDrive\Desktop\new invoice`  
**Target Version:** `2.0.0`  
**Date:** November 14, 2026  

---

## 1. Executive Summary & Security Posture

Enterprise Invoice Manager v2.0.0 is an offline-first commercial desktop ERP and invoicing application built with Electron, Node.js/Express, Knex ORM, SQLite/PostgreSQL, and React. 

The software exhibits strong baseline architecture in core business operations:
- Electron process isolation is properly configured (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Financial operations strictly employ `decimal.js` with `ROUND_HALF_UP` rounding to eliminate floating-point calculation errors.
- Multi-company data queries consistently enforce `company_id` isolation.
- Finalized documents are immutable, requiring formal audited cancellations.
- PDF generation uses pure-JavaScript `pdf-lib` without headless browser rendering engines, preventing classic SSRF and headless browser attack vectors.

However, the audit identified **5 concrete vulnerabilities** violating application trust boundaries:
- **3 High Severity** findings: Arbitrary Local File Read via Letterhead template path traversal, Arbitrary Database File Overwrite via Backup Restore path traversal, and Permissive Wildcard CORS with unauthenticated default 0.0.0.0 host binding.
- **2 Medium/Low Severity** findings: CSV/Excel Formula Injection (CWE-1236) in master data exports, and missing Electron window open and navigation event guards.

---

## 2. Confirmed Vulnerabilities Summary Table

| Severity | Finding ID | Title | Affected Boundary | Demonstrated Result |
| :--- | :--- | :--- | :--- | :--- |
| **HIGH** | `vuln-path-traversal-letterhead-file-read` | Arbitrary File Read via Unvalidated Letterhead Template Path | API <-> Host Filesystem | Download of arbitrary host files via `/api/companies/:companyId/letterheads/:templateId/file` |
| **HIGH** | `vuln-path-traversal-backup-restore-overwrite` | Path Traversal and Database Overwrite via Backup Restore | API <-> Storage Lifecycle | Replacement of production `invoice_manager.sqlite3` with arbitrary file content |
| **HIGH** | `vuln-cors-wildcard-and-unrestricted-binding` | Permissive CORS Wildcard (`*`) & Default `0.0.0.0` Binding | Network <-> Local API | External websites in user's browser or LAN devices can read/mutate business data |
| **MEDIUM** | `vuln-csv-excel-formula-injection-export` | CSV / Excel Formula Injection (CWE-1236) in Data Export | Data Export <-> Spreadsheet Client | Cells starting with `=, +, -, @` execute dynamic formulas when opened in Excel |
| **LOW** | `vuln-electron-unrestricted-window-open-and-navigation` | Missing Window Open and Navigation Event Guardrails | Webview <-> Electron Shell | In-app external link clicks or `window.open` trigger unmanaged window creation |

---

## 3. Detailed Vulnerability Analyses & Source Locations

### Finding 1: Arbitrary File Read via Unvalidated Letterhead Template Path (`vuln-path-traversal-letterhead-file-read`)
- **Severity:** High (Likelihood: Medium, Impact: High)
- **Source Locations:**
  - `src/server/routes.ts`: Lines 962–970 (POST) & Lines 1056–1066 (GET `:templateId/file`)
  - `src/server/services/letterheadService.ts`: Lines 90–130 (`createTemplate`), Lines 240–263 (`getTemplateFile`), Lines 814–824 (`analyzeLetterhead`)
- **Vulnerability Mechanics:**
  When a letterhead template is registered via `POST /api/companies/:companyId/letterheads`, the API accepts an arbitrary `file_path` string in the request body without verifying that it points to a file within the company's designated upload directory (`getLetterheadUploadDir(companyId)`). When `GET /api/companies/:companyId/letterheads/:templateId/file` is called, `getTemplateFile` resolves the path and calls `res.sendFile(fileInfo.filePath)`, transmitting arbitrary local files (e.g. system files, user documents, configuration files) to the caller.
- **Smallest Effective Source Fix:**
  In `letterheadService.ts`, verify that `path.resolve(tpl.file_path).startsWith(path.resolve(this.getLetterheadUploadDir(companyId)) + path.sep)`. Throw an authorization error if the file lies outside the upload directory.

---

### Finding 2: Path Traversal and Database Overwrite via Backup Restore (`vuln-path-traversal-backup-restore-overwrite`)
- **Severity:** High (Likelihood: Medium, Impact: High)
- **Source Locations:**
  - `src/server/routes.ts`: Lines 1123–1130
  - `src/server/services/backupRestoreService.ts`: Lines 90–104 (`restoreFromBackup`)
- **Vulnerability Mechanics:**
  `POST /api/backups/restore` accepts a `filename` in the JSON request body. `restoreFromBackup` executes `path.join(backupDir, backupFilename)` without stripping directory traversal sequences (`../`). The resolved path is then copied directly over the active database file (`fs.copyFileSync(backupPath, sqlitePath)`), allowing replacement of the database with an arbitrary host file or uploaded artifact.
- **Smallest Effective Source Fix:**
  Sanitize `backupFilename` using `path.basename()`, enforce regex validation (e.g. `/^backup_full_[A-Za-z0-9._-]+\.sqlite3$/`), and ensure `path.resolve(backupPath).startsWith(path.resolve(backupDir) + path.sep)`.

---

### Finding 3: Permissive CORS Wildcard (`*`) & Default `0.0.0.0` Binding (`vuln-cors-wildcard-and-unrestricted-binding`)
- **Severity:** High (Likelihood: Medium, Impact: High)
- **Source Locations:**
  - `src/server/index.ts`: Lines 14–18 (`cors({ origin: '*' })`) & Lines 57–60 (`app.listen(p)`)
- **Vulnerability Mechanics:**
  1. `cors({ origin: '*' })` disables browser same-origin protection for API responses. If the user browses the web while the desktop app is open, any malicious website can make cross-origin JavaScript `fetch()` calls to `http://127.0.0.1:4200/api/...` to read customer records, financial ledgers, and audit logs.
  2. `app.listen(p)` without a host parameter binds to `0.0.0.0` (all interfaces), exposing the unauthenticated backend API to other devices on the local Wi-Fi or Ethernet network.
- **Smallest Effective Source Fix:**
  In `src/server/index.ts`, bind explicitly to `'127.0.0.1'` for Single-Computer mode. Configure CORS middleware to validate the `Origin` header, allowing only localhost origins (`127.0.0.1:*`, `localhost:*`) or requests without an origin (Electron desktop client).

---

### Finding 4: CSV / Excel Formula Injection (CWE-1236) in Data Export (`vuln-csv-excel-formula-injection-export`)
- **Severity:** Medium (Likelihood: Low, Impact: Medium)
- **Source Locations:**
  - `src/server/services/importExportService.ts`: Lines 43–60 (`exportCustomersToExcel`) & Lines 96–115 (`exportProductsToExcel`)
- **Vulnerability Mechanics:**
  User-supplied strings (customer names, company names, product SKUs, descriptions) are written directly into worksheet cells. If an entity name begins with formula prefix characters (`=`, `+`, `-`, `@`, `\t`, `\r`), opening the exported `.xlsx` file in Excel can trigger dynamic formula evaluation or DDE execution.
- **Smallest Effective Source Fix:**
  Introduce a cell sanitizer helper that prepends a single quote (`'`) to any string value matching `/^[=+@\-\t\r]/`.

---

### Finding 5: Missing Electron Window Open and Navigation Guardrails (`vuln-electron-unrestricted-window-open-and-navigation`)
- **Severity:** Low (Likelihood: Low, Impact: Low)
- **Source Locations:**
  - `electron/main.ts`: Lines 116–140
- **Vulnerability Mechanics:**
  `BrowserWindow` does not configure `setWindowOpenHandler` or `will-navigate`. If the renderer renders an external hyperlink or a script calls `window.open()`, Electron creates an unmanaged child window or navigates the primary window away from the local application bundle.
- **Smallest Effective Source Fix:**
  Add `mainWindow.webContents.setWindowOpenHandler` to intercept window opens and redirect `http/https` URLs to `shell.openExternal`, returning `{ action: 'deny' }`. Add `will-navigate` listener to prevent navigation away from `127.0.0.1`.

---

## 4. Positive Architectural Defenses Identified

1. **Strict Context Isolation**: `webPreferences` sets `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Preload script exposes only 3 narrow IPC methods.
2. **Deterministic Financial Math**: Zero use of native floating-point math for monetary calculations; `decimal.js` is consistently enforced.
3. **Database Parameterization**: Knex query builder parameters are properly utilized; raw queries use parameterized bindings.
4. **Draft vs Finalized Immutability**: Finalized documents cannot be edited or silently deleted; cancellations are formally audited and reverse balances atomically.
5. **Multi-Tenant Scoping**: All transactional queries consistently filter by `company_id`.
6. **Pure-JS PDF Generation**: `pdf-lib` renders PDFs in memory, eliminating headless browser SSRF vulnerabilities.

---

## 5. Coverage Summary

- **Total In-Scope Ledger Units:** 6
- **Units with Confirmed Vulnerabilities (Candidate):** 5
- **Units Cleanly Verified (Covered):** 1 (Financial calculation engine and database transaction isolation)
- **Units Blocked / Deferred:** 0
- **Final Validator Status:** PASS (100% compliant with `report-schema.json` and `coverage-ledger.json` specifications).
