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
      customerName?: string;
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
        customer_name: input.customerName || custRecord?.name || 'Walk-in Customer',
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

  async updateCustomerPayment(
    companyId: string,
    paymentId: string,
    input: {
      customerId: string;
      customerName?: string;
      amount: string | number;
      paymentMethod: PaymentMethod;
      bankAccount?: string;
      paymentDate?: string;
      referenceNumber?: string;
      notes?: string;
      allocations?: { invoiceId: string; amount: string | number }[];
    }
  ): Promise<CustomerPayment> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const oldPayment = await trx('customer_payments').where({ company_id: companyId, id: paymentId }).first();
      if (!oldPayment) throw new Error('Customer payment not found');

      const totalPaymentAmount = new Decimal(input.amount || 0);
      if (!totalPaymentAmount.isFinite() || totalPaymentAmount.lte(0)) {
        throw new Error('Customer payment amount must be greater than zero.');
      }

      // Step 1: Revert previous allocations on invoices
      const oldAllocations = await trx('payment_allocations').where({ payment_id: paymentId, document_type: 'INVOICE' });
      for (const oldAlloc of oldAllocations) {
        const inv = await trx('invoices').where({ id: oldAlloc.document_id, company_id: companyId }).first();
        if (inv) {
          const allocAmt = new Decimal(oldAlloc.allocated_amount);
          const newPaid = new Decimal(inv.paid_amount).sub(allocAmt);
          const newBal = new Decimal(inv.balance_amount).add(allocAmt);
          await trx('invoices').where({ id: inv.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBal.toFixed(2),
            updated_at: now,
          });
        }
      }

      // Step 2: Restore previous payment amount to the old customer's balance
      const oldCustRecord = await trx('customers').where({ id: oldPayment.customer_id, company_id: companyId }).first();
      if (oldCustRecord) {
        const restoredBal = new Decimal(oldCustRecord.current_balance || 0).add(new Decimal(oldPayment.amount));
        await trx('customers')
          .where({ id: oldCustRecord.id, company_id: companyId })
          .update({
            current_balance: restoredBal.toFixed(2),
            updated_at: now,
          });
      }

      // Delete old allocations
      await trx('payment_allocations').where({ payment_id: paymentId }).del();

      // Step 3: Process new allocations
      let allocatedSum = new Decimal(0);
      const newAllocationRecords: PaymentAllocation[] = [];

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
          newAllocationRecords.push(allocRec);
        }
      }

      if (allocatedSum.gt(totalPaymentAmount)) {
        throw new Error('Total allocated amount cannot exceed received payment amount.');
      }

      const unallocatedAmount = totalPaymentAmount.sub(allocatedSum);

      // Step 4: Apply new payment amount to customer balance
      const newCustRecord = await trx('customers').where({ id: input.customerId, company_id: companyId }).first();
      if (newCustRecord) {
        const nextCustBal = new Decimal(newCustRecord.current_balance || 0).sub(totalPaymentAmount);
        await trx('customers')
          .where({ id: input.customerId, company_id: companyId })
          .update({
            current_balance: nextCustBal.toFixed(2),
            updated_at: now,
          });
      }

      // Step 5: Update customer_payments record
      await trx('customer_payments').where({ id: paymentId, company_id: companyId }).update({
        customer_id: input.customerId,
        customer_name: input.customerName || newCustRecord?.name || oldPayment.customer_name,
        amount: totalPaymentAmount.toFixed(2),
        payment_method: input.paymentMethod || oldPayment.payment_method,
        bank_account: input.bankAccount !== undefined ? input.bankAccount : oldPayment.bank_account,
        reference_number: input.referenceNumber !== undefined ? input.referenceNumber : oldPayment.reference_number,
        payment_date: input.paymentDate || oldPayment.payment_date,
        notes: input.notes !== undefined ? input.notes : oldPayment.notes,
        unallocated_amount: unallocatedAmount.toFixed(2),
        updated_at: now,
      });

      const updated = await trx('customer_payments').where({ id: paymentId, company_id: companyId }).first();
      updated.allocations = newAllocationRecords;
      return updated;
    });
  }

  async updateSupplierPayment(
    companyId: string,
    paymentId: string,
    input: {
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
    }
  ): Promise<SupplierPayment> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const oldPayment = await trx('supplier_payments').where({ company_id: companyId, id: paymentId }).first();
      if (!oldPayment) throw new Error('Supplier payment not found');

      const totalAmount = new Decimal(input.amount || 0);
      if (totalAmount.lte(0)) {
        throw new Error('Payment amount must be greater than zero.');
      }

      // Step 1: Revert previous allocations on purchase bills
      const oldAllocations = await trx('payment_allocations').where({ payment_id: paymentId, document_type: 'PURCHASE_INVOICE' });
      for (const oldAlloc of oldAllocations) {
        const bill = await trx('purchase_invoices').where({ id: oldAlloc.document_id, company_id: companyId }).first();
        if (bill) {
          const allocAmt = new Decimal(oldAlloc.allocated_amount);
          const newPaid = new Decimal(bill.paid_amount).sub(allocAmt);
          const newBal = new Decimal(bill.balance_amount).add(allocAmt);
          await trx('purchase_invoices').where({ id: bill.id }).update({
            paid_amount: newPaid.toFixed(2),
            balance_amount: newBal.toFixed(2),
            updated_at: now,
          });
        }
      }

      // Step 2: Restore previous payment amount to the old supplier's balance (payable increased)
      const oldSupRecord = await trx('suppliers').where({ id: oldPayment.supplier_id, company_id: companyId }).first();
      if (oldSupRecord) {
        const restoredBal = new Decimal(oldSupRecord.current_balance || 0).add(new Decimal(oldPayment.amount));
        await trx('suppliers')
          .where({ id: oldSupRecord.id, company_id: companyId })
          .update({
            current_balance: restoredBal.toFixed(2),
            updated_at: now,
          });
      }

      // Delete old allocations
      await trx('payment_allocations').where({ payment_id: paymentId }).del();

      // Step 3: Process new allocations
      let allocatedSum = new Decimal(0);
      const newAllocationRecords: PaymentAllocation[] = [];

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
          newAllocationRecords.push(allocRec);
        }
      }

      if (allocatedSum.gt(totalAmount)) {
        throw new Error('Total allocated amount cannot exceed payment amount.');
      }

      const unallocated = totalAmount.sub(allocatedSum);

      // Step 4: Apply new payment amount to supplier balance (payable decreased)
      const newSupRecord = await trx('suppliers').where({ id: input.supplierId, company_id: companyId }).first();
      if (newSupRecord) {
        const nextSupBal = new Decimal(newSupRecord.current_balance || 0).sub(totalAmount);
        await trx('suppliers')
          .where({ id: input.supplierId, company_id: companyId })
          .update({
            current_balance: nextSupBal.toFixed(2),
            updated_at: now,
          });
      }

      // Step 5: Update supplier_payments record
      await trx('supplier_payments').where({ id: paymentId, company_id: companyId }).update({
        supplier_id: input.supplierId,
        supplier_name: input.supplierName || newSupRecord?.name || oldPayment.supplier_name,
        amount: totalAmount.toFixed(2),
        payment_method: input.paymentMethod || oldPayment.payment_method,
        bank_account: input.bankAccount !== undefined ? input.bankAccount : oldPayment.bank_account,
        vendor_bank_account: input.vendorBankAccount !== undefined ? input.vendorBankAccount : oldPayment.vendor_bank_account,
        reference_number: input.referenceNumber !== undefined ? input.referenceNumber : oldPayment.reference_number,
        payment_date: input.paymentDate || oldPayment.payment_date,
        notes: input.notes !== undefined ? input.notes : oldPayment.notes,
        unallocated_amount: unallocated.toFixed(2),
        updated_at: now,
      });

      const updated = await trx('supplier_payments').where({ id: paymentId, company_id: companyId }).first();
      updated.allocations = newAllocationRecords;
      return updated;
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
