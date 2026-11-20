// src/server/services/pdfEngine.ts - High-Fidelity Dual-Mode PDF & Print Overlay Engine
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';
import { Invoice, Quotation, LetterheadTemplate, Company, Branch } from '../../shared/types';
import { formatIndianCurrency } from '../finance/decimalCalc';

function getLocalFontPaths(): { regular?: string; bold?: string } {
  const resourcesPath = (process as any).resourcesPath || '';
  const candidatesRegular = [
    path.join(process.cwd(), 'assets', 'fonts', 'AppFont-Regular.ttf'),
    path.join(resourcesPath, 'assets', 'fonts', 'AppFont-Regular.ttf'),
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ];
  const candidatesBold = [
    path.join(process.cwd(), 'assets', 'fonts', 'AppFont-Bold.ttf'),
    path.join(resourcesPath, 'assets', 'fonts', 'AppFont-Bold.ttf'),
    'C:\\Windows\\Fonts\\segoeuib.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
  ];
  const regular = candidatesRegular.find((p) => fs.existsSync(p));
  const bold = candidatesBold.find((p) => fs.existsSync(p));
  return { regular, bold };
}

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

    let fontRegular: any;
    let fontBold: any;
    let currencySymbol = 'Rs.';

    const fontPaths = getLocalFontPaths();
    if (fontPaths.regular && fontPaths.bold) {
      try {
        const fontkit = require('@pdf-lib/fontkit');
        pdfDoc.registerFontkit(fontkit);
        const regBytes = fs.readFileSync(fontPaths.regular);
        const boldBytes = fs.readFileSync(fontPaths.bold);
        fontRegular = await pdfDoc.embedFont(regBytes);
        fontBold = await pdfDoc.embedFont(boldBytes);
        currencySymbol = '₹';
      } catch {
        fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        currencySymbol = 'Rs.';
      }
    } else {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      currencySymbol = 'Rs.';
    }

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
    page.drawText(`${currencySymbol} ${invoice.total_taxable_value}`, { x: totValX, y: toPdfY(totalsY), size: 8.5, font: fontRegular });

    if (invoice.is_inter_state) {
      page.drawText('IGST:', { x: totLabelX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
      page.drawText(`${currencySymbol} ${invoice.total_igst}`, { x: totValX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
    } else {
      page.drawText('CGST:', { x: totLabelX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });
      page.drawText(`${currencySymbol} ${invoice.total_cgst}`, { x: totValX, y: toPdfY(totalsY + 15), size: 8.5, font: fontRegular });

      page.drawText('SGST:', { x: totLabelX, y: toPdfY(totalsY + 30), size: 8.5, font: fontRegular });
      page.drawText(`${currencySymbol} ${invoice.total_sgst}`, { x: totValX, y: toPdfY(totalsY + 30), size: 8.5, font: fontRegular });
    }

    if (Number(invoice.round_off) !== 0) {
      page.drawText('Round Off:', { x: totLabelX, y: toPdfY(totalsY + 45), size: 8.5, font: fontRegular });
      page.drawText(`${currencySymbol} ${invoice.round_off}`, { x: totValX, y: toPdfY(totalsY + 45), size: 8.5, font: fontRegular });
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

    page.drawText(`${currencySymbol} ${invoice.grand_total}`, {
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
   * Generates a 1-page Physical Letterhead Ruler Calibration PDF
   * Contains millimeter and point grid lines so users can print directly onto their
   * physical stationery and measure exact topMarginMm and bottomMarginMm clearances.
   */
  static async generateLetterheadCalibrationPdf(): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    let fontRegular: any;
    let fontBold: any;

    try {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    } catch {
      fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    }

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const MM_TO_PT = 2.83464567;
    const toPdfY = (topY: number) => height - topY;

    // Background subtle border
    page.drawRectangle({
      x: 10,
      y: 10,
      width: width - 20,
      height: height - 20,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    // 1. Top Ruler (0 mm to 100 mm from top edge)
    const topMaxMm = 100;
    for (let mm = 0; mm <= topMaxMm; mm++) {
      const y = toPdfY(mm * MM_TO_PT);
      const is10 = mm % 10 === 0;
      const is5 = mm % 5 === 0;
      const isDefault = mm === 55;
      const tickW = isDefault ? 28 : is10 ? 20 : is5 ? 12 : 6;

      // Left tick
      page.drawLine({
        start: { x: 0, y },
        end: { x: tickW, y },
        thickness: isDefault ? 1.5 : is10 ? 1 : 0.5,
        color: isDefault ? rgb(0.85, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
      });

      // Right tick
      page.drawLine({
        start: { x: width - tickW, y },
        end: { x: width, y },
        thickness: isDefault ? 1.5 : is10 ? 1 : 0.5,
        color: isDefault ? rgb(0.85, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
      });

      // Label every 10 mm
      if (is10 || isDefault) {
        const lbl = isDefault ? '55 mm (DEFAULT TOP)' : `${mm} mm`;
        const f = isDefault ? fontBold : fontRegular;
        const color = isDefault ? rgb(0.85, 0.1, 0.1) : rgb(0.3, 0.3, 0.3);
        page.drawText(lbl, {
          x: tickW + 4,
          y: y - 3,
          size: isDefault ? 7.5 : 6.5,
          font: f,
          color,
        });
      }
    }

    // Default Top Clearance Guide Line (55 mm)
    const topGuideY = toPdfY(55 * MM_TO_PT);
    page.drawLine({
      start: { x: 30, y: topGuideY },
      end: { x: width - 30, y: topGuideY },
      thickness: 1,
      color: rgb(0.85, 0.15, 0.15),
    });
    page.drawText('--- DEFAULT TOP LETTERHEAD CLEARANCE (55 mm / 155.9 pt) ---', {
      x: 160,
      y: topGuideY + 4,
      size: 7.5,
      font: fontBold,
      color: rgb(0.85, 0.15, 0.15),
    });

    // 2. Bottom Ruler (0 mm to 60 mm from bottom edge upwards)
    const botMaxMm = 60;
    for (let mm = 0; mm <= botMaxMm; mm++) {
      const y = mm * MM_TO_PT;
      const is10 = mm % 10 === 0;
      const is5 = mm % 5 === 0;
      const isDefault = mm === 32;
      const tickW = isDefault ? 28 : is10 ? 20 : is5 ? 12 : 6;

      // Left tick
      page.drawLine({
        start: { x: 0, y },
        end: { x: tickW, y },
        thickness: isDefault ? 1.5 : is10 ? 1 : 0.5,
        color: isDefault ? rgb(0.1, 0.4, 0.85) : rgb(0.2, 0.2, 0.2),
      });

      // Right tick
      page.drawLine({
        start: { x: width - tickW, y },
        end: { x: width, y },
        thickness: isDefault ? 1.5 : is10 ? 1 : 0.5,
        color: isDefault ? rgb(0.1, 0.4, 0.85) : rgb(0.2, 0.2, 0.2),
      });

      // Label every 10 mm or at default (32 mm)
      if (is10 || isDefault) {
        const lbl = isDefault ? '32 mm (DEFAULT BOTTOM)' : `${mm} mm`;
        const f = isDefault ? fontBold : fontRegular;
        const color = isDefault ? rgb(0.1, 0.4, 0.85) : rgb(0.3, 0.3, 0.3);
        page.drawText(lbl, {
          x: tickW + 4,
          y: y - 3,
          size: isDefault ? 7.5 : 6.5,
          font: f,
          color,
        });
      }
    }

    // Default Bottom Clearance Guide Line (32 mm)
    const botGuideY = 32 * MM_TO_PT;
    page.drawLine({
      start: { x: 30, y: botGuideY },
      end: { x: width - 30, y: botGuideY },
      thickness: 1,
      color: rgb(0.1, 0.4, 0.85),
    });
    page.drawText('--- DEFAULT BOTTOM LETTERHEAD FOOTER CLEARANCE (32 mm / 90.7 pt) ---', {
      x: 145,
      y: botGuideY + 4,
      size: 7.5,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.85),
    });

    // 3. Side Margins Guide (15 mm Left & Right)
    const leftMarginX = 15 * MM_TO_PT;
    const rightMarginX = width - (15 * MM_TO_PT);

    page.drawLine({
      start: { x: leftMarginX, y: botGuideY },
      end: { x: leftMarginX, y: topGuideY },
      thickness: 0.5,
      color: rgb(0.2, 0.65, 0.3),
    });
    page.drawLine({
      start: { x: rightMarginX, y: botGuideY },
      end: { x: rightMarginX, y: topGuideY },
      thickness: 0.5,
      color: rgb(0.2, 0.65, 0.3),
    });

    // 4. Instructions in the Center
    const centerY = (topGuideY + botGuideY) / 2;

    page.drawText('VARUN SYSTEMS', {
      x: 230,
      y: centerY + 130,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.15, 0.25),
    });
    page.drawText('PHYSICAL LETTERHEAD RULER CALIBRATION SHEET', {
      x: 140,
      y: centerY + 110,
      size: 11,
      font: fontBold,
      color: rgb(0.25, 0.3, 0.4),
    });

    const instructions = [
      'HOW TO CALIBRATE YOUR PRE-PRINTED PHYSICAL STATIONERY:',
      '',
      '1. Feed your pre-printed physical letterhead paper into your printer.',
      '2. Print this calibration page at 100% scale (Do NOT choose "Fit to Printable Area").',
      '3. Hold the printed sheet against light or inspect the top header:',
      '   - Look at the top ruler to find where your printed logo/header ends.',
      '   - The default clearance is set to 55 mm (red dashed line).',
      '4. Inspect the bottom footer address block:',
      '   - Look at the bottom ruler to find where your printed footer/contact details begin.',
      '   - The default clearance is set to 32 mm (blue dashed line).',
      '5. Side margins are set to 15 mm on both left and right (green lines).',
      '6. Enter these exact millimeter measurements in the Quotation form or Software Settings',
      '   to achieve 100% laser-precise alignment on your physical letterhead stationery.',
      '',
      'NOTE: The software does NOT print any digital company logo or header banner by default,',
      'ensuring your pre-printed stationery is never double-printed or smudged.',
    ];

    let instY = centerY + 75;
    for (const line of instructions) {
      const isHeader = line.startsWith('HOW') || line.startsWith('NOTE');
      page.drawText(line, {
        x: 65,
        y: instY,
        size: isHeader ? 8.5 : 8,
        font: isHeader ? fontBold : fontRegular,
        color: isHeader ? rgb(0.1, 0.1, 0.1) : rgb(0.3, 0.35, 0.4),
      });
      instY -= 14;
    }

    return await pdfDoc.save();
  }

  /**
   * Generates a vector-accurate PDF matching the Varun Systems Word document quotation template
   * Supports both GST and Without-GST formats with clean vector table lines and pagination.
   * By default, leaves exact clearances (top 55mm, bottom 32mm) for physical pre-printed letterhead.
   */
  static async generateVarunQuotationPdf(
    quotation: Quotation,
    options: PdfGenerationOptions,
    isGst: boolean = true
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    let fontRegular: any;
    let fontBold: any;
    let fontItalic: any;

    const fontPaths = getLocalFontPaths();
    if (fontPaths.regular && fontPaths.bold) {
      try {
        const fontkit = require('@pdf-lib/fontkit');
        pdfDoc.registerFontkit(fontkit);
        const regBytes = fs.readFileSync(fontPaths.regular);
        const boldBytes = fs.readFileSync(fontPaths.bold);
        fontRegular = await pdfDoc.embedFont(regBytes);
        fontBold = await pdfDoc.embedFont(boldBytes);
        fontItalic = fontRegular;
      } catch {
        fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      }
    } else {
      fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    }

    const formatAmt = (val: any) => {
      const n = Number(val || 0);
      return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDate = (d?: string) => {
      if (!d) return '';
      const clean = d.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return d;
    };

    const MM_TO_PT = 2.83464567;
    // Configurable letterhead clearances (defaults: Top 55mm, Bottom 32mm, Left 15mm, Right 15mm)
    const topMarginMm = quotation.top_margin_mm !== undefined ? Number(quotation.top_margin_mm) : 55.0;
    const bottomMarginMm = quotation.bottom_margin_mm !== undefined ? Number(quotation.bottom_margin_mm) : 32.0;
    const leftMarginMm = quotation.left_margin_mm !== undefined ? Number(quotation.left_margin_mm) : 15.0;
    const rightMarginMm = quotation.right_margin_mm !== undefined ? Number(quotation.right_margin_mm) : 15.0;

    const topMarginPt = topMarginMm * MM_TO_PT;
    const bottomMarginPt = bottomMarginMm * MM_TO_PT;
    const leftX = leftMarginMm * MM_TO_PT;
    const rightMarginPt = rightMarginMm * MM_TO_PT;

    const pageWidthPt = 595.28;
    const pageHeightPt = 841.89;
    const tableWidth = pageWidthPt - leftX - rightMarginPt; // 510.24 pt on A4 with 15mm margins
    const rightX = leftX + tableWidth;

    // 8-Column GST Format matching the Word document and customer sample
    const cols = isGst
      ? [
          { name: 'Sl.No', width: 26, align: 'center' },
          { name: 'Description of Goods', width: tableWidth - (26 + 30 + 58 + 74 + 32 + 58 + 72), align: 'left' },
          { name: 'Units', width: 30, align: 'center' },
          { name: 'Base rate', width: 58, align: 'right' },
          { name: 'Taxable Amount', width: 74, align: 'right' },
          { name: 'GST %', width: 32, align: 'center' },
          { name: 'GST Amount', width: 58, align: 'right' },
          { name: 'Total Amount', width: 72, align: 'right' },
        ]
      : [
          { name: 'Sl.No', width: 35, align: 'center' },
          { name: 'Description of Goods', width: tableWidth - (35 + 45 + 115 + 115), align: 'left' },
          { name: 'Units', width: 45, align: 'center' },
          { name: 'Base rate', width: 115, align: 'right' },
          { name: 'Total Amount', width: 115, align: 'right' },
        ];

    let page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    const { width, height } = page.getSize();
    const toPdfY = (topY: number) => height - topY;

    // Optional Digital Letterhead Overlay (ONLY if explicitly enabled)
    const renderDigitalOverlay = Boolean(quotation.print_letterhead_overlay || (options as any).showOverlay);
    if (renderDigitalOverlay && options.template?.file_path && fs.existsSync(options.template.file_path)) {
      try {
        const bgBytes = fs.readFileSync(options.template.file_path);
        const bgDoc = await PDFDocument.load(bgBytes);
        const [bgPage] = await pdfDoc.embedPages([bgDoc.getPages()[0]]);
        page.drawPage(bgPage, { x: 0, y: 0, width, height });
      } catch {
        // Overlay fallback ignored
      }
    }

    const drawHeader = (isContinuation: boolean = false) => {
      // Starting vertical coordinate below the physical letterhead header
      const startContentY = topMarginPt;

      // 1. Centered QUOTATION Title
      const titleText = isContinuation ? 'QUOTATION (Continued)' : 'QUOTATION';
      const titleSize = isContinuation ? 12 : 15;
      const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
      const titleX = (width - titleWidth) / 2;
      const titleY = startContentY + 6;

      page.drawText(titleText, {
        x: titleX,
        y: toPdfY(titleY),
        size: titleSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: titleX, y: toPdfY(titleY + 3) },
        end: { x: titleX + titleWidth, y: toPdfY(titleY + 3) },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      if (!isContinuation) {
        // 2. Top Right: Quotation No & Date
        const metaX = rightX - 160;
        const qNo = quotation.quotation_number || 'VS-QT-001';
        page.drawText(`Quotation No ${qNo}`, {
          x: metaX,
          y: toPdfY(startContentY + 28),
          size: 9.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
        page.drawText(`Date: ${formatDate(quotation.quotation_date)}`, {
          x: metaX,
          y: toPdfY(startContentY + 42),
          size: 9.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        // 3. Top Left: Recipient Block (To,)
        page.drawText('To,', {
          x: leftX,
          y: toPdfY(startContentY + 32),
          size: 9.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        const custName = quotation.customer_name || 'Customer';
        page.drawText(custName, {
          x: leftX,
          y: toPdfY(startContentY + 46),
          size: 9.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        let custOffset = startContentY + 59;
        if (quotation.billing_address) {
          const addrLines = quotation.billing_address
            .split(/[\r\n]+/)
            .map((l) => l.trim())
            .filter(Boolean);
          for (const line of addrLines.slice(0, 3)) {
            page.drawText(line.slice(0, 75), {
              x: leftX,
              y: toPdfY(custOffset),
              size: 8.5,
              font: fontRegular,
              color: rgb(0, 0, 0),
            });
            custOffset += 12;
          }
        }

        if (quotation.customer_gstin) {
          page.drawText(`GSTIN: ${quotation.customer_gstin}`, {
            x: leftX,
            y: toPdfY(custOffset),
            size: 8.5,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
          custOffset += 12;
        }

        // 4. Salutation & Formal Opening
        const salutationY = Math.max(custOffset + 6, startContentY + 76);
        const salutation = quotation.salutation || 'Dear Sir,';
        page.drawText(salutation, {
          x: leftX,
          y: toPdfY(salutationY),
          size: 9.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        const openingText =
          quotation.opening_text ||
          'With the reference to your enquiry, we are herewith quoting our lowest and best possible prices of the following.';
        page.drawText(openingText, {
          x: leftX,
          y: toPdfY(salutationY + 14),
          size: 8.5,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });

        return salutationY + 30;
      }

      return startContentY + 24;
    };

    const drawTableHeader = (startY: number) => {
      const headerH = 22;
      // Pure crisp transparent background (remove any gray/color shading)

      let curColX = leftX;
      for (const c of cols) {
        let fontSize = 7.5;
        let textW = fontBold.widthOfTextAtSize(c.name, fontSize);
        while (textW > c.width - 6 && fontSize > 5.5) {
          fontSize -= 0.5;
          textW = fontBold.widthOfTextAtSize(c.name, fontSize);
        }
        // Center all column titles inside their header cell to avoid header text overlap
        let textX = curColX + (c.width - textW) / 2;
        if (textX < curColX + 2) textX = curColX + 2;

        page.drawText(c.name, {
          x: textX,
          y: toPdfY(startY + 15),
          size: fontSize,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
        curColX += c.width;
      }

      // Outer & Divider Lines: Solid black with uniform 0.75 thickness (no blur)
      page.drawLine({ start: { x: leftX, y: toPdfY(startY) }, end: { x: rightX, y: toPdfY(startY) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: leftX, y: toPdfY(startY + headerH) }, end: { x: rightX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      let divX = leftX;
      page.drawLine({ start: { x: leftX, y: toPdfY(startY) }, end: { x: leftX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      for (const c of cols) {
        divX += c.width;
        page.drawLine({ start: { x: divX, y: toPdfY(startY) }, end: { x: divX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      }

      return startY + headerH;
    };

    let currentY = drawHeader(false);
    currentY = drawTableHeader(currentY);

    // Render Table Items with Multi-line Wrapping
    const splitTextToLines = (text: string, maxWidth: number, font: any, size: number): string[] => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';

      for (const w of words) {
        const testLine = currentLine ? `${currentLine} ${w}` : w;
        const testW = font.widthOfTextAtSize(testLine, size);
        if (testW <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = w;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    const descColWidth = cols.find((c) => c.name === 'Description of Goods')?.width || 180;

    for (let i = 0; i < quotation.items.length; i++) {
      const it = quotation.items[i];
      const itemTitle = it.item_name || 'Item';
      const itemDesc = it.description || '';
      const fullText = itemDesc ? `${itemTitle}\n${itemDesc}` : itemTitle;
      const rawLines = fullText.split(/[\r\n]+/);
      const wrappedLines: string[] = [];

      for (const r of rawLines) {
        const wrapped = splitTextToLines(r, descColWidth - 8, fontRegular, 7.5);
        wrappedLines.push(...wrapped);
      }

      const lineCount = Math.max(wrappedLines.length, 1);
      const rowHeight = Math.max(lineCount * 11 + 9, 20);

      // Check remaining space against bottom margin clearance
      if (currentY + rowHeight > height - bottomMarginPt - 130) {
        page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
        currentY = drawHeader(true);
        currentY = drawTableHeader(currentY);
      }

      const rowStartY = currentY;

      // Draw Cells
      let colX = leftX;
      cols.forEach((c, cIdx) => {
        if (c.name === 'Description of Goods') {
          let lineY = rowStartY + 10;
          for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
            const lText = wrappedLines[lIdx];
            const isFirst = lIdx === 0;
            page.drawText(lText, {
              x: colX + 4,
              y: toPdfY(lineY),
              size: 7.5,
              font: isFirst ? fontBold : fontRegular,
              color: rgb(0, 0, 0),
            });
            lineY += 11;
          }
        } else {
          let cellText = '';
          if (c.name === 'Sl.No') {
            cellText = (i + 1).toString() + '.';
          } else if (c.name === 'Units') {
            cellText = it.units || (Number(it.quantity) < 10 ? `0${it.quantity}` : `${it.quantity}`);
          } else if (c.name === 'Base rate') {
            cellText = formatAmt(it.base_rate || it.rate);
          } else if (c.name === 'Taxable Amount') {
            cellText = formatAmt(it.taxable_amount || it.taxable_value);
          } else if (c.name === 'GST %') {
            cellText = Number(it.gst_rate || 0).toString();
          } else if (c.name === 'GST Amount') {
            cellText = formatAmt(it.gst_amount || it.total_tax);
          } else if (c.name === 'Total Amount') {
            cellText = formatAmt(it.total_amount || it.line_total);
          }

          let textX = colX + 4;
          const textW = fontRegular.widthOfTextAtSize(cellText, 8);
          if (c.align === 'center') textX = colX + (c.width - textW) / 2;
          if (c.align === 'right') textX = colX + c.width - textW - 4;

          page.drawText(cellText, {
            x: textX,
            y: toPdfY(rowStartY + 12),
            size: 8,
            font: fontRegular,
            color: rgb(0, 0, 0),
          });
        }

        colX += c.width;
      });

      // Bottom Row Divider (Solid crisp black line, uniform 0.75pt thickness)
      page.drawLine({
        start: { x: leftX, y: toPdfY(rowStartY + rowHeight) },
        end: { x: rightX, y: toPdfY(rowStartY + rowHeight) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });

      // Vertical Cell Dividers (Crisp solid black lines, no blur)
      let rDivX = leftX;
      page.drawLine({ start: { x: leftX, y: toPdfY(rowStartY) }, end: { x: leftX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });
      for (const c of cols) {
        rDivX += c.width;
        page.drawLine({ start: { x: rDivX, y: toPdfY(rowStartY) }, end: { x: rDivX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });
      }
      page.drawLine({ start: { x: rightX, y: toPdfY(rowStartY) }, end: { x: rightX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });

      currentY += rowHeight;
    }

    // Check space for Summary Totals & Terms
    if (currentY + 160 > height - bottomMarginPt) {
      page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      currentY = topMarginPt + 20;
    }

    // Totals Rows (TOTAL, Round Off, Grand Total)
    const totalsColsSpanWidth = cols.slice(0, cols.length - 1).reduce((acc, c) => acc + c.width, 0);

    // TOTAL row = sum of all products' Total Amount (Taxable Amount + GST Amount)
    let productsTotalDec = new Decimal(0);
    if (quotation.items && quotation.items.length > 0) {
      for (const it of quotation.items) {
        const itemLineTotal =
          it.total_amount ||
          it.line_total ||
          new Decimal(it.taxable_amount || it.taxable_value || 0)
            .add(new Decimal(it.gst_amount || it.total_tax || 0))
            .toFixed(2);
        productsTotalDec = productsTotalDec.add(new Decimal(itemLineTotal || 0));
      }
    } else {
      productsTotalDec = new Decimal(quotation.total_taxable_value || quotation.subtotal || 0).add(
        new Decimal(quotation.total_tax || quotation.gst_total || 0)
      );
    }

    const totalOfAllProducts = productsTotalDec.toFixed(2);
    const roundOffDec = new Decimal(quotation.round_off || 0);
    const roundOffVal = roundOffDec.toFixed(2);
    // Grand Total = Total Amount of all products + Round Off
    const grandTotalVal = productsTotalDec.add(roundOffDec).toFixed(2);

    const summaryRows = [
      { label: 'TOTAL', val: formatAmt(totalOfAllProducts), isBold: true },
      { label: 'Round Off', val: formatAmt(roundOffVal), isBold: false },
      { label: 'Grand Total', val: formatAmt(grandTotalVal), isBold: true },
    ];

    for (const s of summaryRows) {
      const sH = 17;
      const sY = currentY;

      const labelW = (s.isBold ? fontBold : fontRegular).widthOfTextAtSize(s.label, 8.5);
      page.drawText(s.label, {
        x: leftX + totalsColsSpanWidth - labelW - 6,
        y: toPdfY(sY + 11.5),
        size: 8.5,
        font: s.isBold ? fontBold : fontRegular,
        color: rgb(0, 0, 0),
      });

      const valW = (s.isBold ? fontBold : fontRegular).widthOfTextAtSize(s.val, 8.5);
      page.drawText(s.val, {
        x: rightX - valW - 4,
        y: toPdfY(sY + 11.5),
        size: 8.5,
        font: s.isBold ? fontBold : fontRegular,
        color: rgb(0, 0, 0),
      });

      // Borders
      page.drawLine({
        start: { x: leftX, y: toPdfY(sY + sH) },
        end: { x: rightX, y: toPdfY(sY + sH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
      page.drawLine({ start: { x: leftX, y: toPdfY(sY) }, end: { x: leftX, y: toPdfY(sY + sH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: leftX + totalsColsSpanWidth, y: toPdfY(sY) }, end: { x: leftX + totalsColsSpanWidth, y: toPdfY(sY + sH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: rightX, y: toPdfY(sY) }, end: { x: rightX, y: toPdfY(sY + sH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      currentY += sH;
    }

    // Clean spacing after Grand Total row before Terms & Conditions (No AP-GST number below table)
    currentY += 16;

    // Check space for Terms & Conditions Block
    if (currentY + 110 > height - bottomMarginPt) {
      page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      currentY = topMarginPt + 20;
    }

    // Terms & Conditions Block - Fully dynamic from quotation terms / company default terms
    const rawTerms =
      quotation.terms_and_conditions ||
      quotation.terms_conditions ||
      options.company?.default_quotation_terms ||
      `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.`;

    const allLines = rawTerms
      .split(/[\r\n]+/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const firstLine = allLines[0] || 'Terms &Conditions: No warranty for burn / Physical Damage.';
    const isFirstLineHeader =
      firstLine.toLowerCase().includes('terms') ||
      firstLine.toLowerCase().includes('condition') ||
      firstLine.toLowerCase().includes('warranty') ||
      firstLine.endsWith(':');

    const headerText = isFirstLineHeader
      ? firstLine
      : 'Terms &Conditions: No warranty for burn / Physical Damage.';
    const bodyLines = isFirstLineHeader ? allLines.slice(1) : allLines;

    const termsY = currentY;
    page.drawText(headerText, {
      x: leftX,
      y: toPdfY(termsY),
      size: 9.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    const headerTextW = fontBold.widthOfTextAtSize(headerText, 9.5);
    page.drawLine({
      start: { x: leftX, y: toPdfY(termsY + 2) },
      end: { x: leftX + headerTextW, y: toPdfY(termsY + 2) },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    let itemTermsY = termsY + 15;
    for (const tLine of bodyLines) {
      // Check page boundary for long terms
      if (itemTermsY + 14 > height - bottomMarginPt - 50) {
        page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
        itemTermsY = topMarginPt + 20;
      }
      page.drawText(tLine, {
        x: leftX + 16,
        y: toPdfY(itemTermsY),
        size: 8.5,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      itemTermsY += 12;
    }

    // Courtesy line
    let courtesyY = itemTermsY + 6;
    if (courtesyY + 40 > height - bottomMarginPt) {
      page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      courtesyY = topMarginPt + 20;
    }

    const closingText =
      quotation.closing_text ||
      'Thanking you and assuring of our best services and attention at all times.';
    page.drawText(closingText, {
      x: leftX,
      y: toPdfY(courtesyY),
      size: 9.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Sign-Off Block (Yours truly, For VARUN SYSTEMS.)
    const signY = courtesyY + 20;
    const signX = width - 180;
    page.drawText('Yours truly,', {
      x: signX,
      y: toPdfY(signY),
      size: 9.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Space for physical rubber stamp and signature (~36 pt)
    const companySignText = quotation.sign_off_company || 'For VARUN SYSTEMS.';
    page.drawText(companySignText, {
      x: signX,
      y: toPdfY(signY + 38),
      size: 9.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    return await pdfDoc.save();
  }

  /**
   * Generates a vector-accurate PDF for Quotations
   */
  static async generateQuotationPdf(quotation: Quotation, options: PdfGenerationOptions): Promise<Uint8Array> {
    const templateId = options.template?.id || quotation.letterhead_template_id || '';
    const hasCustomFile = Boolean(
      options.template?.file_path &&
      fs.existsSync(options.template.file_path) &&
      !templateId.startsWith('builtin-')
    );

    if (hasCustomFile) {
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

    const isNonGst = templateId === 'builtin-varun-nogst';
    return this.generateVarunQuotationPdf(quotation, options, !isNonGst);
  }
}
