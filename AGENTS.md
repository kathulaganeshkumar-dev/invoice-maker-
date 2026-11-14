# AGENTS.md - System Architecture & Engineering Directives

## 1. Project Overview & Requirements
This application is a commercial-grade, desktop-first Invoicing, Quotation, Inventory, and Business Management software designed for Indian businesses and international standards.
- Operating Modes:
  1. Single-Computer Mode: Zero-configuration local database (SQLite/local embedded engine).
  2. Local-Network Multi-User Mode: Central local server with PostgreSQL database supporting 3–5 concurrent client computers over LAN without requiring internet access.
- Zero Cloud Dependency: All database storage, PDF generation, calculation, OCR, and document handling run 100% locally and offline.
- No mandatory authentication/login required on launch; users enter directly into Company & Branch selection.
- Multi-Company and Multi-Branch with strict data isolation per company.

## 2. Technology Stack
- **Desktop Shell**: Electron with secure IPC (`contextBridge`), secure preload scripts, sandboxed renderers, and native window management.
- **Frontend**: React 18+, TypeScript, Tailwind CSS, Lucide React icons, Headless UI / modern responsive design, Toast notifications, Modal dialogs.
- **Backend / Services**: Node.js & TypeScript modular API services, Express router, controller-service-repository architecture.
- **Database Layer**: Knex.js query builder with schema migrations, indexes, foreign keys, transaction management, supporting both SQLite (`better-sqlite3` / `sqlite3`) and PostgreSQL (`pg`).
- **Financial Calculation Engine**: `decimal.js` for all monetary arithmetic, avoiding IEEE 754 floating point inaccuracies. Indian currency formatting (Lakhs, Crores) and Amount in Words converter.
- **Indian GST Engine**: Full CGST, SGST, IGST, UTGST, HSN/SAC summaries, Reverse Charge, Tax-inclusive and Tax-exclusive calculation, Place of Supply determination.
- **Document & PDF Generation**: Vector-accurate PDF generation with preprinted letterhead overlay alignment, multi-page tables, repeated headers, page numbers, digital signatures, and direct printing.
- **Offline OCR & Letterhead AI**: Tesseract.js offline OCR worker with layout zone detection (Header, Footer, Margins, Table area, Signature area) and regex/NLP entity extraction (GSTIN, PAN, IFSC, UPI, Phone, Email).
- **Import/Export Engine**: `exceljs` and CSV parser with column mapping, preview, schema validation, and error reporting.

## 3. Strict Coding & Architectural Standards
1. **Financial Calculations**: NEVER use native JavaScript `+`, `-`, `*`, `/` on currency or tax rates. Always use `Decimal` instances and explicit rounding policies (`ROUND_HALF_UP`).
2. **Company Data Isolation**: Every transactional query (Invoices, Quotations, Customers, Suppliers, Products, Stock, Payments) MUST filter by `company_id`.
3. **Sequential Document Numbering**: Document numbers (Invoices, Quotations, POs, Payments) must be atomically generated within a database transaction to prevent duplicates or race conditions. Cancelled finalized numbers must never be reused silently.
4. **Draft vs Finalize Workflow**:
   - Drafts are fully mutable.
   - Finalized documents are immutable: changes require credit/debit notes or formal audited cancellation with mandatory reason.
5. **Inventory Movement**:
   - Quotes and Proforma invoices do NOT modify stock.
   - Inward movements (GRN, Purchase Invoices, Adjustments) and Outward movements (Finalized Invoices, Delivery Challans) create atomic `inventory_transactions` records with FIFO / Weighted Average valuation.
   - Prevent negative inventory unless explicitly permitted in company configuration.
6. **Payment Allocation**:
   - Payments are recorded atomically; allocations cannot exceed invoice outstanding balances.
7. **Offline Integrity**:
   - Never initiate external HTTP calls to third-party CDNs, analytics, or cloud APIs. All assets, fonts, icons, and libraries are locally bundled.

## 4. Phase Plan
- Phase 1: Architecture, Multi-Company & Multi-Branch, Database Migrations, Seed Data, Dashboard Foundation.
- Phase 2: Customers, Suppliers, Products & Services, Categories, Units.
- Phase 3: Invoicing Engine, Numbering Sequences, GST Engine, Quotation Management & Conversion.
- Phase 4: Letterhead Management, Offline OCR Layout Recognition, PDF Generation & Print Overlay Engine.
- Phase 5: Purchase Management, Warehouses, Inventory Movements & Valuation.
- Phase 6: Customer & Supplier Payments, Financial Dashboard, Business & GST Reports.
- Phase 7: Backup, Restore, Excel/CSV Import/Export, Audit Logs & System Settings.
- Phase 8: Cross-platform Packaging, Documentation, and Automated Quality Testing.

## 5. Local Software & Development Directives (Version 2.0)
- **Local Application URL**: `http://127.0.0.1:4200` (Local embedded server running directly on user's machine)
- **Local Desktop Executable**: `version 2.0\win-unpacked\Enterprise Invoice Manager.exe`
- **User Launch Directive**: When the user requests to "open", "open the software", or review changes, open the **local Version 2 software** directly on their PC (`http://127.0.0.1:4200` and the desktop application), NOT the remote Vercel link unless explicitly asked.
- **Development & Review Workflow**:
  1. Make requested code changes directly in the local workspace (`src/`).
  2. Build and update local files with `npm run build` (or run Vite dev server `npm run dev:vite` on port 5173 with proxy to 4200 for instant live reload).
  3. Verify changes locally on `http://127.0.0.1:4200` and in the Version 2 desktop application.
