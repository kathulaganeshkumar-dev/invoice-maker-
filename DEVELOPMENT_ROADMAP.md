# DEVELOPMENT_ROADMAP.md

## Phase Execution Checklist

### [Phase 1] Foundation & Core Entity Architecture
- [x] Initialize package.json, TypeScript configs, Vite build config, Tailwind CSS config, Electron main & preload
- [x] Database Schema: Knex migrations for Companies, Branches, Sequences, Settings (27 tables with foreign keys and indexes)
- [x] Backend Server: Express/Node local API server supporting both embedded mode and LAN server mode
- [x] Company & Branch selection workflow with persistence and switching (matching reference screenshot)
- [x] Dashboard foundation metrics & navigation layout

### [Phase 2] Master Data Management
- [x] Customers module: Individual/Company, multiple addresses, GSTIN/PAN, opening balance, credit limits
- [x] Suppliers module: Contact details, GSTIN/PAN, bank details, opening balance
- [x] Products & Services: Categories, units, HSN/SAC codes, tax rates, selling & purchase prices, minimum stock alerts
- [x] Real-time search, filtering, and validation

### [Phase 3] Invoicing, GST & Quotation Engine
- [x] Configurable sequential document numbering engine (FY prefix/suffix, padding, anti-collision)
- [x] Document types: Standard Tax Invoice, Bill of Supply, Proforma, Service Invoice, Delivery Challan, Credit Note, Debit Note
- [x] Indian GST Engine: CGST/SGST vs IGST based on State Codes / Place of Supply, Reverse Charge, Tax-inclusive vs Tax-exclusive calculation using Decimal.js
- [x] Invoice state machine: Draft -> Review -> Finalize -> Cancel (with reason & audit log)
- [x] Quotation module: Creation, status lifecycle, revision history, manual 1-click conversion to Invoice

### [Phase 4] Letterhead Engine, Offline OCR & PDF System
- [x] Letterhead template management: PDF, PNG, JPG uploads with template coordinates
- [x] Offline OCR & Layout recognition using local regex & geometric zone analysis
- [x] Extraction of Company Name, GSTIN, PAN, Phone, Email, Bank details, Header/Footer bounding boxes
- [x] PDF Generation engine: Dual mode (A. Digital Letterhead background, B. Preprinted stationery overlay)
- [x] Accurate print preview and multi-page table continuation with repeated headers and amount-in-words

### [Phase 5] Purchasing, Inventory & Warehouses
- [x] Purchase Orders & Purchase Invoices linked to Suppliers
- [x] Multi-warehouse management & inter-warehouse stock transfers
- [x] Real-time stock ledgers with FIFO / Weighted Average inventory valuation
- [x] Automatic stock outward on finalized invoices, stock inward on purchases, manual adjustments, negative stock guard

### [Phase 6] Payments & Business Intelligence
- [x] Customer payment receipt tracking (Cash, UPI, NEFT/RTGS, Cheque, Card) with invoice allocation
- [x] Supplier payment tracking with purchase invoice allocation
- [x] Financial Dashboard: Real-time calculation of receivables, payables, sales, purchases, stock valuation
- [x] Comprehensive Reports: Daily/Monthly Sales, Quotations, Purchases, Stock ledger, GSTR-1 & GSTR-3B summaries

### [Phase 7] Data Portability, Backup & System Settings
- [x] Excel & CSV Import/Export engine with preview, column mapping, and duplicate detection (ExcelJS)
- [x] Automated & Manual Backup (full DB snapshot, attachments) and safety-validated Restore
- [x] System settings: Database mode switch (SQLite vs PostgreSQL), Printer preferences, Numbering rules

### [Phase 8] Testing, Hardening & Production Packaging
- [x] Comprehensive unit and integration tests for calculations, numbering, GST, stock movements, and migrations
- [x] Electron-builder packaging setup for Windows (NSIS installer & portable), macOS, Linux
- [x] User Manual (`docs/USER_MANUAL.md`) & Technical Architecture (`docs/TECHNICAL_ARCHITECTURE.md`) complete
