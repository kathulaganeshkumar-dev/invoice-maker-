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

## 5. Mandatory Workflow Directive: Vercel Web Preview Before Local Software Installation
- **CRITICAL DIRECTIVE**: Whenever any code modification, frontend polish, bug fix, or feature request is made:
  1. **Deploy to Vercel First**: Commit and push changes to the repository (`git push origin main`) to trigger the live Vercel deployment so the user can immediately review and inspect changes on the web.
  2. **Provide Web Preview to User**: Share and open the Vercel web preview link so the user can verify the visual UI, layout, and functionality before applying changes to the local software file.
  3. **Local Software Sync After Web Review**: Only after the changes are verified on the Vercel web build, compile the local packages (`cmd.exe /c "npm run build"`), update the local installation files, and refresh the desktop Electron application.
