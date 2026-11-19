// tests/comprehensive_audit.test.ts - Comprehensive System & Liabilities Audit Test Suite
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Decimal from 'decimal.js';
import { initDatabase, closeDatabase } from '../src/server/database/connection';
import { seedInitialData } from '../src/server/database/seed';
import { CompanyService } from '../src/server/services/companyService';
import { MasterDataService } from '../src/server/services/masterDataService';
import { InvoiceService } from '../src/server/services/invoiceService';
import { QuotationService } from '../src/server/services/quotationService';
import { PurchaseService } from '../src/server/services/purchaseService';
import { InventoryService } from '../src/server/services/inventoryService';
import { PaymentService } from '../src/server/services/paymentService';
import { NumberingService } from '../src/server/services/numberingService';
import { calculateLineItem, calculateDocumentTotals, formatIndianCurrency } from '../src/server/finance/decimalCalc';
import { convertAmountToWords } from '../src/server/finance/numberToWords';

describe('Comprehensive System & Liabilities Audit Suite', () => {
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

  let compA: any;
  let compB: any;
  let custA: any;
  let custB: any;
  let prodA: any;
  let defaultWhA: any;

  beforeAll(async () => {
    prevAppDataDir = process.env.APP_DATA_DIR;
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comprehensive-audit-test-'));
    process.env.APP_DATA_DIR = tempDataDir;

    const testDbPath = path.join(tempDataDir, 'audit_invoice_manager.sqlite3');
    db = await initDatabase({ type: 'sqlite', sqlitePath: testDbPath });
    await seedInitialData(db);

    companyService = new CompanyService(db);
    masterDataService = new MasterDataService(db);
    invoiceService = new InvoiceService(db);
    quotationService = new QuotationService(db, invoiceService);
    purchaseService = new PurchaseService(db);
    inventoryService = new InventoryService(db);
    paymentService = new PaymentService(db);

    // Create Company A (Maharashtra) and Company B (Gujarat)
    compA = await companyService.createCompany({
      name: 'Alpha Infotech Ltd',
      legal_name: 'Alpha Infotech Pvt Ltd',
      business_type: 'Private Limited Company',
      state: 'Maharashtra',
      state_code: '27',
      gstin: '27AAAAA0000A1Z5',
      financial_year: '2026-27',
    });

    compB = await companyService.createCompany({
      name: 'Beta Global Traders',
      legal_name: 'Beta Global Traders LLP',
      business_type: 'LLP',
      state: 'Gujarat',
      state_code: '24',
      gstin: '24BBBBB1111B1Z2',
      financial_year: '2026-27',
    });

    custA = await masterDataService.createCustomer(compA.id, {
      name: 'Cust Alpha Mumbai',
      customer_type: 'BUSINESS_B2B',
      mobile: '9820000001',
      state: 'Maharashtra',
      state_code: '27',
      gstin: '27AABCA1234A1Z1',
    });

    custB = await masterDataService.createCustomer(compB.id, {
      name: 'Cust Beta Surat',
      customer_type: 'BUSINESS_B2B',
      mobile: '9820000002',
      state: 'Gujarat',
      state_code: '24',
      gstin: '24AABCB5678B1Z2',
    });

    prodA = await masterDataService.createProduct(compA.id, {
      name: 'Industrial Router 5G',
      item_type: 'PRODUCT',
      hsn_or_sac: '8517',
      selling_price: '10000.00',
      purchase_price: '7000.00',
      gst_rate: '18.00',
      unit: 'NOS',
      current_stock: '10.00',
    });

    const whs = await inventoryService.getWarehouses(compA.id);
    defaultWhA = whs[0] || (await inventoryService.createWarehouse(compA.id, { name: 'Main Hub', is_default: true }));
  });

  afterAll(async () => {
    await closeDatabase();
    if (prevAppDataDir) {
      process.env.APP_DATA_DIR = prevAppDataDir;
    } else {
      delete process.env.APP_DATA_DIR;
    }
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ==========================================
  // SECTION 1: FINANCIAL & GST CALCULATIONS
  // ==========================================
  describe('1. Financial Precision & Indian GST Calculation Engine', () => {
    it('accurately computes tax-inclusive line item without floating point drift', () => {
      // 1 unit at 105.00 inclusive of 5% GST
      const res = calculateLineItem({
        quantity: '1',
        rate: '105.00',
        gstRate: '5.00',
        isTaxInclusive: true,
        isInterState: false,
      });

      expect(res.taxableValue).toBe('100.00');
      expect(res.cgstAmount).toBe('2.50');
      expect(res.sgstAmount).toBe('2.50');
      expect(res.igstAmount).toBe('0.00');
      expect(res.totalTax).toBe('5.00');
      expect(res.lineTotal).toBe('105.00');
    });

    it('correctly calculates 100% discount as zero taxable value', () => {
      const res = calculateLineItem({
        quantity: '5',
        rate: '2000.00',
        discountPercentage: '100',
        gstRate: '18.00',
        isTaxInclusive: false,
        isInterState: false,
      });

      expect(res.taxableValue).toBe('0.00');
      expect(res.totalTax).toBe('0.00');
      expect(res.lineTotal).toBe('0.00');
    });

    it('handles high value monetary transactions (Crores) without overflow', () => {
      // 25 units at 1 Crore each = 25 Crores + 18% IGST (4.5 Crores) = 29.5 Crores
      const res = calculateLineItem({
        quantity: '25',
        rate: '10000000.00',
        gstRate: '18.00',
        isTaxInclusive: false,
        isInterState: true,
      });

      expect(res.taxableValue).toBe('250000000.00');
      expect(res.igstAmount).toBe('45000000.00');
      expect(res.lineTotal).toBe('295000000.00');
      expect(formatIndianCurrency(res.lineTotal, false)).toBe('29,50,00,000.00');
    });

    it('converts amounts to English words according to Indian numbering system (Lakhs & Crores)', () => {
      expect(convertAmountToWords('0')).toBe('Rupees Zero Only');
      expect(convertAmountToWords('100000')).toBe('Rupees One Lakh Only');
      expect(convertAmountToWords('10000000')).toBe('Rupees One Crore Only');
      expect(convertAmountToWords('12345678.50')).toBe(
        'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only'
      );
      expect(convertAmountToWords('5.05')).toBe('Rupees Five and Five Paise Only');
    });

    it('applies auto round-off policy correctly', () => {
      const items = [
        calculateLineItem({
          quantity: '1',
          rate: '100.33',
          gstRate: '0.00',
          isTaxInclusive: false,
          isInterState: false,
        }),
      ];

      const doc = calculateDocumentTotals({
        items: items as any,
        roundOff: true,
      });

      expect(doc.subtotal).toBe('100.33');
      expect(doc.roundOff).toBe('-0.33');
      expect(doc.grandTotal).toBe('100.00');
    });
  });

  // ==========================================
  // SECTION 2: SEQUENTIAL NUMBERING CONCURRENCY
  // ==========================================
  describe('2. Sequential Numbering Atomic Concurrency Under Stress', () => {
    it('produces 10 unique, non-colliding sequential numbers when called in parallel', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          db.transaction(async (trx: any) => {
            return NumberingService.getNextNumber(trx, compA.id, 'TAX_INVOICE');
          })
        )
      );

      const generatedNumbers = results.map((r: any) => r.number);
      const uniqueNumbers = new Set(generatedNumbers);

      // Verify zero duplicates
      expect(uniqueNumbers.size).toBe(10);
      expect(generatedNumbers.length).toBe(10);

      // Verify sequence progression is monotonically strictly increasing
      const sequenceIds = results.map((r: any) => r.sequenceNumber);
      for (let i = 1; i < sequenceIds.length; i++) {
        expect(sequenceIds[i]).toBeGreaterThan(sequenceIds[i - 1]);
      }
    });
  });

  // ==========================================
  // SECTION 3: MULTI-COMPANY ISOLATION
  // ==========================================
  describe('3. Strict Cross-Company Isolation (Multi-Tenancy Guard)', () => {
    let invoiceA: any;

    beforeAll(async () => {
      invoiceA = await invoiceService.createInvoice(compA.id, {
        customer_id: custA.id,
        document_type: 'TAX_INVOICE',
        invoice_date: '2026-11-19',
        is_finalized: false,
        items: [
          {
            product_id: prodA.id,
            description: '5G Router Unit',
            quantity: 1,
            unit: 'NOS',
            rate: 10000,
            gst_rate: 18,
          },
        ],
      });
    });

    it('ensures Company B cannot read Company A invoices', async () => {
      const compBInvoices = await invoiceService.getInvoices(compB.id);
      expect(compBInvoices.some((inv) => inv.id === invoiceA.id)).toBe(false);

      const crossFetch = await invoiceService.getInvoiceById(compB.id, invoiceA.id);
      expect(crossFetch).toBeNull();
    });

    it('rejects finalizing Company A invoice using Company B identifier', async () => {
      await expect(invoiceService.finalizeInvoice(compB.id, invoiceA.id)).rejects.toThrow(
        'Invoice not found'
      );
    });

    it('rejects deleting Company A invoice using Company B identifier', async () => {
      await expect(invoiceService.deleteInvoice(compB.id, invoiceA.id)).rejects.toThrow(
        'Invoice not found'
      );
    });

    it('rejects recording customer payment for Company A customer under Company B', async () => {
      await expect(
        paymentService.recordCustomerPayment(compB.id, {
          customerId: custA.id,
          customerName: custA.name,
          amount: 5000,
          paymentMethod: 'BANK_TRANSFER',
          allocations: [{ invoiceId: invoiceA.id, amount: 5000 }],
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // SECTION 4: DRAFT VS FINALIZED IMMUTABILITY
  // ==========================================
  describe('4. Draft vs Finalized Lifecycle & Immutability Rules', () => {
    it('draft invoices do NOT decrement stock or affect customer balance', async () => {
      const initialStock = prodA.current_stock;
      const initialCustBal = custA.current_balance || '0.00';

      const draftInv = await invoiceService.createInvoice(compA.id, {
        customer_id: custA.id,
        document_type: 'TAX_INVOICE',
        invoice_date: '2026-11-19',
        is_finalized: false,
        items: [
          {
            product_id: prodA.id,
            description: 'Item',
            quantity: 2,
            unit: 'NOS',
            rate: 10000,
            gst_rate: 18,
          },
        ],
      });

      expect(draftInv.status).toBe('DRAFT');

      const prodAfter = await masterDataService.getProductById(compA.id, prodA.id);
      const custAfter = await masterDataService.getCustomerById(compA.id, custA.id);

      expect(prodAfter?.current_stock).toBe(initialStock);
      expect(custAfter?.current_balance).toBe(initialCustBal);

      // Finalizing decrements stock and increments customer balance atomically
      const finalized = await invoiceService.finalizeInvoice(compA.id, draftInv.id);
      expect(finalized.status).toBe('FINALIZED');
      expect(finalized.invoice_number).toMatch(/ALP|INV/);

      const prodFinal = await masterDataService.getProductById(compA.id, prodA.id);
      const custFinal = await masterDataService.getCustomerById(compA.id, custA.id);

      const expectedStock = new Decimal(initialStock).sub(2).toFixed(2);
      expect(prodFinal?.current_stock).toBe(expectedStock);

      const expectedBal = new Decimal(initialCustBal).add(finalized.grand_total).toFixed(2);
      expect(custFinal?.current_balance).toBe(expectedBal);

      // Finalized invoice cannot be deleted directly
      await expect(invoiceService.deleteInvoice(compA.id, finalized.id)).rejects.toThrow(
        'Finalized invoices cannot be deleted'
      );

      // Cancelling requires a reason and restores stock and reverses customer balance
      await expect(invoiceService.cancelInvoice(compA.id, finalized.id, '')).rejects.toThrow(
        'Cancellation requires a mandatory reason.'
      );

      const cancelled = await invoiceService.cancelInvoice(compA.id, finalized.id, 'Customer cancellation request');
      expect(cancelled.status).toBe('CANCELLED');

      const prodRestored = await masterDataService.getProductById(compA.id, prodA.id);
      const custRestored = await masterDataService.getCustomerById(compA.id, custA.id);

      expect(prodRestored?.current_stock).toBe(initialStock);
      expect(custRestored?.current_balance).toBe(initialCustBal);
    });
  });

  // ==========================================
  // SECTION 5: INVENTORY & NEGATIVE STOCK GUARDS
  // ==========================================
  describe('5. Inventory Integrity & Negative Stock Guarding', () => {
    it('blocks finalizing invoice if stock is insufficient and allow_negative_stock is false', async () => {
      // Configure company settings to forbid negative inventory
      await db('company_settings')
        .where({ company_id: compA.id })
        .update({ allow_negative_stock: false });

      // Create a low-stock product with only 1 unit
      const lowStockProd = await masterDataService.createProduct(compA.id, {
        name: 'Rare Microchip',
        item_type: 'PRODUCT',
        hsn_or_sac: '8542',
        selling_price: '500.00',
        current_stock: '1.00',
      });

      // Try to finalize an invoice requesting 5 units
      const draft = await invoiceService.createInvoice(compA.id, {
        customer_id: custA.id,
        document_type: 'TAX_INVOICE',
        invoice_date: '2026-11-19',
        is_finalized: false,
        items: [
          {
            product_id: lowStockProd.id,
            description: 'Rare Chip',
            quantity: 5,
            unit: 'NOS',
            rate: 500,
            gst_rate: 18,
          },
        ],
      });

      await expect(invoiceService.finalizeInvoice(compA.id, draft.id)).rejects.toThrow(/insufficient stock/i);

      // Verify stock was not changed
      const checkProd = await masterDataService.getProductById(compA.id, lowStockProd.id);
      expect(checkProd?.current_stock).toBe('1.00');

      // Now permit negative inventory in settings and verify it passes
      await db('company_settings')
        .where({ company_id: compA.id })
        .update({ allow_negative_stock: true });

      const allowedFinal = await invoiceService.finalizeInvoice(compA.id, draft.id);
      expect(allowedFinal.status).toBe('FINALIZED');

      const checkAllowedProd = await masterDataService.getProductById(compA.id, lowStockProd.id);
      expect(checkAllowedProd?.current_stock).toBe('-4.00');
    });
  });

  // ==========================================
  // SECTION 6: PAYMENT ALLOCATION SAFETY
  // ==========================================
  describe('6. Payment Allocation Limits & Balance Tracking', () => {
    it('prevents allocating more than the outstanding invoice balance', async () => {
      const inv = await invoiceService.createInvoice(compA.id, {
        customer_id: custA.id,
        document_type: 'TAX_INVOICE',
        invoice_date: '2026-11-19',
        is_finalized: true,
        items: [
          {
            description: 'Consulting',
            quantity: 1,
            unit: 'NOS',
            rate: 1000,
            gst_rate: 18,
          },
        ],
      });

      // Grand total = 1180.00
      expect(inv.balance_amount).toBe('1180.00');

      // Attempting to allocate 1500 must fail
      await expect(
        paymentService.recordCustomerPayment(compA.id, {
          customerId: custA.id,
          customerName: custA.name,
          amount: '1500.00',
          paymentMethod: 'UPI',
          allocations: [{ invoiceId: inv.id, amount: '1500.00' }],
        })
      ).rejects.toThrow(/exceeds outstanding invoice balance/i);

      // Attempting payment <= 0 must fail
      await expect(
        paymentService.recordCustomerPayment(compA.id, {
          customerId: custA.id,
          customerName: custA.name,
          amount: '0.00',
          paymentMethod: 'CASH',
        })
      ).rejects.toThrow(/greater than zero/i);

      // Valid partial payment of 500
      const partialPay = await paymentService.recordCustomerPayment(compA.id, {
        customerId: custA.id,
        customerName: custA.name,
        amount: '500.00',
        paymentMethod: 'BANK_TRANSFER',
        allocations: [{ invoiceId: inv.id, amount: '500.00' }],
      });

      expect(partialPay.unallocated_amount).toBe('0.00');
      const invAfterPartial = (await invoiceService.getInvoiceById(compA.id, inv.id))!;
      expect(invAfterPartial.paid_amount).toBe('500.00');
      expect(invAfterPartial.balance_amount).toBe('680.00');

      // Valid remainder payment of 680
      await paymentService.recordCustomerPayment(compA.id, {
        customerId: custA.id,
        customerName: custA.name,
        amount: '680.00',
        paymentMethod: 'CASH',
        allocations: [{ invoiceId: inv.id, amount: '680.00' }],
      });

      const invPaid = (await invoiceService.getInvoiceById(compA.id, inv.id))!;
      expect(invPaid.paid_amount).toBe('1180.00');
      expect(invPaid.balance_amount).toBe('0.00');
    });
  });

  // ==========================================
  // SECTION 7: QUOTATION WORKFLOW & CONVERSION
  // ==========================================
  describe('7. Quotation Conversion Workflow', () => {
    it('creates quotation without changing stock, then safely converts to invoice', async () => {
      const quoteProd = await masterDataService.createProduct(compA.id, {
        name: 'Fiber Optic Cable 100m',
        item_type: 'PRODUCT',
        hsn_or_sac: '8544',
        selling_price: '2500.00',
        current_stock: '20.00',
      });

      const quote = await quotationService.createQuotation(compA.id, {
        customer_id: custA.id,
        quotation_date: '2026-11-19',
        valid_until_date: '2026-12-19',
        items: [
          {
            product_id: quoteProd.id,
            description: 'Fiber Roll',
            quantity: 3,
            unit: 'NOS',
            rate: 2500,
            gst_rate: 18,
          },
        ],
      });

      // Verify stock untouched
      const pCheck = await masterDataService.getProductById(compA.id, quoteProd.id);
      expect(pCheck?.current_stock).toBe('20.00');

      // Convert to Tax Invoice
      const convertedInv = await quotationService.convertToInvoice(compA.id, quote.id);
      expect(convertedInv).toBeDefined();
      expect(convertedInv.customer_id).toBe(custA.id);

      // Verify quote is marked converted
      const quoteAfter = await quotationService.getQuotationById(compA.id, quote.id);
      expect(quoteAfter?.status).toBe('CONVERTED');
      expect(quoteAfter?.converted_invoice_id).toBe(convertedInv.id);
    });
  });
});
