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

function getHandwritingFontPath(): string | undefined {
  const resourcesPath = (process as any).resourcesPath || '';
  const candidates = [
    path.join(process.cwd(), 'assets', 'fonts', 'LucidaHandwriting.ttf'),
    path.join(resourcesPath, 'assets', 'fonts', 'LucidaHandwriting.ttf'),
    'C:\\Windows\\Fonts\\LHANDW.TTF',
    'C:\\Windows\\Fonts\\lhandw.ttf',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

// 28 States & 8 Union Territories mapping for Indian GST invoices & quotations
const STATE_INITIALS_MAP: Record<string, string> = {
  // 28 States & Common Variants
  'ANDHRA PRADESH': 'AP',
  'ANDHRA PRADESH (NEW)': 'AP',
  'ANDHRA PRADESH (OLD)': 'AP',
  'ANDHRA': 'AP',
  'ARUNACHAL PRADESH': 'AR',
  'ASSAM': 'AS',
  'BIHAR': 'BR',
  'CHHATTISGARH': 'CG',
  'CHATTISGARH': 'CG',
  'GOA': 'GA',
  'GUJARAT': 'GJ',
  'HARYANA': 'HR',
  'HIMACHAL PRADESH': 'HP',
  'JHARKHAND': 'JH',
  'KARNATAKA': 'KA',
  'KERALA': 'KL',
  'MADHYA PRADESH': 'MP',
  'MAHARASHTRA': 'MH',
  'MAHARASTRA': 'MH',
  'MANIPUR': 'MN',
  'MEGHALAYA': 'ML',
  'MIZORAM': 'MZ',
  'NAGALAND': 'NL',
  'ODISHA': 'OD',
  'ORISSA': 'OD',
  'PUNJAB': 'PB',
  'RAJASTHAN': 'RJ',
  'SIKKIM': 'SK',
  'TAMIL NADU': 'TN',
  'TAMILNADU': 'TN',
  'TELANGANA': 'TG',
  'TELENGANA': 'TG',
  'TRIPURA': 'TR',
  'UTTAR PRADESH': 'UP',
  'UTTARAKHAND': 'UK',
  'UTTRANCHAL': 'UK',
  'UTTARANCHAL': 'UK',
  'WEST BENGAL': 'WB',
  'BENGAL': 'WB',
  // 8 Union Territories & Variants
  'ANDAMAN AND NICOBAR ISLANDS': 'AN',
  'ANDAMAN AND NICOBAR': 'AN',
  'ANDAMAN & NICOBAR': 'AN',
  'CHANDIGARH': 'CH',
  'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': 'DD',
  'DADRA AND NAGAR HAVELI': 'DD',
  'DAMAN AND DIU': 'DD',
  'DELHI': 'DL',
  'DELHI (NCT)': 'DL',
  'NEW DELHI': 'DL',
  'NATIONAL CAPITAL TERRITORY OF DELHI': 'DL',
  'JAMMU AND KASHMIR': 'JK',
  'JAMMU & KASHMIR': 'JK',
  'J&K': 'JK',
  'LADAKH': 'LA',
  'LAKSHADWEEP': 'LD',
  'PUDUCHERRY': 'PY',
  'PONDICHERRY': 'PY',
  // GST State Numeric Codes (first 2 digits of GSTIN)
  '01': 'JK',
  '02': 'HP',
  '03': 'PB',
  '04': 'CH',
  '05': 'UK',
  '06': 'HR',
  '07': 'DL',
  '08': 'RJ',
  '09': 'UP',
  '10': 'BR',
  '11': 'SK',
  '12': 'AR',
  '13': 'NL',
  '14': 'MN',
  '15': 'MZ',
  '16': 'TR',
  '17': 'ML',
  '18': 'AS',
  '19': 'WB',
  '20': 'JH',
  '21': 'OD',
  '22': 'CG',
  '23': 'MP',
  '24': 'GJ',
  '26': 'DD',
  '27': 'MH',
  '28': 'AP',
  '29': 'KA',
  '30': 'GA',
  '31': 'LD',
  '32': 'KL',
  '33': 'TN',
  '34': 'PY',
  '35': 'AN',
  '36': 'TG',
  '37': 'AP',
  '38': 'LA',
};

function getStateInitials(stateName?: string, stateCode?: string, gstin?: string): string {
  // 1. Direct state name check
  if (stateName) {
    const clean = stateName.trim().toUpperCase();
    if (STATE_INITIALS_MAP[clean]) return STATE_INITIALS_MAP[clean];
    // Check partial / substring matches
    for (const [k, v] of Object.entries(STATE_INITIALS_MAP)) {
      if (isNaN(Number(k)) && (clean.includes(k) || k.includes(clean))) {
        return v;
      }
    }
  }
  // 2. Direct state numeric code check (e.g. '27', '36', '37')
  if (stateCode) {
    const cleanCode = stateCode.toString().trim().padStart(2, '0');
    if (STATE_INITIALS_MAP[cleanCode]) return STATE_INITIALS_MAP[cleanCode];
  }
  // 3. GSTIN prefix check (if first 2 digits are numeric)
  if (gstin && gstin.trim().length >= 2) {
    const prefix = gstin.trim().substring(0, 2);
    if (STATE_INITIALS_MAP[prefix]) return STATE_INITIALS_MAP[prefix];
  }
  return 'AP';
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
    const templateId = options.template?.id || invoice.letterhead_template_id || '';
    const templateName = (options.template?.name || '').toLowerCase();
    const layout = options.template?.layout_config;

    const isVarunShree =
      layout?.detected_archetype === 'VARUN_SHREE' ||
      templateId === 'builtin-varun-shree-igst-invoice' ||
      templateId === 'builtin-varun-shree-invoice-normal-gst' ||
      templateName.includes('varun shree') ||
      templateName.includes('varun sree');

    if (isVarunShree) {
      const isNormalGst =
        layout?.is_igst === false ||
        templateId === 'builtin-varun-shree-invoice-normal-gst' ||
        (templateName.includes('normal gst') && (templateName.includes('varun shree') || templateName.includes('varun sree')));
      return this.generateVarunShreeInvoicePdf(invoice, options, isNormalGst);
    }

    const isVarunInvoice =
      layout?.detected_archetype === 'VARUN_SYSTEMS' ||
      templateId === 'builtin-varun-invoice-normal-gst' ||
      templateId === 'builtin-varun-invoice-gst' ||
      templateName.includes('normal gst') ||
      templateName.includes('varun systems named gst invoice') ||
      (templateName.includes('varun') && templateName.includes('invoice')) ||
      (templateName.includes('varun') && templateName.includes('gst'));

    if (isVarunInvoice) {
      return this.generateVarunInvoicePdf(invoice, options);
    }

    const isDigital = options.mode === 'DIGITAL_LETTERHEAD';
    const template = options.template;

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

    // 1. Document Meta Information (respects detected template coordinates)
    const invNoStr = hasFileBackground ? invoice.invoice_number : `No: ${invoice.invoice_number}`;
    page.drawText(invNoStr, {
      x: invNumX,
      y: toPdfY(baseMetaY),
      size: 9.5,
      font: fontBold,
    });

    const invDateY = hasFileBackground ? (layout?.invoice_date?.y || baseMetaY + 15) : baseMetaY + 14;
    const invDateStr = hasFileBackground ? invoice.invoice_date : `Date: ${invoice.invoice_date}`;
    page.drawText(invDateStr, {
      x: hasFileBackground && layout?.invoice_date?.x ? layout.invoice_date.x : invNumX,
      y: toPdfY(invDateY),
      size: 8.5,
      font: fontRegular,
    });

    if (hasFileBackground) {
      if (layout?.po_number && invoice.po_number) {
        page.drawText(invoice.po_number, {
          x: layout.po_number.x,
          y: toPdfY(layout.po_number.y),
          size: 8.5,
          font: fontRegular,
        });
      }
      if (layout?.po_date && invoice.po_date) {
        page.drawText(invoice.po_date, {
          x: layout.po_date.x,
          y: toPdfY(layout.po_date.y),
          size: 8.5,
          font: fontRegular,
        });
      }
      if (layout?.challan_number) {
        const challanVal = (invoice as any).challan_number || (invoice as any).reference_number || '';
        if (challanVal) {
          page.drawText(challanVal, {
            x: layout.challan_number.x,
            y: toPdfY(layout.challan_number.y),
            size: 8.5,
            font: fontRegular,
          });
        }
      }
      if (layout?.due_date) {
        page.drawText(invoice.due_date, {
          x: layout.due_date.x,
          y: toPdfY(layout.due_date.y),
          size: 8.5,
          font: fontRegular,
        });
      }
      if (layout?.place_of_supply) {
        page.drawText(`${invoice.place_of_supply_state} (${invoice.place_of_supply_code})`, {
          x: layout.place_of_supply.x,
          y: toPdfY(layout.place_of_supply.y),
          size: 8.5,
          font: fontRegular,
        });
      }
    } else {
      const dueDateY = invDateY + 14;
      page.drawText(`Due: ${invoice.due_date}`, {
        x: invNumX,
        y: toPdfY(dueDateY),
        size: 8.5,
        font: fontRegular,
      });

      const pos = dueDateY + 14;
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
      const addrY = hasFileBackground && layout?.billing_address?.y ? layout.billing_address.y : custNameY + 13;
      const addrX = hasFileBackground && layout?.billing_address?.x ? layout.billing_address.x : custX;
      page.drawText(invoice.billing_address.slice(0, 120), {
        x: addrX,
        y: toPdfY(addrY),
        size: 8,
        font: fontRegular,
        maxWidth: layout?.billing_address?.width || 260,
      });
    }

    if (invoice.customer_gstin) {
      const gstinY = hasFileBackground && layout?.customer_gstin?.y ? layout.customer_gstin.y : custNameY + 38;
      const gstinX = hasFileBackground && layout?.customer_gstin?.x ? layout.customer_gstin.x : custX;
      const gstinLabel = hasFileBackground ? invoice.customer_gstin : `GSTIN: ${invoice.customer_gstin}`;
      page.drawText(gstinLabel, {
        x: gstinX,
        y: toPdfY(gstinY),
        size: 8,
        font: fontBold,
      });
    }

    if (hasFileBackground) {
      if (layout?.customer_state && invoice.place_of_supply_state) {
        page.drawText(invoice.place_of_supply_state, {
          x: layout.customer_state.x,
          y: toPdfY(layout.customer_state.y),
          size: 8,
          font: fontRegular,
        });
      }
      if (layout?.customer_state_code && invoice.place_of_supply_code) {
        page.drawText(String(invoice.place_of_supply_code), {
          x: layout.customer_state_code.x,
          y: toPdfY(layout.customer_state_code.y),
          size: 8,
          font: fontRegular,
        });
      }
    }

    // 3. Line Items Table (supports detected template columns and standard layout)
    const tCols = layout?.table_columns;
    const hasDetectedColumns = Boolean(
      tCols && (tCols.sr_no || tCols.item_name || tCols.total || tCols.taxable || tCols.rate)
    );

    const tableTop = hasFileBackground
      ? Math.max(layout?.table_top_y || 230, custY + 50)
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
    } else {
      currentY = tableTop + 5;
    }

    // Render Items
    for (let i = 0; i < invoice.items.length; i++) {
      const it = invoice.items[i];
      const rowY = currentY;

      if (hasDetectedColumns && tCols) {
        // Dynamic Column Alignment matching uploaded template
        if (tCols.sr_no && tCols.sr_no.x != null) {
          page.drawText(String(i + 1), {
            x: tCols.sr_no.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        const descMaxW = tCols.item_name && tCols.item_name.width != null ? Math.max(tCols.item_name.width - 6, 80) : 200;
        const itemX = tCols.item_name && tCols.item_name.x != null ? tCols.item_name.x + 3 : leftX + 30;

        page.drawText(it.item_name.substring(0, 45), {
          x: itemX,
          y: toPdfY(rowY),
          size: 8.5,
          font: fontBold,
          maxWidth: descMaxW,
        });

        if (tCols.hsn_sac && tCols.hsn_sac.x != null) {
          page.drawText(it.hsn_or_sac || '', {
            x: tCols.hsn_sac.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        if (tCols.qty && tCols.qty.x != null) {
          const qtyStr = tCols.unit ? String(it.quantity) : `${it.quantity} ${it.unit}`;
          page.drawText(qtyStr, {
            x: tCols.qty.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        if (tCols.unit && tCols.unit.x != null && it.unit) {
          page.drawText(it.unit, {
            x: tCols.unit.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        if (tCols.rate && tCols.rate.x != null) {
          page.drawText(it.rate, {
            x: tCols.rate.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        if (tCols.taxable && tCols.taxable.x != null) {
          page.drawText(it.taxable_value, {
            x: tCols.taxable.x + 3,
            y: toPdfY(rowY),
            size: 8,
            font: fontRegular,
          });
        }

        if (tCols.cgst_rate && tCols.cgst_rate.x != null) {
          const halfRate = (Number(it.gst_rate || 0) / 2).toFixed(1).replace('.0', '');
          page.drawText(`${halfRate}%`, {
            x: tCols.cgst_rate.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }
        if (tCols.cgst_amt && tCols.cgst_amt.x != null) {
          const halfAmt = (Number(it.taxable_value || 0) * Number(it.gst_rate || 0) / 200).toFixed(2);
          page.drawText(halfAmt, {
            x: tCols.cgst_amt.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }

        if (tCols.sgst_rate && tCols.sgst_rate.x != null) {
          const halfRate = (Number(it.gst_rate || 0) / 2).toFixed(1).replace('.0', '');
          page.drawText(`${halfRate}%`, {
            x: tCols.sgst_rate.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }
        if (tCols.sgst_amt && tCols.sgst_amt.x != null) {
          const halfAmt = (Number(it.taxable_value || 0) * Number(it.gst_rate || 0) / 200).toFixed(2);
          page.drawText(halfAmt, {
            x: tCols.sgst_amt.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }

        if (tCols.igst_rate && tCols.igst_rate.x != null) {
          page.drawText(`${it.gst_rate}%`, {
            x: tCols.igst_rate.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }
        if (tCols.igst_amt && tCols.igst_amt.x != null) {
          const igstAmt = (Number(it.taxable_value || 0) * Number(it.gst_rate || 0) / 100).toFixed(2);
          page.drawText(igstAmt, {
            x: tCols.igst_amt.x + 2,
            y: toPdfY(rowY),
            size: 7.5,
            font: fontRegular,
          });
        }

        if (tCols.total && tCols.total.x != null) {
          page.drawText(it.line_total, {
            x: tCols.total.x + 3,
            y: toPdfY(rowY),
            size: 8.5,
            font: fontBold,
          });
        }

        let noteBottomY = rowY;
        if (it.description && it.description.trim()) {
          const rawLines = it.description
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          for (const line of rawLines) {
            noteBottomY += 10;
            page.drawText(line.substring(0, 50), {
              x: itemX,
              y: toPdfY(noteBottomY),
              size: 7,
              font: fontRegular,
              color: rgb(0.35, 0.35, 0.35),
              maxWidth: descMaxW,
            });
          }
        }

        if (!hasFileBackground) {
          page.drawLine({
            start: { x: leftX, y: toPdfY(noteBottomY + 6) },
            end: { x: leftX + tableWidth, y: toPdfY(noteBottomY + 6) },
            thickness: 0.5,
            color: rgb(0.88, 0.88, 0.88),
          });
        }

        currentY = noteBottomY + 16;
      } else {
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

        if (!hasFileBackground) {
          page.drawLine({
            start: { x: leftX, y: toPdfY(noteBottomY + 6) },
            end: { x: leftX + tableWidth, y: toPdfY(noteBottomY + 6) },
            thickness: 0.5,
            color: rgb(0.88, 0.88, 0.88),
          });
        }

        currentY = noteBottomY + 18;
      }
    }

    // 4. Totals Section (transparent text — respects uploaded template layout)
    const maxTotalsStart = Math.max(height - (layout?.table_bottom_margin || 220), 420);
    const totalsY = Math.min(Math.max(currentY + 15, maxTotalsStart), height - 135);

    if (invoice.amount_in_words) {
      const wordsX = hasFileBackground && layout?.amount_in_words?.x ? layout.amount_in_words.x : leftX;
      const wordsY = hasFileBackground && layout?.amount_in_words?.y ? layout.amount_in_words.y : totalsY + 8;
      page.drawText(invoice.amount_in_words, {
        x: wordsX,
        y: toPdfY(wordsY),
        size: 8.5,
        font: fontBold,
        maxWidth: hasFileBackground ? 360 : 300,
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
   * Generates a vector-accurate PDF matching the Varun Systems GST Invoice format
   * Matches the exact layout, grid headers, table styling, terms and bank details
   */
  static async generateVarunInvoicePdf(
    invoice: Invoice,
    options: PdfGenerationOptions
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    let fontRegular: any;
    let fontBold: any;
    let fontItalic: any;
    let fontHandwriting: any = null;

    let fontkitLoaded = false;
    try {
      const fontkit = require('@pdf-lib/fontkit');
      pdfDoc.registerFontkit(fontkit);
      fontkitLoaded = true;
    } catch {}

    const fontPaths = getLocalFontPaths();
    if (fontkitLoaded && fontPaths.regular && fontPaths.bold) {
      try {
        const regBytes = fs.readFileSync(fontPaths.regular);
        const boldBytes = fs.readFileSync(fontPaths.bold);
        fontRegular = await pdfDoc.embedFont(regBytes);
        fontBold = await pdfDoc.embedFont(boldBytes);
        fontItalic = fontRegular;
      } catch {
        fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      }
    } else {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    }

    if (fontkitLoaded) {
      const hwPath = getHandwritingFontPath();
      if (hwPath && fs.existsSync(hwPath)) {
        try {
          const hwBytes = fs.readFileSync(hwPath);
          fontHandwriting = await pdfDoc.embedFont(hwBytes);
        } catch (err) {
          console.warn('Could not embed handwriting font:', err);
        }
      }
    }

    const formatAmt = (val: any) => {
      const n = Number(val || 0);
      return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatInvoiceDate = (d?: string) => {
      if (!d) return '';
      const clean = d.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return d;
    };

    const formatPoDate = (d?: string) => {
      if (!d) return '';
      const clean = d.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIdx = parseInt(parts[1], 10) - 1;
        const monthStr = months[monthIdx] || parts[1];
        return `${parts[2]}-${monthStr}-${parts[0]}`;
      }
      return d;
    };

    const MM_TO_PT = 2.83464567;
    // Configurable clearances (default top 48mm, bottom 30mm for preprinted letterhead)
    const topMarginMm = invoice.top_margin_mm !== undefined ? Number(invoice.top_margin_mm) : 48.0;
    const bottomMarginMm = invoice.bottom_margin_mm !== undefined ? Number(invoice.bottom_margin_mm) : 30.0;
    const leftMarginMm = invoice.left_margin_mm !== undefined ? Number(invoice.left_margin_mm) : 15.0;
    const rightMarginMm = invoice.right_margin_mm !== undefined ? Number(invoice.right_margin_mm) : 15.0;

    const topMarginPt = topMarginMm * MM_TO_PT;
    const bottomMarginPt = bottomMarginMm * MM_TO_PT;
    const leftX = leftMarginMm * MM_TO_PT;
    const rightMarginPt = rightMarginMm * MM_TO_PT;

    const pageWidthPt = 595.28;
    const pageHeightPt = 841.89;
    const tableWidth = pageWidthPt - leftX - rightMarginPt; // 510.24 pt on A4
    const rightX = leftX + tableWidth; // 552.76 pt

    // Determine GST tax mode: Inter-state (IGST) vs Intra-state (CGST + SGST)
    const templateId = options.template?.id || invoice.letterhead_template_id || '';
    const templateName = (options.template?.name || '').toLowerCase();
    const isNormalGstTemplate =
      templateId === 'builtin-varun-invoice-normal-gst' ||
      templateName.includes('normal gst');

    const companyGstin = (options.company?.gstin || options.branch?.gstin || '36APLPV0118G1ZU').trim();
    const companyState = (options.company?.state || options.branch?.state || 'Telangana').trim();
    const companyStateCode = (options.company?.state_code || options.branch?.state_code || (companyGstin.length >= 2 ? companyGstin.substring(0, 2) : '36')).trim();

    const customerGstin = (invoice.customer_gstin || '').trim();
    const gstinStateCode = customerGstin.length >= 2 ? customerGstin.substring(0, 2) : '';

    const receiverState = (
      invoice.place_of_supply_state ||
      (invoice as any).customer_state ||
      companyState ||
      'Telangana'
    ).trim();

    const receiverStateCode = (
      invoice.place_of_supply_code ||
      (invoice as any).customer_state_code ||
      gstinStateCode ||
      companyStateCode ||
      '36'
    ).trim();

    const isInterState = isNormalGstTemplate
      ? (Number(invoice.total_igst || 0) > 0 && Number(invoice.total_cgst || 0) === 0)
      : Boolean(
          invoice.is_inter_state ||
          Number(invoice.total_igst || 0) > 0 ||
          (companyStateCode && receiverStateCode && companyStateCode !== receiverStateCode)
        );

    // Columns structure
    const cols = isInterState
      ? [
          { name: 'S No', key: 'sr', width: 24, align: 'center' },
          { name: 'Description of Goodes', key: 'desc', width: tableWidth - (24 + 54 + 28 + 52 + 56 + 22 + 46 + 54), align: 'left' },
          { name: 'HSN/SAC Code', key: 'hsn', width: 54, align: 'center' },
          { name: 'Qty', key: 'qty', width: 28, align: 'center' },
          { name: 'Base Rate', key: 'rate', width: 52, align: 'right' },
          { name: 'Taxable Amount', key: 'taxable', width: 56, align: 'right' },
          { name: 'IGST', key: 'igst', width: 68, subCols: [{ name: '%', width: 22 }, { name: 'Amt.', width: 46 }] },
          { name: 'Total Amount', key: 'total', width: 54, align: 'right' },
        ]
      : [
          { name: 'S No', key: 'sr', width: 22, align: 'center' },
          { name: 'Description of Goodes', key: 'desc', width: tableWidth - (22 + 48 + 26 + 46 + 50 + 48 + 48 + 68), align: 'left' },
          { name: 'HSN/SAC Code', key: 'hsn', width: 48, align: 'center' },
          { name: 'Qty', key: 'qty', width: 26, align: 'center' },
          { name: 'Base Rate', key: 'rate', width: 46, align: 'right' },
          { name: 'Taxable Amount', key: 'taxable', width: 50, align: 'right' },
          { name: 'CGST', key: 'cgst', width: 48, subCols: [{ name: '%', width: 16 }, { name: 'Amt.', width: 32 }] },
          { name: 'SGST', key: 'sgst', width: 48, subCols: [{ name: '%', width: 16 }, { name: 'Amt.', width: 32 }] },
          { name: 'Total Amount', key: 'total', width: 68, align: 'right' },
        ];

    let page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    const { width, height } = page.getSize();
    const toPdfY = (topY: number) => height - topY;

    // Optional Digital Letterhead Overlay
    const renderDigitalOverlay = Boolean(
      (invoice.print_letterhead_overlay || (options as any).showOverlay) &&
      options.mode !== 'PREPRINTED_STATIONERY'
    );
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

    const drawHeaderAndBoxes = (isContinuation: boolean = false) => {
      const startContentY = topMarginPt;

      // 1. Centered GST-INVOICE Title with Underline
      const titleText = isContinuation ? 'GST-INVOICE (Continued)' : 'GST-INVOICE';
      const titleSize = isContinuation ? 12 : 14;
      const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
      const titleX = (width - titleWidth) / 2;
      const titleY = startContentY + 2;

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
        thickness: 1.2,
        color: rgb(0, 0, 0),
      });

      if (isContinuation) {
        return startContentY + 24;
      }

      // 2. Structured Header Box Grid (Top row 28 pt, Second row 58 pt)
      const boxStartY = titleY + 16;
      const row1H = 28;
      const row2H = 58;
      const boxTotalH = row1H + row2H;

      const col1W = 185;
      const col2W = 150;

      const divX1 = leftX + col1W;
      const divX2 = leftX + col1W + col2W; // 335 pt from leftX

      // Outer border around the header box
      page.drawLine({ start: { x: leftX, y: toPdfY(boxStartY) }, end: { x: rightX, y: toPdfY(boxStartY) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: leftX, y: toPdfY(boxStartY + boxTotalH) }, end: { x: rightX, y: toPdfY(boxStartY + boxTotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: leftX, y: toPdfY(boxStartY) }, end: { x: leftX, y: toPdfY(boxStartY + boxTotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: rightX, y: toPdfY(boxStartY) }, end: { x: rightX, y: toPdfY(boxStartY + boxTotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      // Horizontal line separating row 1 & row 2
      page.drawLine({ start: { x: leftX, y: toPdfY(boxStartY + row1H) }, end: { x: rightX, y: toPdfY(boxStartY + row1H) }, thickness: 0.75, color: rgb(0, 0, 0) });

      // Row 1 vertical dividers
      page.drawLine({ start: { x: divX1, y: toPdfY(boxStartY) }, end: { x: divX1, y: toPdfY(boxStartY + row1H) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: divX2, y: toPdfY(boxStartY) }, end: { x: divX2, y: toPdfY(boxStartY + boxTotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      // --- Row 1 Texts ---
      // Col 1: Invoice No & Date
      page.drawText(`Invoice No : ${invoice.invoice_number}`, {
        x: leftX + 5,
        y: toPdfY(boxStartY + 11),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(`Date of invoice :${formatInvoiceDate(invoice.invoice_date)}`, {
        x: leftX + 5,
        y: toPdfY(boxStartY + 23),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 2: PO No & PO Date
      const poNum = invoice.purchase_order_number || invoice.reference_number || '';
      page.drawText(`PO No:${poNum}`, {
        x: divX1 + 5,
        y: toPdfY(boxStartY + 11),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      const poDateStr = formatPoDate(invoice.purchase_order_date || (invoice as any).po_date);
      page.drawText(`PO Date: ${poDateStr}`, {
        x: divX1 + 5,
        y: toPdfY(boxStartY + 23),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 3: GST Registration No & State
      page.drawText(`GST Registration No: ${companyGstin}`, {
        x: divX2 + 5,
        y: toPdfY(boxStartY + 11),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(`State : ${companyState}, State Code : ${companyStateCode}`, {
        x: divX2 + 5,
        y: toPdfY(boxStartY + 23),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // --- Row 2 Texts ---
      // Billed To (Left side, spanning col1 + col2)
      page.drawText('Billed To:', {
        x: leftX + 5,
        y: toPdfY(boxStartY + row1H + 11),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      const custName = invoice.customer_name || 'Customer';
      page.drawText(custName, {
        x: leftX + 5,
        y: toPdfY(boxStartY + row1H + 22),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      let addrY = boxStartY + row1H + 33;
      if (invoice.billing_address) {
        const addrLines = invoice.billing_address
          .split(/[\r\n]+/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of addrLines.slice(0, 3)) {
          page.drawText(line.slice(0, 68), {
            x: leftX + 5,
            y: toPdfY(addrY),
            size: 8,
            font: fontRegular,
            color: rgb(0, 0, 0),
          });
          addrY += 11;
        }
      }

      // Details of Receiver (Right side)
      page.drawText('Details of Receiver :', {
        x: divX2 + 5,
        y: toPdfY(boxStartY + row1H + 11),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(`State : ${receiverState}`, {
        x: divX2 + 5,
        y: toPdfY(boxStartY + row1H + 22),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      page.drawText(`State Code : ${receiverStateCode}`, {
        x: divX2 + 5,
        y: toPdfY(boxStartY + row1H + 33),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      page.drawText(`GSTIN/Unique ID : ${customerGstin}`, {
        x: divX2 + 5,
        y: toPdfY(boxStartY + row1H + 44),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      return boxStartY + boxTotalH;
    };

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

    const drawTableHeader = (startY: number) => {
      const headerH = 26;

      page.drawLine({ start: { x: leftX, y: toPdfY(startY) }, end: { x: rightX, y: toPdfY(startY) }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: leftX, y: toPdfY(startY + headerH) }, end: { x: rightX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      let curX = leftX;
      page.drawLine({ start: { x: leftX, y: toPdfY(startY) }, end: { x: leftX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });

      for (const c of cols) {
        if ((c as any).subCols) {
          const tierH = 13;
          const topLabel = c.name;
          const topW = fontBold.widthOfTextAtSize(topLabel, 8);
          page.drawText(topLabel, {
            x: curX + (c.width - topW) / 2,
            y: toPdfY(startY + 9.5),
            size: 8,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
          page.drawLine({ start: { x: curX, y: toPdfY(startY + tierH) }, end: { x: curX + c.width, y: toPdfY(startY + tierH) }, thickness: 0.75, color: rgb(0, 0, 0) });

          let subX = curX;
          for (let sIdx = 0; sIdx < (c as any).subCols.length; sIdx++) {
            const sc = (c as any).subCols[sIdx];
            const scW = fontBold.widthOfTextAtSize(sc.name, 7.5);
            page.drawText(sc.name, {
              x: subX + (sc.width - scW) / 2,
              y: toPdfY(startY + tierH + 9.5),
              size: 7.5,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            subX += sc.width;
            if (sIdx < (c as any).subCols.length - 1) {
              page.drawLine({ start: { x: subX, y: toPdfY(startY + tierH) }, end: { x: subX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });
            }
          }
        } else {
          let lines = [c.name];
          if (c.name === 'S No') lines = ['S', 'No'];
          else if (c.name === 'HSN/SAC Code') lines = ['HSN/SAC', 'Code'];
          else if (c.name === 'Base Rate') lines = ['Base', 'Rate'];
          else if (c.name === 'Taxable Amount') lines = ['Taxable', 'Amount'];
          else if (c.name === 'Total Amount') lines = ['Total', 'Amount'];

          if (lines.length === 2) {
            const w1 = fontBold.widthOfTextAtSize(lines[0], 7.5);
            const w2 = fontBold.widthOfTextAtSize(lines[1], 7.5);
            page.drawText(lines[0], {
              x: curX + (c.width - w1) / 2,
              y: toPdfY(startY + 10),
              size: 7.5,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
            page.drawText(lines[1], {
              x: curX + (c.width - w2) / 2,
              y: toPdfY(startY + 20),
              size: 7.5,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
          } else {
            const w = fontBold.widthOfTextAtSize(lines[0], 8);
            page.drawText(lines[0], {
              x: c.align === 'left' ? curX + 5 : curX + (c.width - w) / 2,
              y: toPdfY(startY + 16),
              size: 8,
              font: fontBold,
              color: rgb(0, 0, 0),
            });
          }
        }

        curX += c.width;
        page.drawLine({ start: { x: curX, y: toPdfY(startY) }, end: { x: curX, y: toPdfY(startY + headerH) }, thickness: 0.75, color: rgb(0, 0, 0) });
      }

      return startY + headerH;
    };

    const colDividers = isInterState
      ? [leftX, leftX + 24, leftX + 198.24, leftX + 252.24, leftX + 280.24, leftX + 332.24, leftX + 388.24, leftX + 410.24, leftX + 456.24, rightX]
      : [leftX, leftX + 22, leftX + 176.24, leftX + 224.24, leftX + 250.24, leftX + 296.24, leftX + 346.24, leftX + 362.24, leftX + 394.24, leftX + 410.24, leftX + 442.24, rightX];

    const midDividerX = isInterState ? colDividers[5] : colDividers[6];

    let currentY = drawHeaderAndBoxes(false);
    currentY = drawTableHeader(currentY);
    const tableBodyStartY = currentY;

    let totalQty = new Decimal(0);
    let totalTaxable = new Decimal(0);
    let totalTaxAmt = new Decimal(0);
    let totalLineAmt = new Decimal(0);

    for (let i = 0; i < invoice.items.length; i++) {
      const it = invoice.items[i];
      const itemTitle = it.item_name || 'Item';
      const itemDesc = it.description || '';
      const fullText = itemDesc ? `${itemTitle}\n${itemDesc}` : itemTitle;
      const rawLines = fullText.split(/[\r\n]+/);
      const wrappedLines: string[] = [];

      const descW = cols.find((c) => c.key === 'desc')?.width || 170;
      for (const r of rawLines) {
        wrappedLines.push(...splitTextToLines(r, descW - 10, fontRegular, 8));
      }

      const lineCount = Math.max(wrappedLines.length, 1);
      const rowHeight = Math.max(lineCount * 11 + 8, 20);

      // Check space
      if (currentY + rowHeight > height - bottomMarginPt - 180) {
        for (const divX of colDividers) {
          page.drawLine({ start: { x: divX, y: toPdfY(tableBodyStartY) }, end: { x: divX, y: toPdfY(currentY) }, thickness: 0.75, color: rgb(0, 0, 0) });
        }
        page.drawLine({ start: { x: leftX, y: toPdfY(currentY) }, end: { x: rightX, y: toPdfY(currentY) }, thickness: 0.75, color: rgb(0, 0, 0) });

        page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
        currentY = drawHeaderAndBoxes(true);
        currentY = drawTableHeader(currentY);
      }

      const rowTopY = currentY;
      const textBaseY = rowTopY + 11;

      // Col 0: S No
      const srText = String(i + 1);
      const srW = fontBold.widthOfTextAtSize(srText, 8);
      page.drawText(srText, { x: colDividers[0] + (colDividers[1] - colDividers[0] - srW) / 2, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });

      // Col 1: Description lines
      let curLineY = textBaseY;
      for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
        page.drawText(wrappedLines[lIdx], {
          x: colDividers[1] + 5,
          y: toPdfY(curLineY),
          size: 8,
          font: lIdx === 0 ? fontBold : fontRegular,
          color: rgb(0, 0, 0),
        });
        curLineY += 11;
      }

      // Col 2: HSN/SAC
      const hsnText = String(it.hsn_or_sac || '');
      const hsnW = fontBold.widthOfTextAtSize(hsnText, 8);
      page.drawText(hsnText, { x: colDividers[2] + (colDividers[3] - colDividers[2] - hsnW) / 2, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });

      // Col 3: Qty
      const qtyText = String(it.quantity || '1');
      const qtyW = fontBold.widthOfTextAtSize(qtyText, 8);
      page.drawText(qtyText, { x: colDividers[3] + (colDividers[4] - colDividers[3] - qtyW) / 2, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });
      totalQty = totalQty.add(new Decimal(it.quantity || 0));

      // Col 4: Base Rate
      const rateText = formatAmt(it.rate);
      const rateW = fontBold.widthOfTextAtSize(rateText, 8);
      page.drawText(rateText, { x: colDividers[5] - rateW - 5, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });

      // Col 5: Taxable Amount
      const taxVal = it.taxable_value || (new Decimal(it.quantity || 1).mul(new Decimal(it.rate || 0)).toFixed(2));
      const taxValText = formatAmt(taxVal);
      const taxValW = fontBold.widthOfTextAtSize(taxValText, 8);
      page.drawText(taxValText, { x: colDividers[6] - taxValW - 5, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });
      totalTaxable = totalTaxable.add(new Decimal(taxVal || 0));

      if (isInterState) {
        // Col 6: IGST %
        const igstRateText = String(Math.round(Number(it.gst_rate || it.igst_rate || 18)));
        const igstRateW = fontBold.widthOfTextAtSize(igstRateText, 8);
        page.drawText(igstRateText, { x: colDividers[6] + (colDividers[7] - colDividers[6] - igstRateW) / 2, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });

        // Col 7: IGST Amt
        const igstAmt = it.igst_amount || it.total_tax || (new Decimal(taxVal).mul(new Decimal(it.gst_rate || 18).div(100)).toFixed(2));
        const igstAmtText = formatAmt(igstAmt);
        const igstAmtW = fontBold.widthOfTextAtSize(igstAmtText, 8);
        page.drawText(igstAmtText, { x: colDividers[8] - igstAmtW - 5, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });
        totalTaxAmt = totalTaxAmt.add(new Decimal(igstAmt || 0));

        // Col 8: Total Amount
        const lineTotal = it.line_total || (new Decimal(taxVal).add(new Decimal(igstAmt)).toFixed(2));
        const lineTotalText = formatAmt(lineTotal);
        const lineTotalW = fontBold.widthOfTextAtSize(lineTotalText, 8);
        page.drawText(lineTotalText, { x: rightX - lineTotalW - 5, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });
        totalLineAmt = totalLineAmt.add(new Decimal(lineTotal || 0));
      } else {
        // Intra-state (CGST + SGST)
        const halfGst = (Number(it.gst_rate || 18) / 2).toFixed(1).replace(/\.0$/, '');
        const cgstAmt = it.cgst_amount || (new Decimal(taxVal).mul(new Decimal(halfGst).div(100)).toFixed(2));
        const sgstAmt = it.sgst_amount || cgstAmt;

        // CGST %
        const cgstRateW = fontBold.widthOfTextAtSize(halfGst, 7.5);
        page.drawText(halfGst, { x: colDividers[6] + (colDividers[7] - colDividers[6] - cgstRateW) / 2, y: toPdfY(textBaseY), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
        // CGST Amt
        const cgstAmtText = formatAmt(cgstAmt);
        const cgstAmtW = fontBold.widthOfTextAtSize(cgstAmtText, 7.5);
        page.drawText(cgstAmtText, { x: colDividers[8] - cgstAmtW - 3, y: toPdfY(textBaseY), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

        // SGST %
        const sgstRateW = fontBold.widthOfTextAtSize(halfGst, 7.5);
        page.drawText(halfGst, { x: colDividers[8] + (colDividers[9] - colDividers[8] - sgstRateW) / 2, y: toPdfY(textBaseY), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
        // SGST Amt
        const sgstAmtText = formatAmt(sgstAmt);
        const sgstAmtW = fontBold.widthOfTextAtSize(sgstAmtText, 7.5);
        page.drawText(sgstAmtText, { x: colDividers[10] - sgstAmtW - 3, y: toPdfY(textBaseY), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
        totalTaxAmt = totalTaxAmt.add(new Decimal(cgstAmt).add(new Decimal(sgstAmt)));

        // Total Amount
        const lineTotal = it.line_total || (new Decimal(taxVal).add(new Decimal(cgstAmt)).add(new Decimal(sgstAmt)).toFixed(2));
        const lineTotalText = formatAmt(lineTotal);
        const lineTotalW = fontBold.widthOfTextAtSize(lineTotalText, 8);
        page.drawText(lineTotalText, { x: rightX - lineTotalW - 5, y: toPdfY(textBaseY), size: 8, font: fontBold, color: rgb(0, 0, 0) });
        totalLineAmt = totalLineAmt.add(new Decimal(lineTotal || 0));
      }

      currentY += rowHeight;
    }

    // Minimum body height to ensure spacious look matching the sample
    const minBodyH = 220;
    const actualBodyH = currentY - tableBodyStartY;
    if (actualBodyH < minBodyH) {
      currentY = tableBodyStartY + minBodyH;
    }

    // Draw all vertical column divider lines running through the table body
    for (const divX of colDividers) {
      page.drawLine({ start: { x: divX, y: toPdfY(tableBodyStartY) }, end: { x: divX, y: toPdfY(currentY) }, thickness: 0.75, color: rgb(0, 0, 0) });
    }

    // Horizontal line closing item rows / opening subtotal row
    page.drawLine({ start: { x: leftX, y: toPdfY(currentY) }, end: { x: rightX, y: toPdfY(currentY) }, thickness: 0.75, color: rgb(0, 0, 0) });

    // --- Subtotal Row (height 18 pt) ---
    const subtotalH = 18;
    const subtotalY = currentY;

    // Draw vertical dividers for subtotal row
    for (const divX of colDividers) {
      page.drawLine({ start: { x: divX, y: toPdfY(subtotalY) }, end: { x: divX, y: toPdfY(subtotalY + subtotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    }

    // Qty total
    const totQtyText = totalQty.toString();
    const totQtyW = fontBold.widthOfTextAtSize(totQtyText, 8);
    page.drawText(totQtyText, { x: colDividers[3] + (colDividers[4] - colDividers[3] - totQtyW) / 2, y: toPdfY(subtotalY + 12), size: 8, font: fontBold, color: rgb(0, 0, 0) });

    // Taxable total
    const totTaxValText = formatAmt(totalTaxable.toFixed(2));
    const totTaxValW = fontBold.widthOfTextAtSize(totTaxValText, 8);
    page.drawText(totTaxValText, { x: colDividers[6] - totTaxValW - 5, y: toPdfY(subtotalY + 12), size: 8, font: fontBold, color: rgb(0, 0, 0) });

    if (isInterState) {
      // IGST total
      const totTaxAmtText = formatAmt(totalTaxAmt.toFixed(2));
      const totTaxAmtW = fontBold.widthOfTextAtSize(totTaxAmtText, 8);
      page.drawText(totTaxAmtText, { x: colDividers[8] - totTaxAmtW - 5, y: toPdfY(subtotalY + 12), size: 8, font: fontBold, color: rgb(0, 0, 0) });

      // Total Amount total before round-off
      const totLineAmtText = formatAmt(totalLineAmt.toFixed(2));
      const totLineAmtW = fontBold.widthOfTextAtSize(totLineAmtText, 8);
      page.drawText(totLineAmtText, { x: rightX - totLineAmtW - 5, y: toPdfY(subtotalY + 12), size: 8, font: fontBold, color: rgb(0, 0, 0) });
    } else {
      // Intra-state CGST & SGST totals
      const halfTax = totalTaxAmt.div(2).toFixed(2);
      const halfTaxText = formatAmt(halfTax);
      const cgstW = fontBold.widthOfTextAtSize(halfTaxText, 7.5);
      page.drawText(halfTaxText, { x: colDividers[8] - cgstW - 3, y: toPdfY(subtotalY + 12), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });
      const sgstW = fontBold.widthOfTextAtSize(halfTaxText, 7.5);
      page.drawText(halfTaxText, { x: colDividers[10] - sgstW - 3, y: toPdfY(subtotalY + 12), size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

      const totLineAmtText = formatAmt(totalLineAmt.toFixed(2));
      const totLineAmtW = fontBold.widthOfTextAtSize(totLineAmtText, 8);
      page.drawText(totLineAmtText, { x: rightX - totLineAmtW - 5, y: toPdfY(subtotalY + 12), size: 8, font: fontBold, color: rgb(0, 0, 0) });
    }

    // Horizontal line closing subtotal row
    page.drawLine({ start: { x: leftX, y: toPdfY(subtotalY + subtotalH) }, end: { x: rightX, y: toPdfY(subtotalY + subtotalH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    currentY = subtotalY + subtotalH;

    // --- Summary Rows (height 36 pt = two 18 pt rows) ---
    const summaryH = 36;
    const summaryStartY = currentY;

    // Outer & inner borders of summary box
    page.drawLine({ start: { x: leftX, y: toPdfY(summaryStartY) }, end: { x: leftX, y: toPdfY(summaryStartY + summaryH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: rightX, y: toPdfY(summaryStartY) }, end: { x: rightX, y: toPdfY(summaryStartY + summaryH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midDividerX, y: toPdfY(summaryStartY) }, end: { x: midDividerX, y: toPdfY(summaryStartY + summaryH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: leftX, y: toPdfY(summaryStartY + summaryH) }, end: { x: rightX, y: toPdfY(summaryStartY + summaryH) }, thickness: 0.75, color: rgb(0, 0, 0) });

    // Vertical line between summary labels (Round Off/Grand Total) and values (aligns with Total Amount column left line)
    const summaryValDividerX = colDividers[colDividers.length - 2];
    page.drawLine({ start: { x: summaryValDividerX, y: toPdfY(summaryStartY) }, end: { x: summaryValDividerX, y: toPdfY(summaryStartY + summaryH) }, thickness: 0.75, color: rgb(0, 0, 0) });

    // Horizontal line between round-off and grand total on right side only
    page.drawLine({ start: { x: midDividerX, y: toPdfY(summaryStartY + 18) }, end: { x: rightX, y: toPdfY(summaryStartY + 18) }, thickness: 0.75, color: rgb(0, 0, 0) });

    // Left Cell: Total Amount (In words)
    const wordsPrefix = 'Total Amount (In words) ';
    const wordsValue = invoice.amount_in_words || '';
    const prefixW = fontBold.widthOfTextAtSize(wordsPrefix, 8.5);
    page.drawText(wordsPrefix, {
      x: leftX + 5,
      y: toPdfY(summaryStartY + 16),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    // Wrapped words if needed
    const wordsLines = splitTextToLines(wordsValue, (midDividerX - leftX) - prefixW - 12, fontBold, 8.5);
    if (wordsLines.length > 0) {
      page.drawText(wordsLines[0], {
        x: leftX + 5 + prefixW,
        y: toPdfY(summaryStartY + 16),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      if (wordsLines.length > 1) {
        page.drawText(wordsLines.slice(1).join(' '), {
          x: leftX + 5,
          y: toPdfY(summaryStartY + 28),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Right Cell Row 1: Round Off label and value
    const roLabel = 'Round Off';
    const roLabelW = fontBold.widthOfTextAtSize(roLabel, 8.5);
    page.drawText(roLabel, {
      x: midDividerX + (summaryValDividerX - midDividerX - roLabelW) / 2,
      y: toPdfY(summaryStartY + 12.5),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const roundOffVal = Number(invoice.round_off || 0);
    const roundOffStr = roundOffVal === 0 ? '0.00' : (roundOffVal > 0 ? `+${roundOffVal.toFixed(2)}` : roundOffVal.toFixed(2));
    const roundOffW = fontBold.widthOfTextAtSize(roundOffStr, 8.5);
    page.drawText(roundOffStr, {
      x: rightX - roundOffW - 5,
      y: toPdfY(summaryStartY + 12.5),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Right Cell Row 2: Grand Total label and value
    const gtLabel = 'Grand Total';
    const gtLabelW = fontBold.widthOfTextAtSize(gtLabel, 9.5);
    page.drawText(gtLabel, {
      x: midDividerX + (summaryValDividerX - midDividerX - gtLabelW) / 2,
      y: toPdfY(summaryStartY + 30),
      size: 9.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const grandTotText = formatAmt(invoice.grand_total);
    const grandTotW = fontBold.widthOfTextAtSize(grandTotText, 9.5);
    page.drawText(grandTotText, {
      x: rightX - grandTotW - 5,
      y: toPdfY(summaryStartY + 30),
      size: 9.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    currentY = summaryStartY + summaryH;

    // --- Bottom Box (Terms & Conditions + Bank Details) (height: 94 pt) ---
    const bottomBoxH = 94;
    const bottomBoxStartY = currentY;

    // Outer & inner borders of bottom box
    page.drawLine({ start: { x: leftX, y: toPdfY(bottomBoxStartY) }, end: { x: rightX, y: toPdfY(bottomBoxStartY) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: leftX, y: toPdfY(bottomBoxStartY + bottomBoxH) }, end: { x: rightX, y: toPdfY(bottomBoxStartY + bottomBoxH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: leftX, y: toPdfY(bottomBoxStartY) }, end: { x: leftX, y: toPdfY(bottomBoxStartY + bottomBoxH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: rightX, y: toPdfY(bottomBoxStartY) }, end: { x: rightX, y: toPdfY(bottomBoxStartY + bottomBoxH) }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midDividerX, y: toPdfY(bottomBoxStartY) }, end: { x: midDividerX, y: toPdfY(bottomBoxStartY + bottomBoxH) }, thickness: 0.75, color: rgb(0, 0, 0) });

    // Left Column: Terms & Conditions (exact 6 points + thank you line)
    const defaultTerms = [
      '1. Goods once sold will not be taken back.',
      '2. Provider as per OEM Terms & Conditions.',
      '3. Standard warranty 11 months from the date of invoice.',
      '4. Warranty provided by Manufacturer\'s Authorized Service.',
      '5. Payments should be sent through A/C payee only.',
      '6. Payments should be made within 14 days otherwise interest will be charged @24% P.A.',
      'Thanking you and assuring of our best services and attention at all times.',
    ];

    const rawTerms =
      (invoice.terms_conditions && invoice.terms_conditions.trim()) ||
      ((invoice as any).terms_and_conditions && (invoice as any).terms_and_conditions.trim()) ||
      (options.company?.default_invoice_terms && options.company.default_invoice_terms.trim());

    const rawTermsList = rawTerms
      ? rawTerms.split(/[\r\n]+/).map((l: string) => l.trim()).filter(Boolean)
      : defaultTerms;

    const termMaxW = midDividerX - leftX - 10;
    const termsToRender: string[] = [];
    for (const rLine of rawTermsList) {
      termsToRender.push(...splitTextToLines(rLine, termMaxW, fontRegular, 7.5));
    }

    const totalLines = termsToRender.length;
    const termFontSize = totalLines > 7 ? 6.5 : 7.5;
    const lineSpacing = totalLines > 7 ? Math.min(12, Math.max(8.5, Math.floor((bottomBoxH - 12) / totalLines))) : 12;

    let termLineY = bottomBoxStartY + 10;
    for (const tLine of termsToRender) {
      if (termLineY > bottomBoxStartY + bottomBoxH - 6) break;
      page.drawText(tLine, {
        x: leftX + 5,
        y: toPdfY(termLineY),
        size: termFontSize,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      termLineY += lineSpacing;
    }

    // Right Column: Bank Details
    const branchBank =
      options.branch &&
      !options.branch.use_company_bank &&
      (options.branch.bank_name || options.branch.bank_account_no);
    const bankSource: any = branchBank ? options.branch : options.company;

    const bName = bankSource?.bank_name || (invoice as any).bank_name || 'State Bank of India';
    const bBranch = bankSource?.bank_branch || (invoice as any).bank_branch || 'Erragadda, Hyderabad';
    const bAcc = bankSource?.bank_account_no || (invoice as any).bank_account_no || (isNormalGstTemplate ? '42562273668' : '34624302309');
    const bIfsc = (bankSource?.bank_ifsc || (invoice as any).bank_ifsc || 'SBIN0013272').toUpperCase();

    const bankRows = [
      { label: 'Bank Name', val: bName },
      { label: 'Branch', val: bBranch },
      { label: 'Account No', val: bAcc },
      { label: 'RTGS/NEFT/ IFSC', val: bIfsc },
    ];

    let bankLineY = bottomBoxStartY + 14;
    for (const bRow of bankRows) {
      page.drawText(`${bRow.label} : ${bRow.val}`, {
        x: midDividerX + 5,
        y: toPdfY(bankLineY),
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      bankLineY += 16;
    }

    currentY = bottomBoxStartY + bottomBoxH;

    // --- Sign-Off Block (bottom right) ---
    const signY = currentY + 16;
    const signCompany = invoice.sign_off_company || (options.company?.name ? options.company.name.toUpperCase() : 'VARUN SYSTEMS');
    let signClean = signCompany.trim();
    if (signClean.toLowerCase().startsWith('for ')) {
      signClean = signClean.substring(4).trim();
    }
    if (!signClean.endsWith('.')) {
      signClean = `${signClean}.`;
    }

    const yoursTrulyText = 'Yours truly,';
    const forCompanyText = `For ${signClean}`;

    const forW = fontBold.widthOfTextAtSize(forCompanyText, 9.5);
    const yoursW = fontRegular.widthOfTextAtSize(yoursTrulyText, 8.5);

    const rightAlignX = rightX - 5;
    page.drawText(yoursTrulyText, {
      x: rightAlignX - yoursW,
      y: toPdfY(signY),
      size: 8.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    if (fontHandwriting) {
      const compW = fontHandwriting.widthOfTextAtSize(signClean, 11);
      const prefixW = fontBold.widthOfTextAtSize('For ', 9.5);
      const totalW = prefixW + compW;
      const startSignX = rightAlignX - totalW;

      page.drawText('For ', {
        x: startSignX,
        y: toPdfY(signY + 28),
        size: 9.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(signClean, {
        x: startSignX + prefixW,
        y: toPdfY(signY + 28),
        size: 11,
        font: fontHandwriting,
        color: rgb(0, 0, 0),
      });
    } else {
      page.drawText(forCompanyText, {
        x: rightAlignX - forW,
        y: toPdfY(signY + 28),
        size: 9.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    return await pdfDoc.save();
  }

  /**
   * Generates a vector-accurate PDF matching the Varun Shree Infotech PVT LTD GST invoice templates.
   * Supports both:
   * 1. Varun Shree Infotech Normal GST Template (Intra-state with CGST & SGST columns)
   * 2. Varun Sree Infotech IGST Invoice Template (Inter-state with IGST columns)
   * - 612x792 pt Letter format with precision vector borders
   * - Header: Original/Duplicate/Triplicate copy box and centered bold underlined GST-INVOICE title
   * - 4-Column Metadata Box: Invoice No/Date, PO No/Date, DC No/Date, GSTIN/PAN
   * - Details of Receiver (Billed to) Box: Customer details, Place of supply/State/GSTIN, Agent/Code
   * - Line Items Table with extended grid lines running through body to subtotal row
   * - Subtotal row with Taxable, Tax, and Total Amount totals
   * - Summary Box: Invoice value (in words), Round Off, Grand Total
   * - Bottom 3-Column Box: Terms & Conditions, CIN & TAN numbers, Bank Details & Authorised Signatory
   */
  static async generateVarunShreeInvoicePdf(
    invoice: Invoice,
    options: PdfGenerationOptions,
    forceNormalGst?: boolean
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    let fontRegular: any;
    let fontBold: any;
    let fontItalic: any;

    let fontkitLoaded = false;
    try {
      const fontkit = require('@pdf-lib/fontkit');
      pdfDoc.registerFontkit(fontkit);
      fontkitLoaded = true;
    } catch {}

    const fontPaths = getLocalFontPaths();
    if (fontkitLoaded && fontPaths.regular && fontPaths.bold) {
      try {
        const regBytes = fs.readFileSync(fontPaths.regular);
        const boldBytes = fs.readFileSync(fontPaths.bold);
        fontRegular = await pdfDoc.embedFont(regBytes);
        fontBold = await pdfDoc.embedFont(boldBytes);
        fontItalic = fontRegular;
      } catch {
        fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      }
    } else {
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    }

    const pageWidthPt = 612;
    const pageHeightPt = 792;

    const companyName = (options.company?.legal_name || options.company?.name || 'VARUN SHREE INFOTECH PVT LTD.').trim();
    const companyGstin = (options.company?.gstin || options.branch?.gstin || '36AAKCV1634J1Z3').trim();
    const companyPan = (options.company?.pan || (companyGstin.length >= 12 ? companyGstin.substring(2, 12) : 'AAKCV1634J')).trim();
    const companyCin = ((options.company as any)?.cin || 'U47411TS2024PTC185327').trim();
    const companyTan = ((options.company as any)?.tan || 'HYDV26494G').trim();

    const bankName = (options.company?.bank_name || 'STATE BANK OF INDIA').trim();
    const bankBranch = (options.company?.bank_branch || 'ERRAGADDA, HYDERABAD,').trim();
    const bankAccNo = (options.company?.bank_account_no || '43167049390').trim();
    const bankIfsc = (options.company?.bank_ifsc || 'SBIN0013272').trim();

    const customerGstin = (invoice.customer_gstin || '').trim();
    const gstinStateCode = customerGstin.length >= 2 ? customerGstin.substring(0, 2) : '';

    const templateId = options.template?.id || invoice.letterhead_template_id || '';
    const templateName = (options.template?.name || '').toLowerCase();
    const isNormalGstTemplate =
      forceNormalGst === true ||
      templateId === 'builtin-varun-shree-invoice-normal-gst' ||
      ((templateName.includes('varun shree') || templateName.includes('varun sree')) && templateName.includes('normal gst'));

    const isIgstTemplate =
      templateId === 'builtin-varun-shree-igst-invoice' ||
      ((templateName.includes('varun shree') || templateName.includes('varun sree')) && templateName.includes('igst'));

    const isInterState = isNormalGstTemplate
      ? false
      : isIgstTemplate
      ? true
      : Boolean(
          invoice.is_inter_state ||
          Number(invoice.total_igst || 0) > 0 ||
          (companyGstin.length >= 2 && customerGstin.length >= 2 && companyGstin.substring(0, 2) !== customerGstin.substring(0, 2))
        );

    const receiverState = (
      invoice.place_of_supply_state ||
      (invoice as any).customer_state ||
      (isInterState ? 'Andhra Pradesh' : 'Telangana')
    ).trim();

    const receiverPlaceOfSupply = (
      (invoice as any).place_of_supply ||
      invoice.place_of_supply_state ||
      (isInterState ? 'Ananthapuramu' : 'Telangana')
    ).trim();

    const receiverStateCode = (
      invoice.place_of_supply_code ||
      (invoice as any).customer_state_code ||
      gstinStateCode ||
      (isInterState ? '37' : '36')
    ).trim();

    const agentName = (invoice.agent_name || (invoice as any).agent || '').trim();

    const formatDdmmyyyy = (d?: string) => {
      if (!d) return '';
      const clean = d.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return clean;
    };

    const splitTextToLines = (text: string, maxWidth: number, font: any, size: number): string[] => {
      if (!text) return [];
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

    let page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    const { width, height } = page.getSize();
    const toPdfY = (topY: number) => height - topY;

    // Optional Digital Letterhead Overlay
    const renderDigitalOverlay = Boolean(
      (invoice.print_letterhead_overlay || (options as any).showOverlay) &&
      options.mode !== 'PREPRINTED_STATIONERY'
    );
    if (renderDigitalOverlay && options.template?.file_path && fs.existsSync(options.template.file_path)) {
      try {
        const bgBytes = fs.readFileSync(options.template.file_path);
        const bgDoc = await PDFDocument.load(bgBytes);
        const [bgPage] = await pdfDoc.embedPages([bgDoc.getPages()[0]]);
        page.drawPage(bgPage, { x: 0, y: 0, width, height });
      } catch {}
    }

    // Geometry based on exact coordinates from official VSIT sample PDFs
    const outerLeft = 11.88;
    const outerRight = 601.32;
    const outerTopY = 70.4;
    const outerBottomY = 715.06;

    const leftX = 13.8;
    const rightX = 598.8;
    const tableWidth = rightX - leftX; // 585 pt

    // Dividers adapt based on whether document is Inter-State (IGST) or Intra-State (Normal GST with CGST+SGST)
    const metaDividers = isInterState ? [281.81, 344.35, 452.38] : [204.89, 314.33, 453.70];
    const receiverDividers = isInterState ? [281.81, 452.38] : [314.33, 453.70];
    const bottomDividers = isInterState ? [281.81, 389.11] : [204.89, 376.39];

    // For IGST: [13.8, 30.6, 281.81, 323.35, 344.35, 389.11, 452.38, 471.10, 532.30, 598.80] (8 cols)
    // For Normal GST: [13.8, 31.0, 204.89, 247.13, 268.97, 314.33, 376.39, 394.39, 453.70, 475.06, 533.02, 598.80] (9 cols with CGST & SGST)
    const colDividers = isInterState
      ? [13.8, 30.6, 281.81, 323.35, 344.35, 389.11, 452.38, 471.10, 532.30, 598.80]
      : [13.8, 31.0, 204.89, 247.13, 268.97, 314.33, 376.39, 394.39, 453.70, 475.06, 533.02, 598.80];

    const drawHeaderAndMetadata = (isContinuation: boolean = false): number => {
      // 1. Top copy indicator box (Original / Duplicate / Triplicate)
      if (!isContinuation) {
        const copyBoxX = 471.58;
        const copyBoxTopY = 66.1;
        const copyBoxW = rightX - copyBoxX;
        const copyBoxH = 14.78;

        page.drawRectangle({
          x: copyBoxX,
          y: toPdfY(copyBoxTopY + copyBoxH),
          width: copyBoxW,
          height: copyBoxH,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.75,
        });
        const copyText = 'Orginal/Duplicate/Triplicate';
        const copyW = fontRegular.widthOfTextAtSize(copyText, 8);
        page.drawText(copyText, {
          x: copyBoxX + (copyBoxW - copyW) / 2,
          y: toPdfY(copyBoxTopY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }

      // 2. GST-INVOICE Title Box
      const titleBoxTopY = 80.9;
      const titleBoxH = 29.76;
      page.drawRectangle({
        x: leftX,
        y: toPdfY(titleBoxTopY + titleBoxH),
        width: tableWidth,
        height: titleBoxH,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });

      const titleText = isContinuation ? 'GST-INVOICE (Continued)' : 'GST-INVOICE';
      const titleSize = 13.5;
      const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
      const titleX = leftX + (tableWidth - titleW) / 2;
      const titleY = titleBoxTopY + 19;

      page.drawText(titleText, {
        x: titleX,
        y: toPdfY(titleY),
        size: titleSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Underline directly beneath GST-INVOICE
      page.drawLine({
        start: { x: titleX, y: toPdfY(titleY + 3) },
        end: { x: titleX + titleW, y: toPdfY(titleY + 3) },
        thickness: 1.2,
        color: rgb(0, 0, 0),
      });

      if (isContinuation) {
        return titleBoxTopY + titleBoxH;
      }

      // 3. 4-Column Metadata Box (Height = 29.76 pt, 2 rows of 14.88 pt)
      const metaTopY = titleBoxTopY + titleBoxH; // 110.66
      const metaRowH = 14.88;
      const metaBoxH = metaRowH * 2; // 29.76

      page.drawRectangle({
        x: leftX,
        y: toPdfY(metaTopY + metaBoxH),
        width: tableWidth,
        height: metaBoxH,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });

      // Horizontal line separating Row 1 and Row 2
      page.drawLine({
        start: { x: leftX, y: toPdfY(metaTopY + metaRowH) },
        end: { x: rightX, y: toPdfY(metaTopY + metaRowH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });

      // Vertical dividers in metadata box
      for (const divX of metaDividers) {
        page.drawLine({
          start: { x: divX, y: toPdfY(metaTopY) },
          end: { x: divX, y: toPdfY(metaTopY + metaBoxH) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });
      }

      // Row 1 Texts
      const row1BaselineY = metaTopY + 10.5;
      page.drawText(`Invoice No : ${invoice.invoice_number || ''}`, {
        x: leftX + 4,
        y: toPdfY(row1BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const poNumberStr = invoice.purchase_order_number || invoice.po_number || '';
      page.drawText(`PO No: ${poNumberStr}`, {
        x: metaDividers[0] + 4,
        y: toPdfY(row1BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const dcNumberStr = invoice.delivery_challan_number || invoice.dc_number || invoice.reference_number || '';
      page.drawText(`DC No: ${dcNumberStr}`, {
        x: metaDividers[1] + 4,
        y: toPdfY(row1BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(`GST IN: ${companyGstin}`, {
        x: metaDividers[2] + 4,
        y: toPdfY(row1BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Row 2 Texts
      const row2BaselineY = metaTopY + metaRowH + 10.5;
      page.drawText(`Date of invoice : ${formatDdmmyyyy(invoice.invoice_date)}`, {
        x: leftX + 4,
        y: toPdfY(row2BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const poDateStr = formatDdmmyyyy(invoice.purchase_order_date || invoice.po_date);
      page.drawText(`PO Date: ${poDateStr}`, {
        x: metaDividers[0] + 4,
        y: toPdfY(row2BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const dcDateStr = formatDdmmyyyy(invoice.delivery_challan_date || invoice.dc_date);
      page.drawText(`DC Date: ${dcDateStr}`, {
        x: metaDividers[1] + 4,
        y: toPdfY(row2BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(`PAN :  ${companyPan}`, {
        x: metaDividers[2] + 4,
        y: toPdfY(row2BaselineY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // 4. Details of Receiver (Billed to) Box (Total Height = 60 pt)
      const receiverTopY = metaTopY + metaBoxH; // 140.42
      const receiverBannerH = 14.88;
      const receiverContentH = 45.12;
      const receiverTotalH = receiverBannerH + receiverContentH; // 60 pt

      page.drawRectangle({
        x: leftX,
        y: toPdfY(receiverTopY + receiverTotalH),
        width: tableWidth,
        height: receiverTotalH,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });

      // Horizontal line under banner
      page.drawLine({
        start: { x: leftX, y: toPdfY(receiverTopY + receiverBannerH) },
        end: { x: rightX, y: toPdfY(receiverTopY + receiverBannerH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });

      // Banner Text: Details of Receiver (Billed to)
      const bannerText = 'Details of Receiver (Billed to)';
      const bannerW = fontBold.widthOfTextAtSize(bannerText, 9);
      page.drawText(bannerText, {
        x: leftX + (tableWidth - bannerW) / 2,
        y: toPdfY(receiverTopY + 10.5),
        size: 9,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Receiver Vertical dividers
      page.drawLine({
        start: { x: receiverDividers[0], y: toPdfY(receiverTopY + receiverBannerH) },
        end: { x: receiverDividers[0], y: toPdfY(receiverTopY + receiverTotalH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: receiverDividers[1], y: toPdfY(receiverTopY + receiverBannerH) },
        end: { x: receiverDividers[1], y: toPdfY(receiverTopY + receiverTotalH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });

      // Left Column: Customer Name & Address
      const custContentTopY = receiverTopY + receiverBannerH;
      const custName = (invoice.customer_name || '').trim();
      page.drawText(custName, {
        x: leftX + 4,
        y: toPdfY(custContentTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const rawAddress = (invoice.billing_address || '').replace(/\r/g, '');
      const addrLines = rawAddress
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      let curAddrY = custContentTopY + 21.5;
      for (const line of addrLines.slice(0, 3)) {
        page.drawText(line, {
          x: leftX + 4,
          y: toPdfY(curAddrY),
          size: 7.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
        curAddrY += 10.5;
      }

      // Middle Column: Place of Supply, State Name, GSTIN/UIN
      const midBaselineY1 = custContentTopY + 10.5;
      const midBaselineY2 = custContentTopY + 25.0;
      const midBaselineY3 = custContentTopY + 39.5;

      page.drawText(`Place of Supply : ${receiverPlaceOfSupply}`, {
        x: receiverDividers[0] + 4,
        y: toPdfY(midBaselineY1),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      page.drawText(`State Name : ${receiverState}`, {
        x: receiverDividers[0] + 4,
        y: toPdfY(midBaselineY2),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      page.drawText(`GSTIN/UIN : ${customerGstin}`, {
        x: receiverDividers[0] + 4,
        y: toPdfY(midBaselineY3),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Right Column: Agent Name, Code
      page.drawText(`Agent Name: ${agentName}`, {
        x: receiverDividers[1] + 4,
        y: toPdfY(midBaselineY1),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      page.drawText(`Code : ${receiverStateCode}`, {
        x: receiverDividers[1] + 4,
        y: toPdfY(midBaselineY2),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      return receiverTopY + receiverTotalH; // 200.42
    };

    const drawTableHeader = (tableHeaderTopY: number) => {
      const headerH = 29.16;
      page.drawRectangle({
        x: leftX,
        y: toPdfY(tableHeaderTopY + headerH),
        width: tableWidth,
        height: headerH,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });

      const subTopY = tableHeaderTopY + 14.58;

      if (isInterState) {
        // IGST subheader horizontal line
        page.drawLine({
          start: { x: colDividers[6], y: toPdfY(subTopY) },
          end: { x: colDividers[8], y: toPdfY(subTopY) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        // Vertical line separating IGST % and Amt.
        page.drawLine({
          start: { x: colDividers[7], y: toPdfY(subTopY) },
          end: { x: colDividers[7], y: toPdfY(tableHeaderTopY + headerH) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        // Main column vertical lines in header
        for (let i = 1; i <= 8; i++) {
          if (i === 7) continue;
          page.drawLine({
            start: { x: colDividers[i], y: toPdfY(tableHeaderTopY) },
            end: { x: colDividers[i], y: toPdfY(tableHeaderTopY + headerH) },
            thickness: 0.75,
            color: rgb(0, 0, 0),
          });
        }
      } else {
        // Normal GST: CGST & SGST horizontal subheader lines
        page.drawLine({
          start: { x: colDividers[6], y: toPdfY(subTopY) },
          end: { x: colDividers[10], y: toPdfY(subTopY) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        // Subdivider for CGST (% and Amt.)
        page.drawLine({
          start: { x: colDividers[7], y: toPdfY(subTopY) },
          end: { x: colDividers[7], y: toPdfY(tableHeaderTopY + headerH) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        // Subdivider for SGST (% and Amt.)
        page.drawLine({
          start: { x: colDividers[9], y: toPdfY(subTopY) },
          end: { x: colDividers[9], y: toPdfY(tableHeaderTopY + headerH) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        // Main column vertical lines in header
        for (let i = 1; i <= 10; i++) {
          if (i === 7 || i === 9) continue;
          page.drawLine({
            start: { x: colDividers[i], y: toPdfY(tableHeaderTopY) },
            end: { x: colDividers[i], y: toPdfY(tableHeaderTopY + headerH) },
            thickness: 0.75,
            color: rgb(0, 0, 0),
          });
        }
      }

      // Col 0: S No (stacked)
      const sW = fontBold.widthOfTextAtSize('S', 8);
      const noW = fontBold.widthOfTextAtSize('No', 8);
      page.drawText('S', {
        x: colDividers[0] + (colDividers[1] - colDividers[0] - sW) / 2,
        y: toPdfY(tableHeaderTopY + 11),
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText('No', {
        x: colDividers[0] + (colDividers[1] - colDividers[0] - noW) / 2,
        y: toPdfY(tableHeaderTopY + 22),
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 1: Description of Goodes
      const descText = 'Description of Goodes';
      const descW = fontBold.widthOfTextAtSize(descText, 8.5);
      page.drawText(descText, {
        x: colDividers[1] + (colDividers[2] - colDividers[1] - descW) / 2,
        y: toPdfY(tableHeaderTopY + 17),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 2: HSN/SAC Code (stacked)
      const hsnW = fontBold.widthOfTextAtSize('HSN/SAC', 8);
      const codeW = fontBold.widthOfTextAtSize('Code', 8);
      page.drawText('HSN/SAC', {
        x: colDividers[2] + (colDividers[3] - colDividers[2] - hsnW) / 2,
        y: toPdfY(tableHeaderTopY + 11),
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText('Code', {
        x: colDividers[2] + (colDividers[3] - colDividers[2] - codeW) / 2,
        y: toPdfY(tableHeaderTopY + 22),
        size: 8,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 3: Qty
      const qtyText = 'Qty';
      const qtyW = fontBold.widthOfTextAtSize(qtyText, 8.5);
      page.drawText(qtyText, {
        x: colDividers[3] + (colDividers[4] - colDividers[3] - qtyW) / 2,
        y: toPdfY(tableHeaderTopY + 17),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 4: Base Rate
      const rateText = 'Base Rate';
      const rateW = fontBold.widthOfTextAtSize(rateText, 8.5);
      page.drawText(rateText, {
        x: colDividers[4] + (colDividers[5] - colDividers[4] - rateW) / 2,
        y: toPdfY(tableHeaderTopY + 17),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Col 5: Taxable Amount
      const taxText = 'Taxable Amount';
      const taxW = fontBold.widthOfTextAtSize(taxText, 8.5);
      page.drawText(taxText, {
        x: colDividers[5] + (colDividers[6] - colDividers[5] - taxW) / 2,
        y: toPdfY(tableHeaderTopY + 17),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      if (isInterState) {
        // Col 6: IGST Header
        const igstText = 'IGST';
        const igstW = fontBold.widthOfTextAtSize(igstText, 8.5);
        page.drawText(igstText, {
          x: colDividers[6] + (colDividers[8] - colDividers[6] - igstW) / 2,
          y: toPdfY(tableHeaderTopY + 10.5),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Subcol 6a: %
        const pctText = '%';
        const pctW = fontBold.widthOfTextAtSize(pctText, 8);
        page.drawText(pctText, {
          x: colDividers[6] + (colDividers[7] - colDividers[6] - pctW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Subcol 6b: Amt.
        const amtText = 'Amt.';
        const amtW = fontBold.widthOfTextAtSize(amtText, 8);
        page.drawText(amtText, {
          x: colDividers[7] + (colDividers[8] - colDividers[7] - amtW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Col 7: Total Amount
        const totalText = 'Total Amount';
        const totalW = fontBold.widthOfTextAtSize(totalText, 8.5);
        page.drawText(totalText, {
          x: colDividers[8] + (colDividers[9] - colDividers[8] - totalW) / 2,
          y: toPdfY(tableHeaderTopY + 17),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      } else {
        // Normal GST Headers: CGST & SGST
        // Col 6: CGST Header
        const cgstText = 'CGST';
        const cgstW = fontBold.widthOfTextAtSize(cgstText, 8.5);
        page.drawText(cgstText, {
          x: colDividers[6] + (colDividers[8] - colDividers[6] - cgstW) / 2,
          y: toPdfY(tableHeaderTopY + 10.5),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        const pctText = '%';
        const pctW = fontBold.widthOfTextAtSize(pctText, 8);
        page.drawText(pctText, {
          x: colDividers[6] + (colDividers[7] - colDividers[6] - pctW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        const amtText = 'Amt.';
        const amtW = fontBold.widthOfTextAtSize(amtText, 8);
        page.drawText(amtText, {
          x: colDividers[7] + (colDividers[8] - colDividers[7] - amtW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Col 7: SGST Header
        const sgstText = 'SGST';
        const sgstW = fontBold.widthOfTextAtSize(sgstText, 8.5);
        page.drawText(sgstText, {
          x: colDividers[8] + (colDividers[10] - colDividers[8] - sgstW) / 2,
          y: toPdfY(tableHeaderTopY + 10.5),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        page.drawText(pctText, {
          x: colDividers[8] + (colDividers[9] - colDividers[8] - pctW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        page.drawText(amtText, {
          x: colDividers[9] + (colDividers[10] - colDividers[9] - amtW) / 2,
          y: toPdfY(tableHeaderTopY + 23),
          size: 8,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Col 8: Total Amount
        const totalText = 'Total Amount';
        const totalW = fontBold.widthOfTextAtSize(totalText, 8.5);
        page.drawText(totalText, {
          x: colDividers[10] + (colDividers[11] - colDividers[10] - totalW) / 2,
          y: toPdfY(tableHeaderTopY + 17),
          size: 8.5,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }

      return tableHeaderTopY + headerH;
    };

    // Calculate item heights and wrap lines
    const rawItems = invoice.items || [];
    const itemHeights: number[] = [];
    const itemDescLines: string[][] = [];

    for (const it of rawItems) {
      const fullDesc = (it.item_name || '') + (it.description ? ` ${it.description}` : '');
      const maxWidth = colDividers[2] - colDividers[1] - 8;
      const lines = splitTextToLines(fullDesc, maxWidth, fontBold, 8);
      const computedLines = lines.length > 0 ? lines : [''];
      itemDescLines.push(computedLines);
      const rowH = Math.max(14.76, computedLines.length * 10.5 + 4);
      itemHeights.push(rowH);
    }

    // Page 1 Setup
    let currentTopY = drawHeaderAndMetadata(false); // 200.42
    let tableBodyStartY = drawTableHeader(currentTopY); // 229.58

    const subtotalTopY = 517.51;
    const subtotalH = 14.28;
    const summaryTopY = subtotalTopY + subtotalH; // 531.79
    const summaryH = 45.00;
    const bottomBoxTopY = summaryTopY + summaryH; // 576.79
    const bottomBoxH = 138.27; // down to 715.06

    let itemCursorY = tableBodyStartY;
    let pageItemsStartIndex = 0;
    const numDividers = colDividers.length - 1;

    for (let i = 0; i < rawItems.length; i++) {
      const rowH = itemHeights[i];
      if (itemCursorY + rowH > subtotalTopY && i > pageItemsStartIndex) {
        // Multi-page continuation
        for (let d = 1; d <= numDividers - 1; d++) {
          page.drawLine({
            start: { x: colDividers[d], y: toPdfY(tableBodyStartY) },
            end: { x: colDividers[d], y: toPdfY(subtotalTopY) },
            thickness: 0.75,
            color: rgb(0, 0, 0),
          });
        }
        page.drawLine({
          start: { x: leftX, y: toPdfY(subtotalTopY) },
          end: { x: rightX, y: toPdfY(subtotalTopY) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });

        page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
        currentTopY = drawHeaderAndMetadata(true);
        tableBodyStartY = drawTableHeader(currentTopY);
        itemCursorY = tableBodyStartY;
        pageItemsStartIndex = i;
      }

      // Draw item row
      const it = rawItems[i];
      const descLines = itemDescLines[i];
      const srText = String(i + 1);

      // S No (centered in col 0)
      const srW = fontRegular.widthOfTextAtSize(srText, 8);
      page.drawText(srText, {
        x: colDividers[0] + (colDividers[1] - colDividers[0] - srW) / 2,
        y: toPdfY(itemCursorY + 10.5),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Description of Goods (col 1)
      let lineY = itemCursorY + 10.5;
      for (let lIdx = 0; lIdx < descLines.length; lIdx++) {
        page.drawText(descLines[lIdx], {
          x: colDividers[1] + 4,
          y: toPdfY(lineY),
          size: 8,
          font: lIdx === 0 ? fontBold : fontRegular,
          color: rgb(0, 0, 0),
        });
        lineY += 10.5;
      }

      // HSN/SAC (col 2, centered)
      const hsnVal = String(it.hsn_or_sac || '');
      const hsnW = fontRegular.widthOfTextAtSize(hsnVal, 8);
      page.drawText(hsnVal, {
        x: colDividers[2] + (colDividers[3] - colDividers[2] - hsnW) / 2,
        y: toPdfY(itemCursorY + 10.5),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Qty (col 3, centered)
      const qtyVal = String(it.quantity || '1');
      const qtyW = fontRegular.widthOfTextAtSize(qtyVal, 8);
      page.drawText(qtyVal, {
        x: colDividers[3] + (colDividers[4] - colDividers[3] - qtyW) / 2,
        y: toPdfY(itemCursorY + 10.5),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Base Rate (col 4, right-aligned)
      const rateVal = Number(it.rate || 0).toFixed(2);
      const rateW = fontRegular.widthOfTextAtSize(rateVal, 8);
      page.drawText(rateVal, {
        x: colDividers[5] - 4 - rateW,
        y: toPdfY(itemCursorY + 10.5),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      // Taxable Amount (col 5, right-aligned)
      const taxVal = Number(it.taxable_value || 0).toFixed(2);
      const taxW = fontRegular.widthOfTextAtSize(taxVal, 8);
      page.drawText(taxVal, {
        x: colDividers[6] - 4 - taxW,
        y: toPdfY(itemCursorY + 10.5),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });

      if (isInterState) {
        // IGST % (subcol 6a, centered)
        const igstRateVal = String(Math.round(Number(it.igst_rate || it.gst_rate || 18)));
        const igstRateW = fontRegular.widthOfTextAtSize(igstRateVal, 8);
        page.drawText(igstRateVal, {
          x: colDividers[6] + (colDividers[7] - colDividers[6] - igstRateW) / 2,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        // IGST Amt (subcol 6b, right-aligned)
        const igstAmtVal = (Number(it.igst_amount || it.total_tax || 0)).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const igstAmtW = fontRegular.widthOfTextAtSize(igstAmtVal, 8);
        page.drawText(igstAmtVal, {
          x: colDividers[8] - 4 - igstAmtW,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        // Total Amount (col 7, right-aligned)
        const lineTotalVal = Number(it.line_total || 0).toFixed(2);
        const lineTotalW = fontRegular.widthOfTextAtSize(lineTotalVal, 8);
        page.drawText(lineTotalVal, {
          x: colDividers[9] - 4 - lineTotalW,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      } else {
        // Normal GST: CGST & SGST
        const halfRate = Math.round(Number(it.cgst_rate || (Number(it.gst_rate || 18) / 2)));
        const cgstRateVal = String(halfRate);
        const cgstRateW = fontRegular.widthOfTextAtSize(cgstRateVal, 8);
        page.drawText(cgstRateVal, {
          x: colDividers[6] + (colDividers[7] - colDividers[6] - cgstRateW) / 2,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        const halfTax = (Number(it.cgst_amount || (Number(it.total_tax || 0) / 2))).toFixed(2);
        const cgstAmtW = fontRegular.widthOfTextAtSize(halfTax, 8);
        page.drawText(halfTax, {
          x: colDividers[8] - 4 - cgstAmtW,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        const sgstRateVal = String(halfRate);
        const sgstRateW = fontRegular.widthOfTextAtSize(sgstRateVal, 8);
        page.drawText(sgstRateVal, {
          x: colDividers[8] + (colDividers[9] - colDividers[8] - sgstRateW) / 2,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        const sgstAmtW = fontRegular.widthOfTextAtSize(halfTax, 8);
        page.drawText(halfTax, {
          x: colDividers[10] - 4 - sgstAmtW,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });

        // Total Amount (col 8, right-aligned)
        const lineTotalVal = Number(it.line_total || 0).toFixed(2);
        const lineTotalW = fontRegular.widthOfTextAtSize(lineTotalVal, 8);
        page.drawText(lineTotalVal, {
          x: colDividers[11] - 4 - lineTotalW,
          y: toPdfY(itemCursorY + 10.5),
          size: 8,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }

      itemCursorY += rowH;
    }

    // Extended vertical column lines all the way from tableBodyStartY to subtotalTopY
    for (let d = 1; d <= numDividers - 1; d++) {
      page.drawLine({
        start: { x: colDividers[d], y: toPdfY(tableBodyStartY) },
        end: { x: colDividers[d], y: toPdfY(subtotalTopY) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
    }

    // --- Subtotal Row ---
    // Horizontal border at top of subtotal row
    page.drawLine({
      start: { x: leftX, y: toPdfY(subtotalTopY) },
      end: { x: rightX, y: toPdfY(subtotalTopY) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
    // Horizontal border at bottom of subtotal row
    page.drawLine({
      start: { x: leftX, y: toPdfY(subtotalTopY + subtotalH) },
      end: { x: rightX, y: toPdfY(subtotalTopY + subtotalH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Subtotal vertical dividers
    const subtotalDivs = isInterState
      ? [colDividers[5], colDividers[6], colDividers[7], colDividers[8]]
      : [colDividers[5], colDividers[6], colDividers[7], colDividers[8], colDividers[9], colDividers[10]];

    for (const sDivX of subtotalDivs) {
      page.drawLine({
        start: { x: sDivX, y: toPdfY(subtotalTopY) },
        end: { x: sDivX, y: toPdfY(subtotalTopY + subtotalH) },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
    }

    // Subtotal values
    const totTaxableStr = Number(invoice.total_taxable_value || invoice.subtotal || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const totTaxableW = fontBold.widthOfTextAtSize(totTaxableStr, 8.5);
    page.drawText(totTaxableStr, {
      x: colDividers[6] - 4 - totTaxableW,
      y: toPdfY(subtotalTopY + 10.5),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    if (isInterState) {
      const totIgstStr = Number(invoice.total_igst || invoice.total_tax || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const totIgstW = fontBold.widthOfTextAtSize(totIgstStr, 8.5);
      page.drawText(totIgstStr, {
        x: colDividers[8] - 4 - totIgstW,
        y: toPdfY(subtotalTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const totBeforeRound = (
        Number(invoice.total_taxable_value || invoice.subtotal || 0) +
        Number(invoice.total_igst || invoice.total_tax || 0)
      ).toFixed(2);
      const totBeforeRoundW = fontBold.widthOfTextAtSize(totBeforeRound, 8.5);
      page.drawText(totBeforeRound, {
        x: colDividers[9] - 4 - totBeforeRoundW,
        y: toPdfY(subtotalTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    } else {
      const totCgstNum = Number(invoice.total_cgst || (Number(invoice.total_tax || 0) / 2));
      const totCgstStr = totCgstNum.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const totCgstW = fontBold.widthOfTextAtSize(totCgstStr, 8.5);
      page.drawText(totCgstStr, {
        x: colDividers[8] - 4 - totCgstW,
        y: toPdfY(subtotalTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const totSgstNum = Number(invoice.total_sgst || (Number(invoice.total_tax || 0) / 2));
      const totSgstStr = totSgstNum.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const totSgstW = fontBold.widthOfTextAtSize(totSgstStr, 8.5);
      page.drawText(totSgstStr, {
        x: colDividers[10] - 4 - totSgstW,
        y: toPdfY(subtotalTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      const totBeforeRound = (
        Number(invoice.total_taxable_value || invoice.subtotal || 0) +
        Number(invoice.total_cgst || (Number(invoice.total_tax || 0) / 2)) +
        Number(invoice.total_sgst || (Number(invoice.total_tax || 0) / 2))
      ).toFixed(2);
      const totBeforeRoundW = fontBold.widthOfTextAtSize(totBeforeRound, 8.5);
      page.drawText(totBeforeRound, {
        x: colDividers[11] - 4 - totBeforeRoundW,
        y: toPdfY(subtotalTopY + 10.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // --- Summary Box (Height = 45 pt) ---
    page.drawRectangle({
      x: leftX,
      y: toPdfY(summaryTopY + summaryH),
      width: tableWidth,
      height: summaryH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    const summarySplitX = isInterState ? 452.38 : 453.70;
    const summaryValDividerX = isInterState ? 532.30 : 533.02;

    // Vertical line separating Words (left) and Totals (right)
    page.drawLine({
      start: { x: summarySplitX, y: toPdfY(summaryTopY) },
      end: { x: summarySplitX, y: toPdfY(summaryTopY + summaryH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Horizontal line separating Round Off (row 1) and Grand Total (row 2)
    const summaryMidY = summaryTopY + 22.5;
    page.drawLine({
      start: { x: summarySplitX, y: toPdfY(summaryMidY) },
      end: { x: rightX, y: toPdfY(summaryMidY) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Vertical divider in Totals between Labels and Values
    page.drawLine({
      start: { x: summaryValDividerX, y: toPdfY(summaryTopY) },
      end: { x: summaryValDividerX, y: toPdfY(summaryTopY + summaryH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Left side: Invoice value (In words)
    page.drawText('Invoice value (In words)', {
      x: leftX + 4,
      y: toPdfY(summaryTopY + 12),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const wordsVal = (invoice.amount_in_words || '').trim();
    const wordsLines = splitTextToLines(wordsVal, summarySplitX - leftX - 10, fontRegular, 8);
    let wordsY = summaryTopY + 25;
    for (const wLine of wordsLines.slice(0, 2)) {
      page.drawText(wLine, {
        x: leftX + 4,
        y: toPdfY(wordsY),
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      });
      wordsY += 10.5;
    }

    // Right side: Round Off and Grand Total
    page.drawText('Round Off', {
      x: summarySplitX + 6,
      y: toPdfY(summaryTopY + 15),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const roundOffNum = Number(invoice.round_off || 0);
    const roundOffStr = (roundOffNum >= 0 ? '' : '') + roundOffNum.toFixed(2);
    const roundOffW = fontRegular.widthOfTextAtSize(roundOffStr, 8.5);
    page.drawText(roundOffStr, {
      x: rightX - 6 - roundOffW,
      y: toPdfY(summaryTopY + 15),
      size: 8.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    page.drawText('Grand Total', {
      x: summarySplitX + 6,
      y: toPdfY(summaryMidY + 15),
      size: 9,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const grandTotalStr = Number(invoice.grand_total || 0).toFixed(2);
    const grandTotalW = fontBold.widthOfTextAtSize(grandTotalStr, 9);
    page.drawText(grandTotalStr, {
      x: rightX - 6 - grandTotalW,
      y: toPdfY(summaryMidY + 15),
      size: 9,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // --- Bottom 3-Column Box (Height = 138.27 pt) ---
    // Outer border
    page.drawRectangle({
      x: leftX,
      y: toPdfY(bottomBoxTopY + bottomBoxH),
      width: tableWidth,
      height: bottomBoxH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    // Column Dividers at bottomDividers[0] and bottomDividers[1]
    page.drawLine({
      start: { x: bottomDividers[0], y: toPdfY(bottomBoxTopY) },
      end: { x: bottomDividers[0], y: toPdfY(bottomBoxTopY + bottomBoxH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: bottomDividers[1], y: toPdfY(bottomBoxTopY) },
      end: { x: bottomDividers[1], y: toPdfY(bottomBoxTopY + bottomBoxH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Left Column: Terms & Conditions
    const defaultTermsList = [
      '1. Goods once sold will not be taken back.',
      '2. All disputes are subjected to Hyderabad jurisdiction',
      '3. Cheque Bounce Will Be Charged Rs.500/-+Taxes',
      '4. All payments Chqes/DD Payable to VARUN SHREE INFOTECH PVT LTD.',
      '5. Warranty as per manufacturers standard warranty policy and shall be directly provided by the company.',
      '6. Payments should be made within14days other wise interest will be charged @24% P.A.',
      'Thanking you and assuring of our best services and attention at all times.',
    ];

    const activeTermsText = (invoice.terms_and_conditions || invoice.terms_conditions || '').trim();
    const activeTermsList = activeTermsText
      ? activeTermsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      : defaultTermsList;

    let termY = bottomBoxTopY + 10;
    const termsMaxW = bottomDividers[0] - leftX - 8;
    for (const term of activeTermsList) {
      const wrappedTermLines = splitTextToLines(term, termsMaxW, fontRegular, 6.7);
      for (const tLine of wrappedTermLines) {
        if (termY > bottomBoxTopY + bottomBoxH - 4) break;
        page.drawText(tLine, {
          x: leftX + 4,
          y: toPdfY(termY),
          size: 6.7,
          font: term.startsWith('Thanking') ? fontItalic : fontRegular,
          color: rgb(0, 0, 0),
        });
        termY += 9.2;
      }
    }

    // Middle Column: Statutory Details (CIN No & TAN No)
    page.drawLine({
      start: { x: bottomDividers[0], y: toPdfY(bottomBoxTopY + 30) },
      end: { x: bottomDividers[1], y: toPdfY(bottomBoxTopY + 30) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    page.drawText(`CIN No:  ${companyCin}`, {
      x: bottomDividers[0] + 4,
      y: toPdfY(bottomBoxTopY + 16),
      size: 7,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Company's TAN No:   ${companyTan}`, {
      x: bottomDividers[0] + 4,
      y: toPdfY(bottomBoxTopY + 46),
      size: 7,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Right Column: Bank Details & Signatory
    const bankHeader = "Company's Bank details";
    const bankHdrW = fontBold.widthOfTextAtSize(bankHeader, 8);
    const bankHdrX = bottomDividers[1] + 6;
    const bankHdrY = bottomBoxTopY + 13;

    page.drawText(bankHeader, {
      x: bankHdrX,
      y: toPdfY(bankHdrY),
      size: 8,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: bankHdrX, y: toPdfY(bankHdrY + 2) },
      end: { x: bankHdrX + bankHdrW, y: toPdfY(bankHdrY + 2) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Bank Name :  ${bankName}`, {
      x: bottomDividers[1] + 6,
      y: toPdfY(bottomBoxTopY + 27),
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Branch :         ${bankBranch}`, {
      x: bottomDividers[1] + 6,
      y: toPdfY(bottomBoxTopY + 41),
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Account No : ${bankAccNo}`, {
      x: bottomDividers[1] + 6,
      y: toPdfY(bottomBoxTopY + 55),
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    page.drawText(`IFSC CODE :  ${bankIfsc}`, {
      x: bottomDividers[1] + 6,
      y: toPdfY(bottomBoxTopY + 69),
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Signatory Area (Bottom-Right part)
    const signBoxTopY = bottomBoxTopY + 82;
    page.drawLine({
      start: { x: bottomDividers[1], y: toPdfY(signBoxTopY) },
      end: { x: rightX, y: toPdfY(signBoxTopY) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    const forText = `For ${companyName}`;
    const forW = fontBold.widthOfTextAtSize(forText, 8.5);
    page.drawText(forText, {
      x: bottomDividers[1] + (rightX - bottomDividers[1] - forW) / 2,
      y: toPdfY(signBoxTopY + 14),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const authText = 'Authorised signatory';
    const authW = fontBold.widthOfTextAtSize(authText, 8.5);
    page.drawText(authText, {
      x: bottomDividers[1] + (rightX - bottomDividers[1] - authW) / 2,
      y: toPdfY(bottomBoxTopY + bottomBoxH - 8),
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Outer border surrounding the entire document
    page.drawRectangle({
      x: outerLeft,
      y: toPdfY(outerBottomY),
      width: outerRight - outerLeft,
      height: outerBottomY - outerTopY,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.96,
    });

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
    let fontHandwriting: any = null;

    let fontkitLoaded = false;
    try {
      const fontkit = require('@pdf-lib/fontkit');
      pdfDoc.registerFontkit(fontkit);
      fontkitLoaded = true;
    } catch {}

    const fontPaths = getLocalFontPaths();
    if (fontkitLoaded && fontPaths.regular && fontPaths.bold) {
      try {
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

    if (fontkitLoaded) {
      const hwPath = getHandwritingFontPath();
      if (hwPath && fs.existsSync(hwPath)) {
        try {
          const hwBytes = fs.readFileSync(hwPath);
          fontHandwriting = await pdfDoc.embedFont(hwBytes);
        } catch (err) {
          console.warn('Could not embed handwriting font:', err);
        }
      }
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
          { name: 'Sl.No', width: 32, align: 'center' },
          { name: 'Description of Goods', width: tableWidth - (32 + 36 + 55 + 65), align: 'left' },
          { name: 'Units', width: 36, align: 'center' },
          { name: 'Base rate', width: 55, align: 'right' },
          { name: 'Total Amount', width: 65, align: 'right' },
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
      const headerH = 24;
      // Pure crisp transparent background (remove any gray/color shading)

      let curColX = leftX;
      for (const c of cols) {
        let lines: string[] = [c.name];
        if (c.name === 'Base rate') {
          lines = ['Base', 'rate'];
        } else if (c.name === 'Total Amount') {
          lines = ['Total', 'Amount'];
        } else if (c.name === 'Taxable Amount') {
          lines = ['Taxable', 'Amount'];
        } else if (c.name === 'GST Amount') {
          lines = ['GST', 'Amount'];
        }

        if (lines.length === 2) {
          const fontSize = 7.5;
          const w1 = fontBold.widthOfTextAtSize(lines[0], fontSize);
          const w2 = fontBold.widthOfTextAtSize(lines[1], fontSize);
          page.drawText(lines[0], {
            x: curColX + (c.width - w1) / 2,
            y: toPdfY(startY + 10),
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
          page.drawText(lines[1], {
            x: curColX + (c.width - w2) / 2,
            y: toPdfY(startY + 19),
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        } else {
          let fontSize = 7.5;
          let textW = fontBold.widthOfTextAtSize(lines[0], fontSize);
          while (textW > c.width - 6 && fontSize > 5.5) {
            fontSize -= 0.5;
            textW = fontBold.widthOfTextAtSize(lines[0], fontSize);
          }
          let textX = curColX + (c.width - textW) / 2;
          if (textX < curColX + 2) textX = curColX + 2;

          page.drawText(lines[0], {
            x: textX,
            y: toPdfY(startY + 15),
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        }
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
        // Close table on current page before breaking to next page
        page.drawLine({
          start: { x: leftX, y: toPdfY(currentY) },
          end: { x: rightX, y: toPdfY(currentY) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });
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

      // Vertical Cell Dividers (Crisp solid black lines; in-between row bottom lines are omitted per requirement)
      let rDivX = leftX;
      page.drawLine({ start: { x: leftX, y: toPdfY(rowStartY) }, end: { x: leftX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });
      for (const c of cols) {
        rDivX += c.width;
        page.drawLine({ start: { x: rDivX, y: toPdfY(rowStartY) }, end: { x: rDivX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });
      }
      page.drawLine({ start: { x: rightX, y: toPdfY(rowStartY) }, end: { x: rightX, y: toPdfY(rowStartY + rowHeight) }, thickness: 0.75, color: rgb(0, 0, 0) });

      currentY += rowHeight;
    }

    // Close bottom of items table with solid horizontal line before summary totals
    page.drawLine({
      start: { x: leftX, y: toPdfY(currentY) },
      end: { x: rightX, y: toPdfY(currentY) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // Check space for Summary Totals & Terms
    if (currentY + 160 > height - bottomMarginPt) {
      page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      currentY = topMarginPt + 20;
    }

    // Totals Rows (TOTAL, Round Off, Grand Total)
    const totalsColsSpanWidth = cols.slice(0, cols.length - 1).reduce((acc, c) => acc + c.width, 0);
    const dividerX = leftX + totalsColsSpanWidth;

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
      { label: 'Round Off', val: formatAmt(roundOffVal), isBold: true },
      { label: 'Grand Total', val: formatAmt(grandTotalVal), isBold: true },
    ];

    const sH = 17;
    const totalsBlockStartY = currentY;
    const totalBlockH = sH * summaryRows.length; // 51 pt

    // 1. Draw labels in left merged cell and values in right column (no horizontal lines in left cell)
    summaryRows.forEach((s, idx) => {
      const rowY = totalsBlockStartY + idx * sH;

      // Label right-aligned inside the left merged cell (against dividerX - 6)
      const labelW = fontBold.widthOfTextAtSize(s.label, 8.5);
      page.drawText(s.label, {
        x: dividerX - labelW - 6,
        y: toPdfY(rowY + 11.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Amount right-aligned inside the right column (against rightX - 4)
      const valW = fontBold.widthOfTextAtSize(s.val, 8.5);
      page.drawText(s.val, {
        x: rightX - valW - 4,
        y: toPdfY(rowY + 11.5),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Horizontal divider for the right amounts column ONLY (between rows 0-1 and 1-2)
      if (idx < summaryRows.length - 1) {
        page.drawLine({
          start: { x: dividerX, y: toPdfY(rowY + sH) },
          end: { x: rightX, y: toPdfY(rowY + sH) },
          thickness: 0.75,
          color: rgb(0, 0, 0),
        });
      }
    });

    // 2. Vertical borders for the totals block
    // Left outer border
    page.drawLine({
      start: { x: leftX, y: toPdfY(totalsBlockStartY) },
      end: { x: leftX, y: toPdfY(totalsBlockStartY + totalBlockH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
    // Middle vertical divider separating left merged cell from right amounts column
    page.drawLine({
      start: { x: dividerX, y: toPdfY(totalsBlockStartY) },
      end: { x: dividerX, y: toPdfY(totalsBlockStartY + totalBlockH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
    // Right outer border
    page.drawLine({
      start: { x: rightX, y: toPdfY(totalsBlockStartY) },
      end: { x: rightX, y: toPdfY(totalsBlockStartY + totalBlockH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    // 3. Full-width horizontal bottom border closing the entire table
    page.drawLine({
      start: { x: leftX, y: toPdfY(totalsBlockStartY + totalBlockH) },
      end: { x: rightX, y: toPdfY(totalsBlockStartY + totalBlockH) },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });

    currentY = totalsBlockStartY + totalBlockH;

    // 4. Company GST Number line placed directly below the table's bottom border matching the screenshot (GST format only)
    if (isGst) {
      const companyGstin = (
        options.company?.gstin ||
        options.branch?.gstin ||
        (quotation as any).company_gstin ||
        ''
      ).trim();
      // Prioritize Company Details state (options.company?.state) as explicitly configured by the user
      const stateInitials = getStateInitials(
        options.company?.state || options.branch?.state || (quotation as any).company_state || (quotation as any).state,
        options.company?.state_code || options.branch?.state_code,
        companyGstin
      );
      const gstPrefix = `${stateInitials}-GST Number :`;
      const gstLine = companyGstin ? `${gstPrefix} ${companyGstin}` : `${gstPrefix} `;

      // Spacing: exactly below table bottom line
      currentY += 12;

      page.drawText(gstLine, {
        x: leftX,
        y: toPdfY(currentY),
        size: 9.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      currentY += 16;
    } else {
      currentY += 12;
    }

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

    // Resolve Bank & PAN details (options.company / options.branch / quotation)
    const branchBank =
      options.branch &&
      !options.branch.use_company_bank &&
      (options.branch.bank_name || options.branch.bank_account_no);
    const bankSource: any = branchBank ? options.branch : options.company;

    const companyPan = (
      options.company?.pan ||
      (quotation as any).company_pan ||
      (options.company?.gstin && options.company.gstin.length >= 12
        ? options.company.gstin.slice(2, 12)
        : '') ||
      ''
    ).trim();

    const bankName = (bankSource?.bank_name || (quotation as any).bank_name || '').trim();
    const bankAccountNo = (bankSource?.bank_account_no || (quotation as any).bank_account_no || '').trim();
    const bankIfsc = (bankSource?.bank_ifsc || (quotation as any).bank_ifsc || '').trim().toUpperCase();
    const bankBranch = (bankSource?.bank_branch || (quotation as any).bank_branch || '').trim();

    // Total vertical height required for footer: Courtesy (~14pt) + Bank Details (5 rows * 12.5pt = ~63pt) + Sign-off (~45pt) = ~122pt
    const totalFooterHeight = 122;
    if (courtesyY + totalFooterHeight > height - bottomMarginPt) {
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

    // Bank details in requested series:
    // 1. PAN Number of the company
    // 2. Bank Name
    // 3. Account Number
    // 4. IFSC Code
    // 5. Branch Address
    const bankDetailsList = [
      { label: 'PAN Number', value: companyPan },
      { label: 'Bank Name', value: bankName },
      { label: 'Account Number', value: bankAccountNo },
      { label: 'IFSC Code', value: bankIfsc },
      { label: 'Branch Address', value: bankBranch },
    ];

    let bankItemY = courtesyY + 16;
    const colonX = leftX + 88;

    for (const bItem of bankDetailsList) {
      page.drawText(`${bItem.label} :`, {
        x: leftX,
        y: toPdfY(bankItemY),
        size: 8.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      if (bItem.value) {
        page.drawText(bItem.value, {
          x: colonX,
          y: toPdfY(bankItemY),
          size: 8.5,
          font: fontRegular,
          color: rgb(0, 0, 0),
        });
      }

      bankItemY += 12.5;
    }

    // Sign-Off Block (Yours truly, For VARUN SYSTEMS.)
    // Positioned on the same side (right side) but below the bank details
    const rawSignCompany =
      quotation.sign_off_company ||
      (options.company?.name ? options.company.name.toUpperCase() : 'VARUN SYSTEMS');
    let companyClean = rawSignCompany.trim();
    if (companyClean.toLowerCase().startsWith('for ')) {
      companyClean = companyClean.substring(4).trim();
    }
    if (!companyClean.endsWith('.')) {
      companyClean = `${companyClean}.`;
    }

    const forPrefix = 'For ';
    const compW = fontHandwriting
      ? fontHandwriting.widthOfTextAtSize(companyClean, 11)
      : fontBold.widthOfTextAtSize(companyClean, 9.5);
    const forW = fontBold.widthOfTextAtSize(forPrefix, 9.5);
    const totalSignW = forW + compW;
    const signX = Math.max(leftX + 150, rightX - Math.max(totalSignW, 140));

    // Position signY below bank details (with dynamic adjustment if space is tight)
    let signY = bankItemY + 6;
    if (signY + 42 > height - bottomMarginPt) {
      signY = Math.max(bankItemY + 2, height - bottomMarginPt - 42);
    }

    page.drawText('Yours truly,', {
      x: signX,
      y: toPdfY(signY),
      size: 9.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Space for physical rubber stamp and signature (~36 pt)
    if (fontHandwriting) {
      page.drawText(forPrefix, {
        x: signX,
        y: toPdfY(signY + 36),
        size: 9.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page.drawText(companyClean, {
        x: signX + forW,
        y: toPdfY(signY + 36),
        size: 11,
        font: fontHandwriting,
        color: rgb(0, 0, 0),
      });
    } else {
      page.drawText(`For ${companyClean}`, {
        x: signX,
        y: toPdfY(signY + 36),
        size: 9.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

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
