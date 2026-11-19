// src/server/services/pdfEngine.ts - High-Fidelity Dual-Mode PDF & Print Overlay Engine
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import { Invoice, Quotation, LetterheadTemplate, Company, Branch } from '../../shared/types';
import { formatIndianCurrency } from '../finance/decimalCalc';

export interface PdfGenerationOptions {
  mode: 'DIGITAL_LETTERHEAD' | 'PREPRINTED_STATIONERY';
  template?: LetterheadTemplate;
  company: Company;
  branch?: Branch;
}

export class PdfEngine {
  /**
   * Generates a vector-accurate PDF invoice supporting both Digital letterhead backgrounds
   * and Preprinted stationery overlay.
   */
  static async generateInvoicePdf(invoice: Invoice, options: PdfGenerationOptions): Promise<Uint8Array> {
    const isDigital = options.mode === 'DIGITAL_LETTERHEAD';
    const template = options.template;
    const layout = template?.layout_config;

    let pdfDoc: PDFDocument;
    let page: PDFPage;
    let hasFileBackground = false;

    // Check if background template file (PDF / PNG / JPG) exists
    const tplPath = template?.file_path;
    const hasValidPath = Boolean(tplPath && fs.existsSync(tplPath));

    if (isDigital && hasValidPath && tplPath) {
      const ext = tplPath.toLowerCase();
      const templateBytes = fs.readFileSync(tplPath);

      if (template?.file_type === 'PDF' || ext.endsWith('.pdf')) {
        pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
        if (pdfDoc.getPageCount() > 0) {
          page = pdfDoc.getPage(0);
        } else {
          page = pdfDoc.addPage(
            template?.orientation === 'LANDSCAPE' ? [841.89, 595.28] : [595.28, 841.89]
          );
        }
        hasFileBackground = true;
      } else if (
        template?.file_type === 'PNG' ||
        template?.file_type === 'JPG' ||
        ext.endsWith('.png') ||
        ext.endsWith('.jpg') ||
        ext.endsWith('.jpeg')
      ) {
        pdfDoc = await PDFDocument.create();
        const isLandscape = template?.orientation === 'LANDSCAPE';
        page = pdfDoc.addPage(isLandscape ? [841.89, 595.28] : [595.28, 841.89]);
        const { width: pW, height: pH } = page.getSize();
        const embeddedImg =
          template?.file_type === 'PNG' || ext.endsWith('.png')
            ? await pdfDoc.embedPng(templateBytes)
            : await pdfDoc.embedJpg(templateBytes);
        page.drawImage(embeddedImg, { x: 0, y: 0, width: pW, height: pH });
        hasFileBackground = true;
      } else {
        pdfDoc = await PDFDocument.create();
        page = pdfDoc.addPage(
          template?.orientation === 'LANDSCAPE' ? [841.89, 595.28] : [595.28, 841.89]
        );
      }
    } else {
      pdfDoc = await PDFDocument.create();
      page = pdfDoc.addPage(
        template?.orientation === 'LANDSCAPE' ? [841.89, 595.28] : [595.28, 841.89]
      );
    }

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();

    // Helper: convert top-down Y coordinates to pdf-lib bottom-up Y coordinates
    const toPdfY = (topY: number) => height - topY;

    const leftX = layout?.customer_name?.x || 45;
    const tableWidth = Math.max(460, width - leftX * 2);

    // If no custom template background exists, draw clean, professional GST header & metadata
    if (!hasFileBackground) {
      // 1. Company Brand Header
      page.drawText(options.company.name || 'Enterprise Business', {
        x: leftX,
        y: toPdfY(32),
        size: 15,
        font: fontBold,
        color: rgb(0.08, 0.15, 0.28),
      });

      const compAddr = [
        options.company.registered_address,
        options.company.state ? `${options.company.state}${options.company.pin_code ? ` - ${options.company.pin_code}` : ''}` : '',
      ]
        .filter(Boolean)
        .join(', ');

      if (compAddr) {
        page.drawText(compAddr.slice(0, 75), {
          x: leftX,
          y: toPdfY(48),
          size: 8,
          font: fontRegular,
          color: rgb(0.3, 0.35, 0.4),
        });
      }

      const compContact = [
        options.company.phone ? `Phone: ${options.company.phone}` : '',
        options.company.email ? `Email: ${options.company.email}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      if (compContact) {
        page.drawText(compContact.slice(0, 75), {
          x: leftX,
          y: toPdfY(60),
          size: 7.5,
          font: fontRegular,
          color: rgb(0.35, 0.4, 0.45),
        });
      }

      const compTax = [
        `GSTIN: ${options.company.gstin || 'N/A'}`,
        options.company.pan ? `PAN: ${options.company.pan}` : '',
        options.branch?.name ? `Branch: ${options.branch.name}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      page.drawText(compTax, {
        x: leftX,
        y: toPdfY(72),
        size: 8,
        font: fontBold,
        color: rgb(0.12, 0.22, 0.38),
      });

      // Right Header: Document Title & Origin
      const docTypeStr = String(invoice.document_type || '');
      const docTitle =
        docTypeStr === 'QUOTATION'
          ? 'QUOTATION'
          : docTypeStr === 'PROFORMA_INVOICE'
          ? 'PROFORMA INVOICE'
          : docTypeStr === 'DELIVERY_CHALLAN'
          ? 'DELIVERY CHALLAN'
          : docTypeStr === 'CREDIT_NOTE'
          ? 'CREDIT NOTE'
          : docTypeStr === 'DEBIT_NOTE'
          ? 'DEBIT NOTE'
          : 'TAX INVOICE';

      page.drawText(docTitle, {
        x: width - 185,
        y: toPdfY(32),
        size: 14,
        font: fontBold,
        color: rgb(0.12, 0.35, 0.72),
      });

      page.drawText('ORIGINAL FOR RECIPIENT', {
        x: width - 185,
        y: toPdfY(47),
        size: 7.5,
        font: fontBold,
        color: rgb(0.45, 0.5, 0.55),
      });

      page.drawText(`State: ${options.company.state || ''} (${options.company.state_code || ''})`, {
        x: width - 185,
        y: toPdfY(59),
        size: 7.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });

      // Header Rule
      page.drawLine({
        start: { x: leftX, y: toPdfY(84) },
        end: { x: leftX + tableWidth, y: toPdfY(84) },
        thickness: 1,
        color: rgb(0.2, 0.38, 0.68),
      });
    }

    // Print dynamic document values (respects uploaded template layout if present)
    const baseMetaY = hasFileBackground ? (layout?.invoice_number?.y || 120) : 98;
    const invNumX = Math.min(layout?.invoice_number?.x || 390, width - 195);

    // 1. Document Meta Information
    page.drawText(`No: ${invoice.invoice_number}`, {
      x: invNumX,
      y: toPdfY(baseMetaY),
      size: 9.5,
      font: fontBold,
    });

    const invDateY = hasFileBackground ? (layout?.invoice_date?.y || baseMetaY + 15) : baseMetaY + 14;
    page.drawText(`Date: ${invoice.invoice_date}`, {
      x: invNumX,
      y: toPdfY(invDateY),
      size: 8.5,
      font: fontRegular,
    });

    const dueDateY = hasFileBackground ? (layout?.due_date?.y || invDateY + 15) : invDateY + 14;
    page.drawText(`Due: ${invoice.due_date}`, {
      x: invNumX,
      y: toPdfY(dueDateY),
      size: 8.5,
      font: fontRegular,
    });

    const pos = hasFileBackground ? (layout?.place_of_supply?.y || dueDateY + 15) : dueDateY + 14;
    page.drawText(`POS: ${invoice.place_of_supply_state} (${invoice.place_of_supply_code})`, {
      x: invNumX,
      y: toPdfY(pos),
      size: 8.5,
      font: fontRegular,
    });

    if (invoice.created_by_device_name) {
      page.drawText(`Prepared By: ${invoice.created_by_device_name.slice(0, 24)}`, {
        x: invNumX,
        y: toPdfY(pos + 13),
        size: 7.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      });
    }

    // 2. Customer Details
    const custX = layout?.customer_name?.x || leftX;
    const custY = hasFileBackground ? (layout?.customer_name?.y || Math.max(baseMetaY + 10, 145)) : baseMetaY;

    if (!hasFileBackground) {
      page.drawText('BILLED TO / CUSTOMER:', {
        x: custX,
        y: toPdfY(custY),
        size: 7.5,
        font: fontBold,
        color: rgb(0.35, 0.4, 0.45),
      });
    }

    const custNameY = !hasFileBackground ? custY + 13 : custY;
    page.drawText(invoice.customer_name, {
      x: custX,
      y: toPdfY(custNameY),
      size: 9.5,
      font: fontBold,
    });

    if (invoice.billing_address) {
      page.drawText(invoice.billing_address.slice(0, 120), {
        x: custX,
        y: toPdfY(custNameY + 13),
        size: 8,
        font: fontRegular,
        maxWidth: 260,
      });
    }

    if (invoice.customer_gstin) {
      page.drawText(`GSTIN: ${invoice.customer_gstin}`, {
        x: custX,
        y: toPdfY(custNameY + 38),
        size: 8,
        font: fontBold,
      });
    }

    // 3. Line Items Table
    const tableTop = hasFileBackground
      ? Math.max(layout?.table_top_y || 230, custY + 62)
      : Math.max(172, custNameY + 54);
    let currentY = tableTop;

    if (!hasFileBackground) {
      page.drawRectangle({
        x: leftX,
        y: toPdfY(currentY + 16),
        width: tableWidth,
        height: 19,
        color: rgb(0.93, 0.95, 0.98),
      });
    }

    const cols = [
      { name: '#', x: leftX + 5 },
      { name: 'Item Description', x: leftX + 30 },
      { name: 'HSN/SAC', x: leftX + 205 },
      { name: 'Qty', x: leftX + 265 },
      { name: 'Rate (Rs)', x: leftX + 310 },
      { name: 'Taxable (Rs)', x: leftX + 370 },
      { name: 'GST %', x: leftX + 430 },
      { name: 'Total (Rs)', x: leftX + 465 },
    ];

    for (const c of cols) {
      page.drawText(c.name, {
        x: c.x,
        y: toPdfY(currentY + 12),
        size: 8,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.25),
      });
    }

    page.drawLine({
      start: { x: leftX, y: toPdfY(currentY + 17) },
      end: { x: leftX + tableWidth, y: toPdfY(currentY + 17) },
      thickness: 0.75,
      color: rgb(0.75, 0.75, 0.75),
    });

    currentY += 28;

    // Render Items
    for (let i = 0; i < invoice.items.length; i++) {
      const it = invoice.items[i];
      const rowY = currentY;

      page.drawText((i + 1).toString(), { x: leftX + 5, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(it.item_name.substring(0, 35), { x: leftX + 30, y: toPdfY(rowY), size: 8.5, font: fontBold });
      page.drawText(it.hsn_or_sac || '-', { x: leftX + 205, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(`${it.quantity} ${it.unit}`, { x: leftX + 265, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(it.rate, { x: leftX + 310, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(it.taxable_value, { x: leftX + 370, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(`${it.gst_rate}%`, { x: leftX + 430, y: toPdfY(rowY), size: 8, font: fontRegular });
      page.drawText(it.line_total, { x: leftX + 465, y: toPdfY(rowY), size: 8.5, font: fontBold });

      let noteBottomY = rowY;
      if (it.description && it.description.trim()) {
        const rawLines = it.description
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        for (const line of rawLines) {
          noteBottomY += 10;
          page.drawText(line.substring(0, 46), {
            x: leftX + 30,
            y: toPdfY(noteBottomY),
            size: 7,
            font: fontRegular,
            color: rgb(0.35, 0.35, 0.35),
          });
        }
      }

      page.drawLine({
        start: { x: leftX, y: toPdfY(noteBottomY + 6) },
        end: { x: leftX + tableWidth, y: toPdfY(noteBottomY + 6) },
        thickness: 0.5,
        color: rgb(0.88, 0.88, 0.88),
      });

      currentY = noteBottomY + 18;
    }

    // 4. Totals Section (transparent text — respects uploaded template layout)
    const maxTotalsStart = Math.max(height - (layout?.table_bottom_margin || 220), 420);
    const totalsY = Math.min(Math.max(currentY + 15, maxTotalsStart), height - 135);

    if (invoice.amount_in_words) {
      page.drawText(invoice.amount_in_words, {
        x: leftX,
        y: toPdfY(totalsY + 8),
        size: 8.5,
        font: fontBold,
        maxWidth: 300,
      });
    }

    const totLabelX = width - 215;
    const totValX = width - 95;

    page.drawText('Taxable Value:', { x: totLabelX, y: toPdfY(totalsY), size: 8.5, font: fontRegular });
    page.drawText(`Rs. ${invoice.total_taxable_value}`, { x: totValX, y: toPdfY(totalsY), size: 8.5, font: fontRegular });

    if (invoice.is_inter_state) {
      page.drawText('IGST:', { x: totLabelX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
      page.drawText(`Rs. ${invoice.total_igst}`, { x: totValX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
    } else {
      page.drawText('CGST:', { x: totLabelX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
      page.drawText(`Rs. ${invoice.total_cgst}`, { x: totValX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });

      page.drawText('SGST:', { x: totLabelX, y: toPdfY(totalsY + 30), size: 8.5, font: fontRegular });
      page.drawText(`Rs. ${invoice.total_sgst}`, { x: totValX, y: toPdfY(totalsY + 30), size: 8.5, font: fontRegular });
    }

    if (Number(invoice.round_off) !== 0) {
      page.drawText('Round Off:', { x: totLabelX, y: toPdfY(totalsY + 45), size: 8.5, font: fontRegular });
      page.drawText(`Rs. ${invoice.round_off}`, { x: totValX, y: toPdfY(totalsY + 45), size: 8.5, font: fontRegular });
    }

    page.drawLine({
      start: { x: width - 220, y: toPdfY(totalsY + 56) },
      end: { x: width - 45, y: toPdfY(totalsY + 56) },
      thickness: 0.75,
      color: rgb(0.65, 0.65, 0.65),
    });

    page.drawText('Grand Total:', {
      x: width - 215,
      y: toPdfY(totalsY + 72),
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.15, 0.25),
    });

    page.drawText(`Rs. ${invoice.grand_total}`, {
      x: width - 130,
      y: toPdfY(totalsY + 72),
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.15, 0.25),
    });

    if (!hasFileBackground) {
      // Bank details for payment
      const compBank = options.company.bank_name || options.company.bank_account_no;
      if (compBank) {
        page.drawText('BANK PAYMENT DETAILS:', {
          x: leftX,
          y: toPdfY(totalsY + 28),
          size: 7.5,
          font: fontBold,
          color: rgb(0.3, 0.35, 0.4),
        });
        page.drawText(
          `Bank: ${options.company.bank_name || '-'} | A/C: ${options.company.bank_account_no || '-'} | IFSC: ${options.company.bank_ifsc || '-'}`,
          {
            x: leftX,
            y: toPdfY(totalsY + 40),
            size: 7.5,
            font: fontRegular,
            color: rgb(0.3, 0.35, 0.4),
          }
        );
      }

      // Terms & notes if any
      const terms = invoice.terms_conditions || options.company.default_invoice_terms;
      if (terms) {
        page.drawText('TERMS & CONDITIONS:', {
          x: leftX,
          y: toPdfY(totalsY + 54),
          size: 7,
          font: fontBold,
          color: rgb(0.4, 0.45, 0.5),
        });
        page.drawText(terms.slice(0, 90), {
          x: leftX,
          y: toPdfY(totalsY + 64),
          size: 6.5,
          font: fontRegular,
          color: rgb(0.4, 0.45, 0.5),
        });
      }

      // Authorized Signatory
      page.drawText(`For ${options.company.name || 'Company'}`, {
        x: width - 180,
        y: toPdfY(totalsY + 98),
        size: 8,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.2),
      });

      page.drawText('[ Authorized Signatory ]', {
        x: width - 180,
        y: toPdfY(totalsY + 120),
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.5, 0.55),
      });

      // Bottom computer generated footnote
      page.drawText('This is a computer generated document and does not require a physical signature.', {
        x: leftX,
        y: toPdfY(height - 18),
        size: 6.5,
        font: fontRegular,
        color: rgb(0.55, 0.6, 0.65),
      });
    }

    return await pdfDoc.save();
  }

  /**
   * Generates a vector-accurate PDF for Quotations
   */
  static async generateQuotationPdf(quotation: Quotation, options: PdfGenerationOptions): Promise<Uint8Array> {
    const adaptedInvoice: any = {
      ...quotation,
      document_type: 'QUOTATION',
      invoice_number: quotation.quotation_number,
      invoice_date: quotation.quotation_date,
      due_date: quotation.valid_until_date,
      paid_amount: '0.00',
      balance_amount: quotation.grand_total,
      items: quotation.items.map((it: any) => ({
        ...it,
        item_name: it.item_name || 'Item',
        hsn_or_sac: it.hsn_or_sac || '',
        quantity: it.quantity,
        unit: it.unit || 'NOS',
        rate: it.rate,
        discount_percentage: it.discount_percentage || '0.00',
        discount_amount: it.discount_amount || '0.00',
        gst_rate: it.gst_rate || '18.00',
        taxable_value: it.taxable_value,
        total_tax: it.total_tax,
        line_total: it.line_total,
      })),
    };
    return this.generateInvoicePdf(adaptedInvoice, options);
  }
}
