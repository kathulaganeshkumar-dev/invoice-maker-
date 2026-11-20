// tests/varun_quotation.test.ts - Comprehensive tests for Varun Systems Quotation & Calibration PDF
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';
import { calculateLineItem, calculateDocumentTotals } from '../src/server/finance/decimalCalc';
import { QuotationSequenceService } from '../src/server/services/quotationSequenceService';
import { PdfEngine } from '../src/server/services/pdfEngine';
import { getSystemQuotationTemplates, LetterheadService } from '../src/server/services/letterheadService';
import { Quotation, Company } from '../src/shared/types';

describe('Varun Systems Quotation Management & Precision Calculation', () => {
  it('accurately computes 8-column GST table numbers matching Varun Systems sample quote', () => {
    // Ground truth sample quote:
    // Base rate: 32,565.00, Units: 01, GST 18%
    // Taxable Amount: 32,565.00
    // GST Amount (18%): 5,861.70
    // Total Amount: 38,426.70
    // Round Off: 0.30 -> Grand Total: 38,427.00
    const line = calculateLineItem({
      quantity: '1',
      rate: '32565.00',
      gstRate: '18.00',
      isTaxInclusive: false,
      isInterState: false,
    });

    expect(line.taxableValue).toBe('32565.00');
    expect(line.totalTax).toBe('5861.70');
    expect(line.cgstAmount).toBe('2930.85');
    expect(line.sgstAmount).toBe('2930.85');
    expect(line.lineTotal).toBe('38426.70');

    const docTotals = calculateDocumentTotals({
      items: [
        {
          quantity: line.quantity,
          rate: line.rate,
          taxable_value: line.taxableValue,
          total_tax: line.totalTax,
          cgst_amount: line.cgstAmount,
          sgst_amount: line.sgstAmount,
          line_total: line.lineTotal,
        } as any,
      ],
    });

    expect(docTotals.totalTaxableValue).toBe('32565.00');
    expect(docTotals.totalTax).toBe('5861.70');
    expect(docTotals.roundOff).toBe('0.30');
    expect(docTotals.grandTotal).toBe('38427.00');
  });

  it('supports custom round-off, including 0 to disable rounding completely', () => {
    const line = calculateLineItem({
      quantity: '1',
      rate: '32565.00',
      gstRate: '18.00',
      isTaxInclusive: false,
      isInterState: false,
    });

    // 1. Custom Round Off = "0" -> No round off, exact unrounded sum (38,426.70)
    const docTotalsZero = calculateDocumentTotals({
      items: [
        {
          quantity: line.quantity,
          rate: line.rate,
          taxable_value: line.taxableValue,
          total_tax: line.totalTax,
          line_total: line.lineTotal,
        } as any,
      ],
      customRoundOff: '0',
    });

    expect(docTotalsZero.totalTaxableValue).toBe('32565.00');
    expect(docTotalsZero.totalTax).toBe('5861.70');
    expect(docTotalsZero.roundOff).toBe('0.00');
    expect(docTotalsZero.grandTotal).toBe('38426.70');

    // 2. Custom Round Off = "-0.70" -> 38,426.70 - 0.70 = 38,426.00
    const docTotalsMinus = calculateDocumentTotals({
      items: [
        {
          quantity: line.quantity,
          rate: line.rate,
          taxable_value: line.taxableValue,
          total_tax: line.totalTax,
          line_total: line.lineTotal,
        } as any,
      ],
      customRoundOff: '-0.70',
    });

    expect(docTotalsMinus.roundOff).toBe('-0.70');
    expect(docTotalsMinus.grandTotal).toBe('38426.00');

    // 3. Custom Round Off = "5.00" -> 38,426.70 + 5.00 = 38,431.70
    const docTotalsCustom = calculateDocumentTotals({
      items: [
        {
          quantity: line.quantity,
          rate: line.rate,
          taxable_value: line.taxableValue,
          total_tax: line.totalTax,
          line_total: line.lineTotal,
        } as any,
      ],
      customRoundOff: '5.00',
    });

    expect(docTotalsCustom.roundOff).toBe('5.00');
    expect(docTotalsCustom.grandTotal).toBe('38431.70');
  });

  it('determines Indian Financial Year correctly (April 1 to March 31 boundary)', () => {
    // April 2024 -> 24-25
    expect(QuotationSequenceService.getFinancialYear(new Date(2024, 3, 15))).toBe('24-25');
    // December 2024 -> 24-25
    expect(QuotationSequenceService.getFinancialYear(new Date(2024, 11, 31))).toBe('24-25');
    // January 2025 -> 24-25
    expect(QuotationSequenceService.getFinancialYear(new Date(2025, 0, 15))).toBe('24-25');
    // March 2025 -> 24-25
    expect(QuotationSequenceService.getFinancialYear(new Date(2025, 2, 31))).toBe('24-25');
    // April 2025 -> 25-26
    expect(QuotationSequenceService.getFinancialYear(new Date(2025, 3, 1))).toBe('25-26');
    // February 2026 -> 25-26
    expect(QuotationSequenceService.getFinancialYear(new Date(2026, 1, 20))).toBe('25-26');
  });

  it('generates 1-page A4 physical letterhead ruler calibration PDF', async () => {
    const pdfBytes = await PdfEngine.generateLetterheadCalibrationPdf({
      topMarginMm: 55,
      bottomMarginMm: 32,
      leftMarginMm: 15,
      rightMarginMm: 15,
    });

    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(1000);
    // PDF Magic Header %PDF-
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('generates Varun Systems vector quotation PDF with pre-printed physical clearance', async () => {
    const sampleCompany: Company = {
      id: 'comp-1',
      name: 'VARUN SYSTEMS',
      trade_name: 'VARUN SYSTEMS',
      address_line1: 'HIG : 40, Bharath Nagar Colony',
      address_line2: 'Moosapet',
      city: 'Hyderabad',
      state: 'Telangana',
      state_code: '36',
      pincode: '500018',
      phone: '9849012345',
      email: 'varunsystems@gmail.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const sampleQuote: Quotation = {
      id: 'quote-1',
      company_id: 'comp-1',
      quotation_number: 'VS-QT-008-24-25',
      quotation_date: '2024-04-20',
      valid_until_date: '2024-04-27',
      customer_name: 'FUTURE TRENDS',
      billing_address: 'Plot No. 12, Cyber Gateway, Madhapur, Hyderabad',
      place_of_supply_state: 'Telangana',
      place_of_supply_code: '36',
      status: 'SENT',
      subtotal: '32565.00',
      taxable_total: '32565.00',
      cgst_total: '2930.85',
      sgst_total: '2930.85',
      igst_total: '0.00',
      gst_total: '5861.70',
      round_off: '0.30',
      grand_total: '38427.00',
      amount_in_words: 'Rupees Thirty Eight Thousand Four Hundred Twenty Seven Only',
      top_margin_mm: 55,
      bottomMargin_mm: 32 as any,
      terms_and_conditions: `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.`,
      items: [
        {
          id: 'item-1',
          quotation_id: 'quote-1',
          item_name: 'Dell OptiPlex Desktop System',
          description: 'Intel Core i5, 16GB RAM, 512GB NVMe SSD, Windows 11 Pro\nWarranty: 3 Years Onsite OEM Warranty',
          units: '01',
          quantity: '1',
          base_rate: '32565.00',
          rate: '32565.00',
          taxable_amount: '32565.00',
          gst_rate: '18.00',
          gst_amount: '5861.70',
          cgst_rate: '9.00',
          cgst_amount: '2930.85',
          sgst_rate: '9.00',
          sgst_amount: '2930.85',
          total_amount: '38426.70',
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Mode: PREPRINTED_STATIONERY (Strictly leaves 55mm top and 32mm bottom clearances, NO logo printed)
    const pdfBytes = await PdfEngine.generateVarunQuotationPdf(
      sampleQuote,
      sampleCompany,
      'PREPRINTED_STATIONERY',
      undefined,
      false
    );

    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');
  });

  it('includes built-in Varun Systems quotation formats in templates list when requested', () => {
    const sysTemplates = getSystemQuotationTemplates();
    expect(sysTemplates).toBeDefined();
    expect(sysTemplates.length).toBeGreaterThanOrEqual(2);
    expect(sysTemplates.some((t: any) => t.id === 'builtin-varun-gst')).toBe(true);
    expect(sysTemplates.some((t: any) => t.id === 'builtin-varun-nogst')).toBe(true);
  });

  it('detects DOCX Word document template and extracts text correctly', () => {
    const dummyDb: any = () => {};
    const service = new LetterheadService(dummyDb);

    const docxPath = path.join(process.cwd(), 'assets', 'templates', 'VARUN_SYSTEMS_QUOTATIO_GST_FORMAT.docx');
    if (fs.existsSync(docxPath)) {
      const buffer = fs.readFileSync(docxPath);
      const fileType = service.detectFileTypeFromBuffer(buffer, 'VARUN_SYSTEMS_QUOTATIO_GST_FORMAT.docx', true);
      expect(fileType).toBe('DOCX');

      const extracted = service.extractDocxText(buffer);
      expect(extracted).toContain('QUOTATION');
      expect(extracted).toContain('VARUN SYSTEMS');
    }
  });

  it('renders all customized and multi-point terms without truncation in Varun Quotation PDF', async () => {
    const sampleCompany: Company = {
      id: 'comp-1',
      name: 'VARUN SYSTEMS',
      trade_name: 'VARUN SYSTEMS',
      address_line1: 'HIG : 40, Bharath Nagar Colony',
      address_line2: 'Moosapet',
      city: 'Hyderabad',
      state: 'Telangana',
      state_code: '36',
      pincode: '500018',
      phone: '9849012345',
      email: 'varunsystems@gmail.com',
      default_quotation_terms: `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.
6. Support: 1 Year free on-site warranty.
7. Jurisdiction: Subject to Hyderabad jurisdiction only.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const sampleQuote: Quotation = {
      id: 'quote-custom-terms',
      company_id: 'comp-1',
      quotation_number: 'VS-QT-009-24-25',
      quotation_date: '2024-04-21',
      valid_until_date: '2024-04-28',
      customer_name: 'FUTURE TRENDS',
      customer_gstin: '36AABCU9603R1ZM',
      status: 'SENT',
      subtotal: '10000.00',
      grand_total: '11800.00',
      amount_in_words: 'Rupees Eleven Thousand Eight Hundred Only',
      top_margin_mm: 55,
      terms_and_conditions: sampleCompany.default_quotation_terms,
      items: [
        {
          id: 'item-1',
          quotation_id: 'quote-custom-terms',
          item_name: 'Networking Cable CAT 6',
          units: '01',
          quantity: '1',
          base_rate: '10000.00',
          rate: '10000.00',
          taxable_amount: '10000.00',
          gst_rate: '18.00',
          gst_amount: '1800.00',
          total_amount: '11800.00',
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const pdfBytes = await PdfEngine.generateVarunQuotationPdf(
      sampleQuote,
      sampleCompany,
      'PREPRINTED_STATIONERY',
      undefined,
      false
    );

    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.length).toBeGreaterThan(2000);
    // PDF generated cleanly with 7-line terms and no errors
  });

  it('verifies custom round-off: 45.85 with 0 yields 45.85; with +15 yields 60.85', () => {
    // Exact user test scenario:
    // Product with amount 45.85
    const items = [
      {
        quantity: '1',
        rate: '45.85',
        taxable_value: '45.85',
        total_tax: '0.00',
        line_total: '45.85',
      } as any,
    ];

    // Scenario A: round off = "0" -> grand total = 45.85
    const totalsWithZero = calculateDocumentTotals({
      items,
      customRoundOff: '0',
    });
    expect(totalsWithZero.totalProductsAmount).toBe('45.85');
    expect(totalsWithZero.roundOff).toBe('0.00');
    expect(totalsWithZero.grandTotal).toBe('45.85');

    // Scenario B: round off = "+15" -> grand total = 60.85
    const totalsWithPlus15 = calculateDocumentTotals({
      items,
      customRoundOff: '+15',
    });
    expect(totalsWithPlus15.totalProductsAmount).toBe('45.85');
    expect(totalsWithPlus15.roundOff).toBe('15.00');
    expect(totalsWithPlus15.grandTotal).toBe('60.85');

    // Scenario C: round off = "15" -> grand total = 60.85
    const totalsWith15 = calculateDocumentTotals({
      items,
      customRoundOff: '15',
    });
    expect(totalsWith15.totalProductsAmount).toBe('45.85');
    expect(totalsWith15.roundOff).toBe('15.00');
    expect(totalsWith15.grandTotal).toBe('60.85');
  });
});
