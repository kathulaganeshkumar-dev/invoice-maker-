// tests/integration.test.ts - End-to-end integration tests for invoicing, purchases, payments, warehouses, PDF/AI letterheads, dashboard & company lifecycle
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { initDatabase, closeDatabase } from '../src/server/database/connection';
import { seedInitialData } from '../src/server/database/seed';
import { CompanyService } from '../src/server/services/companyService';
import { MasterDataService } from '../src/server/services/masterDataService';
import { InvoiceService } from '../src/server/services/invoiceService';
import { QuotationService } from '../src/server/services/quotationService';
import { PurchaseService } from '../src/server/services/purchaseService';
import { InventoryService } from '../src/server/services/inventoryService';
import { PaymentService } from '../src/server/services/paymentService';
import { LetterheadService } from '../src/server/services/letterheadService';
import { ReportService } from '../src/server/services/reportService';
import { PdfEngine } from '../src/server/services/pdfEngine';
import Decimal from 'decimal.js';

describe('End-to-End Business Application Operations', () => {
  let db: any;
  let tempDataDir: string;
  let prevAppDataDir: string | undefined;

  let companyService: CompanyService;
  let masterDataService: MasterDataService;
  let invoiceService: InvoiceService;
  let quotationService: QuotationService;
  let purchaseService: PurchaseService;
  let inventoryService: InventoryService;
  let paymentService: PaymentService;
  let letterheadService: LetterheadService;
  let reportService: ReportService;

  let company: any;
  let companyTwo: any;
  let branch: any;
  let customer: any;
  let supplier: any;
  let product: any;
  let defaultWarehouse: any;

  beforeAll(async () => {
    prevAppDataDir = process.env.APP_DATA_DIR;
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-invoicer-test-'));
    process.env.APP_DATA_DIR = tempDataDir;

    const tempSqlitePath = path.join(tempDataDir, 'test_invoice_manager.sqlite3');
    db = await initDatabase({ type: 'sqlite', sqlitePath: tempSqlitePath });
    await seedInitialData(db);

    companyService = new CompanyService(db);
    masterDataService = new MasterDataService(db);
    invoiceService = new InvoiceService(db);
    quotationService = new QuotationService(db, invoiceService);
    purchaseService = new PurchaseService(db);
    inventoryService = new InventoryService(db);
    paymentService = new PaymentService(db);
    letterheadService = new LetterheadService(db);
    reportService = new ReportService(db);

    // Verify clean-slate seed (zero demo companies, customers, suppliers, or products)
    const preExistingCompanies = await companyService.getAllCompanies();
    expect(preExistingCompanies.length).toBe(0);

    // Create two isolated companies for testing multi-company behavior & final deletion
    company = await companyService.createCompany({
      name: 'Acme Enterprise Test',
      legal_name: 'Acme Enterprise Test Pvt Ltd',
      registered_address: 'Plot 42, Electronic Complex, Indore',
      state: 'Madhya Pradesh',
      state_code: '23',
      pin_code: '452010',
      phone: '+91 98260 12345',
      email: 'accounts@acmeenterprise.example',
      bank_name: 'State Bank of India',
      bank_account_no: '38291048192',
      bank_ifsc: 'SBIN0001234',
    });

    companyTwo = await companyService.createCompany({
      name: 'Nova Logistics LLP',
      legal_name: 'Nova Logistics LLP',
      registered_address: 'Bandra Kurla Complex, Mumbai',
      state: 'Maharashtra',
      state_code: '27',
      pin_code: '400051',
      phone: '+91 98201 55555',
      email: 'billing@novalogistics.example',
    });

    const branches = await companyService.getBranches(company.id);
    branch = branches[0];

    const warehouses = await inventoryService.getWarehouses(company.id);
    defaultWarehouse = warehouses[0];

    // Configure invoice starting sequence to 45 with prefix AC/
    await db('numbering_sequences')
      .where({ company_id: company.id, document_type: 'TAX_INVOICE' })
      .update({ prefix: 'AC/', current_number: 45 });

    // Create customer
    customer = await masterDataService.createCustomer(company.id, {
      name: 'Apex Test Logistics',
      mobile: '+91 98930 98765',
      billing_address: '104 Silver Arc, Indore',
      city: 'Indore',
      state: 'Madhya Pradesh',
      state_code: '23',
      pin_code: '452001',
      opening_balance: '0.00',
    });

    // Create supplier
    supplier = await masterDataService.createSupplier(company.id, {
      name: 'Metro Wholesale Distributors',
      mobile: '+91 98111 22334',
      address: 'MIDC Phase 2, Pune',
      state: 'Maharashtra',
      state_code: '27',
      pin_code: '411019',
      opening_balance: '0.00',
    });

    // Create product
    product = await masterDataService.createProduct(company.id, {
      name: 'Managed Switch 24G',
      unit: 'NOS',
      hsn_or_sac: '85176290',
      selling_price: '18500.00',
      purchase_price: '14000.00',
      current_stock: '50.00',
    });
  });

  afterAll(async () => {
    await closeDatabase();
    if (prevAppDataDir === undefined) {
      delete process.env.APP_DATA_DIR;
    } else {
      process.env.APP_DATA_DIR = prevAppDataDir;
    }
    if (tempDataDir && fs.existsSync(tempDataDir)) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  it('generates next running invoice number AC/2026-27/0046 when finalized and renders PDF', async () => {
    const initialProductStock = new Decimal(product.current_stock);
    const initialCustomerBal = new Decimal(customer.current_balance);

    // 1. Create Draft Invoice with 2 quantities
    const draft = await invoiceService.createInvoice(company.id, {
      branch_id: branch.id,
      document_type: 'TAX_INVOICE',
      customer_id: customer.id,
      customer_name: customer.name,
      customer_gstin: customer.gstin,
      billing_address: customer.billing_address,
      place_of_supply_state: customer.state,
      place_of_supply_code: customer.state_code,
      invoice_date: '2026-11-09',
      items: [
        {
          item_id: product.id,
          item_type: 'PRODUCT',
          item_name: product.name,
          quantity: 2,
          rate: product.selling_price, // 18500
          gst_rate: 18,
          hsn_or_sac: product.hsn_or_sac,
        },
      ],
    });

    expect(draft.status).toBe('DRAFT');
    expect(draft.grand_total).toBe('43660.00'); // 2 * 18500 = 37000 + 18% (6660) = 43660

    // 2. Finalize Invoice
    const finalized = await invoiceService.finalizeInvoice(company.id, draft.id);

    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.invoice_number).toBe('AC/2026-27/0046');

    // Verify Customer balance incremented
    const updatedCustomer = await masterDataService.getCustomerById(company.id, customer.id);
    expect(new Decimal(updatedCustomer!.current_balance).toNumber()).toBe(
      initialCustomerBal.add(new Decimal('43660.00')).toNumber()
    );

    // Verify Stock reduced by 2
    const updatedProduct = await masterDataService.getProductById(company.id, product.id);
    expect(new Decimal(updatedProduct!.current_stock).toNumber()).toBe(
      initialProductStock.sub(2).toNumber()
    );

    // 3. Generate PDF for the finalized invoice
    const pdfBytes = await PdfEngine.generateInvoicePdf(finalized, {
      mode: 'DIGITAL_LETTERHEAD',
      company,
      branch,
    });
    expect(pdfBytes.length).toBeGreaterThan(1000);
  });

  it('supports Paid toggle during invoice creation, custom non-catalog items, and markInvoiceAsPaid', async () => {
    // 1. Create Invoice with a non-catalog custom item AND mark_as_paid = true
    const paidCustomInv = await invoiceService.createInvoice(company.id, {
      branch_id: branch.id,
      document_type: 'TAX_INVOICE',
      customer_id: customer.id,
      customer_name: customer.name,
      billing_address: customer.billing_address,
      place_of_supply_state: customer.state,
      place_of_supply_code: customer.state_code,
      invoice_date: '2026-11-10',
      mark_as_paid: true,
      payment_method: 'UPI',
      payment_reference: 'UPI-CUSTOM-01',
      items: [
        {
          // Non-catalog custom item (no item_id)
          item_type: 'SERVICE',
          item_name: 'On-Site Fiber Fusion Splicing & Testing',
          unit: 'JOB',
          quantity: 1,
          rate: '5000.00',
          gst_rate: 18,
          hsn_or_sac: '998719',
        },
      ],
    });

    expect(paidCustomInv.status).toBe('FINALIZED');
    expect(paidCustomInv.grand_total).toBe('5900.00');
    expect(paidCustomInv.paid_amount).toBe('5900.00');
    expect(paidCustomInv.balance_amount).toBe('0.00');
    expect(paidCustomInv.items[0].item_id).toBeNull();

    // 2. Create Draft -> Finalize -> Mark Paid on existing unpaid invoice
    const unpaidInv = await invoiceService.createInvoice(company.id, {
      branch_id: branch.id,
      document_type: 'TAX_INVOICE',
      customer_id: customer.id,
      customer_name: customer.name,
      billing_address: customer.billing_address,
      place_of_supply_state: customer.state,
      place_of_supply_code: customer.state_code,
      invoice_date: '2026-11-11',
      finalize_on_create: true,
      items: [
        {
          item_type: 'PRODUCT',
          item_name: 'Custom Wall Bracket (Ad-hoc)',
          unit: 'PCS',
          quantity: 2,
          rate: '500.00',
          gst_rate: 18,
          hsn_or_sac: '7326',
        },
      ],
    });

    expect(unpaidInv.status).toBe('FINALIZED');
    expect(unpaidInv.balance_amount).toBe('1180.00');

    const settledInv = await invoiceService.markInvoiceAsPaid(company.id, unpaidInv.id, {
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: '2026-11-11',
      referenceNumber: 'NEFT-SETTLE-01',
    });

    expect(settledInv.paid_amount).toBe('1180.00');
    expect(settledInv.balance_amount).toBe('0.00');
  });

  it('supports quotation creation, deletion, and 1-click conversion to invoice', async () => {
    const quote = await quotationService.createQuotation(company.id, {
      branch_id: branch.id,
      customer_id: customer.id,
      customer_name: customer.name,
      quotation_date: '2026-11-09',
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          quantity: 1,
          rate: '18500.00',
          gst_rate: 18,
        },
      ],
    });

    expect(quote.status).toBe('DRAFT');
    expect(quote.quotation_number).toContain('QT/');

    const convertedInvoice = await quotationService.convertToInvoice(company.id, quote.id);
    expect(convertedInvoice.status).toBe('DRAFT');
    expect(convertedInvoice.items.length).toBe(1);
    expect(convertedInvoice.items[0].rate).toBe('18500.00');

    const updatedQuote = await quotationService.getQuotationById(company.id, quote.id);
    expect(updatedQuote!.status).toBe('CONVERTED');
    expect(updatedQuote!.converted_invoice_id).toBe(convertedInvoice.id);

    const tempQuote = await quotationService.createQuotation(company.id, {
      branch_id: branch.id,
      customer_id: customer.id,
      customer_name: customer.name,
      items: [{ item_name: 'Temporary Quote Item', quantity: '1', rate: '500', gst_rate: '18' }],
    });
    expect(await quotationService.deleteQuotation(company.id, tempQuote.id)).toBe(true);
    expect(await quotationService.getQuotationById(company.id, tempQuote.id)).toBeNull();
  });

  it('records customer payment and supplier vendor payment with bill allocation & reversal', async () => {
    // 1. Customer Payment Allocation against AC/2026-27/0046
    const invoices = await invoiceService.getInvoices(company.id, { status: 'FINALIZED' });
    const inv = invoices.find((i) => i.invoice_number === 'AC/2026-27/0046')!;
    const initialInvBalance = new Decimal(inv.balance_amount);

    const payment = await paymentService.recordCustomerPayment(company.id, {
      branchId: branch.id,
      customerId: inv.customer_id,
      customerName: inv.customer_name,
      amount: '10000.00',
      paymentMethod: 'UPI',
      referenceNumber: 'UPI-REF-998877',
      allocations: [{ invoiceId: inv.id, amount: '10000.00' }],
    });

    expect(payment.amount).toBe('10000.00');
    expect(payment.allocations.length).toBe(1);

    const refreshedInv = await invoiceService.getInvoiceById(company.id, inv.id);
    expect(refreshedInv!.paid_amount).toBe('10000.00');
    expect(refreshedInv!.balance_amount).toBe(initialInvBalance.sub(10000).toFixed(2));

    // 2. Supplier Purchase Bill + Supplier Vendor Payment Allocation + Delete Finalized Bill
    const stockBeforePur = new Decimal((await masterDataService.getProductById(company.id, product.id))!.current_stock);
    const purBill = await purchaseService.createPurchaseInvoice(company.id, {
      branch_id: branch.id,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      warehouse_id: defaultWarehouse.id,
      bill_number: 'SUP-BILL-001',
      bill_date: '2026-11-10',
      items: [
        {
          product_id: product.id,
          item_name: product.name,
          quantity: 5,
          rate: '14000.00',
          gst_rate: 18,
          hsn_code: product.hsn_or_sac,
        },
      ],
    });
    expect(purBill.grand_total).toBe('82600.00');

    const finalizedPur = await purchaseService.finalizePurchaseInvoice(company.id, purBill.id);
    expect(finalizedPur.is_finalized).toBe(true);

    const stockAfterPur = new Decimal((await masterDataService.getProductById(company.id, product.id))!.current_stock);
    expect(stockAfterPur.toNumber()).toBe(stockBeforePur.add(5).toNumber());

    const supBeforePay = await masterDataService.getSupplierById(company.id, supplier.id);
    expect(supBeforePay!.current_balance).toBe('82600.00');

    // Record Vendor Payment paying 50000 against SUP-BILL-001
    const supPay = await paymentService.recordSupplierPayment(company.id, {
      branchId: branch.id,
      supplierId: supplier.id,
      amount: '50000.00',
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: '2026-11-11',
      referenceNumber: 'UTR-VENDOR-1234',
      allocations: [{ billId: finalizedPur.id, amount: '50000.00' }],
    });

    expect(supPay.amount).toBe('50000.00');
    expect(supPay.allocations.length).toBe(1);
    expect(supPay.allocations[0].document_number).toBe('SUP-BILL-001');

    const supAfterPay = await masterDataService.getSupplierById(company.id, supplier.id);
    expect(supAfterPay!.current_balance).toBe('32600.00');

    // Delete finalized purchase bill and confirm stock, supplier balance, and transactions roll back
    expect(await purchaseService.deletePurchaseInvoice(company.id, finalizedPur.id)).toBe(true);

    const stockAfterDel = new Decimal((await masterDataService.getProductById(company.id, product.id))!.current_stock);
    expect(stockAfterDel.toNumber()).toBe(stockBeforePur.toNumber());

    const purList = await purchaseService.getPurchaseInvoices(company.id);
    expect(purList.find((b) => b.id === finalizedPur.id)).toBeUndefined();

    // Clean up vendor advance left after bill deletion
    await paymentService.deleteSupplierPayment(company.id, supPay.id);
    const supFinal = await masterDataService.getSupplierById(company.id, supplier.id);
    expect(supFinal!.current_balance).toBe('0.00');
  });

  it('supports warehouse CRUD (create, edit, delete)', async () => {
    const newWh = await inventoryService.createWarehouse(company.id, {
      name: 'Pune Regional Depot',
      code: 'PUNE01',
      address: 'Plot 88, Chakan MIDC, Pune',
      is_default: false,
    });
    expect(newWh.name).toBe('Pune Regional Depot');
    expect(newWh.code).toBe('PUNE01');

    const updatedWh = await inventoryService.updateWarehouse(company.id, newWh.id, {
      name: 'Pune Central Hub',
      code: 'PCH01',
      address: 'Hinjewadi Phase 2, Pune',
    });
    expect(updatedWh.name).toBe('Pune Central Hub');
    expect(updatedWh.code).toBe('PCH01');

    await inventoryService.deleteWarehouse(company.id, newWh.id);
    const listAfterDel = await inventoryService.getWarehouses(company.id);
    expect(listAfterDel.find((w) => w.id === newWh.id)).toBeUndefined();
  });

  it('filters dashboard metrics accurately by From Date and To Date', async () => {
    const novAll = await reportService.getDashboardMetrics(company.id, {
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    const decOnly = await reportService.getDashboardMetrics(company.id, {
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });

    // All test invoices were created on Nov 9-11 2026: 43660 + 5900 + 1180 = 50740.00
    expect(novAll.totalSales).toBe('50740.00');
    const novEntry = novAll.monthlySales.find((m) => m.month === 'Nov');
    expect(novEntry?.sales).toBe(50740);

    // Zero invoices in Dec 2026
    expect(decOnly.totalSales).toBe('0.00');
    expect(decOnly.totalInvoicesCount).toBe(0);
  });

  it('imports PDF letterhead templates, reads header/entities via offline AI, isolates per company, and overlays PDFs', async () => {
    // Build a real in-memory A4 PDF containing letterhead header & GST/bank metadata
    const samplePdf = await PDFDocument.create();
    const p = samplePdf.addPage([595.28, 841.89]);
    const fontBold = await samplePdf.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await samplePdf.embedFont(StandardFonts.Helvetica);

    p.drawText('NOVA LOGISTICS LLP', { x: 42, y: 795, size: 16, font: fontBold });
    p.drawText('GSTIN: 27AAACN1234K1Z5 | PAN: AAACN1234K', { x: 42, y: 775, size: 10, font: fontReg });
    p.drawText('IFSC: HDFC0001234 | UPI: billing@okhdfcbank | Phone: +91 98201 55555', {
      x: 42,
      y: 758,
      size: 9,
      font: fontReg,
    });
    p.drawText('Registered Office Footer - Subject to Mumbai Jurisdiction', {
      x: 42,
      y: 32,
      size: 8,
      font: fontReg,
    });
    const pdfBuffer = Buffer.from(await samplePdf.save());

    // Import into companyTwo's Letterheads & Templates category
    const { template, analysis } = await letterheadService.importTemplateFile(
      companyTwo.id,
      { originalname: 'Nova_Official_Letterhead.pdf', buffer: pdfBuffer },
      { name: 'Nova Corporate Stationery', is_default: true, auto_detect: true }
    );

    expect(template.company_id).toBe(companyTwo.id);
    expect(template.file_type).toBe('PDF');
    expect(fs.existsSync(template.file_path)).toBe(true);

    // Offline AI entity extraction & zone detection
    expect(analysis.detected_entities.gstin).toBe('27AAACN1234K1Z5');
    expect(analysis.detected_entities.pan).toBe('AAACN1234K');
    expect(analysis.detected_entities.bank_ifsc).toBe('HDFC0001234');
    expect(analysis.detected_entities.upi_id).toBe('billing@okhdfcbank');
    expect(analysis.recommended_orientation).toBe('PORTRAIT');

    // Per-company isolation: company 1 sees 0 templates, company 2 sees 1 template
    expect((await letterheadService.getTemplates(company.id)).length).toBe(0);
    expect((await letterheadService.getTemplates(companyTwo.id)).length).toBe(1);

    // Generate invoice PDF overlaid onto the imported PDF letterhead template
    const invoicesComp1 = await invoiceService.getInvoices(company.id, { status: 'FINALIZED' });
    const overlaidBytes = await PdfEngine.generateInvoicePdf(invoicesComp1[0], {
      mode: 'DIGITAL_LETTERHEAD',
      template,
      company: companyTwo,
    });
    expect(overlaidBytes.length).toBeGreaterThan(pdfBuffer.length);
  });

  it('allows deleting ALL companies including the very last remaining company', async () => {
    await companyService.deleteCompany(company.id);
    let remaining = await companyService.getAllCompanies();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(companyTwo.id);

    // Now delete the ONLY remaining company (previously blocked)
    await companyService.deleteCompany(companyTwo.id);
    remaining = await companyService.getAllCompanies();
    expect(remaining.length).toBe(0);
  });
});
