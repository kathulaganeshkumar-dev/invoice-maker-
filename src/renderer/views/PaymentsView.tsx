// src/renderer/views/PaymentsView.tsx - Customer Receipts (AR) & Supplier Payments (AP)
import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import {
  CustomerPayment,
  SupplierPayment,
  Customer,
  Supplier,
  Invoice,
  PurchaseInvoice,
} from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  CreditCard,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  X,
  Trash2,
  Wand2,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const PaymentsView: React.FC<Props> = ({ companyId }) => {
  const [activeTab, setActiveTab] = useState<'customer' | 'supplier'>('customer');
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form State
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('0.00');
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
  const [unpaidBills, setUnpaidBills] = useState<PurchaseInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (companyId) {
      loadPayments();
      loadMaster();
    }
  }, [companyId, activeTab]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      if (activeTab === 'customer') {
        const cp = await api.getCustomerPayments(companyId);
        setCustomerPayments(cp);
      } else {
        const sp = await api.getSupplierPayments(companyId);
        setSupplierPayments(sp);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMaster = async () => {
    try {
      const [cList, sList] = await Promise.all([
        api.getCustomers(companyId),
        api.getSuppliers(companyId),
      ]);
      setCustomers(cList);
      setSuppliers(sList);
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setSelectedPartyId('');
    setPaymentAmount('0.00');
    setPaymentMethod('BANK_TRANSFER');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setReferenceNumber('');
    setNotes('');
    setUnpaidInvoices([]);
    setUnpaidBills([]);
    setAllocations({});
  };

  const handleTabSwitch = (tab: 'customer' | 'supplier') => {
    setActiveTab(tab);
    setSearchQuery('');
    resetForm();
  };

  const handlePartyChange = async (partyId: string) => {
    setSelectedPartyId(partyId);
    setAllocations({});
    setUnpaidInvoices([]);
    setUnpaidBills([]);

    if (!partyId) return;

    try {
      if (activeTab === 'customer') {
        const invs = await api.getInvoices(companyId, { customer_id: partyId, status: 'FINALIZED' } as any);
        const pending = invs.filter((i) => new Decimal(i.balance_amount || 0).gt(0));
        setUnpaidInvoices(pending);
      } else {
        const bills = await api.getPurchaseInvoices(companyId);
        const pendingBills = bills.filter(
          (b) => b.supplier_id === partyId && b.is_finalized && new Decimal(b.balance_amount || 0).gt(0)
        );
        setUnpaidBills(pendingBills);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutoAllocate = () => {
    let remaining = new Decimal(paymentAmount || 0);
    if (remaining.lte(0)) {
      alert('Enter a Payment Amount greater than zero first to auto-allocate.');
      return;
    }

    const targetDocs = activeTab === 'customer' ? unpaidInvoices : unpaidBills;
    const nextAlloc: Record<string, string> = {};

    for (const doc of targetDocs) {
      if (remaining.lte(0)) break;
      const bal = new Decimal(doc.balance_amount || 0);
      if (bal.lte(0)) continue;
      const alloc = Decimal.min(remaining, bal);
      nextAlloc[doc.id] = alloc.toFixed(2);
      remaining = remaining.sub(alloc);
    }

    setAllocations(nextAlloc);
  };

  const handleFillSingleDoc = (docId: string, balanceAmount: string) => {
    const nextAlloc = { ...allocations, [docId]: new Decimal(balanceAmount || 0).toFixed(2) };
    setAllocations(nextAlloc);

    let sum = new Decimal(0);
    for (const val of Object.values(nextAlloc)) {
      if (val && new Decimal(val || 0).gt(0)) {
        sum = sum.add(new Decimal(val));
      }
    }
    if (sum.gt(new Decimal(paymentAmount || 0))) {
      setPaymentAmount(sum.toFixed(2));
    }
  };

  const handleRecordPayment = async () => {
    let enteredAmt: Decimal;
    try {
      enteredAmt = new Decimal(paymentAmount || 0);
    } catch {
      alert('Invalid payment amount');
      return;
    }
    if (enteredAmt.lte(0)) {
      alert('Payment amount must be greater than zero');
      return;
    }

    let allocTotal = new Decimal(0);
    for (const val of Object.values(allocations)) {
      if (val && new Decimal(val || 0).gt(0)) {
        allocTotal = allocTotal.add(new Decimal(val));
      }
    }
    if (allocTotal.gt(enteredAmt)) {
      alert(`Total allocated amount (₹${allocTotal.toFixed(2)}) cannot exceed Payment Amount (₹${enteredAmt.toFixed(2)}).`);
      return;
    }

    setSaving(true);
    try {
      if (activeTab === 'customer') {
        const cust = customers.find((c) => c.id === selectedPartyId);
        if (!cust) {
          alert('Please select a customer');
          setSaving(false);
          return;
        }

        const allocationList = Object.entries(allocations)
          .filter(([_, amt]) => amt && new Decimal(amt || 0).gt(0))
          .map(([invoiceId, amount]) => ({ invoiceId, amount }));

        await api.recordCustomerPayment(companyId, {
          customerId: cust.id,
          customerName: cust.name,
          amount: enteredAmt.toFixed(2),
          paymentMethod,
          paymentDate,
          referenceNumber,
          notes,
          allocations: allocationList,
        });
      } else {
        const sup = suppliers.find((s) => s.id === selectedPartyId);
        if (!sup) {
          alert('Please select a supplier');
          setSaving(false);
          return;
        }

        const billAllocations = Object.entries(allocations)
          .filter(([_, amt]) => amt && new Decimal(amt || 0).gt(0))
          .map(([purchaseInvoiceId, amount]) => ({ purchaseInvoiceId, amount }));

        await api.recordSupplierPayment(companyId, {
          supplierId: sup.id,
          supplierName: sup.name,
          amount: enteredAmt.toFixed(2),
          paymentMethod,
          paymentDate,
          referenceNumber,
          notes,
          allocations: billAllocations,
        });
      }

      setIsModalOpen(false);
      resetForm();
      await Promise.all([loadPayments(), loadMaster()]);
    } catch (err: any) {
      alert(err.message || 'Error recording payment voucher');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    const msg =
      activeTab === 'customer'
        ? 'Delete this customer payment receipt? Any allocated invoice balances will be restored.'
        : 'Delete this supplier payment voucher? Any settled purchase bill balances and supplier payable balance will be restored.';
    if (!window.confirm(msg)) return;
    try {
      if (activeTab === 'customer') {
        await api.deleteCustomerPayment(companyId, paymentId);
      } else {
        await api.deleteSupplierPayment(companyId, paymentId);
      }
      await Promise.all([loadPayments(), loadMaster()]);
      alert('Payment voucher deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting payment');
    }
  };

  // Totals for KPI strip computed strictly via Decimal
  const totalCustomerInflow = customerPayments
    .reduce((acc, p) => acc.add(new Decimal(p.amount || 0)), new Decimal(0))
    .toFixed(2);
  const totalReceivable = customers
    .reduce((acc, c) => acc.add(new Decimal(c.current_balance || 0)), new Decimal(0))
    .toFixed(2);

  const totalSupplierOutflow = supplierPayments
    .reduce((acc, p) => acc.add(new Decimal(p.amount || 0)), new Decimal(0))
    .toFixed(2);
  const totalPayable = suppliers
    .reduce((acc, s) => acc.add(new Decimal(s.current_balance || 0)), new Decimal(0))
    .toFixed(2);

  const q = searchQuery.toLowerCase();
  const filteredCustomerPayments = customerPayments.filter(
    (p) =>
      !q ||
      p.payment_number.toLowerCase().includes(q) ||
      p.customer_name.toLowerCase().includes(q) ||
      (p.reference_number && p.reference_number.toLowerCase().includes(q))
  );
  const filteredSupplierPayments = supplierPayments.filter(
    (p) =>
      !q ||
      p.payment_number.toLowerCase().includes(q) ||
      p.supplier_name.toLowerCase().includes(q) ||
      (p.reference_number && p.reference_number.toLowerCase().includes(q))
  );

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-brand-600" />
            <span>Payments & Settlements (AR / AP)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeTab === 'customer'
              ? 'Record incoming collections received from customers and allocate to sales invoices'
              : 'Record outgoing payments paid to suppliers/vendors and settle purchase bills'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setReferenceNumber(`TXN-${Date.now().toString().slice(-6)}`);
            setIsModalOpen(true);
          }}
          className={`inline-flex items-center space-x-1.5 px-4 py-2 text-white rounded-lg text-xs font-bold shadow-sm transition-all ${
            activeTab === 'customer'
              ? 'bg-brand-600 hover:bg-brand-700'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>{activeTab === 'customer' ? 'Record Customer Receipt' : 'Pay Supplier (Record Vendor Payment)'}</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => handleTabSwitch('customer')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'customer'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <ArrowDownLeft className={`w-4 h-4 ${activeTab === 'customer' ? 'text-emerald-300' : 'text-emerald-600'}`} />
            <span>Customer Receipts (Money In / AR)</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('supplier')}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'supplier'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <ArrowUpRight className={`w-4 h-4 ${activeTab === 'supplier' ? 'text-rose-200' : 'text-rose-600'}`} />
            <span>Supplier Payments (Money Out / AP)</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
          <input
            type="text"
            placeholder="Search voucher #, party, UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* KPI Strip tailored to active ledger direction */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        {activeTab === 'customer' ? (
          <>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Total Collected from Customers (Money In)</div>
              <div className="text-lg font-extrabold text-emerald-600 mt-1">{formatIndianCurrency(totalCustomerInflow)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Total Customer Receivables Pending</div>
              <div className="text-lg font-extrabold text-amber-600 mt-1">{formatIndianCurrency(totalReceivable)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Receipt Vouchers Recorded</div>
              <div className="text-lg font-extrabold text-slate-800 dark:text-white mt-1">{customerPayments.length} Receipts</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Total Paid to Suppliers (Money Out)</div>
              <div className="text-lg font-extrabold text-rose-600 mt-1">{formatIndianCurrency(totalSupplierOutflow)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Total Owed to Suppliers (Payables Balance)</div>
              <div className="text-lg font-extrabold text-amber-600 mt-1">{formatIndianCurrency(totalPayable)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-sm">
              <div className="text-slate-500 font-semibold">Vendor Payment Vouchers Issued</div>
              <div className="text-lg font-extrabold text-slate-800 dark:text-white mt-1">{supplierPayments.length} Payments</div>
            </div>
          </>
        )}
      </div>

      {/* Purpose-Built Ledger Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        {activeTab === 'customer' ? (
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-medium text-xs">
              <tr>
                <th className="py-2.5 px-4">Receipt #</th>
                <th className="py-2.5 px-4">Receipt date</th>
                <th className="py-2.5 px-4">Received from</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4">UTR / Ref #</th>
                <th className="py-2.5 px-4 text-right">Amount received</th>
                <th className="py-2.5 px-4 text-right">Invoices settled</th>
                <th className="py-2.5 px-4 text-center w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomerPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No customer receipts recorded yet. Click "+ Record Customer Receipt" to post collections.
                  </td>
                </tr>
              ) : (
                filteredCustomerPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {p.payment_number}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.payment_date}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{p.customer_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {p.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.reference_number || '-'}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">
                      + {formatIndianCurrency(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {p.allocations && p.allocations.length > 0 ? (
                        <span title={p.allocations.map((a) => `${a.document_number}: ₹${a.allocated_amount}`).join(', ')}>
                          {p.allocations.length} Invoice{p.allocations.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-amber-600">On-Account Advance</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete Customer Receipt"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50/80 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-medium text-xs">
              <tr>
                <th className="py-2.5 px-4">Voucher #</th>
                <th className="py-2.5 px-4">Payment date</th>
                <th className="py-2.5 px-4">Paid to</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4">UTR / Ref #</th>
                <th className="py-2.5 px-4 text-right">Amount paid</th>
                <th className="py-2.5 px-4 text-right">Bills settled</th>
                <th className="py-2.5 px-4 text-center w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSupplierPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No vendor payments recorded yet. Click "+ Pay Supplier (Record Vendor Payment)" when you pay a supplier.
                  </td>
                </tr>
              ) : (
                filteredSupplierPayments.map((p) => {
                  const hasAllocs = p.allocations && p.allocations.length > 0;
                  const unalloc = new Decimal(p.unallocated_amount || 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {p.payment_number}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.payment_date}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.supplier_name}</div>
                        {p.notes && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{p.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.reference_number || '-'}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                        - {formatIndianCurrency(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {hasAllocs ? (
                          <div className="inline-flex flex-col items-end">
                            <span
                              className="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded font-bold text-[10px]"
                              title={p.allocations!.map((a) => `${a.document_number}: ₹${a.allocated_amount}`).join(', ')}
                            >
                              Settled {p.allocations!.length} Bill{p.allocations!.length > 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {p.allocations!.map((a) => a.document_number).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded font-bold text-[10px]">
                            Vendor Advance ({formatIndianCurrency(unalloc.toFixed(2))})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Supplier Payment Voucher"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                {activeTab === 'customer' ? (
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {activeTab === 'customer'
                    ? 'Record Customer Receipt (Money Received)'
                    : 'Record Vendor Payment (Paid to Supplier)'}
                </span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {activeTab === 'supplier' && (
                <div className="p-3 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-lg text-rose-900 dark:text-rose-200 text-[11px]">
                  <strong>Outgoing Payment to Vendor (Accounts Payable):</strong> You are paying this supplier for purchases or vendor advance. Their payable balance will be reduced accordingly.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {activeTab === 'customer' ? 'Received From Customer *' : 'Paid To Supplier *'}
                  </label>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => handlePartyChange(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="">
                      {activeTab === 'customer' ? '-- Select Customer --' : '-- Select Supplier --'}
                    </option>
                    {activeTab === 'customer'
                      ? customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Receivable: ₹{c.current_balance})
                          </option>
                        ))
                      : suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (Payable: ₹{s.current_balance})
                          </option>
                        ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {activeTab === 'customer' ? 'Amount Received (₹) *' : 'Amount Paid to Supplier (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS / IMPS)</option>
                    <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reference / UTR / Cheque #
                  </label>
                  <input
                    type="text"
                    placeholder="Transaction Reference"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder={
                      activeTab === 'customer'
                        ? 'e.g. Received against monthly bill'
                        : 'e.g. Settled vendor invoice via NEFT'
                    }
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              {/* Outstanding Sales Invoices Allocation (Customer Tab) */}
              {activeTab === 'customer' && unpaidInvoices.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Allocate Receipt to Outstanding Sales Invoices:
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoAllocate}
                      className="inline-flex items-center space-x-1 text-brand-600 font-bold hover:underline"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>Auto-Allocate</span>
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {unpaidInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700"
                      >
                        <div>
                          <span className="font-mono font-bold">{inv.invoice_number}</span>
                          <span className="text-slate-400 ml-2">({inv.invoice_date})</span>
                          <span className="text-slate-600 dark:text-slate-300 ml-2 font-semibold">
                            Due: {formatIndianCurrency(inv.balance_amount)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleFillSingleDoc(inv.id, inv.balance_amount)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-semibold"
                          >
                            Full
                          </button>
                          <span>₹</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            max={inv.balance_amount}
                            value={allocations[inv.id] || ''}
                            onChange={(e) => setAllocations({ ...allocations, [inv.id]: e.target.value })}
                            className="w-24 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-right font-mono"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Outstanding Purchase Bills Allocation (Supplier Tab) */}
              {activeTab === 'supplier' && selectedPartyId && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Settle Unpaid Purchase Bills ({unpaidBills.length} Pending):
                    </span>
                    {unpaidBills.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoAllocate}
                        className="inline-flex items-center space-x-1 text-rose-600 font-bold hover:underline"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Auto-Allocate</span>
                      </button>
                    )}
                  </div>
                  {unpaidBills.length === 0 ? (
                    <div className="text-[11px] text-slate-500 py-2">
                      No unpaid finalized purchase bills found for this supplier. This payment will be recorded as a Vendor Advance / On-Account payment.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {unpaidBills.map((bill) => (
                        <div
                          key={bill.id}
                          className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700"
                        >
                          <div>
                            <span className="font-mono font-bold">{bill.bill_number}</span>
                            <span className="text-slate-400 ml-2">({bill.bill_date})</span>
                            <span className="text-rose-600 ml-2 font-semibold">
                              Owed: {formatIndianCurrency(bill.balance_amount)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleFillSingleDoc(bill.id, bill.balance_amount)}
                              className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-semibold border border-rose-200"
                            >
                              Pay Full
                            </button>
                            <span>₹</span>
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              max={bill.balance_amount}
                              value={allocations[bill.id] || ''}
                              onChange={(e) => setAllocations({ ...allocations, [bill.id]: e.target.value })}
                              className="w-24 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-right font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleRecordPayment}
                className={`px-4 py-1.5 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50 ${
                  activeTab === 'customer'
                    ? 'bg-brand-600 hover:bg-brand-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {saving
                  ? 'Saving...'
                  : activeTab === 'customer'
                  ? 'Save Customer Receipt'
                  : 'Save Vendor Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
