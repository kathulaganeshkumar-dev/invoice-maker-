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

    // 1. Company Header (Draw only if in DIGITAL mode WITHOUT an imported file background)
    if (isDigital && !hasFileBackground) {
      // Draw standard professional header
      page.drawText(options.company.name.toUpperCase(), {
        x: leftX,
        y: toPdfY(50),
        size: 16,
        font: fontBold,
        color: rgb(0.08, 0.2, 0.45),
      });

      page.drawText(options.company.registered_address, {
        x: leftX,
        y: toPdfY(68),
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });

      const taxInfo = `GSTIN: ${options.company.gstin || 'N/A'}  |  PAN: ${options.company.pan || 'N/A'}  |  Phone: ${options.company.phone}`;
      page.drawText(taxInfo, {
        x: leftX,
        y: toPdfY(82),
        size: 8,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });

      page.drawLine({
        start: { x: leftX, y: toPdfY(98) },
        end: { x: width - 45, y: toPdfY(98) },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
    }

    // 2. Document Title
    const invNumY = layout?.invoice_number?.y || 120;
    const titleY = hasFileBackground ? Math.max(invNumY - 18, 90) : 120;
    const docTitle = invoice.document_type.replace(/_/g, ' ');
    page.drawText(docTitle, {
      x: leftX,
      y: toPdfY(titleY),
      size: 13,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // 3. Invoice Meta Information
    const invNumX = Math.min(layout?.invoice_number?.x || 400, width - 195);
    page.drawText(`Invoice No: ${invoice.invoice_number}`, {
      x: invNumX,
      y: toPdfY(invNumY),
      size: 10,
      font: fontBold,
    });

    const invDateY = layout?.invoice_date?.y || invNumY + 15;
    page.drawText(`Date: ${invoice.invoice_date}`, {
      x: invNumX,
      y: toPdfY(invDateY),
      size: 9,
      font: fontRegular,
    });

    const dueDateY = layout?.due_date?.y || invDateY + 15;
    page.drawText(`Due Date: ${invoice.due_date}`, {
      x: invNumX,
      y: toPdfY(dueDateY),
      size: 9,
      font: fontRegular,
    });

    const pos = layout?.place_of_supply?.y || dueDateY + 15;
    page.drawText(`Place of Supply: ${invoice.place_of_supply_state} (${invoice.place_of_supply_code})`, {
      x: invNumX,
      y: toPdfY(pos),
      size: 9,
      font: fontRegular,
    });

    // 4. Bill To Details
    const custX = layout?.customer_name?.x || leftX;
    const custY = layout?.customer_name?.y || Math.max(titleY + 25, 145);

    page.drawText('BILLED TO:', {
      x: custX,
      y: toPdfY(custY),
      size: 8,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText(invoice.customer_name, {
      x: custX,
      y: toPdfY(custY + 14),
      size: 10,
      font: fontBold,
    });

    page.drawText(invoice.billing_address, {
      x: custX,
      y: toPdfY(custY + 28),
      size: 8.5,
      font: fontRegular,
      maxWidth: 260,
    });

    if (invoice.customer_gstin) {
      page.drawText(`GSTIN: ${invoice.customer_gstin}`, {
        x: custX,
        y: toPdfY(custY + 54),
        size: 8.5,
        font: fontBold,
      });
    }

    // 5. Line Items Table
    const tableTop = Math.max(layout?.table_top_y || 230, custY + 72);
    let currentY = tableTop;

    // Table Header Background
    const tableWidth = Math.max(460, width - leftX * 2);
    page.drawRectangle({
      x: leftX,
      y: toPdfY(currentY + 18),
      width: tableWidth,
      height: 20,
      color: rgb(0.93, 0.94, 0.96),
    });

    // Table Columns
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
        y: toPdfY(currentY + 13),
        size: 8,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.25),
      });
    }

    currentY += 26;

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

      // Row separator line
      page.drawLine({
        start: { x: leftX, y: toPdfY(rowY + 6) },
        end: { x: leftX + tableWidth, y: toPdfY(rowY + 6) },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9),
      });

      currentY += 18;
    }

    // 6. Totals Section
    const maxTotalsStart = Math.max(height - (layout?.table_bottom_margin || 220), 420);
    const totalsY = Math.min(Math.max(currentY + 15, maxTotalsStart), height - 135);

    // Amount in words box
    page.drawText('Total Amount in Words:', {
      x: leftX,
      y: toPdfY(totalsY),
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(invoice.amount_in_words, {
      x: leftX,
      y: toPdfY(totalsY + 14),
      size: 8.5,
      font: fontBold,
      maxWidth: 300,
    });

    // Bank Details
    if (options.company.bank_name) {
      page.drawText(`Bank: ${options.company.bank_name} | A/c: ${options.company.bank_account_no} | IFSC: ${options.company.bank_ifsc}`, {
        x: leftX,
        y: toPdfY(totalsY + 45),
        size: 8,
        font: fontRegular,
        color: rgb(0.25, 0.25, 0.25),
      });
    }

    // Totals Column
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

    // Grand Total Highlight Box
    page.drawRectangle({
      x: width - 220,
      y: toPdfY(totalsY + 82),
      width: 175,
      height: 24,
      color: rgb(0.9, 0.94, 0.98),
    });

    page.drawText('Grand Total:', {
      x: width - 213,
      y: toPdfY(totalsY + 74),
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.2, 0.45),
    });

    page.drawText(`Rs. ${invoice.grand_total}`, {
      x: width - 130,
      y: toPdfY(totalsY + 74),
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.2, 0.45),
    });

    // Signatures
    const sigY = Math.min(layout?.signature?.y || 740, height - 65);
    page.drawText(`For ${options.company.name}`, {
      x: width - 175,
      y: toPdfY(sigY),
      size: 9,
      font: fontBold,
    });

    page.drawText('Authorised Signatory', {
      x: width - 165,
      y: toPdfY(sigY + 45),
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Page Number
    page.drawText('Page 1 of 1', {
      x: width / 2 - 22,
      y: toPdfY(Math.min(layout?.footer?.y || height - 30, height - 18)),
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });

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
