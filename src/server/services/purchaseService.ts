// src/server/services/purchaseService.ts - Purchasing, Purchase Bills, Inward Stock Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { PurchaseOrder, PurchaseOrderItem, PurchaseInvoice, PurchaseInvoiceItem } from '../../shared/types';
import { calculateLineItem, calculateDocumentTotals } from '../finance/decimalCalc';
import { NumberingService } from './numberingService';

export class PurchaseService {
  constructor(private db: Knex) {}

  // ===================== PURCHASE ORDERS =====================
  async getPurchaseOrders(companyId: string): Promise<PurchaseOrder[]> {
    const pos = await this.db('purchase_orders').where({ company_id: companyId }).orderBy('created_at', 'desc');
    for (const po of pos) {
      po.items = await this.db('purchase_order_items').where({ purchase_order_id: po.id });
    }
    return pos;
  }

  async createPurchaseOrder(companyId: string, input: any): Promise<PurchaseOrder> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const poId = uuidv4();

      let branch = null;
      if (input.branch_id) {
        branch = await trx('branches').where({ id: input.branch_id, company_id: companyId }).first();
      }
      if (!branch) {
        branch = await trx('branches').where({ company_id: companyId, is_default: true }).first()
          || await trx('branches').where({ company_id: companyId }).first();
      }

      const { number: poNumber } = await NumberingService.getNextNumber(
        trx,
        companyId,
        'PURCHASE_ORDER',
        branch?.id || input.branch_id,
        input.po_date
      );

      const items: PurchaseOrderItem[] = [];
      let subtotal = new Decimal(0);
      let totalTax = new Decimal(0);

      const lineInputs = input.items || [];
      for (const item of lineInputs) {
        const qty = new Decimal(item.quantity ?? 1);
        const rate = new Decimal(item.rate ?? 0);
        const gstRate = new Decimal(item.gst_rate !== undefined ? item.gst_rate : 18);
        if (!qty.isFinite() || qty.lte(0)) {
          throw new Error(`Invalid quantity for purchase item "${item.item_name || 'Item'}": must be greater than zero.`);
        }
        if (!rate.isFinite() || rate.lt(0)) {
          throw new Error(`Invalid rate for purchase item "${item.item_name || 'Item'}": cannot be negative.`);
        }
        if (!gstRate.isFinite() || gstRate.lt(0) || gstRate.gt(100)) {
          throw new Error(`Invalid GST rate for purchase item "${item.item_name || 'Item'}": must be between 0% and 100%.`);
        }
        const taxable = qty.mul(rate);
        const tax = taxable.mul(gstRate).div(100);
        const lineTotal = taxable.add(tax);

        subtotal = subtotal.add(taxable);
        totalTax = totalTax.add(tax);

        items.push({
          id: uuidv4(),
          purchase_order_id: poId,
          product_id: item.product_id || undefined,
          item_name: item.item_name || 'Purchase Item',
          hsn_code: item.hsn_code || '',
          quantity: qty.toFixed(2),
          unit: item.unit || 'NOS',
          rate: rate.toFixed(2),
          discount_amount: '0.00',
          gst_rate: gstRate.toFixed(2),
          taxable_value: taxable.toFixed(2),
          total_tax: tax.toFixed(2),
          line_total: lineTotal.toFixed(2),
        });
      }

      const grandTotal = subtotal.add(totalTax);

      const po: PurchaseOrder = {
        id: poId,
        company_id: companyId,
        branch_id: input.branch_id || 'DEFAULT_BRANCH',
        po_number: poNumber,
        po_date: input.po_date || now.split('T')[0],
        expected_delivery_date: input.expected_delivery_date || undefined,
        supplier_id: input.supplier_id,
        supplier_name: input.supplier_name,
        supplier_gstin: input.supplier_gstin || undefined,
        items,
        subtotal: subtotal.toFixed(2),
        total_tax: totalTax.toFixed(2),
        grand_total: grandTotal.toFixed(2),
        status: 'DRAFT',
        notes: input.notes || undefined,
        created_at: now,
        updated_at: now,
      };

      const { items: _, ...poRow } = po;
      await trx('purchase_orders').insert(poRow);
      for (const item of items) {
        await trx('purchase_order_items').insert(item);
      }

      return po;
    });
  }

  // ===================== PURCHASE INVOICES (BILLS) =====================
  async getPurchaseInvoices(companyId: string): Promise<PurchaseInvoice[]> {
    const bills = await this.db('purchase_invoices').where({ company_id: companyId }).orderBy('created_at', 'desc');
    for (const b of bills) {
      b.items = await this.db('purchase_invoice_items').where({ purchase_invoice_id: b.id });
    }
    return bills;
  }

  async createPurchaseInvoice(companyId: string, input: any): Promise<PurchaseInvoice> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const billId = uuidv4();

      const items: PurchaseInvoiceItem[] = [];
      let subtotal = new Decimal(0);
      let totalTax = new Decimal(0);

      const lineInputs = input.items || [];
      for (const item of lineInputs) {
        const qty = new Decimal(item.quantity ?? 1);
        const rate = new Decimal(item.rate ?? 0);
        const gstRate = new Decimal(item.gst_rate !== undefined ? item.gst_rate : 18);
        if (!qty.isFinite() || qty.lte(0)) {
          throw new Error(`Invalid quantity for purchase item "${item.item_name || 'Item'}": must be greater than zero.`);
        }
        if (!rate.isFinite() || rate.lt(0)) {
          throw new Error(`Invalid rate for purchase item "${item.item_name || 'Item'}": cannot be negative.`);
        }
        if (!gstRate.isFinite() || gstRate.lt(0) || gstRate.gt(100)) {
          throw new Error(`Invalid GST rate for purchase item "${item.item_name || 'Item'}": must be between 0% and 100%.`);
        }
        const taxable = qty.mul(rate);
        const tax = taxable.mul(gstRate).div(100);
        const lineTotal = taxable.add(tax);

        subtotal = subtotal.add(taxable);
        totalTax = totalTax.add(tax);

        items.push({
          id: uuidv4(),
          purchase_invoice_id: billId,
          product_id: item.product_id || undefined,
          item_name: item.item_name || 'Item',
          hsn_code: item.hsn_code || '',
          quantity: qty.toFixed(2),
          unit: item.unit || 'NOS',
          rate: rate.toFixed(2),
          discount_amount: '0.00',
          gst_rate: gstRate.toFixed(2),
          taxable_value: taxable.toFixed(2),
          cgst_amount: tax.div(2).toFixed(2),
          sgst_amount: tax.div(2).toFixed(2),
          igst_amount: '0.00',
          total_tax: tax.toFixed(2),
          line_total: lineTotal.toFixed(2),
        });
      }

      const grossTotal = subtotal.add(totalTax);

      // Compute Overall Bill Discount using strict Decimal arithmetic (ROUND_HALF_UP)
      const safeDec = (val: any): Decimal => {
        if (val === null || val === undefined || String(val).trim() === '') return new Decimal(0);
        try {
          const d = new Decimal(val);
          return d.isFinite() && d.gt(0) ? d : new Decimal(0);
        } catch {
          return new Decimal(0);
        }
      };

      const discountType: 'AMOUNT' | 'PERCENTAGE' =
        input.overall_discount_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'AMOUNT';

      let discountPercentage = new Decimal(0);
      let discountAmount = new Decimal(0);

      if (discountType === 'PERCENTAGE') {
        const rawPct = safeDec(input.overall_discount_percentage);
        discountPercentage = Decimal.min(new Decimal(100), rawPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        discountAmount = grossTotal
          .mul(discountPercentage)
          .div(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        const rawAmt = safeDec(input.overall_discount_amount);
        discountAmount = Decimal.min(grossTotal, rawAmt).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        discountPercentage = grossTotal.gt(0)
          ? discountAmount.div(grossTotal).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          : new Decimal(0);
      }

      const grandTotal = Decimal.max(0, grossTotal.sub(discountAmount)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      let branch = null;
      if (input.branch_id) {
        branch = await trx('branches').where({ id: input.branch_id, company_id: companyId }).first();
      }
      if (!branch) {
        branch = await trx('branches').where({ company_id: companyId, is_default: true }).first()
          || await trx('branches').where({ company_id: companyId }).first();
      }

      let supplierName = input.supplier_name;
      let supplierGstin = input.supplier_gstin;
      if (input.supplier_id) {
        const supRec = await trx('suppliers').where({ id: input.supplier_id, company_id: companyId }).first();
        if (supRec) {
          supplierName = supplierName || supRec.name;
          supplierGstin = supplierGstin || supRec.gstin;
        }
      }
      if (!supplierName) {
        supplierName = 'Vendor / Supplier';
      }

      const bill: PurchaseInvoice = {
        id: billId,
        company_id: companyId,
        branch_id: branch?.id || input.branch_id || 'DEFAULT_BRANCH',
        purchase_order_id: input.purchase_order_id || undefined,
        bill_number: input.bill_number || `BILL-${Date.now()}`,
        bill_date: input.bill_date || now.split('T')[0],
        due_date: input.due_date || input.bill_date || now.split('T')[0],
        supplier_id: input.supplier_id,
        supplier_name: supplierName,
        supplier_gstin: supplierGstin || undefined,
        warehouse_id: input.warehouse_id,
        items,
        subtotal: subtotal.toFixed(2),
        total_tax: totalTax.toFixed(2),
        overall_discount_type: discountType,
        overall_discount_percentage: discountPercentage.toFixed(2),
        overall_discount_amount: discountAmount.toFixed(2),
        grand_total: grandTotal.toFixed(2),
        paid_amount: '0.00',
        balance_amount: grandTotal.toFixed(2),
        is_finalized: false,
        notes: input.notes || undefined,
        created_at: now,
        updated_at: now,
      };

      const { items: _, ...billRow } = bill;
      await trx('purchase_invoices').insert({
        ...billRow,
        created_by_device_id: input.created_by_device_id || null,
        created_by_device_name: input.created_by_device_name || null,
      });
      for (const item of items) {
        await trx('purchase_invoice_items').insert(item);
      }

      return bill;
    });
  }

  /**
   * Finalizes purchase bill: increases supplier payable balance and performs inward stock movement
   */
  async finalizePurchaseInvoice(companyId: string, billId: string): Promise<PurchaseInvoice> {
    return this.db.transaction(async (trx) => {
      const bill = await trx('purchase_invoices').where({ company_id: companyId, id: billId }).first();
      if (!bill) throw new Error('Purchase bill not found');
      if (bill.is_finalized) throw new Error('Bill is already finalized');

      const now = new Date().toISOString();

      // Mark finalized
      await trx('purchase_invoices').where({ id: billId }).update({
        is_finalized: true,
        updated_at: now,
      });

      // Increase Supplier Payable Current Balance using strict Decimal arithmetic
      const supRecord = await trx('suppliers').where({ id: bill.supplier_id, company_id: companyId }).first();
      if (supRecord) {
        const nextSupBalance = new Decimal(supRecord.current_balance || 0).add(new Decimal(bill.grand_total));
        await trx('suppliers')
          .where({ id: bill.supplier_id, company_id: companyId })
          .update({
            current_balance: nextSupBalance.toFixed(2),
            updated_at: now,
          });
      }

      // Inward stock movement for items
      const items = await trx('purchase_invoice_items').where({ purchase_invoice_id: billId });
      for (const item of items) {
        if (item.product_id) {
          const qtyIn = new Decimal(item.quantity);

          await trx('inventory_transactions').insert({
            id: uuidv4(),
            company_id: companyId,
            branch_id: bill.branch_id,
            warehouse_id: bill.warehouse_id,
            product_id: item.product_id,
            movement_type: 'PURCHASE_RECEIPT',
            quantity: qtyIn.toFixed(2),
            unit_cost: item.rate,
            total_cost: qtyIn.mul(new Decimal(item.rate)).toFixed(2),
            reference_document_type: 'PURCHASE_INVOICE',
            reference_document_id: billId,
            reference_document_number: bill.bill_number,
            notes: `Received against Purchase Bill ${bill.bill_number}`,
            transaction_date: bill.bill_date,
            created_at: now,
          });

          // Increment product current_stock using Decimal arithmetic
          const prodRecord = await trx('products').where({ id: item.product_id, company_id: companyId }).first();
          if (prodRecord) {
            const nextStock = new Decimal(prodRecord.current_stock || 0).add(qtyIn);
            await trx('products')
              .where({ id: item.product_id, company_id: companyId })
              .update({
                current_stock: nextStock.toFixed(2),
                purchase_price: item.rate,
                updated_at: now,
              });
          }

          // Update stock balance
          const existingBal = await trx('stock_balances')
            .where({ company_id: companyId, warehouse_id: bill.warehouse_id, product_id: item.product_id })
            .first();

          if (existingBal) {
            const oldQty = new Decimal(existingBal.quantity_on_hand);
            const oldVal = new Decimal(existingBal.total_stock_value);
            const newQty = oldQty.add(qtyIn);
            const addedVal = qtyIn.mul(new Decimal(item.rate));
            const newVal = oldVal.add(addedVal);
            const newAvgCost = newQty.gt(0) ? newVal.div(newQty) : new Decimal(item.rate);

            await trx('stock_balances').where({ id: existingBal.id }).update({
              quantity_on_hand: newQty.toFixed(2),
              average_unit_cost: newAvgCost.toFixed(2),
              total_stock_value: newVal.toFixed(2),
              last_updated_at: now,
            });
          } else {
            await trx('stock_balances').insert({
              id: uuidv4(),
              company_id: companyId,
              warehouse_id: bill.warehouse_id,
              product_id: item.product_id,
              quantity_on_hand: qtyIn.toFixed(2),
              average_unit_cost: item.rate,
              total_stock_value: qtyIn.mul(new Decimal(item.rate)).toFixed(2),
              last_updated_at: now,
            });
          }
        }
      }

      bill.is_finalized = true;
      bill.items = items;
      return bill;
    });
  }

  async deletePurchaseOrder(companyId: string, poId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const po = await trx('purchase_orders').where({ company_id: companyId, id: poId }).first();
      if (!po) throw new Error('Purchase order not found');

      await trx('purchase_order_items').where({ purchase_order_id: poId }).del();
      await trx('purchase_orders').where({ id: poId }).del();
      return true;
    });
  }

  async deletePurchaseInvoice(companyId: string, billId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const bill = await trx('purchase_invoices').where({ company_id: companyId, id: billId }).first();
      if (!bill) throw new Error('Purchase bill not found');

      const now = new Date().toISOString();

      if (bill.is_finalized) {
        // 1. Reverse supplier payable balance incremented when bill was finalized
        const supplier = await trx('suppliers').where({ id: bill.supplier_id, company_id: companyId }).first();
        if (supplier) {
          const newSupBalance = new Decimal(supplier.current_balance || 0).sub(new Decimal(bill.grand_total || 0));
          await trx('suppliers').where({ id: supplier.id }).update({
            current_balance: newSupBalance.toFixed(2),
            updated_at: now,
          });
        }

        // 2. Restore any allocated amounts back to parent supplier payments so ledger stays accurate
        const allocations = await trx('payment_allocations').where({
          document_type: 'PURCHASE_INVOICE',
          document_id: billId,
        });
        for (const alloc of allocations) {
          const sp = await trx('supplier_payments').where({ id: alloc.payment_id, company_id: companyId }).first();
          if (sp) {
            const updatedUnalloc = new Decimal(sp.unallocated_amount || 0).add(new Decimal(alloc.allocated_amount || 0));
            await trx('supplier_payments').where({ id: sp.id }).update({
              unallocated_amount: updatedUnalloc.toFixed(2),
            });
          }
        }

        // 3. Reverse inward stock movements created for this purchase bill
        const stockMovements = await trx('inventory_transactions').where({
          company_id: companyId,
          reference_document_id: billId,
          movement_type: 'PURCHASE_RECEIPT',
        });

        for (const mov of stockMovements) {
          const qtyDec = new Decimal(mov.quantity || 0).abs();
          const totalCostDec = new Decimal(mov.total_cost || 0).abs();

          const prod = await trx('products').where({ id: mov.product_id, company_id: companyId }).first();
          if (prod) {
            const newProdStock = Decimal.max(0, new Decimal(prod.current_stock || 0).sub(qtyDec));
            await trx('products').where({ id: prod.id }).update({
              current_stock: newProdStock.toFixed(2),
              updated_at: now,
            });
          }

          const existingBal = await trx('stock_balances')
            .where({ company_id: companyId, warehouse_id: mov.warehouse_id, product_id: mov.product_id })
            .first();
          if (existingBal) {
            const oldQty = new Decimal(existingBal.quantity_on_hand || 0);
            const oldVal = new Decimal(existingBal.total_stock_value || 0);
            const newQty = Decimal.max(0, oldQty.sub(qtyDec));
            const newVal = newQty.gt(0) ? Decimal.max(0, oldVal.sub(totalCostDec)) : new Decimal(0);
            const newAvg = newQty.gt(0) ? newVal.div(newQty) : new Decimal(0);

            await trx('stock_balances').where({ id: existingBal.id }).update({
              quantity_on_hand: newQty.toFixed(2),
              average_unit_cost: newAvg.toFixed(2),
              total_stock_value: newVal.toFixed(2),
              last_updated_at: now,
            });
          }
        }

        await trx('inventory_transactions')
          .where({ company_id: companyId, reference_document_id: billId })
          .del();
      }

      await trx('purchase_invoice_items').where({ purchase_invoice_id: billId }).del();
      await trx('payment_allocations').where({ document_type: 'PURCHASE_INVOICE', document_id: billId }).del();
      await trx('purchase_invoices').where({ id: billId }).del();

      await trx('audit_logs').insert({
        id: uuidv4(),
        company_id: companyId,
        entity_type: 'PURCHASE_INVOICE',
        entity_id: billId,
        action: 'DELETE',
        details: `Deleted ${bill.is_finalized ? 'finalized' : 'draft'} purchase bill ${bill.bill_number} (Supplier: ${bill.supplier_name}, Amount: ₹ ${bill.grand_total})`,
        timestamp: now,
      });

      return true;
    });
  }
}
