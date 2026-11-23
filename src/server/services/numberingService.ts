// src/server/services/numberingService.ts - Atomic Sequential Numbering Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { NumberingSequence } from '../../shared/types';

export function getIndianFinancialYear(dateInput?: string | Date, format: 'YYYY-YY' | 'YY-YY' | 'YYYY' = 'YYYY-YY'): string {
  let year: number;
  let month: number;

  if (!dateInput) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    year = parts[0];
    month = parts[1];
  } else {
    const d = new Date(dateInput);
    year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
    month = isNaN(d.getMonth()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  }

  // In India, Financial Year starts on April 1 (month 4)
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;

  const startYearFull = startYear.toString();
  const endYearShort = (endYear % 100).toString().padStart(2, '0');
  const startYearShort = (startYear % 100).toString().padStart(2, '0');

  if (format === 'YY-YY') {
    return `${startYearShort}-${endYearShort}`;
  } else if (format === 'YYYY') {
    return startYearFull;
  }
  return `${startYearFull}-${endYearShort}`;
}

export function formatDocumentNumber(seq: NumberingSequence, nextNum: number, docDate?: string): string {
  const numStr = nextNum.toString().padStart(seq.padding_length || 4, '0');
  const sep = seq.separator !== undefined ? seq.separator : '/';

  if (seq.custom_format) {
    // Custom template tokens: {PREFIX}, {FY}, {NUMBER}, {SUFFIX}
    const fy = getIndianFinancialYear(docDate, seq.fy_format);
    return seq.custom_format
      .replace('{PREFIX}', seq.prefix || '')
      .replace('{FY}', fy)
      .replace('{NUMBER}', numStr)
      .replace('{SUFFIX}', seq.suffix || '');
  }

  const parts: string[] = [];
  if (seq.prefix) parts.push(seq.prefix.replace(/\/$/, ''));
  if (seq.include_financial_year) {
    parts.push(getIndianFinancialYear(docDate, seq.fy_format));
  }
  parts.push(numStr);

  let result = parts.join(sep);
  if (seq.suffix) {
    result += (seq.suffix.startsWith('/') ? '' : sep) + seq.suffix;
  }
  return result;
}

export class NumberingService {
  /**
   * Generates the next sequential number atomically inside a transaction
   */
  static async getNextNumber(
    trx: Knex.Transaction,
    companyId: string,
    documentType: string,
    branchId?: string,
    docDate?: string
  ): Promise<{ number: string; sequenceNumber: number }> {
    let query = trx('numbering_sequences')
      .where({ company_id: companyId, document_type: documentType });

    if (branchId) {
      query = query.andWhere((qb) => {
        qb.where('branch_id', branchId).orWhereNull('branch_id');
      });
    }

    let seq = await query.orderBy('branch_id', 'desc').forUpdate().first();

    if (!seq) {
      // Create default sequence on the fly if not yet created
      const newSeqId = uuidv4();
      const defaultPrefix = `${documentType.substring(0, 3)}/`;
      seq = {
        id: newSeqId,
        company_id: companyId,
        branch_id: branchId || null,
        document_type: documentType,
        prefix: defaultPrefix,
        suffix: '',
        padding_length: 4,
        current_number: 0,
        include_financial_year: true,
        fy_format: 'YYYY-YY',
        separator: '/',
        last_generated_number: null,
        updated_at: new Date().toISOString(),
      };
      await trx('numbering_sequences').insert(seq);
    }

    let nextNumber = Number(seq.current_number) + 1;
    let formatted = formatDocumentNumber(seq, nextNumber, docDate);

    // Collision guard: Ensure generated number is unique across existing documents
    let collision = true;
    while (collision) {
      let existing: any = null;
      if (documentType === 'QUOTATION') {
        existing = await trx('quotations')
          .where({ company_id: companyId, quotation_number: formatted })
          .first();
      } else if (documentType === 'PURCHASE_ORDER') {
        existing = await trx('purchase_orders')
          .where({ company_id: companyId, po_number: formatted })
          .first();
      } else if (documentType === 'CUSTOMER_PAYMENT') {
        existing = await trx('customer_payments')
          .where({ company_id: companyId, payment_number: formatted })
          .first();
      } else if (documentType === 'SUPPLIER_PAYMENT') {
        existing = await trx('supplier_payments')
          .where({ company_id: companyId, payment_number: formatted })
          .first();
      } else {
        existing = await trx('invoices')
          .where({ company_id: companyId, document_type: documentType, invoice_number: formatted })
          .first();
      }

      if (existing) {
        nextNumber++;
        formatted = formatDocumentNumber(seq, nextNumber, docDate);
      } else {
        collision = false;
      }
    }

    // Atomically increment
    await trx('numbering_sequences')
      .where({ id: seq.id })
      .update({
        current_number: nextNumber,
        last_generated_number: formatted,
        updated_at: new Date().toISOString(),
      });

    return {
      number: formatted,
      sequenceNumber: nextNumber,
    };
  }

  /**
   * Previews what the next number will look like without mutating the sequence
   */
  static async previewNextNumber(
    db: Knex,
    companyId: string,
    documentType: string,
    branchId?: string,
    docDate?: string
  ): Promise<string> {
    let query = db('numbering_sequences')
      .where({ company_id: companyId, document_type: documentType });

    if (branchId) {
      query = query.andWhere((qb) => {
        qb.where('branch_id', branchId).orWhereNull('branch_id');
      });
    }

    const seq = await query.orderBy('branch_id', 'desc').first();
    if (!seq) {
      return `${documentType.substring(0, 3)}/${getIndianFinancialYear(docDate)}/0001`;
    }

    const nextNumber = Number(seq.current_number) + 1;
    return formatDocumentNumber(seq, nextNumber, docDate);
  }
}
