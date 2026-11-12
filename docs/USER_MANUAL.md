# Enterprise Invoice Manager - Comprehensive User Manual & Operations Guide

---

## 1. Introduction & Overview

**Enterprise Invoice Manager** is an enterprise-grade, desktop-first Invoicing, Quotation, Inventory, and Financial Business Management software tailored specifically for Indian trade practices and international commercial standards.

### Key Operational Highlights
- **100% Offline & Local**: Completely independent of cloud dependencies, third-party internet APIs, or external payment gateways. Your financial and client data never leaves your local machine or local area network (LAN).
- **No Mandatory Login Screen**: On launch, the software directly presents the **Company & Branch Selection** window, enabling immediate access to daily operations without cumbersome password prompts.
- **Strict Multi-Company & Multi-Branch Architecture**: Manage independent entities (e.g. manufacturing, trading, service firms) within a single software installation with isolated ledgers, products, customers, suppliers, and numbering sequences.
- **Dual Operating Modes**:
  1. *Single-Computer Mode*: Runs instantaneously with a zero-configuration, lightning-fast local SQLite database stored right on your computer.
  2. *Local-Network Multi-User Mode*: Supports 3 to 5 simultaneous workstations connected over your office Wi-Fi / Ethernet LAN to a dedicated central PostgreSQL instance, with zero internet requirement.
- **Financial Arithmetic Precision**: Utilizes high-precision decimal arithmetic (`decimal.js`) with standard commercial half-up rounding (`ROUND_HALF_UP`) to completely eliminate floating-point penny errors.
- **Indian GST Compliance**: Automated Place of Supply determination (CGST + SGST vs. IGST), HSN/SAC code aggregation, Reverse Charge handling, and one-click GSTR-1 / GSTR-3B report generation.

---

## 2. Getting Started & Company Setup

### 2.1 First Launch & Company Selection
When you start **Enterprise Invoice Manager**, the **Startup Business Selection** dialog opens automatically (matching classic desktop accounting workflows):

1. **Company Selection**: Select your desired company from the list and click **Select** to enter the workspace.
2. **Set Default Company**: Check the **"Default"** checkbox next to any company name. On subsequent launches, the application can automatically load into that company.
3. **Show Dialog on Startup**: Toggle the checkbox *"Show this window when program starts"* if you frequently switch between multiple businesses or branches.
4. **Creating a New Business**:
   - Click the **+ New** button on the toolbar.
   - Enter your **Company Legal Name**, **Trade Name**, **GSTIN**, **PAN**, **Registered Address**, **State & State Code**, and **Contact Information**.
   - Input your **Banking Details** (Bank Name, Account Number, IFSC, Branch, UPI ID) so they print automatically on invoices and quotations.
   - Configure your default **Invoice Terms** and **Quotation Terms**.
   - Click **Save**. The system automatically provisions a primary default branch ("Head Office") and sets up standard accounting sequences.

### 2.2 Branch Management
Branches allow large businesses to track sales, quotations, dispatches, and warehouse stocks across multiple physical offices or sales locations while maintaining unified company books:
- Navigate to the Top Bar and click the **Branch Selector** dropdown.
- Click **Manage Branches** to add new branch codes (e.g., `HO`, `BR-NORTH`, `WH-MUMBAI`), specify separate local addresses, contact numbers, and state jurisdictions.
- All documents, dispatches, and inventory ledgers permanently retain their issuing branch identity.

---

## 3. Configuration & System Preferences

Access the system-wide settings at any time by clicking the **Settings** icon on the navigation sidebar or opening the **Configuration** modal dialog:

### 3.1 Business & Invoicing Preferences
- **Invoice Overdue Days**: Default payment term days (e.g., Net 15, Net 30, Due on Receipt).
- **Print Invoice After Save**: Automatically launches the desktop print dialog or PDF preview immediately upon finalizing an invoice.
- **Address Formatting**: Toggle whether to show the Postal PIN code before or after the City name in Billing/Shipping addresses.
- **Numbering Search**: Enable search indexing across document internal notes and reference codes.

### 3.2 Amount in Words & Currency
- **Show Amount in Words**: Automatically prints English verbal amount representations on the footer of all finalized tax invoices and bills of supply (e.g., *"Rupees One Lakh Twenty-Four Thousand Five Hundred Only"*).
- **Indian Numbering Style**: Adheres to the Indian numbering grouping system (Crores, Lakhs, Thousands, Hundreds) rather than international millions/billions.
- **Custom Currency Denomination**: Configure primary denomination (e.g., `Rupees`) and fractional decimal denomination (e.g., `Paise`).

### 3.3 Printed Date Format
Choose your preferred business date display format across all generated invoices and reports:
- `DD/MM/YYYY` (Standard Indian format: e.g., `09/11/2026`)
- `DD-MMM-YYYY` (e.g., `09-Nov-2026`)
- `MMMM DD, YYYY` (e.g., `November 09, 2026`)

---

## 4. Master Data Management

### 4.1 Customer Management
1. Click **Customers** in the navigation bar.
2. Click **+ Add Customer** to register a client:
   - **Entity Type**: Select *Company (B2B)* or *Individual (B2C)*.
   - **Customer Name & Contact Person**: Primary trading title and point of contact.
   - **GSTIN & PAN**: The system automatically validates the 15-character Indian GSTIN format and extracts the embedded 10-character PAN.
   - **State & 2-Digit State Code**: Crucial for determining tax classification (Intra-state vs. Inter-state).
   - **Billing & Shipping Addresses**: Enter distinct addresses if goods are dispatched to a consignee warehouse different from the buyer's billing office.
   - **Credit Limit & Opening Balance**: Set maximum credit thresholds and initial opening receivables.
3. **Quick-Add Customer**: When creating an invoice or quotation on the fly, you can directly register a new customer without leaving the sales screen.

### 4.2 Supplier (Vendor) Management
1. Click **Suppliers** in the navigation menu.
2. Register vendor profiles with their GSTIN, PAN, registered office address, payment terms, and remittance bank details.
3. Track purchase histories, unbilled purchase orders, and total outstanding accounts payable (AP).

### 4.3 Products, Services & Categories
1. Click **Products & Services**:
   - **Type**: Specify *Product (Physical Goods)* or *Service*. Services do not impact inventory stock ledgers.
   - **SKU & Barcode**: Enter internal stock-keeping units and standard EAN/UPC barcodes for rapid scanning.
   - **HSN / SAC Code**: 6-to-8 digit Harmonized System of Nomenclature code for goods, or 6-digit Services Accounting Code.
   - **GST Tax Rate**: Pre-assign standard slabs (0%, 5%, 12%, 18%, 28%, or Exempt).
   - **Pricing**: Define separate default *Selling Price* and standard *Purchase Price*.
   - **Unit of Measurement**: Select from standard UOMs (e.g., `PCS`, `KGS`, `MTR`, `BOX`, `SET`, `HRS`, `NOS`).
   - **Minimum Stock Threshold**: Triggers proactive dashboard alerts when warehouse physical inventory dips below safe thresholds.

---

## 5. Invoicing Engine & Document Types

### 5.1 Supported Document Types
The system provides tailored document schemas and accounting effects for various commercial transactions:
1. **GST Tax Invoice**: Standard commercial invoice for taxable supplies of goods or services.
2. **Bill of Supply**: Issued for exempt supplies or by businesses registered under the GST Composition Scheme (no tax charged to customer).
3. **Proforma Invoice**: Preliminary quotation invoice sent prior to supply of goods (does NOT deduct inventory, does NOT impact tax ledgers).
4. **Service Invoice**: Specialized billing document for consultancies, software, maintenance, and professional services.
5. **Commercial / Export Invoice**: Multi-currency export documents with shipping bill references and port codes.
6. **Delivery Challan**: Authorizes physical movement of inventory (deducts warehouse stock without recognizing revenue).
7. **Credit Note**: Issued for sales returns, post-sale discounts, or tax adjustments; restores stock and issues customer credit.
8. **Debit Note**: Issued for supplemental billing or price enhancements.

### 5.2 Sequential Document Numbering Engine
Document numbering is governed by an automated, atomic numbering engine configured to adhere to Indian Financial Year conventions:
- **Default Structure**: `[PREFIX]/[FINANCIAL_YEAR]/[SEQUENCE_NUMBER]`
  - Example: `VS/2026-27/0046`
- **Guaranteed Uniqueness**: Sequences are generated atomically inside database transactions, guaranteeing zero duplicate numbers and preventing concurrency race conditions across multi-user environments.
- **Financial Year Rollover**: Automatically resets or transitions sequence counters upon April 1st of each fiscal year.
- **Manual Sequence Customization**: You can alter the starting sequence number in Configuration (e.g., setting the next Tax Invoice sequence to `46` to seamlessly match previous accounting books).

### 5.3 Invoice Lifecycle (Draft vs. Finalized)
To maintain financial compliance and prevent data corruption:
- **Draft Status**: Invoices in Draft state are fully editable. You can modify quantities, change line items, recalculate taxes, and adjust customer details freely.
- **Finalized Status**: Once finalized, an invoice is legally issued:
  - The document number becomes permanently fixed.
  - Inventory ledgers are atomically debited for sold products.
  - Accounts Receivable (AR) balances are posted to the customer's ledger.
  - The document becomes **immutable**.
- **Cancellation Workflow**: Finalized invoices cannot be silently deleted. To cancel a finalized invoice, click **Cancel Invoice**, select an authorized reason (e.g., *"Customer Order Cancellation"*, *"Clerical Error"*), and confirm. The cancellation is logged in the audit trail, accounts receivable is credited, and inventory is optionally returned to stock.

---

## 6. Indian GST Calculation Engine

### 6.1 Intra-State vs. Inter-State Determination
The engine determines tax applicability by comparing the **Supplier Branch State Code** and the **Customer Place of Supply State Code**:
- **Intra-State Supply** (Same State):
  - Example: Supplier in Maharashtra (Code 27) sells to Customer in Maharashtra (Code 27).
  - Applicable Taxes: **CGST (Central GST)** at half the slab rate + **SGST (State GST)** at half the slab rate (or UTGST in Union Territories without a legislature).
- **Inter-State Supply** (Different States):
  - Example: Supplier in Maharashtra (Code 27) sells to Customer in Gujarat (Code 24).
  - Applicable Taxes: **IGST (Integrated GST)** at the full slab rate.

### 6.2 Reverse Charge Mechanism (RCM)
Check the **Reverse Charge** box when billing supplies where the tax liability is shifted to the recipient under Section 9(3) or 9(4) of the CGST Act. The invoice clearly marks *"Tax Payable on Reverse Charge: YES"* and does not charge tax to the invoice subtotal.

### 6.3 Tax-Inclusive vs. Tax-Exclusive Pricing
- **Tax Exclusive (Standard)**: Unit Price is the base price; GST is calculated and appended on top of the taxable amount.
  $$\text{Tax Amount} = \text{Taxable Value} \times \frac{\text{GST Rate}}{100}$$
- **Tax Inclusive (Retail)**: Entered price represents the Maximum Retail Price (MRP). The engine automatically extracts the base taxable value and backward-calculates the embedded GST:
  $$\text{Taxable Value} = \frac{\text{Gross Amount}}{1 + \frac{\text{GST Rate}}{100}}$$

---

## 7. Quotation Management & 1-Click Conversion

### 7.1 Creating & Managing Quotations
1. Open **Quotations** and click **+ New Quotation**.
2. Select Customer, Quotation Validity Date, Payment Terms, and Line Items.
3. Manage Quotation states: `Draft` $\rightarrow$ `Sent` $\rightarrow$ `Approved` $\rightarrow$ `Converted` (or `Rejected` / `Expired`).
4. Quotations maintain complete revision numbers (`Rev 1`, `Rev 2`) whenever commercial renegotiations take place.

### 7.2 Manual 1-Click Conversion to Invoice
When a client approves a quotation:
1. Open the quotation details modal or list item.
2. Click the **Convert to Invoice** button.
3. The system generates a brand-new Sales Invoice draft pre-populated with:
   - Identical customer billing & shipping data.
   - All line items, unit rates, quantities, HSN codes, and discounts.
   - Linked reference to the original Quotation Number.
4. Review the generated invoice draft and click **Finalize & Issue**. The original quotation is automatically marked as `CONVERTED`.

---

## 8. Letterhead Management, Offline OCR & PDF Engine

### 8.1 Dual Printing Architecture
Businesses operate with two distinct letterhead workflows, both fully supported by the system:
1. **Mode A: Digital Letterhead (Full PDF Generation)**
   - Upload your company’s full digital letterhead graphic (PDF, high-resolution PNG, or JPG).
   - When printing or exporting to PDF, the application dynamically draws your invoice tables, headers, and totals directly over the digital background.
2. **Mode B: Preprinted Physical Stationery (Overlay Pass-Through)**
   - Used when feeding physical pre-printed letterhead paper into your laser/inkjet printer.
   - The engine automatically suppresses the company logo, company name, bank header, and footer, printing **only** the dynamic invoice data (Invoice No, Date, Customer Details, Item Table, Totals, Signatures) calibrated exactly to fit within the printable margins of your physical paper.

### 8.2 Offline AI Letterhead Recognition & Layout Calibration
When setting up a new letterhead template:
1. Go to **Letterheads** $\rightarrow$ **+ New Template**.
2. Upload a scan or image of your letterhead.
3. Click **Auto-Detect Layout (OCR)**:
   - The integrated offline Tesseract engine scans the document entirely on your computer.
   - It identifies the exact bounding boxes of your letterhead **Header Zone** (top logo and address banner) and **Footer Zone** (bottom registration text, social links, bank details).
   - It parses company metadata using local regex patterns (GSTIN, PAN, Phone, Email, IFSC).
4. Calibrate your coordinates in millimeters:
   - *Top Margin (Table Start Y)*: Distance from top edge where items should begin printing.
   - *Bottom Margin (Footer Clearance)*: Height reserved for bottom letterhead artwork.
   - *Left / Right Margins*: Printable boundary margins.
5. Save the template and set it as Default. Every subsequent invoice and quotation will render with pinpoint millimeter accuracy.

---

## 9. Purchasing, Multi-Warehouse & Inventory Control

### 9.1 Purchase Orders & Vendor Bills
1. Navigate to **Purchases** to issue Purchase Orders (PO) or record inward Vendor Invoices.
2. Inward purchase items specify the destination **Warehouse**.
3. Upon finalizing a purchase invoice, warehouse physical inventory is incremented atomically, and your Accounts Payable (AP) ledger is updated.

### 9.2 Real-Time Stock Ledgers & Valuation
- The system maintains an unalterable **Inventory Movement Ledger** tracking every inward receipt, outward sales dispatch, credit note return, and manual stock adjustment.
- **Inventory Valuation**: Calculates inventory values using standard **FIFO** (First-In, First-Out) and **Weighted Average** costing methods.
- **Negative Stock Protection**: If enabled in Company Settings, the invoice engine prevents finalizing a sale if physical warehouse stock is insufficient, preventing negative inventory states.

### 9.3 Manual Stock Adjustments
- Perform manual stock counts or shrinkage corrections under **Inventory** $\rightarrow$ **Adjust Stock**.
- Every manual stock adjustment requires selecting an audit reason (e.g., *"Physical Count Discrepancy"*, *"Damaged Stock"*, *"Sample Issuance"*) for accountability.

---

## 10. Payment Tracking (AR & AP)

### 10.1 Customer Receipts (Accounts Receivable)
1. Go to **Payments** $\rightarrow$ **Customer Payments**.
2. Click **Record Receipt**:
   - Select the Customer.
   - Enter Payment Date, Payment Mode (*Cash*, *Cheque*, *NEFT / RTGS*, *UPI*, *Credit / Debit Card*), and Transaction Reference / Cheque Number.
   - Enter the total amount received.
3. **Live Invoice Allocation**:
   - The modal lists all pending unpaid and partially paid invoices for that customer.
   - Click **Auto-Allocate** to distribute the payment starting from the oldest invoice (FIFO), or manually enter specific allocation amounts per invoice.
   - Over-payments are automatically tracked as **Advance Balances** for future sales.

### 10.2 Supplier Disbursements (Accounts Payable)
- Record outgoing payments to vendors in **Supplier Payments**, allocating disbursements directly against open Purchase Invoices.

---

## 11. Reports & Business Intelligence

Real-time business insights are available in the **Reports** center:
- **Sales Summary**: Daily, monthly, and financial year sales turnover, taxable turnover, and total tax collections.
- **Customer Aging & Outstanding**: Identifies customers with overdue balances categorized into 0–30, 31–60, 61–90, and 90+ day aging buckets.
- **Stock Valuation Report**: Instant breakdown of total inventory value by product category and warehouse.
- **GSTR-1 Tax Report**:
  - *Table 4 (B2B)*: Invoices issued to registered taxpayers with GSTIN.
  - *Table 5 & 7 (B2C)*: Sales to unregistered consumers (Inter-state large vs. Intra-state).
  - *Table 12 (HSN Summary)*: Mandatory aggregation of quantity, taxable value, CGST, SGST, IGST, and cess per HSN code.
- **GSTR-3B Summary**: Consolidated inward and outward taxable supplies and eligible input tax credits.

---

## 12. Data Portability, Backup & Disaster Recovery

### 12.1 Excel & CSV Import / Export
- **One-Click Export**: Export your complete Customer Directory, Supplier Directory, Product Catalog, or Sales Register directly to `.xlsx` Excel workbooks using formatted column layouts.
- **Bulk Import**:
  - Download pre-configured Excel Import Templates from **Import / Export**.
  - Populate your existing customer or product catalog.
  - Upload the file to import hundreds of items in seconds with automated duplicate SKU and GSTIN validation.

### 12.2 Automated & Manual Database Backups
Protect your mission-critical business data with our integrated backup suite:
1. Go to **Backup & Restore**.
2. Click **Create Backup Now**:
   - The system creates a timestamped, integrity-verified archive file (`backup_YYYYMMDD_HHMMSS.zip`) containing your complete SQLite database file and uploaded letterhead templates.
   - Store backup files on an external USB drive, network share, or personal storage for safe off-site preservation.
3. **Safety-Guaranteed Restore**:
   - Prior to restoring any backup archive, the system automatically takes a **Pre-Restoration Safety Snapshot** of your current active database.
   - If an accidental or corrupt archive is selected, your previous state can be restored with a single click.

---

## 13. Multi-User Local Area Network (LAN) Setup

To connect 3 to 5 computers in your office simultaneously without an internet connection:
1. **Designate a Server Computer**: Choose one office workstation to act as the primary local server.
2. **Install PostgreSQL**: Install PostgreSQL on the server machine (runs locally, zero cloud access required).
3. **Configure Database Mode**:
   - In **Settings** $\rightarrow$ **Database Configuration**, toggle from *Single Computer (SQLite)* to *Local Network (PostgreSQL)*.
   - Enter your server connection credentials (Host: `127.0.0.1`, Port: `5432`, Database: `invoice_manager`, User & Password).
   - Click **Migrate / Connect**. The Knex migration runner automatically initializes all 27 tables.
4. **Connect Client Computers**:
   - On other workstations connected to the same office Wi-Fi or Ethernet switch, open Enterprise Invoice Manager.
   - Set the Database Host to the server computer's local IP address (e.g., `192.168.1.150`).
   - All client computers can now create invoices, manage stock, and view real-time reports simultaneously.

---
*Enterprise Invoice Manager - Designed for Performance, Privacy, and Precision.*
