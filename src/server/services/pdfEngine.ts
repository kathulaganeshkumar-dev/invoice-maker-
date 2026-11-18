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

    // Print ONLY dynamic document values on top of the user's uploaded template
    // (No default letterhead header, no default title banner, no opaque boxes, no default bank/signature/footer chrome)

    // 1. Document Meta Information
    const invNumY = layout?.invoice_number?.y || 120;
    const invNumX = Math.min(layout?.invoice_number?.x || 400, width - 195);
    page.drawText(`No: ${invoice.invoice_number}`, {
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
    page.drawText(`Due: ${invoice.due_date}`, {
      x: invNumX,
      y: toPdfY(dueDateY),
      size: 9,
      font: fontRegular,
    });

    const pos = layout?.place_of_supply?.y || dueDateY + 15;
    page.drawText(`POS: ${invoice.place_of_supply_state} (${invoice.place_of_supply_code})`, {
      x: invNumX,
      y: toPdfY(pos),
      size: 9,
      font: fontRegular,
    });

    // 2. Customer Details
    const custX = layout?.customer_name?.x || leftX;
    const custY = layout?.customer_name?.y || Math.max(invNumY + 10, 145);

    page.drawText(invoice.customer_name, {
      x: custX,
      y: toPdfY(custY),
      size: 10,
      font: fontBold,
    });

    if (invoice.billing_address) {
      page.drawText(invoice.billing_address, {
        x: custX,
        y: toPdfY(custY + 14),
        size: 8.5,
        font: fontRegular,
        maxWidth: 260,
      });
    }

    if (invoice.customer_gstin) {
      page.drawText(`GSTIN: ${invoice.customer_gstin}`, {
        x: custX,
        y: toPdfY(custY + 42),
        size: 8.5,
        font: fontBold,
      });
    }

    // 3. Line Items Table (transparent — never draws opaque background rectangles over uploaded template)
    const tableTop = Math.max(layout?.table_top_y || 230, custY + 62);
    let currentY = tableTop;
    const tableWidth = Math.max(460, width - leftX * 2);

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
