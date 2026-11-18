// src/server/services/paymentService.ts - Customer & Supplier Payments & Allocation Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import {
  CustomerPayment,
  SupplierPayment,
  PaymentAllocation,
  PaymentMethod,
} from '../../shared/types';
import { NumberingService } from './numberingService';

export class PaymentService {
  constructor(private db: Knex) {}

  // ===================== CUSTOMER PAYMENTS (ACCOUNTS RECEIVABLE) =====================
  async getCustomerPayments(companyId: string, customerId?: string): Promise<CustomerPayment[]> {
    let query = this.db('customer_payments').where({ company_id: companyId });
    if (customerId) {
      query = query.andWhere({ customer_id: customerId });
    }
    const payments = await query.orderBy('payment_date', 'desc');

    for (const p of payments) {
      p.allocations = await this.db('payment_allocations').where({ payment_id: p.id });
    }
    return payments;
  }

  async recordCustomerPayment(
    companyId: string,
    input: {
      branchId?: string;
      customerId: string;
      customerName: string;
      amount: string | number;
      paymentMethod: PaymentMethod;
      bankAccount?: string;
      paymentDate?: string;
      referenceNumber?: string;
      notes?: string;
      allocations?: { invoiceId: string; amount: string | number }[];
      created_by_device_id?: string;
      created_by_device_name?: string;
    }
  ): Promise<CustomerPayment> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const paymentId = uuidv4();
      const totalPaymentAmount = new Decimal(input.amount || 0);
      if (!totalPaymentAmount.isFinite() || totalPaymentAmount.lte(0)) {
        throw new Error('Customer payment amount must be greater than zero.');
      }

      const { number: payNum } = await NumberingService.getNextNumber(
        trx,
        companyId,
        'CUSTOMER_PAYMENT',
        input.branchId,
        input.paymentDate
      );

      let allocatedSum = new Decimal(0);
      const allocationRecords: PaymentAllocation[] = [];

      // Process allocations
      if (input.allocations && input.allocations.length > 0) {
        for (const alloc of input.allocations) {
          const allocAmount = new Decimal(alloc.amount);
          if (allocAmount.lte(0)) continue;

          const inv = await trx('invoices').where({ id: alloc.invoiceId, company_id: companyId }).first();
          if (!inv) throw new Error(`Invoice ${alloc.invoiceId} not found`);

          const invBalance = new Decimal(inv.balance_amount);
          if (allocAmount.gt(invBalance)) {
            throw new Error(`Allocation ₹ ${allocAmount} exceeds outstanding invoice balance ₹ ${invBalance}`);
          }

          allocatedSum = allocatedSum.add(allocAmount);

          // Update invoice paid & balance amount
          const newPaid = new Decimal(inv.paid_amount).add(allocAmount);
          const newBalance = invBalance.sub(allocAmount);

          await trx('invoices').where({ id: inv.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBalance.toFixed(2),
            updated_at: now,
          });

          const allocRec: PaymentAllocation = {
            id: uuidv4(),
            payment_id: paymentId,
            document_type: 'INVOICE',
            document_id: inv.id,
            document_number: inv.invoice_number,
            allocated_amount: allocAmount.toFixed(2),
            allocated_at: now,
          };

          await trx('payment_allocations').insert(allocRec);
          allocationRecords.push(allocRec);
        }
      }

      if (allocatedSum.gt(totalPaymentAmount)) {
        throw new Error('Total allocated amount cannot exceed received payment amount.');
      }

      const unallocatedAmount = totalPaymentAmount.sub(allocatedSum);

      // Decrement customer current_balance using strict Decimal precision
      const custRecord = await trx('customers').where({ id: input.customerId, company_id: companyId }).first();
      if (custRecord) {
        const nextCustBal = new Decimal(custRecord.current_balance || 0).sub(totalPaymentAmount);
        await trx('customers')
          .where({ id: input.customerId, company_id: companyId })
          .update({
            current_balance: nextCustBal.toFixed(2),
            updated_at: now,
          });
      }

      const paymentRecord: CustomerPayment = {
        id: paymentId,
        company_id: companyId,
        branch_id: input.branchId || 'DEFAULT_BRANCH',
        payment_number: payNum,
        payment_date: input.paymentDate || now.split('T')[0],
        customer_id: input.customerId,
        customer_name: input.customerName,
        amount: totalPaymentAmount.toFixed(2),
        payment_method: input.paymentMethod || 'BANK_TRANSFER',
        bank_account: input.bankAccount || undefined,
        reference_number: input.referenceNumber || undefined,
        notes: input.notes || undefined,
        allocations: allocationRecords,
        unallocated_amount: unallocatedAmount.toFixed(2),
        created_at: now,
      };

      const { allocations: _, ...paymentRow } = paymentRecord;
      await trx('customer_payments').insert({
        ...paymentRow,
        created_by_device_id: input.created_by_device_id || null,
        created_by_device_name: input.created_by_device_name || null,
      });

      return paymentRecord;
    });
  }

  // ===================== SUPPLIER PAYMENTS (ACCOUNTS PAYABLE) =====================
  async getSupplierPayments(companyId: string, supplierId?: string): Promise<SupplierPayment[]> {
    let query = this.db('supplier_payments').where({ company_id: companyId });
    if (supplierId) {
      query = query.andWhere({ supplier_id: supplierId });
    }
    const payments = await query.orderBy('payment_date', 'desc');
    for (const p of payments) {
      p.allocations = await this.db('payment_allocations').where({ payment_id: p.id });
    }
    return payments;
  }

  async recordSupplierPayment(
    companyId: string,
    input: {
      branchId?: string;
      supplierId: string;
      supplierName?: string;
      amount: string | number;
      paymentMethod: PaymentMethod;
      bankAccount?: string;
      vendorBankAccount?: string;
      paymentDate?: string;
      referenceNumber?: string;
      notes?: string;
      allocations?: { billId: string; amount: string | number }[];
      created_by_device_id?: string;
      created_by_device_name?: string;
    }
  ): Promise<SupplierPayment> {
    return this.db.transaction(async (trx) => {
      if (!input.supplierId) {
        throw new Error('Supplier selection is required.');
      }

      const supplier = await trx('suppliers').where({ id: input.supplierId, company_id: companyId }).first();
      if (!supplier) {
        throw new Error('Selected supplier not found.');
      }

      const now = new Date().toISOString();
      const paymentId = uuidv4();
      const totalAmount = new Decimal(input.amount || 0);
      if (totalAmount.lte(0)) {
        throw new Error('Payment amount must be greater than zero.');
      }

      const { number: payNum } = await NumberingService.getNextNumber(
        trx,
        companyId,
        'SUPPLIER_PAYMENT',
        input.branchId,
        input.paymentDate
      );

      let allocatedSum = new Decimal(0);
      const allocationRecords: PaymentAllocation[] = [];

      if (input.allocations && input.allocations.length > 0) {
        for (const alloc of input.allocations) {
          const allocAmount = new Decimal(alloc.amount || 0);
          if (allocAmount.lte(0)) continue;

          const bill = await trx('purchase_invoices').where({ id: alloc.billId, company_id: companyId }).first();
          if (!bill) throw new Error(`Purchase invoice ${alloc.billId} not found`);

          const billBalance = new Decimal(bill.balance_amount);
          if (allocAmount.gt(billBalance)) {
            throw new Error(`Allocation ₹ ${allocAmount} exceeds outstanding bill balance ₹ ${billBalance}`);
          }

          allocatedSum = allocatedSum.add(allocAmount);

          const newPaid = new Decimal(bill.paid_amount).add(allocAmount);
          const newBalance = billBalance.sub(allocAmount);

          await trx('purchase_invoices').where({ id: bill.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBalance.toFixed(2),
            updated_at: now,
          });

          const allocRec: PaymentAllocation = {
            id: uuidv4(),
            payment_id: paymentId,
            document_type: 'PURCHASE_INVOICE',
            document_id: bill.id,
            document_number: bill.bill_number,
            allocated_amount: allocAmount.toFixed(2),
            allocated_at: now,
          };

          await trx('payment_allocations').insert(allocRec);
          allocationRecords.push(allocRec);
        }
      }

      if (allocatedSum.gt(totalAmount)) {
        throw new Error('Total allocated amount cannot exceed payment amount.');
      }

      const unallocated = totalAmount.sub(allocatedSum);

      // Decrement supplier current_balance (payable reduced) with Decimal precision
      const updatedSupBal = new Decimal(supplier.current_balance || 0).sub(totalAmount);
      await trx('suppliers')
        .where({ id: input.supplierId, company_id: companyId })
        .update({
          current_balance: updatedSupBal.toFixed(2),
          updated_at: now,
        });

      const paymentRecord: SupplierPayment = {
        id: paymentId,
        company_id: companyId,
        branch_id: input.branchId || 'DEFAULT_BRANCH',
        payment_number: payNum,
        payment_date: input.paymentDate || now.split('T')[0],
        supplier_id: input.supplierId,
        supplier_name: input.supplierName || supplier.name,
        amount: totalAmount.toFixed(2),
        payment_method: input.paymentMethod || 'BANK_TRANSFER',
        bank_account: input.bankAccount || undefined,
        vendor_bank_account: input.vendorBankAccount || undefined,
        reference_number: input.referenceNumber || undefined,
        notes: input.notes || undefined,
        allocations: allocationRecords,
        unallocated_amount: unallocated.toFixed(2),
        created_at: now,
      };

      const { allocations: _, ...row } = paymentRecord;
      await trx('supplier_payments').insert({
        ...row,
        created_by_device_id: input.created_by_device_id || null,
        created_by_device_name: input.created_by_device_name || null,
      });

      return paymentRecord;
    });
  }

  async deleteCustomerPayment(companyId: string, paymentId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const p = await trx('customer_payments').where({ company_id: companyId, id: paymentId }).first();
      if (!p) throw new Error('Customer payment not found');

      const allocations = await trx('payment_allocations').where({ payment_id: paymentId, document_type: 'INVOICE' });
      for (const alloc of allocations) {
        const inv = await trx('invoices').where({ id: alloc.document_id, company_id: companyId }).first();
        if (inv) {
          const allocAmt = new Decimal(alloc.allocated_amount);
          const newPaid = new Decimal(inv.paid_amount).sub(allocAmt);
          const newBal = new Decimal(inv.balance_amount).add(allocAmt);
          await trx('invoices').where({ id: inv.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBal.toFixed(2),
            updated_at: new Date().toISOString(),
          });
        }
      }

      const custRecord = await trx('customers').where({ id: p.customer_id, company_id: companyId }).first();
      if (custRecord) {
        const restoredBal = new Decimal(custRecord.current_balance || 0).add(new Decimal(p.amount));
        await trx('customers')
          .where({ id: p.customer_id, company_id: companyId })
          .update({
            current_balance: restoredBal.toFixed(2),
            updated_at: new Date().toISOString(),
          });
      }

      await trx('payment_allocations').where({ payment_id: paymentId }).del();
      await trx('customer_payments').where({ id: paymentId }).del();
      return true;
    });
  }

  async deleteSupplierPayment(companyId: string, paymentId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const p = await trx('supplier_payments').where({ company_id: companyId, id: paymentId }).first();
      if (!p) throw new Error('Supplier payment not found');

      const allocations = await trx('payment_allocations').where({ payment_id: paymentId, document_type: 'PURCHASE_INVOICE' });
      for (const alloc of allocations) {
        const bill = await trx('purchase_invoices').where({ id: alloc.document_id, company_id: companyId }).first();
        if (bill) {
          const allocAmt = new Decimal(alloc.allocated_amount);
          const newPaid = new Decimal(bill.paid_amount).sub(allocAmt);
          const newBal = new Decimal(bill.balance_amount).add(allocAmt);
          await trx('purchase_invoices').where({ id: bill.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBal.toFixed(2),
            updated_at: new Date().toISOString(),
          });
        }
      }

      const supRecord = await trx('suppliers').where({ id: p.supplier_id, company_id: companyId }).first();
      if (supRecord) {
        const restoredSupBal = new Decimal(supRecord.current_balance || 0).add(new Decimal(p.amount));
        await trx('suppliers')
          .where({ id: p.supplier_id, company_id: companyId })
          .update({
            current_balance: restoredSupBal.toFixed(2),
            updated_at: new Date().toISOString(),
          });
      }

      await trx('payment_allocations').where({ payment_id: paymentId }).del();
      await trx('supplier_payments').where({ id: paymentId }).del();
      return true;
    });
  }
}
