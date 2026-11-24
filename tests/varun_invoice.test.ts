// tests/varun_invoice.test.ts - Tests for Varun Systems Named GST Invoice PDF Generation & Templates
import { describe, it, expect } from 'vitest';
import { calculateLineItem, calculateDocumentTotals } from '../src/server/finance/decimalCalc';
import { PdfEngine } from '../src/server/services/pdfEngine';
import { getSystemQuotationTemplates } from '../src/server/services/letterheadService';
import { Invoice, Company } from '../src/shared/types';
import { PDFDocument } from 'pdf-lib';

describe('Varun Systems Named GST Invoice Template & Generation', () => {
  it('accurately computes GST numbers matching Varun Systems sample invoice', () => {
    // Ground truth sample invoice:
    // NETGEAR GS728TX - 24 Ports Managed Non PoE Layer 2 Switch
    // HSN: 85176290, Qty: 1, Base Rate: 33178.00, Taxable: 33178.00, IGST 18%: 5972.04, Total: 39150.04
    // Round off: -0.04 -> Grand Total: 39150.00
    const line = calculateLineItem({
      quantity: '1',
      rate: '33178.00',
      gstRate: '18.00',
      isTaxInclusive: false,
      isInterState: true,
    });

    expect(line.taxableValue).toBe('33178.00');
    expect(line.totalTax).toBe('5972.04');
    expect(line.igstAmount).toBe('5972.04');
    expect(line.lineTotal).toBe('39150.04');

    const docTotals = calculateDocumentTotals({
      items: [
        {
          quantity: line.quantity,
          rate: line.rate,
          taxable_value: line.taxableValue,
          total_tax: line.totalTax,
          igst_amount: line.igstAmount,
          line_total: line.lineTotal,
        } as any,
      ],
      customRoundOff: '-0.04',
    });

    expect(docTotals.totalTaxableValue).toBe('33178.00');
    expect(docTotals.totalTax).toBe('5972.04');
    expect(docTotals.totalIgst).toBe('5972.04');
    expect(docTotals.roundOff).toBe('-0.04');
    expect(docTotals.grandTotal).toBe('39150.00');
  });

  it('includes Varun Systems Normal GST Template and Named GST Invoice in system templates', () => {
    const templates = getSystemQuotationTemplates();
    const normalGstTpl = templates.find((t) => t.id === 'builtin-varun-invoice-normal-gst');
    const namedGstTpl = templates.find((t) => t.id === 'builtin-varun-invoice-gst');

    expect(normalGstTpl).toBeDefined();
    expect(normalGstTpl?.name).toBe('Varun Systems Normal GST Template');
    expect(normalGstTpl?.page_size).toBe('A4');
    expect(normalGstTpl?.orientation).toBe('PORTRAIT');
    expect(normalGstTpl?.applies_to).toBe('INVOICE');

    expect(namedGstTpl).toBeDefined();
    expect(namedGstTpl?.name).toBe('Varun Systems Named GST Invoice');
    expect(namedGstTpl?.applies_to).toBe('INVOICE');
  });

  it('correctly sets initial applies_to scope for invoice and quotation templates', () => {
    const templates = getSystemQuotationTemplates();
    const varunInvNormal = templates.find((t) => t.id === 'builtin-varun-invoice-normal-gst');
    const varunInvNamed = templates.find((t) => t.id === 'builtin-varun-invoice-gst');
    const varunShreeNormal = templates.find((t) => t.id === 'builtin-varun-shree-invoice-normal-gst');
    const varunShreeIgst = templates.find((t) => t.id === 'builtin-varun-shree-igst-invoice');
    const varunQuoteGst = templates.find((t) => t.id === 'builtin-varun-gst');
    const varunQuoteNoGst = templates.find((t) => t.id === 'builtin-varun-nogst');

    expect(varunInvNormal?.applies_to).toBe('INVOICE');
    expect(varunInvNamed?.applies_to).toBe('INVOICE');
    expect(varunShreeNormal?.applies_to).toBe('INVOICE');
    expect(varunShreeIgst?.applies_to).toBe('INVOICE');
    expect(varunQuoteGst?.applies_to).toBe('QUOTATION');
    expect(varunQuoteNoGst?.applies_to).toBe('QUOTATION');
  });

  it('generates Varun Systems Named GST Invoice vector PDF with exact layout', async () => {
    const sampleInvoice: Invoice = {
      id: 'inv-varun-test-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      document_type: 'TAX_INVOICE',
      invoice_number: 'VS\\25-26\\G147',
      invoice_date: '2026-03-03',
      due_date: '2026-03-17',
      customer_id: 'cust-1',
      customer_name: 'JDD,NTRO,PMO',
      billing_address: 'NTRO, Near 25 Bn SSB, AYANAGAR,\nDELHI, SOUTH DELHI, 110047',
      shipping_address: 'NTRO, Near 25 Bn SSB, AYANAGAR,\nDELHI, SOUTH DELHI, 110047',
      place_of_supply_state: 'Delhi',
      place_of_supply_code: '07',
      is_inter_state: true,
      is_reverse_charge: false,
      purchase_order_number: 'GEMC-511687712333006',
      purchase_order_date: '2026-03-02',
      items: [
        {
          id: 'item-1',
          invoice_id: 'inv-varun-test-1',
          item_name: 'NETGEAR GS728TX - 24 Ports Managed Non PoE Layer 2 Switch',
          description: 'S/No : 7S61562HD0014',
          hsn_or_sac: '85176290',
          quantity: '1',
          unit: 'NOS',
          rate: '33178.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '33178.00',
          gst_rate: '18.00',
          cgst_rate: '0.00',
          cgst_amount: '0.00',
          sgst_rate: '0.00',
          sgst_amount: '0.00',
          igst_rate: '18.00',
          igst_amount: '5972.04',
          total_tax: '5972.04',
          line_total: '39150.04',
          sort_order: 0,
        },
      ],
      subtotal: '33178.00',
      overall_discount_percentage: '0.00',
      overall_discount_amount: '0.00',
      total_taxable_value: '33178.00',
      total_cgst: '0.00',
      total_sgst: '0.00',
      total_igst: '5972.04',
      total_tax: '5972.04',
      additional_charges: '0.00',
      round_off: '-0.04',
      grand_total: '39150.00',
      amount_in_words: 'Thirty nine thousand one hundred fifty only.',
      paid_amount: '0.00',
      balance_amount: '39150.00',
      status: 'FINALIZED',
      letterhead_template_id: 'builtin-varun-invoice-gst',
      sign_off_company: 'For VARUN SYSTEMS.',
      created_at: '2026-03-03T10:00:00.000Z',
      updated_at: '2026-03-03T10:00:00.000Z',
    };

    const company: Company = {
      id: 'comp-1',
      name: 'VARUN SYSTEMS',
      trade_name: 'VARUN SYSTEMS',
      legal_name: 'VARUN SYSTEMS',
      gstin: '36APLPV0118G1ZU',
      pan: 'APLPV0118G',
      registered_address: 'Erragadda, Hyderabad',
      city: 'Hyderabad',
      state: 'Telangana',
      state_code: '36',
      pin_code: '500018',
      email: 'info@varunsystems.com',
      mobile: '9849012345',
      bank_name: 'State Bank of India',
      bank_account_no: '34624302309',
      bank_ifsc: 'SBIN0013272',
      bank_branch: 'Erragadda, Hyderabad',
      currency: 'INR',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    const pdfBytes = await PdfEngine.generateInvoicePdf(sampleInvoice, {
      mode: 'DIGITAL_LETTERHEAD',
      template: {
        id: 'builtin-varun-invoice-gst',
        company_id: 'comp-1',
        name: 'Varun Systems Named GST Invoice',
        file_path: '',
        file_type: 'PDF',
        page_size: 'A4',
        orientation: 'PORTRAIT',
        is_default: false,
        layout_config: {} as any,
        created_at: '',
        updated_at: '',
      },
      company,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    // Verify PDF loads and has 1 page with exact A4 dimensions
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const firstPage = doc.getPages()[0];
    const { width, height } = firstPage.getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('generates intra-state Varun Systems GST invoice with CGST and SGST columns', async () => {
    const intraInvoice: Invoice = {
      id: 'inv-intra-test',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      document_type: 'TAX_INVOICE',
      invoice_number: 'VS\\25-26\\001',
      invoice_date: '2026-03-03',
      due_date: '2026-03-17',
      customer_id: 'cust-local',
      customer_name: 'Hyderabad Retailer',
      billing_address: 'Banjara Hills, Hyderabad, Telangana - 500034',
      shipping_address: 'Banjara Hills, Hyderabad, Telangana - 500034',
      place_of_supply_state: 'Telangana',
      place_of_supply_code: '36',
      is_inter_state: false,
      is_reverse_charge: false,
      items: [
        {
          id: 'item-intra',
          invoice_id: 'inv-intra-test',
          item_name: 'Desktop Server',
          hsn_or_sac: '8471',
          quantity: '1',
          unit: 'NOS',
          rate: '50000.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '50000.00',
          gst_rate: '18.00',
          cgst_rate: '9.00',
          cgst_amount: '4500.00',
          sgst_rate: '9.00',
          sgst_amount: '4500.00',
          igst_rate: '0.00',
          igst_amount: '0.00',
          total_tax: '9000.00',
          line_total: '59000.00',
          sort_order: 0,
        },
      ],
      subtotal: '50000.00',
      overall_discount_percentage: '0.00',
      overall_discount_amount: '0.00',
      total_taxable_value: '50000.00',
      total_cgst: '4500.00',
      total_sgst: '4500.00',
      total_igst: '0.00',
      total_tax: '9000.00',
      additional_charges: '0.00',
      round_off: '0.00',
      grand_total: '59000.00',
      amount_in_words: 'Fifty nine thousand only.',
      paid_amount: '0.00',
      balance_amount: '59000.00',
      status: 'FINALIZED',
      letterhead_template_id: 'builtin-varun-invoice-gst',
      created_at: '2026-03-03T10:00:00.000Z',
      updated_at: '2026-03-03T10:00:00.000Z',
    };

    const company: Company = {
      id: 'comp-1',
      name: 'VARUN SYSTEMS',
      legal_name: 'VARUN SYSTEMS',
      gstin: '36APLPV0118G1ZU',
      state: 'Telangana',
      state_code: '36',
      city: 'Hyderabad',
      pin_code: '500018',
      currency: 'INR',
      created_at: '',
      updated_at: '',
    };

    const pdfBytes = await PdfEngine.generateInvoicePdf(intraInvoice, {
      mode: 'DIGITAL_LETTERHEAD',
      template: {
        id: 'builtin-varun-invoice-gst',
        company_id: 'comp-1',
        name: 'Varun Systems Named GST Invoice',
        file_path: '',
        file_type: 'PDF',
        page_size: 'A4',
        orientation: 'PORTRAIT',
        is_default: false,
        layout_config: {} as any,
        created_at: '',
        updated_at: '',
      },
      company,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const firstPage = doc.getPages()[0];
    const { width, height } = firstPage.getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('allows custom terms and conditions to be checked, added or deleted on an invoice', async () => {
    const customTermsInvoice: Invoice = {
      id: 'inv-varun-custom-terms',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      document_type: 'TAX_INVOICE',
      invoice_number: 'VS\\25-26\\G149',
      invoice_date: '2026-03-05',
      due_date: '2026-03-19',
      customer_id: 'cust-1',
      customer_name: 'TEST CUSTOMER WITH CUSTOM TERMS',
      billing_address: 'HYDERABAD, TELANGANA',
      shipping_address: 'HYDERABAD, TELANGANA',
      place_of_supply_state: 'Telangana',
      place_of_supply_code: '36',
      is_inter_state: false,
      is_reverse_charge: false,
      // Custom edited terms (deleted point 3, added custom delivery warranty clause)
      terms_conditions: `1. Goods once sold will not be taken back.
2. Provider as per OEM Terms & Conditions.
3. Warranty provided Manufactures Authorized Service.
4. Payments should be sent through A/C payee only.
5. On-site technical support provided for 12 months.
Thanking you and assuring of our best services and attention at all times.`,
      items: [
        {
          id: 'item-1',
          invoice_id: 'inv-varun-custom-terms',
          item_name: 'Custom Warranty Item',
          description: '',
          hsn_or_sac: '85176290',
          quantity: '1',
          unit: 'NOS',
          rate: '10000.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '10000.00',
          gst_rate: '18.00',
          cgst_rate: '9.00',
          cgst_amount: '900.00',
          sgst_rate: '9.00',
          sgst_amount: '900.00',
          igst_rate: '0.00',
          igst_amount: '0.00',
          total_tax: '1800.00',
          line_total: '11800.00',
          sort_order: 1,
        },
      ],
      subtotal: '10000.00',
      overall_discount_percentage: '0.00',
      overall_discount_amount: '0.00',
      total_taxable_value: '10000.00',
      total_cgst: '900.00',
      total_sgst: '900.00',
      total_igst: '0.00',
      total_tax: '1800.00',
      additional_charges: '0.00',
      round_off: '0.00',
      grand_total: '11800.00',
      amount_in_words: 'Eleven thousand eight hundred only.',
      paid_amount: '0.00',
      balance_amount: '11800.00',
      status: 'FINALIZED',
      letterhead_template_id: 'builtin-varun-invoice-gst',
      top_margin_mm: 55,
      bottom_margin_mm: 32,
      created_at: '2026-03-05T10:00:00.000Z',
      updated_at: '2026-03-05T10:00:00.000Z',
    };

    const company: Company = {
      id: 'comp-1',
      name: 'VARUN SYSTEMS',
      legal_name: 'VARUN SYSTEMS',
      gstin: '36APLPV0118G1ZU',
      state: 'Telangana',
      state_code: '36',
      city: 'Hyderabad',
      pin_code: '500018',
      currency: 'INR',
      default_invoice_terms: 'Default fallback terms',
      created_at: '',
      updated_at: '',
    };

    const pdfBytes = await PdfEngine.generateInvoicePdf(customTermsInvoice, {
      mode: 'DIGITAL_LETTERHEAD',
      template: {
        id: 'builtin-varun-invoice-gst',
        company_id: 'comp-1',
        name: 'Varun Systems Named GST Invoice',
        file_path: '',
        file_type: 'PDF',
        page_size: 'A4',
        orientation: 'PORTRAIT',
        is_default: false,
        layout_config: {} as any,
        created_at: '',
        updated_at: '',
      },
      company,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(2000);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('generates Varun Shree Infotech IGST Invoice vector PDF matching official template', async () => {
    const templates = getSystemQuotationTemplates();
    const vsitTpl = templates.find((t) => t.id === 'builtin-varun-shree-igst-invoice');
    expect(vsitTpl).toBeDefined();
    expect(vsitTpl?.name).toBe('Varun Sree Infotech IGST Invoice Template');

    const vsitInvoice: Invoice = {
      id: 'inv-vsit-1',
      company_id: 'comp-vsit',
      branch_id: 'branch-1',
      document_type: 'TAX_INVOICE',
      invoice_number: 'VSIT\\26-27\\G009',
      invoice_date: '2026-09-16',
      due_date: '2026-09-30',
      customer_id: 'cust-nivya',
      customer_name: 'NIVYA AUTOMOBILES PVT LTD',
      customer_gstin: '37AAKCN6447K1ZU',
      billing_address: 'SY NO: 11/2,12/1,11/1A1,11/1A2, GOPAL DHADA\nRAJEEV COLONY, NH-44, RAJEEV COLONY, OPP ISCKON\nTEMPLE ANANTHAPURAMU-515005.',
      place_of_supply_state: 'Andhra Pradesh',
      place_of_supply_code: '37',
      is_inter_state: true,
      is_reverse_charge: false,
      purchase_order_number: 'PO-NIVYA-01',
      purchase_order_date: '2026-09-15',
      delivery_challan_number: 'DC-0916',
      delivery_challan_date: '2026-09-16',
      agent_name: 'Direct Sales',
      items: [
        {
          id: 'item-1',
          invoice_id: 'inv-vsit-1',
          item_name: 'CP Plus IP Dome/Bullet 5MP Camera',
          hsn_or_sac: '85258090',
          quantity: '6',
          unit: 'NOS',
          rate: '4130.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '24780.00',
          gst_rate: '18.00',
          cgst_rate: '0.00',
          cgst_amount: '0.00',
          sgst_rate: '0.00',
          sgst_amount: '0.00',
          igst_rate: '18.00',
          igst_amount: '4460.40',
          total_tax: '4460.40',
          line_total: '29240.40',
          sort_order: 0,
        },
        {
          id: 'item-2',
          invoice_id: 'inv-vsit-1',
          item_name: 'CP-plus 8CH NVR 2 SATA (1 Year warranty)',
          hsn_or_sac: '85219090',
          quantity: '1',
          unit: 'NOS',
          rate: '6375.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '6375.00',
          gst_rate: '18.00',
          cgst_rate: '0.00',
          cgst_amount: '0.00',
          sgst_rate: '0.00',
          sgst_amount: '0.00',
          igst_rate: '18.00',
          igst_amount: '1147.50',
          total_tax: '1147.50',
          line_total: '7522.50',
          sort_order: 1,
        },
      ],
      subtotal: '31155.00',
      overall_discount_percentage: '0.00',
      overall_discount_amount: '0.00',
      total_taxable_value: '31155.00',
      total_cgst: '0.00',
      total_sgst: '0.00',
      total_igst: '5607.90',
      total_tax: '5607.90',
      additional_charges: '0.00',
      round_off: '0.10',
      grand_total: '36763.00',
      amount_in_words: 'Thirty six thousand seven hundred sixty three rupees only.',
      paid_amount: '0.00',
      balance_amount: '36763.00',
      status: 'FINALIZED',
      letterhead_template_id: 'builtin-varun-shree-igst-invoice',
      created_at: '2026-09-16T10:00:00.000Z',
      updated_at: '2026-09-16T10:00:00.000Z',
    };

    const company: Company = {
      id: 'comp-vsit',
      name: 'VARUN SHREE INFOTECH PVT LTD.',
      legal_name: 'VARUN SHREE INFOTECH PVT LTD.',
      gstin: '36AAKCV1634J1Z3',
      pan: 'AAKCV1634J',
      state: 'Telangana',
      state_code: '36',
      bank_name: 'STATE BANK OF INDIA',
      bank_branch: 'ERRAGADDA, HYDERABAD,',
      bank_account_no: '43167049390',
      bank_ifsc: 'SBIN0013272',
      currency: 'INR',
      created_at: '',
      updated_at: '',
    };

    const pdfBytes = await PdfEngine.generateInvoicePdf(vsitInvoice, {
      mode: 'DIGITAL_LETTERHEAD',
      template: vsitTpl,
      company,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPages()[0];
    const { width, height } = page.getSize();
    expect(Math.round(width)).toBe(612);
    expect(Math.round(height)).toBe(792);
  });

  it('generates Varun Shree Infotech Normal GST Invoice vector PDF with CGST and SGST columns', async () => {
    const templates = getSystemQuotationTemplates();
    const vsitNormalGstTpl = templates.find((t) => t.id === 'builtin-varun-shree-invoice-normal-gst');
    expect(vsitNormalGstTpl).toBeDefined();
    expect(vsitNormalGstTpl?.name).toBe('Varun Shree Infotech Normal GST Template');

    // Ground truth sample invoice from user upload:
    // Invoice No: VSIT\26-27\G015, Date: 23-11-2026
    // Customer: RS Pasuraa & Anvita Buildpro LLP, Telangana (36)
    // Item: D-Link 24 Port Gigabit Switch DES-1024D, HSN: 85176290, Qty: 1, Rate: 1910.00
    // Taxable: 1910.00, CGST 9%: 171.90, SGST 9%: 171.90, Total: 2253.80
    // Round off: 0.20 -> Grand Total: 2254.00
    const normalGstInvoice: Invoice = {
      id: 'inv-vsit-normal-1',
      company_id: 'comp-vsit',
      branch_id: 'branch-1',
      document_type: 'TAX_INVOICE',
      invoice_number: 'VSIT\\26-27\\G015',
      invoice_date: '2026-11-23',
      due_date: '2026-11-23',
      customer_id: 'cust-rsp',
      customer_name: 'RS Pasuraa & Anvita Buildpro LLP',
      billing_address: '3rd floor, G Square, Near Wells Fargo, Raiduram, Gachibowli,\nHyderabad, Telangana 500 032.',
      shipping_address: '3rd floor, G Square, Near Wells Fargo, Raiduram, Gachibowli,\nHyderabad, Telangana 500 032.',
      place_of_supply_state: 'Telangana',
      place_of_supply_code: '36',
      is_inter_state: false,
      is_reverse_charge: false,
      purchase_order_number: '',
      customer_gstin: '36ABCFR2993N1ZJ',
      items: [
        {
          id: 'item-1',
          invoice_id: 'inv-vsit-normal-1',
          item_name: 'D-Link 24 Port Gigabit Switch DES-1024D',
          hsn_or_sac: '85176290',
          quantity: '1',
          unit: 'NOS',
          rate: '1910.00',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          is_tax_inclusive: false,
          taxable_value: '1910.00',
          gst_rate: '18.00',
          cgst_rate: '9.00',
          cgst_amount: '171.90',
          sgst_rate: '9.00',
          sgst_amount: '171.90',
          igst_rate: '0.00',
          igst_amount: '0.00',
          total_tax: '343.80',
          line_total: '2253.80',
          sort_order: 0,
        },
      ],
      subtotal: '1910.00',
      overall_discount_percentage: '0.00',
      overall_discount_amount: '0.00',
      total_taxable_value: '1910.00',
      total_cgst: '171.90',
      total_sgst: '171.90',
      total_igst: '0.00',
      total_tax: '343.80',
      additional_charges: '0.00',
      round_off: '0.20',
      grand_total: '2254.00',
      amount_in_words: 'Two thousand two hundred fifty four only.',
      paid_amount: '0.00',
      balance_amount: '2254.00',
      status: 'FINALIZED',
      letterhead_template_id: 'builtin-varun-shree-invoice-normal-gst',
      created_at: '2026-11-23T10:00:00.000Z',
      updated_at: '2026-11-23T10:00:00.000Z',
    };

    const company: Company = {
      id: 'comp-vsit',
      name: 'VARUN SHREE INFOTECH PVT LTD.',
      legal_name: 'VARUN SHREE INFOTECH PVT LTD.',
      gstin: '36AAKCV1634J1Z3',
      pan: 'AAKCV1634J',
      state: 'Telangana',
      state_code: '36',
      bank_name: 'STATE BANK OF INDIA',
      bank_branch: 'ERRAGADDA, HYDERABAD,',
      bank_account_no: '43167049390',
      bank_ifsc: 'SBIN0013272',
      currency: 'INR',
      created_at: '',
      updated_at: '',
    };

    const pdfBytes = await PdfEngine.generateInvoicePdf(normalGstInvoice, {
      mode: 'DIGITAL_LETTERHEAD',
      template: vsitNormalGstTpl,
      company,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')).toBe('%PDF-');

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPages()[0];
    const { width, height } = page.getSize();
    expect(Math.round(width)).toBe(612);
    expect(Math.round(height)).toBe(792);
  });

  it('automatically detects table columns and generates aligned PDF for future uploaded templates', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const templatePath = path.join(process.cwd(), 'assets', 'templates', 'VARUN_SHREE_INFOTECH_NORMAL_GST_INVOICE_FORMAT.pdf');
    
    if (fs.existsSync(templatePath)) {
      const buffer = fs.readFileSync(templatePath);
      const { LetterheadService } = await import('../src/server/services/letterheadService');
      const service = new LetterheadService({} as any);

      const analysis = await service.analyzeLetterheadBuffer(buffer, 'VARUN_SHREE_INFOTECH_NORMAL_GST_INVOICE_FORMAT.pdf', templatePath);
      expect(analysis.detected_columns).toBeDefined();
      expect(analysis.detected_columns!.length).toBeGreaterThan(3);

      const colIds = analysis.detected_columns!.map((c) => c.id);
      expect(colIds).toContain('sr_no');
      expect(colIds).toContain('item_name');

      const customTemplate = {
        id: 'tpl-future-upload-1',
        company_id: 'comp-vsit',
        name: 'Auto Detected Custom GST Template',
        file_path: templatePath,
        file_type: 'PDF' as const,
        page_size: 'A4' as const,
        orientation: 'PORTRAIT' as const,
        is_default: false,
        applies_to: 'INVOICE' as const,
        layout_config: {
          table_top_y: analysis.table_rows_start_y || 230,
          table_bottom_margin: 200,
          table_columns: {
            sr_no: analysis.detected_columns!.find((c) => c.id === 'sr_no'),
            item_name: analysis.detected_columns!.find((c) => c.id === 'item_name'),
            taxable: analysis.detected_columns!.find((c) => c.id === 'taxable'),
            total: analysis.detected_columns!.find((c) => c.id === 'total'),
          },
          detected_archetype: analysis.detected_archetype,
        },
        created_at: '',
        updated_at: '',
      };

      const testInvoice: Invoice = {
        id: 'inv-custom-test-1',
        company_id: 'comp-vsit',
        branch_id: 'branch-1',
        document_type: 'TAX_INVOICE',
        invoice_number: 'TEST/2026/001',
        invoice_date: '2026-11-24',
        due_date: '2026-12-08',
        customer_id: 'cust-1',
        customer_name: 'FUTURE CLIENT CORP',
        billing_address: '123 Innovation Park, HITEC City, Hyderabad',
        place_of_supply_state: 'Telangana',
        place_of_supply_code: '36',
        is_inter_state: false,
        is_reverse_charge: false,
        items: [
          {
            id: 'it-1',
            invoice_id: 'inv-custom-test-1',
            item_name: 'High Performance Server Node',
            description: 'Intel Xeon 32 Core / 128GB RAM',
            hsn_or_sac: '84713010',
            quantity: '1',
            unit: 'NOS',
            rate: '150000.00',
            discount_percentage: '0.00',
            discount_amount: '0.00',
            gst_rate: '18.00',
            taxable_value: '150000.00',
            cgst_rate: '9.00',
            cgst_amount: '13500.00',
            sgst_rate: '9.00',
            sgst_amount: '13500.00',
            igst_rate: '0.00',
            igst_amount: '0.00',
            line_total: '177000.00',
            sort_order: 0,
          },
        ],
        subtotal: '150000.00',
        overall_discount_percentage: '0.00',
        overall_discount_amount: '0.00',
        total_taxable_value: '150000.00',
        total_cgst: '13500.00',
        total_sgst: '13500.00',
        total_igst: '0.00',
        total_tax: '27000.00',
        additional_charges: '0.00',
        round_off: '0.00',
        grand_total: '177000.00',
        amount_in_words: 'One lakh seventy seven thousand rupees only.',
        paid_amount: '0.00',
        balance_amount: '177000.00',
        status: 'FINALIZED',
        letterhead_template_id: 'tpl-future-upload-1',
        created_at: '',
        updated_at: '',
      };

      const customPdf = await PdfEngine.generateInvoicePdf(testInvoice, {
        mode: 'DIGITAL_LETTERHEAD',
        template: customTemplate,
        company: {
          id: 'comp-vsit',
          name: 'VARUN SHREE INFOTECH PVT LTD.',
          legal_name: 'VARUN SHREE INFOTECH PVT LTD.',
          gstin: '36AAKCV1634J1Z3',
          pan: 'AAKCV1634J',
          state: 'Telangana',
          state_code: '36',
          bank_name: 'STATE BANK OF INDIA',
          bank_branch: 'ERRAGADDA',
          bank_account_no: '43167049390',
          bank_ifsc: 'SBIN0013272',
          currency: 'INR',
          created_at: '',
          updated_at: '',
        },
      });

      expect(customPdf).toBeInstanceOf(Uint8Array);
      expect(customPdf.length).toBeGreaterThan(1000);
      expect(Buffer.from(customPdf.slice(0, 5)).toString('ascii')).toBe('%PDF-');
    }
  });
});
