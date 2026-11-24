// src/server/services/letterheadService.ts - Offline Letterhead Management & Zone Recognition
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { LetterheadTemplate, LayoutConfiguration, LetterheadOCRResult, TemplateAppliesTo } from '../../shared/types';
import { getDefaultDataDir } from '../database/connection';

export function getDefaultLayoutConfig(templateId: string): LayoutConfiguration {
  return {
    id: uuidv4(),
    template_id: templateId,
    invoice_number: { x: 420, y: 155, fontSize: 10, alignment: 'left' },
    invoice_date: { x: 420, y: 175, fontSize: 10, alignment: 'left' },
    due_date: { x: 420, y: 195, fontSize: 10, alignment: 'left' },
    customer_name: { x: 45, y: 155, fontSize: 10, alignment: 'left' },
    billing_address: { x: 45, y: 172, fontSize: 9, alignment: 'left', width: 280 },
    shipping_address: { x: 45, y: 220, fontSize: 9, alignment: 'left', width: 280 },
    place_of_supply: { x: 420, y: 215, fontSize: 10, alignment: 'left' },
    customer_gstin: { x: 45, y: 260, fontSize: 10, alignment: 'left' },
    table_top_y: 285,
    table_bottom_margin: 220,
    table_columns: {
      sr_no: { width: 30, label: 'Sr' },
      item_name: { width: 170, label: 'Item & Description' },
      hsn_sac: { width: 55, label: 'HSN/SAC' },
      qty: { width: 45, label: 'Qty' },
      rate: { width: 55, label: 'Rate (₹)' },
      discount: { width: 45, label: 'Disc' },
      taxable: { width: 60, label: 'Taxable (₹)' },
      gst: { width: 50, label: 'GST %' },
      total: { width: 65, label: 'Total (₹)' },
    },
    total_taxable_value: { x: 500, y: 640, fontSize: 10, alignment: 'right' },
    cgst: { x: 500, y: 655, fontSize: 10, alignment: 'right' },
    sgst: { x: 500, y: 670, fontSize: 10, alignment: 'right' },
    igst: { x: 500, y: 685, fontSize: 10, alignment: 'right' },
    round_off: { x: 500, y: 700, fontSize: 10, alignment: 'right' },
    grand_total: { x: 500, y: 720, fontSize: 12, alignment: 'right' },
    amount_in_words: { x: 45, y: 640, fontSize: 9, alignment: 'left', width: 340 },
    bank_details: { x: 45, y: 680, fontSize: 8, alignment: 'left', width: 250 },
    terms_conditions: { x: 45, y: 740, fontSize: 8, alignment: 'left', width: 320 },
    signature: { x: 440, y: 760, fontSize: 10, alignment: 'center' },
    footer: { x: 297, y: 815, fontSize: 8, alignment: 'center' },
  };
}

function getSystemTemplatePath(filename: string): string {
  const resourcesPath = (process as any).resourcesPath || '';
  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  const candidates = [
    path.join(resourcesPath, 'assets', 'templates', filename),
    path.join(execDir, 'resources', 'assets', 'templates', filename),
    path.join(process.cwd(), 'assets', 'templates', filename),
    path.join(__dirname, '..', 'assets', 'templates', filename),
    path.join(__dirname, '..', '..', 'assets', 'templates', filename),
    path.join(__dirname, '..', '..', '..', 'assets', 'templates', filename),
    path.join(execDir, 'assets', 'templates', filename),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

export function getSystemQuotationTemplates(): LetterheadTemplate[] {
  return [
    {
      id: 'builtin-varun-invoice-normal-gst',
      company_id: '',
      name: 'Varun Systems Normal GST Template',
      file_path: getSystemTemplatePath('VARUN_SYSTEMS_INVOICE_GST_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: true,
      applies_to: 'INVOICE',
      layout_config: getDefaultLayoutConfig('builtin-varun-invoice-normal-gst'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'builtin-varun-invoice-gst',
      company_id: '',
      name: 'Varun Systems Named GST Invoice',
      file_path: getSystemTemplatePath('VARUN_SYSTEMS_INVOICE_GST_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: false,
      applies_to: 'INVOICE',
      layout_config: getDefaultLayoutConfig('builtin-varun-invoice-gst'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'builtin-varun-shree-invoice-normal-gst',
      company_id: '',
      name: 'Varun Shree Infotech Normal GST Template',
      file_path: getSystemTemplatePath('VARUN_SHREE_INFOTECH_NORMAL_GST_INVOICE_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: false,
      applies_to: 'INVOICE',
      layout_config: getDefaultLayoutConfig('builtin-varun-shree-invoice-normal-gst'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'builtin-varun-shree-igst-invoice',
      company_id: '',
      name: 'Varun Sree Infotech IGST Invoice Template',
      file_path: getSystemTemplatePath('VARUN_SHREE_INFOTECH_IGST_INVOICE_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: false,
      applies_to: 'INVOICE',
      layout_config: getDefaultLayoutConfig('builtin-varun-shree-igst-invoice'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'builtin-varun-gst',
      company_id: '',
      name: 'Varun Systems — GST Quotation Format',
      file_path: getSystemTemplatePath('VARUN_SYSTEMS_QUOTATIO_GST_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: true,
      applies_to: 'QUOTATION',
      layout_config: getDefaultLayoutConfig('builtin-varun-gst'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'builtin-varun-nogst',
      company_id: '',
      name: 'Varun Systems — Without GST Format',
      file_path: getSystemTemplatePath('VARUN_SYSTEMS_QUOTATIO_WITHOUT_GST_FORMAT.pdf'),
      file_type: 'PDF',
      page_size: 'A4',
      orientation: 'PORTRAIT',
      is_default: false,
      applies_to: 'QUOTATION',
      layout_config: getDefaultLayoutConfig('builtin-varun-nogst'),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ];
}

export class LetterheadService {
  constructor(private db: Knex) {}

  async getTemplates(companyId: string, includeSystem: boolean = false, appliesToFilter?: string): Promise<LetterheadTemplate[]> {
    const sysTemplates = includeSystem ? getSystemQuotationTemplates() : [];
    const records = await this.db('letterhead_templates')
      .where({ company_id: companyId })
      .whereNotNull('file_path')
      .whereRaw("TRIM(file_path) != ''")
      .orderBy('name', 'asc');
    const custom = records
      .filter((r) => r.file_path && fs.existsSync(r.file_path))
      .map((r) => ({
        ...r,
        applies_to: (r.applies_to || 'BOTH') as any,
        is_default: Boolean(r.is_default),
        layout_config: JSON.parse(r.layout_config_json),
      }));

    let all: LetterheadTemplate[] = [...sysTemplates.map((t) => ({ ...t })), ...custom];

    // Merge company overrides if table exists
    try {
      if (await this.db.schema.hasTable('letterhead_template_overrides')) {
        const overrides = await this.db('letterhead_template_overrides').where({ company_id: companyId });
        const overrideMap = new Map<string, any>(overrides.map((o: any) => [o.template_id, o]));
        all = all.map((tpl) => {
          const ov = overrideMap.get(tpl.id);
          if (!ov) return tpl;
          return {
            ...tpl,
            name: ov.name && ov.name.trim() ? ov.name.trim() : tpl.name,
            applies_to: ov.applies_to ? ov.applies_to : tpl.applies_to,
            is_default: ov.is_default !== null && ov.is_default !== undefined ? Boolean(ov.is_default) : tpl.is_default,
          };
        });
      }
    } catch (ovErr) {
      console.warn('[LetterheadService] Failed to load template overrides:', ovErr);
    }

    if (appliesToFilter) {
      all = all.filter((t) => !t.applies_to || t.applies_to === 'BOTH' || t.applies_to === appliesToFilter);
    }
    return all;
  }

  async getTemplateById(companyId: string, templateId: string): Promise<LetterheadTemplate | null> {
    const list = await this.getTemplates(companyId, true);
    return list.find((t) => t.id === templateId) || null;
  }

  async getDefaultTemplate(companyId: string): Promise<LetterheadTemplate | null> {
    const all = await this.getTemplates(companyId, true);
    if (all.length === 0) return null;
    return all.find((t) => t.is_default) || all[0];
  }

  validateFilePathInsideUploadDir(companyId: string, targetPath?: string): string {
    if (!targetPath) return '';
    const uploadDir = path.resolve(this.getLetterheadUploadDir(companyId));
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(uploadDir + path.sep)) {
      throw new Error('Access denied: Letterhead template file must reside inside company upload directory');
    }
    return resolved;
  }

  async createTemplate(companyId: string, data: Partial<LetterheadTemplate>): Promise<LetterheadTemplate> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const layoutConfig = data.layout_config || getDefaultLayoutConfig(id);

    if (data.file_path) {
      this.validateFilePathInsideUploadDir(companyId, data.file_path);
    }

    const template: LetterheadTemplate = {
      id,
      company_id: companyId,
      branch_id: data.branch_id || undefined,
      name: data.name?.trim() || 'Letterhead Template',
      file_path: data.file_path || '',
      file_type: data.file_type || 'PDF',
      page_size: 'A4',
      orientation: data.orientation || 'PORTRAIT',
      is_default: Boolean(data.is_default),
      applies_to: (data.applies_to || 'BOTH') as any,
      layout_config: layoutConfig,
      created_at: now,
      updated_at: now,
    };

    if (template.is_default) {
      await this.db('letterhead_templates').where({ company_id: companyId }).update({ is_default: false });
    }

    await this.db('letterhead_templates').insert({
      id: template.id,
      company_id: template.company_id,
      branch_id: template.branch_id,
      name: template.name,
      file_path: template.file_path,
      file_type: template.file_type,
      page_size: template.page_size,
      orientation: template.orientation,
      is_default: template.is_default,
      applies_to: template.applies_to || 'BOTH',
      layout_config_json: JSON.stringify(template.layout_config),
      created_at: now,
      updated_at: now,
    });

    return template;
  }

  async updateTemplate(companyId: string, templateId: string, data: Partial<LetterheadTemplate>): Promise<LetterheadTemplate> {
    const now = new Date().toISOString();

    if (data.is_default) {
      await this.db('letterhead_templates').where({ company_id: companyId }).update({ is_default: false });
      if (await this.db.schema.hasTable('letterhead_template_overrides')) {
        await this.db('letterhead_template_overrides').where({ company_id: companyId }).update({ is_default: false });
      }
    }

    if (templateId.startsWith('builtin-')) {
      if (await this.db.schema.hasTable('letterhead_template_overrides')) {
        const existing = await this.db('letterhead_template_overrides')
          .where({ company_id: companyId, template_id: templateId })
          .first();
        if (existing) {
          const up: any = { updated_at: now };
          if (data.name !== undefined && data.name.trim()) up.name = data.name.trim();
          if (data.applies_to !== undefined) up.applies_to = data.applies_to;
          if (data.is_default !== undefined) up.is_default = Boolean(data.is_default);
          await this.db('letterhead_template_overrides')
            .where({ company_id: companyId, template_id: templateId })
            .update(up);
        } else {
          await this.db('letterhead_template_overrides').insert({
            company_id: companyId,
            template_id: templateId,
            name: data.name?.trim() || null,
            applies_to: data.applies_to || null,
            is_default: data.is_default !== undefined ? Boolean(data.is_default) : null,
            is_active: true,
            updated_at: now,
          });
        }
      }
      return (await this.getTemplateById(companyId, templateId))!;
    }

    const updatePayload: any = { updated_at: now };
    if (data.name) updatePayload.name = data.name.trim();
    if (data.applies_to) updatePayload.applies_to = data.applies_to;
    if (data.file_path) {
      this.validateFilePathInsideUploadDir(companyId, data.file_path);
      updatePayload.file_path = data.file_path;
    }
    if (data.file_type) updatePayload.file_type = data.file_type;
    if (data.orientation) updatePayload.orientation = data.orientation;
    if (data.layout_config) updatePayload.layout_config_json = JSON.stringify(data.layout_config);
    if (data.is_default !== undefined) updatePayload.is_default = Boolean(data.is_default);

    await this.db('letterhead_templates').where({ company_id: companyId, id: templateId }).update(updatePayload);
    return (await this.getTemplateById(companyId, templateId))!;
  }

  async deleteTemplate(companyId: string, templateId: string): Promise<void> {
    if (templateId.startsWith('builtin-')) return;
    const existing = await this.getTemplateById(companyId, templateId);
    await this.db('letterhead_templates').where({ company_id: companyId, id: templateId }).delete();

    if (existing?.file_path) {
      const uploadDir = path.resolve(this.getLetterheadUploadDir(companyId));
      const resolvedFile = path.resolve(existing.file_path);
      if (resolvedFile.startsWith(uploadDir + path.sep) && fs.existsSync(resolvedFile)) {
        const remainingRef = await this.db('letterhead_templates').where({ file_path: existing.file_path }).first();
        if (!remainingRef) {
          try {
            fs.unlinkSync(resolvedFile);
          } catch {
            // Non-fatal cleanup error
          }
        }
      }
    }
  }

  getLetterheadUploadDir(companyId: string): string {
    const safeCompany = (companyId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(getDefaultDataDir(), 'letterheads', safeCompany);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  detectFileTypeFromBuffer(buffer: Buffer, fileNameOrPath?: string, strictMagicOnly = false): 'PDF' | 'PNG' | 'JPG' | 'DOCX' | null {
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
      return 'PDF';
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'PNG';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'JPG';
    }
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      return 'DOCX';
    }

    if (strictMagicOnly) {
      return null;
    }

    const ext = path.extname(fileNameOrPath || '').toLowerCase();
    if (ext === '.pdf') return 'PDF';
    if (ext === '.png') return 'PNG';
    if (ext === '.jpg' || ext === '.jpeg') return 'JPG';
    if (ext === '.docx' || ext === '.doc') return 'DOCX';
    return null;
  }

  saveUploadedTemplateFile(
    companyId: string,
    originalName: string,
    buffer: Buffer
  ): { storedPath: string; fileType: 'PDF' | 'PNG' | 'JPG' | 'DOCX'; cleanTitle: string } {
    if (!buffer || buffer.length === 0) {
      throw new Error('Uploaded template file is empty.');
    }

    // Strictly verify binary file magic signature (prevent spoofed extensions serving arbitrary files)
    const fileType = this.detectFileTypeFromBuffer(buffer, originalName, true);
    if (!fileType) {
      throw new Error('Unsupported or invalid template binary. Only valid PDF, PNG, JPG/JPEG, and Word (.docx) files are supported.');
    }

    const ext = fileType === 'PDF' ? '.pdf' : fileType === 'PNG' ? '.png' : fileType === 'DOCX' ? '.docx' : '.jpg';
    const rawBase = path.basename(originalName || 'letterhead', path.extname(originalName || ''));
    const safeBase = rawBase.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'letterhead';
    const cleanTitle =
      rawBase
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Imported Template';

    const dir = this.getLetterheadUploadDir(companyId);
    const filename = `${Date.now()}-${uuidv4().slice(0, 8)}-${safeBase}${ext}`;
    const storedPath = path.join(dir, filename);
    fs.writeFileSync(storedPath, buffer);

    return { storedPath, fileType, cleanTitle };
  }

  extractDocxText(buffer: Buffer): string {
    try {
      const idx = buffer.indexOf(Buffer.from('word/document.xml'));
      if (idx > 0) {
        const headIdx = buffer.lastIndexOf(Buffer.from([0x50, 0x4B, 0x03, 0x04]), idx);
        if (headIdx >= 0 && headIdx + 30 <= buffer.length) {
          const compMethod = buffer.readUInt16LE(headIdx + 8);
          const compSize = buffer.readUInt32LE(headIdx + 18);
          const nameLen = buffer.readUInt16LE(headIdx + 26);
          const extraLen = buffer.readUInt16LE(headIdx + 28);
          const dataStart = headIdx + 30 + nameLen + extraLen;
          if (dataStart + compSize <= buffer.length) {
            const compData = buffer.subarray(dataStart, dataStart + compSize);
            const inflated = compMethod === 8 ? zlib.inflateRawSync(compData) : compData;
            return inflated.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }
      }
    } catch {
      // Fallback
    }
    return buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
  }

  async getTemplateFile(
    companyId: string,
    templateId: string
  ): Promise<{ filePath: string; contentType: string; fileName: string }> {
    const tpl = await this.getTemplateById(companyId, templateId);
    if (!tpl) {
      throw new Error('Template not found');
    }
    if (!tpl.file_path || !fs.existsSync(tpl.file_path)) {
      throw new Error('Template binary file not found on disk');
    }

    if (tpl.id.startsWith('builtin-')) {
      const ext = path.extname(tpl.file_path).toLowerCase();
      const contentType =
        tpl.file_type === 'PNG' || ext === '.png'
          ? 'image/png'
          : tpl.file_type === 'JPG' || ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : tpl.file_type === 'DOCX' || ext === '.docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf';
      return {
        filePath: tpl.file_path,
        contentType,
        fileName: path.basename(tpl.file_path),
      };
    }

    const resolved = this.validateFilePathInsideUploadDir(companyId, tpl.file_path);
    const ext = path.extname(resolved).toLowerCase();
    const contentType =
      tpl.file_type === 'PNG' || ext === '.png'
        ? 'image/png'
        : tpl.file_type === 'JPG' || ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : tpl.file_type === 'DOCX' || ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';

    return {
      filePath: resolved,
      contentType,
      fileName: path.basename(resolved),
    };
  }

  buildLayoutFromAnalysis(templateId: string, analysis: LetterheadOCRResult): LayoutConfiguration {
    const base = getDefaultLayoutConfig(templateId);
    const zones = analysis.detected_zones;
    const headerEnd = zones?.header_box?.y_end || 140;
    const footerStart = zones?.footer_box?.y_start || 780;
    const left = Math.max(25, Math.min(85, zones?.left_margin || 45));

    const metaTopY = Math.min(Math.max(headerEnd + 12, 115), 215);
    const tableTopY = analysis.table_rows_start_y
      ? Math.round(analysis.table_rows_start_y)
      : Math.min(Math.max(metaTopY + 85, 220), 340);
    const clampedFooterStart = Math.max(footerStart, tableTopY + 180);

    const meta = analysis.detected_meta_fields;
    const cust = analysis.detected_customer_fields;
    const detectedCols = analysis.detected_columns;

    const tableCols: any = { ...base.table_columns };
    if (detectedCols && detectedCols.length > 0) {
      for (const col of detectedCols) {
        if (col.id === 'sr_no') tableCols.sr_no = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'item_name') tableCols.item_name = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'hsn_sac') tableCols.hsn_sac = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'qty') tableCols.qty = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'unit') tableCols.unit = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'rate') tableCols.rate = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'discount') tableCols.discount = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'taxable') tableCols.taxable = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'cgst_rate') tableCols.cgst_rate = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'cgst_amt') tableCols.cgst_amt = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'sgst_rate') tableCols.sgst_rate = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'sgst_amt') tableCols.sgst_amt = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'igst_rate') tableCols.igst_rate = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'igst_amt') tableCols.igst_amt = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
        else if (col.id === 'total') tableCols.total = { x: col.x, width: col.width, label: col.label, alignment: col.alignment };
      }
    }

    const tableBottomMargin = analysis.table_rows_end_y
      ? Math.max(120, Math.round(842 - analysis.table_rows_end_y + 40))
      : Math.max(120, Math.round(842 - clampedFooterStart + 60));

    return {
      ...base,
      customer_name: cust?.name ? { ...base.customer_name, x: cust.name.x, y: cust.name.y, width: cust.name.width } : { ...base.customer_name, x: left, y: metaTopY + 12 },
      billing_address: cust?.address ? { ...base.billing_address, x: cust.address.x, y: cust.address.y, width: cust.address.width } : { ...base.billing_address, x: left, y: metaTopY + 28 },
      shipping_address: cust?.address ? { ...base.shipping_address!, x: cust.address.x, y: cust.address.y + 35, width: cust.address.width } : { ...base.shipping_address!, x: left, y: metaTopY + 62 },
      customer_gstin: cust?.gstin ? { ...base.customer_gstin!, x: cust.gstin.x, y: cust.gstin.y } : { ...base.customer_gstin!, x: left, y: metaTopY + 52 },
      customer_state: meta?.state ? { x: meta.state.x, y: meta.state.y, fontSize: 9, alignment: 'left' } : undefined,
      customer_state_code: meta?.state_code ? { x: meta.state_code.x, y: meta.state_code.y, fontSize: 9, alignment: 'left' } : undefined,
      invoice_number: meta?.invoice_number ? { ...base.invoice_number, x: meta.invoice_number.x, y: meta.invoice_number.y } : { ...base.invoice_number, x: Math.max(left + 320, 395), y: metaTopY },
      invoice_date: meta?.invoice_date ? { ...base.invoice_date, x: meta.invoice_date.x, y: meta.invoice_date.y } : { ...base.invoice_date, x: Math.max(left + 320, 395), y: metaTopY + 18 },
      due_date: meta?.due_date ? { ...base.due_date!, x: meta.due_date.x, y: meta.due_date.y } : { ...base.due_date!, x: Math.max(left + 320, 395), y: metaTopY + 36 },
      po_number: meta?.po_number ? { x: meta.po_number.x, y: meta.po_number.y, fontSize: 8.5, alignment: 'left' } : undefined,
      po_date: meta?.po_date ? { x: meta.po_date.x, y: meta.po_date.y, fontSize: 8.5, alignment: 'left' } : undefined,
      challan_number: meta?.challan_number ? { x: meta.challan_number.x, y: meta.challan_number.y, fontSize: 8.5, alignment: 'left' } : undefined,
      challan_date: meta?.challan_date ? { x: meta.challan_date.x, y: meta.challan_date.y, fontSize: 8.5, alignment: 'left' } : undefined,
      place_of_supply: meta?.place_of_supply ? { ...base.place_of_supply!, x: meta.place_of_supply.x, y: meta.place_of_supply.y } : { ...base.place_of_supply!, x: Math.max(left + 320, 395), y: metaTopY + 54 },
      agent_name: meta?.agent_name ? { x: meta.agent_name.x, y: meta.agent_name.y, fontSize: 8.5, alignment: 'left' } : undefined,
      table_top_y: tableTopY,
      table_bottom_margin: tableBottomMargin,
      table_columns: tableCols,
      amount_in_words: { ...base.amount_in_words, x: left, y: Math.max(clampedFooterStart - 135, 580) },
      bank_details: { ...base.bank_details!, x: left, y: Math.max(clampedFooterStart - 95, 620) },
      terms_conditions: { ...base.terms_conditions!, x: left, y: Math.max(clampedFooterStart - 45, 680) },
      signature: { ...base.signature, y: Math.max(clampedFooterStart - 35, 720) },
      footer: { ...base.footer, y: Math.min(Math.max(clampedFooterStart + 15, 760), 825) },
      detected_archetype: analysis.detected_archetype || 'STANDARD_OVERLAY',
      is_igst: analysis.is_igst,
    };
  }

  async importTemplateFile(
    companyId: string,
    file: { originalname: string; buffer: Buffer },
    options?: {
      name?: string;
      orientation?: 'PORTRAIT' | 'LANDSCAPE';
      is_default?: boolean;
      auto_detect?: boolean;
      applies_to?: TemplateAppliesTo;
    }
  ): Promise<{ template: LetterheadTemplate; analysis: LetterheadOCRResult }> {
    const company = await this.db('companies').where({ id: companyId }).first();
    if (!company) {
      throw new Error('Target company not found');
    }

    const { storedPath, fileType, cleanTitle } = this.saveUploadedTemplateFile(
      companyId,
      file.originalname,
      file.buffer
    );

    const analysis = await this.analyzeLetterheadBuffer(file.buffer, file.originalname, storedPath);
    const id = uuidv4();
    const layoutConfig =
      options?.auto_detect === false
        ? getDefaultLayoutConfig(id)
        : this.buildLayoutFromAnalysis(id, analysis);

    const effectiveAppliesTo: TemplateAppliesTo =
      options?.applies_to && options.applies_to !== 'BOTH'
        ? options.applies_to
        : (analysis as any).recommended_applies_to || options?.applies_to || 'BOTH';

    const template = await this.createTemplate(companyId, {
      name: options?.name?.trim() || cleanTitle,
      file_path: storedPath,
      file_type: fileType,
      orientation: options?.orientation || analysis.recommended_orientation || 'PORTRAIT',
      is_default: Boolean(options?.is_default),
      applies_to: effectiveAppliesTo,
      layout_config: layoutConfig,
    });

    return { template, analysis };
  }

  private decodePdfStringLiteral(raw: string): string {
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '\\' && i + 1 < raw.length) {
        const next = raw[i + 1];
        if (next === 'n') {
          out += '\n';
          i++;
        } else if (next === 'r') {
          out += '\r';
          i++;
        } else if (next === 't') {
          out += ' ';
          i++;
        } else if (/[0-7]/.test(next)) {
          const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
          out += String.fromCharCode(parseInt(oct, 8));
          i += oct.length;
        } else {
          out += next;
          i++;
        }
      } else {
        out += ch;
      }
    }
    return out;
  }

  private decodePdfHexString(hex: string): string {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length < 2) return '';
    // Check UTF-16BE BOM FEFF
    if (clean.toUpperCase().startsWith('FEFF') && clean.length >= 8) {
      let out = '';
      for (let i = 4; i + 3 < clean.length; i += 4) {
        const code = parseInt(clean.slice(i, i + 4), 16);
        if (code >= 32 && code < 65535) out += String.fromCharCode(code);
      }
      return out;
    }
    // 1-byte WinAnsi / ASCII
    let asciiOut = '';
    for (let i = 0; i + 1 < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16);
      if (code >= 32 && code <= 126) asciiOut += String.fromCharCode(code);
    }
    if (asciiOut.trim().length > 0) return asciiOut;
    // Fallback 2-byte big endian printable ASCII range
    if (clean.length % 4 === 0) {
      let wideOut = '';
      for (let i = 0; i + 3 < clean.length; i += 4) {
        const code = parseInt(clean.slice(i, i + 4), 16);
        if (code >= 32 && code <= 126) wideOut += String.fromCharCode(code);
      }
      return wideOut;
    }
    return '';
  }

  private extractTextTokensFromPdfStream(
    streamText: string,
    pageWidth: number,
    pageHeight: number
  ): Array<{ text: string; x: number; topY: number; fontSize?: number; width?: number }> {
    const tokens: Array<{ text: string; x: number; topY: number; fontSize?: number; width?: number }> = [];
    const btEtRegex = /BT\b([\s\S]*?)ET\b/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = btEtRegex.exec(streamText)) !== null) {
      const block = blockMatch[1];
      let curX = 45;
      let curPdfY = pageHeight - 50;
      let curFontSize = 10;
      let leading = 14;

      // Walk line-by-line or operator-by-operator within BT..ET
      const opRegex =
        /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm\b|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(?:Td|TD)\b|(\/[A-Za-z0-9_]+)\s+(-?\d+(?:\.\d+)?)\s+Tf\b|(-?\d+(?:\.\d+)?)\s+TL\b|T\*|(\((?:\\.|[^\\)])*\))\s*(?:Tj|'|")|\[((?:\\.|[^\]])*)\]\s*TJ\b|<([0-9A-Fa-f\s]+)>\s*Tj\b/g;

      let opMatch: RegExpExecArray | null;
      while ((opMatch = opRegex.exec(block)) !== null) {
        if (opMatch[5] !== undefined && opMatch[6] !== undefined) {
          curX = parseFloat(opMatch[5]);
          curPdfY = parseFloat(opMatch[6]);
        } else if (opMatch[7] !== undefined && opMatch[8] !== undefined) {
          curX += parseFloat(opMatch[7]);
          curPdfY += parseFloat(opMatch[8]);
        } else if (opMatch[9] !== undefined && opMatch[10] !== undefined) {
          curFontSize = Math.abs(parseFloat(opMatch[10])) || 10;
        } else if (opMatch[11] !== undefined) {
          leading = Math.abs(parseFloat(opMatch[11])) || 14;
        } else if (opMatch[0] === 'T*') {
          curPdfY -= leading;
        } else if (opMatch[12] !== undefined) {
          const inner = opMatch[12].slice(1, -1);
          const decoded = this.decodePdfStringLiteral(inner).replace(/\s+/g, ' ').trim();
          if (decoded) {
            const topY = Math.max(0, Math.min(pageHeight, pageHeight - curPdfY));
            const w = Math.round(decoded.length * curFontSize * 0.52 * 10) / 10;
            tokens.push({
              text: decoded,
              x: Math.round(Math.max(0, Math.min(pageWidth, curX)) * 10) / 10,
              topY: Math.round(topY * 10) / 10,
              fontSize: curFontSize,
              width: w,
            });
          }
        } else if (opMatch[13] !== undefined) {
          const arrayBody = opMatch[13];
          let combined = '';
          const partRegex = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g;
          let part: RegExpExecArray | null;
          while ((part = partRegex.exec(arrayBody)) !== null) {
            if (part[0].startsWith('(')) {
              combined += this.decodePdfStringLiteral(part[0].slice(1, -1));
            } else if (part[1]) {
              combined += this.decodePdfHexString(part[1]);
            }
          }
          const decoded = combined.replace(/\s+/g, ' ').trim();
          if (decoded) {
            const topY = Math.max(0, Math.min(pageHeight, pageHeight - curPdfY));
            const w = Math.round(decoded.length * curFontSize * 0.52 * 10) / 10;
            tokens.push({
              text: decoded,
              x: Math.round(Math.max(0, Math.min(pageWidth, curX)) * 10) / 10,
              topY: Math.round(topY * 10) / 10,
              fontSize: curFontSize,
              width: w,
            });
          }
        } else if (opMatch[14] !== undefined) {
          const decoded = this.decodePdfHexString(opMatch[14]).replace(/\s+/g, ' ').trim();
          if (decoded) {
            const topY = Math.max(0, Math.min(pageHeight, pageHeight - curPdfY));
            const w = Math.round(decoded.length * curFontSize * 0.52 * 10) / 10;
            tokens.push({
              text: decoded,
              x: Math.round(Math.max(0, Math.min(pageWidth, curX)) * 10) / 10,
              topY: Math.round(topY * 10) / 10,
              fontSize: curFontSize,
              width: w,
            });
          }
        }
      }
    }

    return tokens;
  }

  private async extractPdfAnalysis(buffer: Buffer): Promise<{
    rawText: string;
    pageWidth: number;
    pageHeight: number;
    pageCount: number;
    tokens: Array<{ text: string; x: number; topY: number; fontSize?: number; width?: number }>;
  }> {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    const firstPage = pageCount > 0 ? pdfDoc.getPage(0) : null;
    const { width: pageWidth, height: pageHeight } = firstPage
      ? firstPage.getSize()
      : { width: 595.28, height: 841.89 };

    const allTokens: Array<{ text: string; x: number; topY: number; fontSize?: number; width?: number }> = [];

    const MAX_INFLATE_BYTES = 10 * 1024 * 1024; // Cap stream inflation at 10 MB to prevent deflate bombs
    const readStreamBytes = (rawStream: PDFRawStream): string => {
      const contents = rawStream.getContents();
      const filterObj = rawStream.dict.get(PDFName.of('Filter'));
      const filterStr = filterObj ? filterObj.toString() : '';
      let decodedBytes: Buffer = Buffer.from(contents);
      if (filterStr.includes('FlateDecode')) {
        try {
          decodedBytes = zlib.inflateSync(contents, { maxOutputLength: MAX_INFLATE_BYTES });
        } catch {
          // Leave raw if inflation fails or exceeds safety cap
        }
      } else {
        // Sometimes compressed streams don't expose standard filter name in wrapper; probe zlib header
        try {
          if (contents.length > 2 && contents[0] === 0x78) {
            decodedBytes = zlib.inflateSync(contents, { maxOutputLength: MAX_INFLATE_BYTES });
          }
        } catch {
          // Non-deflated stream or exceeds safety cap
        }
      }
      return decodedBytes.toString('latin1');
    };

    if (firstPage) {
      const contentsRef = firstPage.node.get(PDFName.of('Contents'));
      const visited = new Set<any>();

      const inspectNode = (nodeOrRef: any) => {
        const looked = nodeOrRef ? pdfDoc.context.lookup(nodeOrRef) : null;
        if (!looked || visited.has(looked)) return;
        visited.add(looked);

        if (looked instanceof PDFRawStream) {
          const text = readStreamBytes(looked);
          allTokens.push(...this.extractTextTokensFromPdfStream(text, pageWidth, pageHeight));
        } else if (looked instanceof PDFArray) {
          for (let i = 0; i < looked.size(); i++) {
            inspectNode(looked.get(i));
          }
        }
      };

      if (contentsRef) inspectNode(contentsRef);

      // Also scan Form XObjects referenced by page Resources
      try {
        const resources = firstPage.node.Resources();
        const xObjDict = resources?.get(PDFName.of('XObject'));
        const resolvedDict: any = xObjDict ? pdfDoc.context.lookup(xObjDict) : null;
        if (resolvedDict && typeof resolvedDict.entries === 'function') {
          for (const [, val] of resolvedDict.entries()) {
            const xStream = pdfDoc.context.lookup(val);
            if (xStream instanceof PDFRawStream) {
              const subtype = xStream.dict.get(PDFName.of('Subtype'))?.toString() || '';
              if (subtype.includes('Form')) {
                const text = readStreamBytes(xStream);
                allTokens.push(...this.extractTextTokensFromPdfStream(text, pageWidth, pageHeight));
              }
            }
          }
        }
      } catch {
        // Optional XObject inspection
      }
    }

    // Group tokens into top-down visual lines
    const sorted = [...allTokens].sort((a, b) => a.topY - b.topY || a.x - b.x);
    const lines: string[] = [];
    let currentY = -999;
    let currentLineParts: string[] = [];

    for (const tok of sorted) {
      if (Math.abs(tok.topY - currentY) > 5) {
        if (currentLineParts.length > 0) {
          lines.push(currentLineParts.join(' '));
        }
        currentLineParts = [tok.text];
        currentY = tok.topY;
      } else {
        currentLineParts.push(tok.text);
      }
    }
    if (currentLineParts.length > 0) {
      lines.push(currentLineParts.join(' '));
    }

    return {
      rawText: lines.join('\n'),
      pageWidth,
      pageHeight,
      pageCount,
      tokens: sorted,
    };
  }

  private extractImageDimensions(
    buffer: Buffer,
    fileType: 'PNG' | 'JPG'
  ): { width: number; height: number; metadataText: string } {
    let width = 595.28;
    let height = 841.89;
    const textChunks: string[] = [];

    if (fileType === 'PNG' && buffer.length >= 24) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
      // Inspect uncompressed PNG tEXt / iTXt metadata chunks locally
      let offset = 8;
      while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        if (offset + 12 + length > buffer.length) break;
        if (type === 'tEXt' || type === 'iTXt') {
          const chunkData = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+/g, ' ');
          if (chunkData.trim()) textChunks.push(chunkData.trim());
        }
        if (type === 'IEND') break;
        offset += 12 + length;
      }
    } else if (fileType === 'JPG' && buffer.length >= 10) {
      let i = 2;
      while (i + 9 < buffer.length) {
        if (buffer[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buffer[i + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        if (i + 4 > buffer.length) break;
        const segLen = buffer.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3 && i + 9 < buffer.length) {
          height = buffer.readUInt16BE(i + 5);
          width = buffer.readUInt16BE(i + 7);
          break;
        }
        if (segLen < 2) break;
        i += 2 + segLen;
      }
    }

    return { width, height, metadataText: textChunks.join('\n') };
  }

  private detectTableColumnsAndZones(
    tokens: Array<{ text: string; x: number; topY: number; fontSize?: number; width?: number }>,
    canonicalW: number,
    canonicalH: number,
    rawText: string
  ): {
    detected_archetype: 'VARUN_SYSTEMS' | 'VARUN_SHREE' | 'CUSTOM_GST_GRID' | 'STANDARD_OVERLAY';
    is_igst: boolean;
    recommended_applies_to: TemplateAppliesTo;
    detected_columns: Array<{ id: string; label: string; x: number; width: number; alignment: 'left' | 'center' | 'right' }>;
    table_header_y?: number;
    table_rows_start_y?: number;
    table_rows_end_y?: number;
    detected_meta_fields: {
      invoice_number?: { x: number; y: number };
      invoice_date?: { x: number; y: number };
      due_date?: { x: number; y: number };
      po_number?: { x: number; y: number };
      po_date?: { x: number; y: number };
      challan_number?: { x: number; y: number };
      challan_date?: { x: number; y: number };
      place_of_supply?: { x: number; y: number };
      state?: { x: number; y: number };
      state_code?: { x: number; y: number };
      agent_name?: { x: number; y: number };
    };
    detected_customer_fields: {
      name?: { x: number; y: number; width?: number };
      address?: { x: number; y: number; width?: number };
      gstin?: { x: number; y: number };
    };
  } {
    const upperText = rawText.toUpperCase();
    let archetype: 'VARUN_SYSTEMS' | 'VARUN_SHREE' | 'CUSTOM_GST_GRID' | 'STANDARD_OVERLAY' = 'STANDARD_OVERLAY';
    if (upperText.includes('VARUN SYSTEMS')) {
      archetype = 'VARUN_SYSTEMS';
    } else if (upperText.includes('VARUN SHREE') || upperText.includes('VARUN SREE') || upperText.includes('VSIT')) {
      archetype = 'VARUN_SHREE';
    }

    let isIgst = false;
    if (upperText.includes('IGST') || upperText.includes('INTEGRATED TAX')) {
      isIgst = true;
    } else if (upperText.includes('CGST') || upperText.includes('SGST')) {
      isIgst = false;
    }

    let recommendedAppliesTo: TemplateAppliesTo = 'BOTH';
    if ((upperText.includes('QUOTATION') || upperText.includes('ESTIMATE')) && !upperText.includes('TAX INVOICE') && !upperText.includes('GST-INVOICE')) {
      recommendedAppliesTo = 'QUOTATION';
    } else if (upperText.includes('INVOICE') || upperText.includes('BILL OF SUPPLY')) {
      recommendedAppliesTo = 'INVOICE';
    }

    // Group tokens into lines
    const sorted = [...tokens].sort((a, b) => a.topY - b.topY || a.x - b.x);
    const lines: Array<{ y: number; tokens: typeof tokens; text: string }> = [];
    let curY = -999;
    let curLine: typeof tokens = [];

    for (const t of sorted) {
      if (Math.abs(t.topY - curY) > 5) {
        if (curLine.length > 0) {
          lines.push({ y: curY, tokens: curLine.sort((a, b) => a.x - b.x), text: curLine.map((x) => x.text).join(' ') });
        }
        curLine = [t];
        curY = t.topY;
      } else {
        curLine.push(t);
      }
    }
    if (curLine.length > 0) {
      lines.push({ y: curY, tokens: curLine.sort((a, b) => a.x - b.x), text: curLine.map((x) => x.text).join(' ') });
    }

    // Identify Table Header Line
    let bestHeaderLine: (typeof lines)[0] | null = null;
    let bestSubHeaderLine: (typeof lines)[0] | null = null;
    let bestScore = 0;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.y < canonicalH * 0.15 || l.y > canonicalH * 0.65) continue;

      const nextL = i + 1 < lines.length && lines[i + 1].y - l.y <= 18 ? lines[i + 1] : null;
      const combined = (l.text + ' ' + (nextL ? nextL.text : '')).toLowerCase();

      let score = 0;
      if (/\b(?:s\.?\s*no|sl\.?\s*no|sr\.?\s*no|#|no\.?)\b/.test(combined)) score++;
      if (/\b(?:description|particulars|goods|item)\b/.test(combined)) score++;
      if (/\b(?:hsn|sac)\b/.test(combined)) score++;
      if (/\b(?:qty|quantity|units?)\b/.test(combined)) score++;
      if (/\b(?:rate|base\s*rate|price)\b/.test(combined)) score++;
      if (/\b(?:taxable|amount)\b/.test(combined)) score++;
      if (/\b(?:cgst|sgst|igst|gst)\b/.test(combined)) score++;
      if (/\b(?:total)\b/.test(combined)) score++;

      if (score > bestScore && score >= 3) {
        bestScore = score;
        bestHeaderLine = l;
        bestSubHeaderLine = nextL;
      }
    }

    const detectedColumns: Array<{ id: string; label: string; x: number; width: number; alignment: 'left' | 'center' | 'right' }> = [];
    let tableHeaderY = bestHeaderLine ? bestHeaderLine.y : 220;
    let tableRowsStartY = bestSubHeaderLine ? Math.round(bestSubHeaderLine.y + 16) : Math.round(tableHeaderY + 22);

    if (bestHeaderLine) {
      if (archetype === 'STANDARD_OVERLAY') {
        archetype = 'CUSTOM_GST_GRID';
      }

      const allHeaderTokens = [
        ...bestHeaderLine.tokens,
        ...(bestSubHeaderLine ? bestSubHeaderLine.tokens : []),
      ].sort((a, b) => a.x - b.x);

      const rawCols: Array<{ id: string; label: string; x: number; alignment: 'left' | 'center' | 'right' }> = [];

      for (const t of allHeaderTokens) {
        const txt = t.text.toLowerCase().trim();
        if (/^(?:s\.?\s*no|sl\.?\s*no|sr\.?\s*no|#|no\.?)$/i.test(txt) || txt === 's') {
          if (!rawCols.some((c) => c.id === 'sr_no')) {
            rawCols.push({ id: 'sr_no', label: 'S.No', x: t.x, alignment: 'center' });
          }
        } else if (/description|particulars|goods|item/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'item_name')) {
            rawCols.push({ id: 'item_name', label: 'Item Description', x: t.x, alignment: 'left' });
          }
        } else if (/hsn|sac/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'hsn_sac')) {
            rawCols.push({ id: 'hsn_sac', label: 'HSN/SAC', x: t.x, alignment: 'center' });
          }
        } else if (/qty|quantity/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'qty')) {
            rawCols.push({ id: 'qty', label: 'Qty', x: t.x, alignment: 'center' });
          }
        } else if (/units?|uom|per/i.test(txt) && !/description/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'unit')) {
            rawCols.push({ id: 'unit', label: 'Unit', x: t.x, alignment: 'center' });
          }
        } else if (/base\s*rate|rate|price|unit\s*price/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'rate')) {
            rawCols.push({ id: 'rate', label: 'Rate', x: t.x, alignment: 'right' });
          }
        } else if (/taxable/i.test(txt)) {
          if (!rawCols.some((c) => c.id === 'taxable')) {
            rawCols.push({ id: 'taxable', label: 'Taxable', x: t.x, alignment: 'right' });
          }
        } else if (/total\s*amount|line\s*total/i.test(txt) || (txt === 'total' && t.x > canonicalW * 0.75)) {
          if (!rawCols.some((c) => c.id === 'total')) {
            rawCols.push({ id: 'total', label: 'Total', x: t.x, alignment: 'right' });
          }
        }
      }

      // Detect Tax Columns (CGST, SGST, IGST)
      const cgstToken = allHeaderTokens.find((t) => /\bcgst\b/i.test(t.text));
      const sgstToken = allHeaderTokens.find((t) => /\bsgst\b/i.test(t.text));
      const igstToken = allHeaderTokens.find((t) => /\bigst\b/i.test(t.text));

      if (cgstToken && sgstToken) {
        isIgst = false;
        const subTokens = bestSubHeaderLine ? bestSubHeaderLine.tokens : [];
        const cgstPct = subTokens.find((t) => t.text === '%' && Math.abs(t.x - cgstToken.x) < 40);
        const cgstAmt = subTokens.find((t) => /amt/i.test(t.text) && Math.abs(t.x - cgstToken.x) < 40);
        const sgstPct = subTokens.find((t) => t.text === '%' && Math.abs(t.x - sgstToken.x) < 40);
        const sgstAmt = subTokens.find((t) => /amt/i.test(t.text) && Math.abs(t.x - sgstToken.x) < 40);

        if (cgstPct && cgstAmt && sgstPct && sgstAmt) {
          rawCols.push({ id: 'cgst_rate', label: 'CGST %', x: cgstPct.x, alignment: 'right' });
          rawCols.push({ id: 'cgst_amt', label: 'CGST Amt', x: cgstAmt.x, alignment: 'right' });
          rawCols.push({ id: 'sgst_rate', label: 'SGST %', x: sgstPct.x, alignment: 'right' });
          rawCols.push({ id: 'sgst_amt', label: 'SGST Amt', x: sgstAmt.x, alignment: 'right' });
        } else {
          rawCols.push({ id: 'cgst_amt', label: 'CGST', x: cgstToken.x, alignment: 'right' });
          rawCols.push({ id: 'sgst_amt', label: 'SGST', x: sgstToken.x, alignment: 'right' });
        }
      } else if (igstToken) {
        isIgst = true;
        const subTokens = bestSubHeaderLine ? bestSubHeaderLine.tokens : [];
        const igstPct = subTokens.find((t) => t.text === '%' && Math.abs(t.x - igstToken.x) < 45);
        const igstAmt = subTokens.find((t) => /amt/i.test(t.text) && Math.abs(t.x - igstToken.x) < 45);

        if (igstPct && igstAmt) {
          rawCols.push({ id: 'igst_rate', label: 'IGST %', x: igstPct.x, alignment: 'right' });
          rawCols.push({ id: 'igst_amt', label: 'IGST Amt', x: igstAmt.x, alignment: 'right' });
        } else {
          rawCols.push({ id: 'igst_amt', label: 'IGST', x: igstToken.x, alignment: 'right' });
        }
      }

      rawCols.sort((a, b) => a.x - b.x);

      for (let i = 0; i < rawCols.length; i++) {
        const c = rawCols[i];
        const nextC = i + 1 < rawCols.length ? rawCols[i + 1] : null;
        const width = nextC ? Math.max(20, Math.round(nextC.x - c.x)) : Math.max(45, Math.round(canonicalW - c.x - 30));
        detectedColumns.push({
          id: c.id,
          label: c.label,
          x: Math.round(c.x),
          width,
          alignment: c.alignment,
        });
      }
    }

    let tableRowsEndY = canonicalH - 180;
    const totalsYCandidates: number[] = [];

    for (const l of lines) {
      if (l.y <= tableRowsStartY) continue;
      const lt = l.text.toLowerCase();
      if (/\b(?:total|sub\s*total|taxable\s*amount|total\s*taxable)\b/.test(lt) && !lt.includes('line total')) {
        totalsYCandidates.push(l.y);
      }
      if (/\bround\s*off\b/.test(lt)) totalsYCandidates.push(l.y);
      if (/\bgrand\s*total\b/.test(lt)) totalsYCandidates.push(l.y);
      if (/\b(?:amount\s+chargeable|invoice\s+value|rupees|inr\s*in\s*words)\b/.test(lt)) totalsYCandidates.push(l.y);
    }

    if (totalsYCandidates.length > 0) {
      tableRowsEndY = Math.min(...totalsYCandidates) - 8;
    }

    const detectedMeta: any = {};
    for (const t of tokens) {
      if (t.topY >= tableHeaderY) continue;
      const txt = t.text.toLowerCase();

      if (/\binvoice\s*no\b|\bbill\s*no\b|\bquotation\s*no\b|\bquote\s*no\b/.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.invoice_number = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 55) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bdate\s*of\s*invoice\b|\binvoice\s*date\b|\bdated\b|\bdate\s*:/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.invoice_date = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 45) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bdue\s*date\b|\bvalid\s*until\b/i.test(txt)) {
        detectedMeta.due_date = { x: Math.round(t.x + (t.width || 45) + 4), y: Math.round(t.topY) };
      }
      if (/\bpo\s*no\b|\bp\.o\.\s*no\b|\bbuyer's\s*order\s*no\b/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.po_number = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 35) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bpo\s*date\b|\bp\.o\.\s*date\b|\border\s*date\b/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.po_date = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 40) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bdc\s*no\b|\bdelivery\s*note\b|\bchallan\s*no\b|\bdespatch\s*doc\b/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.challan_number = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 35) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bdc\s*date\b|\bchallan\s*date\b/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.challan_date = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : (t.width || 40) + 4)),
          y: Math.round(t.topY),
        };
      }
      if (/\bplace\s*of\s*supply\b|\bdestination\b/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.place_of_supply = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : 75)),
          y: Math.round(t.topY),
        };
      }
      if (/\bstate\s*name\b|\bstate\s*:/i.test(txt) && !txt.includes('state code')) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.state = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : 55)),
          y: Math.round(t.topY),
        };
      }
      if (/\bstate\s*code\b|\bcode\s*:/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.state_code = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : 40)),
          y: Math.round(t.topY),
        };
      }
      if (/\bagent\s*name\b|\bagent\s*:/i.test(txt)) {
        const colonIdx = t.text.indexOf(':');
        detectedMeta.agent_name = {
          x: Math.round(t.x + (colonIdx >= 0 ? (colonIdx + 2) * 5.2 : 55)),
          y: Math.round(t.topY),
        };
      }
    }

    const detectedCust: any = {};
    const receiverLabelTok = tokens.find((t) =>
      t.topY < tableHeaderY && /billed\s*to|details\s*of\s*receiver|buyer\s*\(bill\s*to\)|consignee|to,/i.test(t.text)
    );

    if (receiverLabelTok) {
      const custX = Math.round(receiverLabelTok.x);
      detectedCust.name = { x: custX, y: Math.round(receiverLabelTok.topY + 14), width: 250 };
      detectedCust.address = { x: custX, y: Math.round(receiverLabelTok.topY + 28), width: 250 };
      detectedCust.gstin = { x: custX, y: Math.round(receiverLabelTok.topY + 52) };
    }

    return {
      detected_archetype: archetype,
      is_igst: isIgst,
      recommended_applies_to: recommendedAppliesTo,
      detected_columns: detectedColumns,
      table_header_y: Math.round(tableHeaderY),
      table_rows_start_y: Math.round(tableRowsStartY),
      table_rows_end_y: Math.round(tableRowsEndY),
      detected_meta_fields: detectedMeta,
      detected_customer_fields: detectedCust,
    };
  }

  private async runLocalTesseractIfBundled(buffer: Buffer): Promise<string> {
    // Strictly offline check: only invoke tesseract.js when local eng.traineddata exists on disk
    const resourcesPath = (process as any).resourcesPath || '';
    const candidates = [
      path.join(process.cwd(), 'assets', 'tesseract', 'eng.traineddata'),
      path.join(process.cwd(), 'assets', 'tesseract', 'eng.traineddata.gz'),
      path.join(resourcesPath, 'assets', 'tesseract', 'eng.traineddata'),
      path.join(resourcesPath, 'assets', 'tesseract', 'eng.traineddata.gz'),
      path.join(getDefaultDataDir(), 'tesseract', 'eng.traineddata'),
      path.join(process.cwd(), 'eng.traineddata'),
    ];
    const foundLangPath = candidates.find((p) => fs.existsSync(p));
    if (!foundLangPath) {
      return '';
    }

    try {
      const Tesseract = await import('tesseract.js');
      const langDir = path.dirname(foundLangPath);
      const isGz = foundLangPath.endsWith('.gz');

      const worker = await Tesseract.createWorker('eng', 1, {
        langPath: langDir,
        cacheMethod: 'none',
        gzip: isGz,
      } as any);
      const result = await worker.recognize(buffer);
      await worker.terminate();
      return result?.data?.text || '';
    } catch {
      return '';
    }
  }

  /**
   * Offline AI Analysis and Zone Recognition on an in-memory Buffer (PDF / PNG / JPG)
   */
  async analyzeLetterheadBuffer(
    buffer: Buffer,
    fileNameOrPath?: string,
    storedFilePath?: string
  ): Promise<LetterheadOCRResult> {
    let extractedText = '';
    let confidence = 0.86;
    let pageWidth = 595.28;
    let pageHeight = 841.89;
    let pageCount = 1;
    let detectedFileType: 'PDF' | 'PNG' | 'JPG' | 'DOCX' | undefined;
    let pdfTokens: Array<{ text: string; x: number; topY: number }> = [];

    const detected = this.detectFileTypeFromBuffer(buffer, fileNameOrPath);
    if (detected) detectedFileType = detected;

    if (detectedFileType === 'PDF' && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
      try {
        const pdfInfo = await this.extractPdfAnalysis(buffer);
        extractedText = pdfInfo.rawText;
        pageWidth = pdfInfo.pageWidth;
        pageHeight = pdfInfo.pageHeight;
        pageCount = pdfInfo.pageCount;
        pdfTokens = pdfInfo.tokens;
        confidence = extractedText.trim().length > 10 ? 0.95 : 0.88;
      } catch {
        // Fallback printable ASCII extract if malformed/custom PDF
        extractedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      }
    } else if (detectedFileType === 'PNG' || detectedFileType === 'JPG') {
      try {
        const imgInfo = this.extractImageDimensions(buffer, detectedFileType);
        const isLandscape = imgInfo.width > imgInfo.height;
        const aspect = imgInfo.width > 0 ? imgInfo.height / imgInfo.width : 1.414;
        pageWidth = isLandscape ? 841.89 : 595.28;
        pageHeight = Math.round(pageWidth * aspect * 100) / 100;
        const ocrText = await this.runLocalTesseractIfBundled(buffer);
        extractedText = [ocrText, imgInfo.metadataText].filter(Boolean).join('\n').trim();
        confidence = ocrText.trim().length > 10 ? 0.93 : 0.85;
      } catch {
        extractedText = '';
      }
    } else if (detectedFileType === 'DOCX') {
      try {
        extractedText = this.extractDocxText(buffer);
        confidence = extractedText.trim().length > 10 ? 0.94 : 0.88;
        pageWidth = 595.28;
        pageHeight = 841.89;
        pageCount = 1;
      } catch {
        extractedText = '';
      }
    } else {
      // Plain text or mock test buffer
      extractedText = buffer.toString('utf-8');
      confidence = extractedText.trim().length > 0 ? 0.92 : 0.85;
    }

    const recommendedOrientation: 'PORTRAIT' | 'LANDSCAPE' =
      pageWidth > pageHeight ? 'LANDSCAPE' : 'PORTRAIT';

    // Robust regex entity extraction
    const gstinMatch = extractedText.match(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/i);
    const gstin = gstinMatch ? gstinMatch[0].toUpperCase() : undefined;
    const panMatch = extractedText.match(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/i);
    const pan = panMatch ? panMatch[0].toUpperCase() : gstin ? gstin.substring(2, 12) : undefined;
    const emailMatch = extractedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = extractedText.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/);
    const ifscMatch = extractedText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i);
    const upiMatch = extractedText.match(
      /\b[a-zA-Z0-9.\-_]{2,64}@(?:okaxis|okicici|okhdfcbank|oksbi|ybl|ibl|axl|paytm|upi|icici|hdfcbank|sbi|kotak|axisbank)\b/i
    );
    const websiteMatch = extractedText.match(/\b(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/i);

    // Infer company name from top-most header tokens or first non-boilerplate text line
    const ignoreLineRe = /^(?:tax\s+invoice|invoice|quotation|gstin|pan|phone|mobile|tel|email|e-mail|original|page\s+\d|bill\s+to|ship\s+to|dated?|sr\.?)/i;
    const headerLines = (
      pdfTokens.length > 0
        ? pdfTokens.filter((t) => t.topY <= pageHeight * 0.22).map((t) => t.text)
        : extractedText.split(/\r?\n/).slice(0, 6)
    )
      .map((l) => l.trim())
      .filter((l) => l.length >= 3 && l.length <= 80 && !ignoreLineRe.test(l) && /[a-zA-Z]{3,}/.test(l));
    const companyName = headerLines[0];

    // Zone Calibration (scaled to canonical A4 height ~842pt for portrait / ~595pt for landscape)
    const canonicalH = recommendedOrientation === 'LANDSCAPE' ? 595 : 842;
    const canonicalW = recommendedOrientation === 'LANDSCAPE' ? 842 : 595;
    const scaleY = pageHeight > 0 ? canonicalH / pageHeight : 1;
    const scaleX = pageWidth > 0 ? canonicalW / pageWidth : 1;

    let headerEnd = 140;
    let footerStart = canonicalH - 62;
    let leftMargin = 40;
    let rightMargin = 40;

    if (pdfTokens.length > 0) {
      const scaledTokens = pdfTokens.map((t) => ({
        text: t.text,
        x: t.x * scaleX,
        y: t.topY * scaleY,
      }));
      const headerZoneLimit = canonicalH * 0.34;
      const bodyKeywordRe = /\b(?:tax\s+invoice|bill\s+to|billed\s+to|invoice\s+no|item\s+description|particulars|hsn|qty|sr\.?\s*no)\b/i;
      const headerTokens = scaledTokens.filter((t) => t.y <= headerZoneLimit && !bodyKeywordRe.test(t.text));
      if (headerTokens.length > 0) {
        const maxHeaderY = Math.max(...headerTokens.map((t) => t.y));
        headerEnd = Math.max(70, Math.min(220, Math.round(maxHeaderY + 18)));
      }

      const footerZoneLimit = canonicalH * 0.78;
      const footerTokens = scaledTokens.filter((t) => t.y >= footerZoneLimit);
      if (footerTokens.length > 0) {
        const minFooterY = Math.min(...footerTokens.map((t) => t.y));
        footerStart = Math.max(canonicalH - 160, Math.min(canonicalH - 35, Math.round(minFooterY - 10)));
      }

      const xs = scaledTokens.map((t) => t.x).filter((x) => x > 10 && x < canonicalW * 0.45);
      if (xs.length > 0) {
        leftMargin = Math.max(25, Math.min(80, Math.round(Math.min(...xs))));
        rightMargin = leftMargin;
      }
    }

    const printableTop = headerEnd + 10;
    const printableBottom = footerStart - 10;

    const intel = this.detectTableColumnsAndZones(
      pdfTokens.map((t) => ({ ...t, x: t.x * scaleX, topY: t.topY * scaleY, width: ((t as any).width || 20) * scaleX })),
      canonicalW,
      canonicalH,
      extractedText
    );

    return {
      raw_text: extractedText.substring(0, 1000),
      confidence,
      stored_file_path: storedFilePath,
      detected_file_type: detectedFileType,
      page_width_pt: Math.round(pageWidth * 100) / 100,
      page_height_pt: Math.round(pageHeight * 100) / 100,
      page_count: pageCount,
      recommended_orientation: recommendedOrientation,
      detected_archetype: intel.detected_archetype,
      is_igst: intel.is_igst,
      detected_columns: intel.detected_columns,
      table_header_y: intel.table_header_y,
      table_rows_start_y: intel.table_rows_start_y,
      table_rows_end_y: intel.table_rows_end_y,
      detected_meta_fields: intel.detected_meta_fields,
      detected_customer_fields: intel.detected_customer_fields,
      detected_entities: {
        company_name: companyName,
        gstin,
        pan,
        email: emailMatch ? emailMatch[0] : undefined,
        phone: phoneMatch ? phoneMatch[0] : undefined,
        website: websiteMatch ? websiteMatch[0] : undefined,
        bank_ifsc: ifscMatch ? ifscMatch[0].toUpperCase() : undefined,
        upi_id: upiMatch ? upiMatch[0] : undefined,
      },
      detected_zones: {
        header_box: { y_start: 0, y_end: headerEnd },
        footer_box: { y_start: footerStart, y_end: canonicalH },
        left_margin: leftMargin,
        right_margin: rightMargin,
        printable_area: {
          top: printableTop,
          bottom: printableBottom,
          left: leftMargin,
          right: canonicalW - rightMargin,
        },
        logo_candidate: { x: leftMargin + 5, y: 24, width: 120, height: Math.max(40, headerEnd - 50) },
        signature_box: { x: canonicalW - rightMargin - 135, y: Math.max(printableBottom - 55, 650), width: 130, height: 50 },
      },
    };
  }

  /**
   * Offline OCR Analysis and Zone Detection from file path on disk
   */
  async analyzeLetterhead(filePath: string, companyId?: string): Promise<LetterheadOCRResult> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Letterhead file path is required.');
    }
    if (!companyId) {
      throw new Error('Company identifier is required for letterhead analysis.');
    }

    // Enforce strict directory containment BEFORE checking file existence (prevents host file-existence oracle)
    const safePath = this.validateFilePathInsideUploadDir(companyId, filePath);
    if (!fs.existsSync(safePath)) {
      throw new Error('Letterhead file not found in company upload directory.');
    }

    const buffer = fs.readFileSync(safePath);
    return this.analyzeLetterheadBuffer(buffer, safePath, safePath);
  }
}
