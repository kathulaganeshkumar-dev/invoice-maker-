// src/server/repositories/quotationRepository.ts
import { Knex } from 'knex';
import { Quotation, QuotationItem, QuotationStatus } from '../../shared/types';

export class QuotationRepository {
  constructor(private db: Knex) {}

  async findById(
    companyId: string,
    id: string,
    trx?: Knex | Knex.Transaction
  ): Promise<Quotation | null> {
    const qb = trx || this.db;
    const row = await qb('quotations')
      .where({ company_id: companyId, id })
      .first();

    if (!row) return null;

    const items = await this.getItems(id, qb);
    return {
      ...row,
      reverse_charge: Boolean(row.reverse_charge),
      print_letterhead_overlay: Boolean(row.print_letterhead_overlay),
      is_gst: row.is_gst !== undefined ? Boolean(row.is_gst) : true,
      items,
    };
  }

  async findList(
    companyId: string,
    filters?: { status?: QuotationStatus; customerId?: string; search?: string },
    trx?: Knex | Knex.Transaction
  ): Promise<Quotation[]> {
    const qb = trx || this.db;
    let query = qb('quotations').where({ company_id: companyId });

    if (filters?.status) {
      query = query.andWhere('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.andWhere('customer_id', filters.customerId);
    }
    if (filters?.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      query = query.andWhere((builder) => {
        builder
          .whereRaw('LOWER(quotation_number) LIKE ?', [s])
          .orWhereRaw('LOWER(customer_name) LIKE ?', [s]);
      });
    }

    const rows = await query.orderBy('created_at', 'desc');
    const result: Quotation[] = [];

    for (const r of rows) {
      const items = await this.getItems(r.id, qb);
      result.push({
        ...r,
        reverse_charge: Boolean(r.reverse_charge),
        print_letterhead_overlay: Boolean(r.print_letterhead_overlay),
        is_gst: r.is_gst !== undefined ? Boolean(r.is_gst) : true,
        items,
      });
    }

    return result;
  }

  async getItems(quotationId: string, trx?: Knex | Knex.Transaction): Promise<QuotationItem[]> {
    const qb = trx || this.db;
    return qb('quotation_items')
      .where({ quotation_id: quotationId })
      .orderBy('sort_order', 'asc');
  }

  private async sanitizeQuotationData(qb: Knex | Knex.Transaction, data: any): Promise<any> {
    try {
      const colInfo = await qb('quotations').columnInfo();
      const validCols = new Set(Object.keys(colInfo));
      if (validCols.size === 0) return data;
      const safe: any = {};
      for (const [k, v] of Object.entries(data)) {
        if (validCols.has(k)) {
          safe[k] = v;
        }
      }
      return safe;
    } catch {
      return data;
    }
  }

  private async sanitizeItemData(qb: Knex | Knex.Transaction, items: any[]): Promise<any[]> {
    try {
      const colInfo = await qb('quotation_items').columnInfo();
      const validCols = new Set(Object.keys(colInfo));
      if (validCols.size === 0) return items;
      return items.map((it) => {
        const safe: any = {};
        for (const [k, v] of Object.entries(it)) {
          if (validCols.has(k)) {
            safe[k] = v;
          }
        }
        return safe;
      });
    } catch {
      return items;
    }
  }

  async insert(quotation: Partial<Quotation>, trx: Knex.Transaction): Promise<void> {
    const data = { ...quotation };
    delete (data as any).items;
    const safeData = await this.sanitizeQuotationData(trx, data);
    await trx('quotations').insert(safeData);
  }

  async update(companyId: string, id: string, quotation: Partial<Quotation>, trx: Knex.Transaction): Promise<void> {
    const data = { ...quotation };
    delete (data as any).items;
    delete (data as any).id;
    delete (data as any).company_id;
    const safeData = await this.sanitizeQuotationData(trx, data);
    await trx('quotations')
      .where({ company_id: companyId, id })
      .update(safeData);
  }

  async delete(companyId: string, id: string, trx?: Knex | Knex.Transaction): Promise<void> {
    const qb = trx || this.db;
    await qb('quotations')
      .where({ company_id: companyId, id })
      .del();
  }

  async insertItems(items: QuotationItem[], trx: Knex.Transaction): Promise<void> {
    if (items.length === 0) return;
    const safeItems = await this.sanitizeItemData(trx, items);
    await trx('quotation_items').insert(safeItems);
  }

  async deleteItems(quotationId: string, trx: Knex.Transaction): Promise<void> {
    await trx('quotation_items')
      .where({ quotation_id: quotationId })
      .del();
  }
}
