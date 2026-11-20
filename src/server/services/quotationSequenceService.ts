// src/server/services/quotationSequenceService.ts
// Atomic sequence tracking for VARUN SYSTEMS (VS-QT-...-YY-YY) across SQLite and PostgreSQL
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export class QuotationSequenceService {
  /**
   * Calculates the Indian Financial Year string (e.g. '24-25', '25-26', '26-27')
   * Indian Financial Year starts on April 1 and ends on March 31.
   */
  static getFinancialYear(dateInput?: string | Date): string {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const year = validDate.getFullYear();
    const month = validDate.getMonth(); // 0 = Jan, 3 = April

    let startYear: number;
    let endYear: number;

    if (month >= 3) {
      // April to December
      startYear = year;
      endYear = year + 1;
    } else {
      // January to March
      startYear = year - 1;
      endYear = year;
    }

    const startStr = String(startYear).slice(-2);
    const endStr = String(endYear).slice(-2);
    return `${startStr}-${endStr}`;
  }

  /**
   * Atomically increments and gets next quotation number, formatted as VS-QT-008-24-25
   */
  static async getNextQuotationNumber(
    db: Knex | Knex.Transaction,
    companyId: string,
    options?: {
      prefix?: string;
      date?: string | Date;
      padding?: number;
    }
  ): Promise<{ number: string; sequenceNumber: number; financialYear: string }> {
    const prefix = options?.prefix || 'VS-QT-';
    const padding = options?.padding || 3;
    const fy = this.getFinancialYear(options?.date);
    const now = new Date().toISOString();

    let query = db('quotation_sequences').where({
      company_id: companyId,
      prefix,
      financial_year: fy,
    });

    if (typeof (query as any).forUpdate === 'function') {
      try {
        query = (query as any).forUpdate();
      } catch {
        // SQLite doesn't support forUpdate, safe to ignore
      }
    }

    let record = await query.first();
    let nextNumber = 1;

    if (!record) {
      const id = uuidv4();
      await db('quotation_sequences').insert({
        id,
        company_id: companyId,
        prefix,
        current_number: 1,
        financial_year: fy,
        padding,
        created_at: now,
        updated_at: now,
      });
      nextNumber = 1;
    } else {
      nextNumber = (record.current_number || 0) + 1;
      await db('quotation_sequences')
        .where({ id: record.id })
        .update({
          current_number: nextNumber,
          updated_at: now,
        });
    }

    const padded = String(nextNumber).padStart(padding, '0');
    const formatted = `${prefix}${padded}-${fy}`;

    return {
      number: formatted,
      sequenceNumber: nextNumber,
      financialYear: fy,
    };
  }

  /**
   * Previews what the next quotation number will be without incrementing
   */
  static async previewNextQuotationNumber(
    db: Knex,
    companyId: string,
    options?: {
      prefix?: string;
      date?: string | Date;
      padding?: number;
    }
  ): Promise<string> {
    const prefix = options?.prefix || 'VS-QT-';
    const padding = options?.padding || 3;
    const fy = this.getFinancialYear(options?.date);

    const record = await db('quotation_sequences')
      .where({
        company_id: companyId,
        prefix,
        financial_year: fy,
      })
      .first();

    const nextNumber = (record?.current_number || 0) + 1;
    const padded = String(nextNumber).padStart(padding, '0');
    return `${prefix}${padded}-${fy}`;
  }
}
