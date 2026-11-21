// src/renderer/views/PaymentsView.tsx - Customer Receipts (AR) & Supplier Payments (AP)
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { ModalPortal } from '../components/ModalPortal';
import {
  CustomerPayment,
  SupplierPayment,
  Customer,
  Supplier,
  Invoice,
  PurchaseInvoice,
  Company,
  Branch,
} from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { SearchableSelect } from '../components/SearchableSelect';
import { DateInput, isoToDisplayDate } from '../components/DateInput';
import {
  CreditCard,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  X,
  Trash2,
  Wand2,
  Landmark,
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
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allCompanyInvoices, setAllCompanyInvoices] = useState<Invoice[]>([]);
  const [allUnpaidInvoices, setAllUnpaidInvoices] = useState<Invoice[]>([]);
  const [allCompanyBills, setAllCompanyBills] = useState<PurchaseInvoice[]>([]);
  const [allUnpaidBills, setAllUnpaidBills] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showMoreInvoices, setShowMoreInvoices] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [editingPayment, setEditingPayment] = useState<CustomerPayment | SupplierPayment | null>(null);

  // Form State
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [selectedVendorBankAccount, setSelectedVendorBankAccount] = useState<string>('');
  const [cashNote, setCashNote] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
  const [unpaidBills, setUnpaidBills] = useState<PurchaseInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Build Company Bank Options from the company & branch bank accounts entered during creation
  const companyBankOptions = useMemo(() => {
    const opts: { value: string; label: string; sublabel?: string; code?: string }[] = [];
    const seen = new Set<string>();

    const addBank = (
      bankName?: string,
      accNo?: string,
      ifsc?: string,
      bankBranch?: string,
      tag?: string
    ) => {
      const name = bankName?.trim();
      if (!name) return;
      const acct = accNo?.trim() || '';
      const key = `${name.toLowerCase()}|${acct.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const valueLabel = acct ? `${name} (A/C ${acct})` : name;
      const subParts: string[] = [];
      if (acct) subParts.push(`A/C: ${acct}`);
      if (bankBranch?.trim()) subParts.push(bankBranch.trim());
      if (tag) subParts.push(tag);

      opts.push({
        value: valueLabel,
        label: name,
        sublabel: subParts.join(' • ') || undefined,
        code: ifsc?.trim() || undefined,
      });
    };

    if (companyInfo) {
      addBank(
        companyInfo.bank_name,
        companyInfo.bank_account_no,
        companyInfo.bank_ifsc,
        companyInfo.bank_branch,
        'Main Company Bank'
      );
    }

    for (const br of branches) {
      if (br.use_company_bank === false && br.bank_name) {
        addBank(
          br.bank_name,
          br.bank_account_no,
          br.bank_ifsc,
          br.bank_branch,
          `Branch: ${br.name}`
        );
      }
    }

    return opts;
  }, [companyInfo, branches]);

  const invoiceDropdownOptions = useMemo(() => {
    const source = selectedPartyId
      ? allUnpaidInvoices.filter((inv) => inv.customer_id === selectedPartyId)
      : allUnpaidInvoices;
    return [
      { value: '', label: '-- Select Invoice Number (Optional) --' },
      ...source.map((inv) => ({
        value: inv.id,
        label: inv.invoice_number,
        sublabel: `${inv.customer_name} • Due: ${formatIndianCurrency(inv.balance_amount)}`,
        badge: `Total ${formatIndianCurrency(inv.grand_total)}`,
      })),
    ];
  }, [allUnpaidInvoices, selectedPartyId]);

  const billDropdownOptions = useMemo(() => {
    const source = selectedPartyId
      ? allUnpaidBills.filter((b) => b.supplier_id === selectedPartyId)
      : allUnpaidBills;
    return [
      { value: '', label: '-- Select Purchase Bill # (Optional) --' },
      ...source.map((b) => ({
        value: b.id,
        label: b.bill_number,
        sublabel: `${b.supplier_name} • Owed: ${formatIndianCurrency(b.balance_amount)}`,
        badge: `Total ${formatIndianCurrency(b.grand_total)}`,
      })),
    ];
  }, [allUnpaidBills, selectedPartyId]);

  const buildVendorBanks = (vendor?: Supplier) => {
    if (!vendor) return [];
    const list: { value: string; label: string; sublabel?: string; code?: string }[] = [];
    const seen = new Set<string>();

    const addBank = (
      bankName?: string,
      accNo?: string,
      ifsc?: string,
      bankBranch?: string,
      tag?: string
    ) => {
      const name = bankName?.trim() || '';
      const acct = accNo?.trim() || '';
      if (!name && !acct) return;
      const key = `${name.toLowerCase()}|${acct.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const displayName = name || 'Bank Account';
      const valueLabel = acct ? `${displayName} (A/C ${acct})` : displayName;
      const subParts: string[] = [];
      if (acct) subParts.push(`A/C: ${acct}`);
      if (bankBranch?.trim()) subParts.push(bankBranch.trim());
      if (tag) subParts.push(tag);

      list.push({
        value: valueLabel,
        label: displayName,
        sublabel: subParts.join(' • ') || undefined,
        code: ifsc?.trim() || undefined,
      });
    };

    addBank(vendor.bank_name, vendor.bank_account_no, vendor.bank_ifsc, vendor.bank_branch, 'Primary Bank');
    if (Array.isArray(vendor.additional_bank_accounts)) {
      vendor.additional_bank_accounts.forEach((b, i) => {
        addBank(b.bank_name, b.bank_account_no, b.bank_ifsc, b.bank_branch, `Bank #${i + 2}`);
      });
    }
    return list;
  };

  const vendorBankOptions = useMemo(() => {
    if (activeTab !== 'supplier' || !selectedPartyId) return [];
    const vendor = suppliers.find((s) => s.id === selectedPartyId);
    const banks = buildVendorBanks(vendor);
    if (banks.length === 0) return [];
    return [{ value: '', label: '-- Select Vendor Bank Account --' }, ...banks];
  }, [activeTab, selectedPartyId, suppliers]);

  const partyOptions = useMemo(() => {
    if (activeTab === 'customer') {
      return [
        { value: '', label: '-- Select Customer --' },
        ...customers.map((c) => ({
          value: c.id,
          label: c.name,
          sublabel: `Receivable: ₹${c.current_balance}`,
          code: c.gstin || undefined,
        })),
      ];
    } else {
      return [
        { value: '', label: '-- Select Supplier --' },
        ...suppliers.map((s) => ({
          value: s.id,
          label: s.name,
          sublabel: `Payable: ₹${s.current_balance}`,
          code: s.gstin || undefined,
        })),
      ];
    }
  }, [activeTab, customers, suppliers]);

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
      const [cList, sList, comp, brList, invList, billList] = await Promise.all([
        api.getCustomers(companyId),
        api.getSuppliers(companyId),
        api.getCompany(companyId).catch(() => null),
        api.getBranches(companyId).catch(() => []),
        api.getInvoices(companyId).catch(() => []),
        api.getPurchaseInvoices(companyId).catch(() => []),
      ]);
      const nonCancelledInvs = invList.filter((i) => i.status !== 'CANCELLED');
      setCustomers(cList);
      setSuppliers(sList);
      setCompanyInfo(comp);
      setBranches(brList);
      setAllCompanyInvoices(nonCancelledInvs);
      setAllUnpaidInvoices(
        nonCancelledInvs.filter((i) => i.status === 'FINALIZED' && new Decimal(i.balance_amount || 0).gt(0))
      );
      setAllCompanyBills(billList);
      setAllUnpaidBills(billList.filter((b) => b.is_finalized && new Decimal(b.balance_amount || 0).gt(0)));
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setEditingPayment(null);
    setSelectedPartyId('');
    setSelectedInvoiceId('');
    setShowMoreInvoices(false);
    setPaymentType('FULL');
    setPaymentAmount('');
    setPaymentMethod('BANK_TRANSFER');
    setSelectedBankAccount(companyBankOptions[0]?.value || '');
    setSelectedVendorBankAccount('');
    setCashNote('');
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
    setSelectedInvoiceId('');
    setSelectedVendorBankAccount('');
    setShowMoreInvoices(false);
    setAllocations({});
    setUnpaidInvoices([]);
    setUnpaidBills([]);

    if (!partyId) return;

    if (activeTab === 'customer') {
      let sourceInvs = allCompanyInvoices;
      try {
        const fresh = await api.getInvoices(companyId);
        sourceInvs = fresh.filter((i) => i.status !== 'CANCELLED');
        setAllCompanyInvoices(sourceInvs);
        setAllUnpaidInvoices(
          sourceInvs.filter((i) => i.status === 'FINALIZED' && new Decimal(i.balance_amount || 0).gt(0))
        );
      } catch {
        // fallback to cached list
      }
      const pending = sourceInvs.filter(
        (i) => i.customer_id === partyId && i.status === 'FINALIZED' && new Decimal(i.balance_amount || 0).gt(0)
      );
      setUnpaidInvoices(pending);
      if (pending.length === 1) {
        const only = pending[0];
        setSelectedInvoiceId(only.id);
        if (paymentType === 'FULL') {
          const bal = new Decimal(only.balance_amount || 0).toFixed(2);
          setPaymentAmount(bal);
          setAllocations({ [only.id]: bal });
        }
      }
    } else {
      let sourceBills = allCompanyBills;
      try {
        sourceBills = await api.getPurchaseInvoices(companyId);
        setAllCompanyBills(sourceBills);
        setAllUnpaidBills(sourceBills.filter((b) => b.is_finalized && new Decimal(b.balance_amount || 0).gt(0)));
      } catch {
        // fallback to cached list
      }
      const pendingBills = sourceBills.filter(
        (b) => b.supplier_id === partyId && b.is_finalized && new Decimal(b.balance_amount || 0).gt(0)
      );
      setUnpaidBills(pendingBills);
      const chosenSup = suppliers.find((s) => s.id === partyId);
      const supBanks = buildVendorBanks(chosenSup);
      // Auto-select only when there is 1 bank; if vendor has 2+ banks leave blank for manual selection
      setSelectedVendorBankAccount(supBanks.length === 1 ? supBanks[0].value : '');
      if (pendingBills.length === 1) {
        const only = pendingBills[0];
        setSelectedInvoiceId(only.id);
        if (paymentType === 'FULL') {
          const bal = new Decimal(only.balance_amount || 0).toFixed(2);
          setPaymentAmount(bal);
          setAllocations({ [only.id]: bal });
        }
      }
    }
  };

  const handleInvoiceOrBillSelect = (docId: string) => {
    setSelectedInvoiceId(docId);
    if (!docId) {
      setAllocations({});
      return;
    }

    if (activeTab === 'customer') {
      const inv = allUnpaidInvoices.find((i) => i.id === docId);
      if (!inv) return;
      if (selectedPartyId !== inv.customer_id) {
        setSelectedPartyId(inv.customer_id);
        setUnpaidInvoices(allUnpaidInvoices.filter((i) => i.customer_id === inv.customer_id));
      }
      const bal = new Decimal(inv.balance_amount || 0).toFixed(2);
      if (paymentType === 'FULL') {
        setPaymentAmount(bal);
        setAllocations({ [inv.id]: bal });
      } else {
        const currentAmt = paymentAmount && Number(paymentAmount) > 0 ? paymentAmount : '';
        setAllocations(currentAmt ? { [inv.id]: currentAmt } : {});
      }
    } else {
      const bill = allUnpaidBills.find((b) => b.id === docId);
      if (!bill) return;
      if (selectedPartyId !== bill.supplier_id) {
        setSelectedPartyId(bill.supplier_id);
        setUnpaidBills(allUnpaidBills.filter((b) => b.supplier_id === bill.supplier_id));
        const chosenSup = suppliers.find((s) => s.id === bill.supplier_id);
        const supBanks = buildVendorBanks(chosenSup);
        setSelectedVendorBankAccount(supBanks.length === 1 ? supBanks[0].value : '');
      }
      const bal = new Decimal(bill.balance_amount || 0).toFixed(2);
      if (paymentType === 'FULL') {
        setPaymentAmount(bal);
        setAllocations({ [bill.id]: bal });
      } else {
        const currentAmt = paymentAmount && Number(paymentAmount) > 0 ? paymentAmount : '';
        setAllocations(currentAmt ? { [bill.id]: currentAmt } : {});
      }
    }
  };

  const handlePaymentTypeChange = (nextType: 'FULL' | 'PARTIAL') => {
    setPaymentType(nextType);
    const docs = activeTab === 'customer' ? unpaidInvoices : unpaidBills;
    if (nextType === 'FULL') {
      if (selectedInvoiceId) {
        const doc = docs.find((d) => d.id === selectedInvoiceId);
        if (doc) {
          const bal = new Decimal(doc.balance_amount || 0).toFixed(2);
          setPaymentAmount(bal);
          setAllocations({ [doc.id]: bal });
          return;
        }
      }
      if (docs.length > 0) {
        let total = new Decimal(0);
        const nextAlloc: Record<string, string> = {};
        for (const d of docs) {
          const bal = new Decimal(d.balance_amount || 0);
          if (bal.gt(0)) {
            nextAlloc[d.id] = bal.toFixed(2);
            total = total.add(bal);
          }
        }
        setPaymentAmount(total.gt(0) ? total.toFixed(2) : '');
        setAllocations(nextAlloc);
      }
    } else {
      // Partial payment: let user enter custom partial amount cleanly
      setPaymentAmount('');
      setAllocations({});
    }
  };

  const handlePaymentAmountChange = (val: string) => {
    setPaymentAmount(val);
    // If a single invoice/bill is explicitly selected and no multi-invoice split exists, keep its allocation synced
    if (selectedInvoiceId) {
      const otherAllocs = Object.entries(allocations).filter(
        ([id, amt]) => id !== selectedInvoiceId && amt && Number(amt) > 0
      );
      if (otherAllocs.length === 0) {
        const docs = activeTab === 'customer' ? allUnpaidInvoices : allUnpaidBills;
        const doc = docs.find((d) => d.id === selectedInvoiceId);
        if (doc && val && Number(val) > 0) {
          try {
            const entered = new Decimal(val);
            const bal = new Decimal(doc.balance_amount || 0);
            setAllocations({ [selectedInvoiceId]: Decimal.min(entered, bal).toFixed(2) });
          } catch {
            // ignore while typing
          }
        } else {
          setAllocations({});
        }
      }
    }
  };

  const handleAllocationInputChange = (docId: string, val: string) => {
    const nextAlloc = { ...allocations, [docId]: val };
    setAllocations(nextAlloc);
    let sum = new Decimal(0);
    for (const v of Object.values(nextAlloc)) {
      if (v && Number(v) > 0) {
        try {
          sum = sum.add(new Decimal(v));
        } catch {
          // ignore
        }
      }
    }
    if (sum.gt(0)) {
      setPaymentAmount(sum.toFixed(2));
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

  const handleOpenEditPayment = async (p: CustomerPayment | SupplierPayment) => {
    setEditingPayment(p);
    setSelectedInvoiceId('');
    setShowMoreInvoices(false);

    const isCust = activeTab === 'customer';
    const partyId = isCust ? (p as CustomerPayment).customer_id : (p as SupplierPayment).supplier_id;
    setSelectedPartyId(partyId);

    setPaymentAmount(p.amount);
    setPaymentDate(p.payment_date || new Date().toISOString().split('T')[0]);
    setPaymentMethod(p.payment_method || 'BANK_TRANSFER');

    if (p.payment_method === 'CASH') {
      if (p.bank_account && p.bank_account.startsWith('Cash: ')) {
        setCashNote(p.bank_account.replace('Cash: ', ''));
      } else {
        setCashNote(p.bank_account || '');
      }
      setSelectedBankAccount('');
    } else {
      setSelectedBankAccount(p.bank_account || companyBankOptions[0]?.value || '');
      setCashNote('');
    }

    if (!isCust) {
      setSelectedVendorBankAccount((p as SupplierPayment).vendor_bank_account || '');
    }

    setReferenceNumber(p.reference_number || '');
    setNotes(p.notes || '');

    // Map existing allocations
    const initialAlloc: Record<string, string> = {};
    const allocDocIds = new Set<string>();
    if (p.allocations && p.allocations.length > 0) {
      for (const a of p.allocations) {
        initialAlloc[a.document_id] = new Decimal(a.allocated_amount || 0).toFixed(2);
        allocDocIds.add(a.document_id);
      }
      if (p.allocations.length === 1) {
        setSelectedInvoiceId(p.allocations[0].document_id);
      } else {
        setShowMoreInvoices(true);
      }
    }
    setAllocations(initialAlloc);

    if (isCust) {
      let sourceInvs = allCompanyInvoices;
      try {
        const fresh = await api.getInvoices(companyId);
        sourceInvs = fresh.filter((i) => i.status !== 'CANCELLED');
        setAllCompanyInvoices(sourceInvs);
        setAllUnpaidInvoices(
          sourceInvs.filter((i) => i.status === 'FINALIZED' && new Decimal(i.balance_amount || 0).gt(0))
        );
      } catch {}
      const relevantInvs = sourceInvs.filter(
        (i) => i.customer_id === partyId && i.status === 'FINALIZED' && (new Decimal(i.balance_amount || 0).gt(0) || allocDocIds.has(i.id))
      );
      const adjustedInvs = relevantInvs.map((inv) => {
        const alreadyAlloc = initialAlloc[inv.id] ? new Decimal(initialAlloc[inv.id]) : new Decimal(0);
        return {
          ...inv,
          balance_amount: new Decimal(inv.balance_amount || 0).add(alreadyAlloc).toFixed(2),
        };
      });
      setUnpaidInvoices(adjustedInvs);
    } else {
      let sourceBills = allCompanyBills;
      try {
        sourceBills = await api.getPurchaseInvoices(companyId);
        setAllCompanyBills(sourceBills);
        setAllUnpaidBills(sourceBills.filter((b) => b.is_finalized && new Decimal(b.balance_amount || 0).gt(0)));
      } catch {}
      const relevantBills = sourceBills.filter(
        (b) => b.supplier_id === partyId && b.is_finalized && (new Decimal(b.balance_amount || 0).gt(0) || allocDocIds.has(b.id))
      );
      const adjustedBills = relevantBills.map((bill) => {
        const alreadyAlloc = initialAlloc[bill.id] ? new Decimal(initialAlloc[bill.id]) : new Decimal(0);
        return {
          ...bill,
          balance_amount: new Decimal(bill.balance_amount || 0).add(alreadyAlloc).toFixed(2),
        };
      });
      setUnpaidBills(adjustedBills);
    }

    setIsModalOpen(true);
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

        const payload = {
          customerId: cust.id,
          customerName: cust.name,
          amount: enteredAmt.toFixed(2),
          paymentMethod,
          bankAccount:
            paymentMethod === 'CASH'
              ? (cashNote.trim() ? `Cash: ${cashNote.trim()}` : undefined)
              : (selectedBankAccount || undefined),
          paymentDate,
          referenceNumber,
          notes,
          allocations: allocationList,
        };

        if (editingPayment) {
          await api.updateCustomerPayment(companyId, editingPayment.id, payload);
        } else {
          await api.recordCustomerPayment(companyId, payload);
        }
      } else {
        const sup = suppliers.find((s) => s.id === selectedPartyId);
        if (!sup) {
          alert('Please select a supplier');
          setSaving(false);
          return;
        }

        const billAllocations = Object.entries(allocations)
          .filter(([_, amt]) => amt && new Decimal(amt || 0).gt(0))
          .map(([billId, amount]) => ({ billId, amount }));

        const payload = {
          supplierId: sup.id,
          supplierName: sup.name,
          amount: enteredAmt.toFixed(2),
          paymentMethod,
          bankAccount:
            paymentMethod === 'CASH'
              ? (cashNote.trim() ? `Cash: ${cashNote.trim()}` : undefined)
              : (selectedBankAccount || undefined),
          vendorBankAccount:
            paymentMethod === 'CASH' ? undefined : (selectedVendorBankAccount || undefined),
          paymentDate,
          referenceNumber,
          notes,
          allocations: billAllocations,
        };

        if (editingPayment) {
          await api.updateSupplierPayment(companyId, editingPayment.id, payload);
        } else {
          await api.recordSupplierPayment(companyId, payload);
        }
      }

      window.dispatchEvent(
        new CustomEvent('eim-data-changed', {
          detail: {
            type: 'payment',
            id: editingPayment ? editingPayment.id : undefined,
          },
        })
      );
      window.dispatchEvent(new CustomEvent('eim-data-sync'));

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
    <div className="p-6 space-y-5">
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
            loadMaster();
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
            <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Receipt Date</th>
                <th className="py-3 px-4">Received From (Customer)</th>
                <th className="py-3 px-4">Method &amp; Bank</th>
                <th className="py-3 px-4">UTR / Ref #</th>
                <th className="py-3 px-4 text-right">Amount Received</th>
                <th className="py-3 px-4 text-right">Invoices Settled</th>
                <th className="py-3 px-4 text-center w-16">Actions</th>
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
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPayment(p)}
                        className="font-mono font-bold text-left cursor-pointer"
                        title="Click to view & edit receipt details"
                      >
                        {p.payment_number}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {isoToDisplayDate(p.payment_date) || p.payment_date}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPayment(p)}
                        className="text-left cursor-pointer"
                        title="Click to view & edit receipt details"
                      >
                        {p.customer_name}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {p.payment_method}
                      </span>
                      {p.bank_account && (
                        <div className="text-[10px] text-brand-700 dark:text-brand-300 font-medium mt-0.5 flex items-center space-x-1">
                          <Landmark className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[180px]" title={p.bank_account}>{p.bank_account}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.reference_number || '-'}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600">
                      + {formatIndianCurrency(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {p.allocations && p.allocations.length > 0 ? (
                        <div className="inline-flex flex-col items-end">
                          <span title={p.allocations.map((a) => `${a.document_number}: ₹${a.allocated_amount}`).join(', ')}>
                            {p.allocations.length} Invoice{p.allocations.length > 1 ? 's' : ''}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.allocations.map((a) => a.document_number).join(', ')}
                          </span>
                        </div>
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
            <thead className="bg-rose-50/70 dark:bg-slate-900/50 border-b border-rose-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Payment Voucher #</th>
                <th className="py-3 px-4">Payment Date</th>
                <th className="py-3 px-4">Paid To (Supplier / Vendor)</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">UTR / Cheque / Ref #</th>
                <th className="py-3 px-4 text-right">Amount Paid (Outflow)</th>
                <th className="py-3 px-4 text-right">Purchase Bills Settled</th>
                <th className="py-3 px-4 text-center w-16">Actions</th>
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
                    <tr key={p.id}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        <button
                          type="button"
                          onClick={() => handleOpenEditPayment(p)}
                          className="font-mono font-bold text-left cursor-pointer"
                          title="Click to view & edit payment voucher details"
                        >
                          {p.payment_number}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {isoToDisplayDate(p.payment_date) || p.payment_date}
                    </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleOpenEditPayment(p)}
                          className="text-left font-semibold text-slate-900 dark:text-white cursor-pointer block"
                          title="Click to view & edit payment voucher details"
                        >
                          {p.supplier_name}
                        </button>
                        {p.notes && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{p.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {p.payment_method}
                        </span>
                        {p.bank_account && (
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 font-medium mt-0.5 flex items-center space-x-1">
                            <Landmark className="w-3 h-3 shrink-0 text-brand-600" />
                            <span className="truncate max-w-[190px]" title={`From: ${p.bank_account}`}>
                              From: {p.bank_account}
                            </span>
                          </div>
                        )}
                        {p.vendor_bank_account && (
                          <div className="text-[10px] text-rose-700 dark:text-rose-300 font-medium mt-0.5 flex items-center space-x-1">
                            <Landmark className="w-3 h-3 shrink-0 text-rose-600" />
                            <span className="truncate max-w-[190px]" title={`To Vendor: ${p.vendor_bank_account}`}>
                              To: {p.vendor_bank_account}
                            </span>
                          </div>
                        )}
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
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                {activeTab === 'customer' ? (
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {editingPayment
                    ? activeTab === 'customer'
                      ? `Edit Customer Receipt (${editingPayment.payment_number})`
                      : `Edit Vendor Payment Voucher (${editingPayment.payment_number})`
                    : activeTab === 'customer'
                    ? 'Record Customer Receipt (Money Received)'
                    : 'Record Vendor Payment (Paid to Supplier)'}
                </span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {activeTab === 'supplier' && (() => {
                const selectedVendor = suppliers.find((s) => s.id === selectedPartyId);
                if (!selectedVendor) {
                  return (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 text-[11px]">
                      Select a supplier below to view their full vendor details (name, address, PIN code, GSTIN, bank &amp; payable balance).
                    </div>
                  );
                }
                return (
                  <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 rounded-lg space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rose-200/70 dark:border-rose-900/50 pb-2">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center flex-wrap gap-2">
                          <span>{selectedVendor.name}</span>
                          {selectedVendor.company_name &&
                            selectedVendor.company_name.trim().toLowerCase() !== selectedVendor.name.trim().toLowerCase() && (
                              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                ({selectedVendor.company_name})
                              </span>
                            )}
                        </div>
                        {selectedVendor.contact_person && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Contact Person: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedVendor.contact_person}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Payable Balance</div>
                        <div className="text-xs font-extrabold text-rose-700 dark:text-rose-400">
                          {formatIndianCurrency(selectedVendor.current_balance || '0.00')}
                        </div>
                        {(() => {
                          const vendorPending = allUnpaidBills.filter((b) => b.supplier_id === selectedVendor.id);
                          const terms = selectedVendor.payment_terms_days || 0;
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const countdowns = vendorPending
                            .map((b) => {
                              const bPart = (b.bill_date || '').split('T')[0];
                              const dPart = (b.due_date || '').split('T')[0];
                              let dueDt: Date | null = null;
                              if (dPart && (!bPart || dPart > bPart)) {
                                const [y, m, d] = dPart.split('-').map(Number);
                                if (y && m && d) dueDt = new Date(y, m - 1, d);
                              } else if (bPart && terms > 0) {
                                const [y, m, d] = bPart.split('-').map(Number);
                                if (y && m && d) {
                                  dueDt = new Date(y, m - 1, d);
                                  dueDt.setDate(dueDt.getDate() + terms);
                                }
                              }
                              if (!dueDt) return null;
                              return Math.round((dueDt.getTime() - today.getTime()) / 86400000);
                            })
                            .filter((d): d is number => d !== null)
                            .sort((a, b) => a - b);

                          if (countdowns.length > 0) {
                            const earliest = countdowns[0];
                            return (
                              <div className={`text-[10px] font-bold mt-0.5 ${earliest <= 0 ? 'text-rose-600' : earliest <= 5 ? 'text-amber-600' : 'text-sky-700'}`}>
                                {earliest < 0
                                  ? `Overdue by ${Math.abs(earliest)} day${Math.abs(earliest) === 1 ? '' : 's'}`
                                  : earliest === 0
                                    ? 'Payment Due Today'
                                    : `${earliest} day${earliest === 1 ? '' : 's'} remaining`}
                              </div>
                            );
                          }
                          if (terms > 0) {
                            return (
                              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                Reminder: {terms} days
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-slate-700 dark:text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Address: </span>
                        <span>{selectedVendor.address || '-'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">State &amp; PIN: </span>
                        <span>
                          {selectedVendor.state} ({selectedVendor.state_code})
                          {selectedVendor.pin_code ? ` — PIN: ${selectedVendor.pin_code}` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Mobile: </span>
                        <span className="font-mono">{selectedVendor.mobile || '-'}</span>
                        {selectedVendor.email && (
                          <>
                            <span className="mx-1.5 text-slate-400">•</span>
                            <span>{selectedVendor.email}</span>
                          </>
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">GSTIN: </span>
                        <span className="font-mono">{selectedVendor.gstin || '-'}</span>
                        {selectedVendor.pan && (
                          <>
                            <span className="mx-1.5 text-slate-400">•</span>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">PAN: </span>
                            <span className="font-mono">{selectedVendor.pan}</span>
                          </>
                        )}
                      </div>
                      {(() => {
                        const vBanks = buildVendorBanks(selectedVendor);
                        if (vBanks.length === 0) return null;
                        return (
                          <div className="sm:col-span-2 pt-1.5 border-t border-rose-200/60 dark:border-rose-900/40 space-y-1">
                            <div className="font-semibold text-slate-500 dark:text-slate-400">
                              Vendor Bank Accounts ({vBanks.length}) — click to select:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {vBanks.map((vb) => {
                                const active = selectedVendorBankAccount === vb.value;
                                return (
                                  <button
                                    key={vb.value}
                                    type="button"
                                    onClick={() => setSelectedVendorBankAccount(vb.value)}
                                    className={`text-left px-2 py-1 rounded border text-[10px] transition-colors ${
                                      active
                                        ? 'bg-rose-600 text-white border-rose-700 font-bold shadow-xs'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-rose-200 dark:border-slate-600 hover:bg-rose-50'
                                    }`}
                                  >
                                    <span className="font-semibold">{vb.label}</span>
                                    {vb.sublabel && (
                                      <span className={active ? 'text-rose-100 ml-1.5' : 'text-slate-500 ml-1.5'}>
                                        {vb.sublabel}
                                      </span>
                                    )}
                                    {vb.code && (
                                      <span className={`font-mono ml-1.5 ${active ? 'text-white' : 'text-slate-500'}`}>
                                        [{vb.code}]
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {activeTab === 'customer' ? 'Received From Customer *' : 'Paid To Supplier *'}
                    </label>
                  </div>
                  {editingPayment ? (
                    <div className="h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 flex items-center bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs">
                      {activeTab === 'customer'
                        ? (editingPayment as CustomerPayment).customer_name
                        : (editingPayment as SupplierPayment).supplier_name}
                    </div>
                  ) : (
                    <SearchableSelect
                      options={partyOptions}
                      value={selectedPartyId}
                      onChange={(val) => handlePartyChange(val)}
                      placeholder={activeTab === 'customer' ? 'Search customer by name or GSTIN...' : 'Search supplier by name or GSTIN...'}
                    />
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {activeTab === 'customer' ? 'Invoice Number' : 'Purchase Bill #'}
                    </label>
                    {selectedPartyId && (() => {
                      const partyDocCount =
                        activeTab === 'customer'
                          ? allCompanyInvoices.filter((i) => i.customer_id === selectedPartyId).length
                          : allCompanyBills.filter((b) => b.supplier_id === selectedPartyId).length;
                      return (
                        <button
                          type="button"
                          onClick={() => setShowMoreInvoices((prev) => !prev)}
                          className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                            showMoreInvoices
                              ? 'bg-brand-600 text-white border-brand-700 hover:bg-brand-700'
                              : 'text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 border-brand-200 dark:border-brand-700'
                          }`}
                          title="Show all existing invoices for this party to select or split payment"
                        >
                          <span>
                            {showMoreInvoices
                              ? 'Hide Invoices'
                              : `Show More (${partyDocCount})`}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                  <SearchableSelect
                    options={activeTab === 'customer' ? invoiceDropdownOptions : billDropdownOptions}
                    value={selectedInvoiceId}
                    onChange={(val) => handleInvoiceOrBillSelect(val)}
                    placeholder={activeTab === 'customer' ? 'Select company invoice number...' : 'Select supplier bill #...'}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {activeTab === 'customer' ? 'Amount Received (₹) *' : 'Amount Paid to Supplier (₹) *'}
                    </label>
                    <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => handlePaymentTypeChange('FULL')}
                        className={`px-2 py-0.5 transition-colors ${
                          paymentType === 'FULL'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Full Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePaymentTypeChange('PARTIAL')}
                        className={`px-2 py-0.5 transition-colors border-l border-slate-200 dark:border-slate-600 ${
                          paymentType === 'PARTIAL'
                            ? 'bg-amber-500 text-white'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Partial Amount
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={paymentType === 'PARTIAL' ? 'Enter partial amount...' : '0.00'}
                    value={paymentAmount}
                    onChange={(e) => handlePaymentAmountChange(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Payment Date</label>
                  </div>
                  <DateInput
                    value={paymentDate}
                    onChange={(val) => setPaymentDate(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Payment Mode</label>
                  </div>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS / IMPS)</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>

                {paymentMethod !== 'CASH' ? (
                  <div>
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                        <Landmark className="w-3.5 h-3.5 text-brand-600" />
                        <span>
                          {activeTab === 'customer' ? 'Company Bank Account (Received In)' : 'Company Bank Account (Paid From)'}
                        </span>
                      </label>
                    </div>
                    {companyBankOptions.length > 0 ? (
                      <SearchableSelect
                        options={companyBankOptions}
                        value={selectedBankAccount}
                        onChange={(val) => setSelectedBankAccount(val)}
                        placeholder="Select company bank account..."
                      />
                    ) : (
                      <div className="px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[11px]">
                        No bank account saved on company profile yet. Add your bank in Company Details.
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        {activeTab === 'customer' ? 'Cash Note (Received By / Details)' : 'Cash Note (Paid By / Details)'}
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder={
                        activeTab === 'customer'
                          ? 'e.g. Received cash in hand / Counter cash'
                          : 'e.g. Paid cash from petty cash / office counter'
                      }
                      value={cashNote}
                      onChange={(e) => setCashNote(e.target.value)}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                )}

                {activeTab === 'supplier' && paymentMethod !== 'CASH' && (
                  <div className="col-span-2">
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                        <Landmark className="w-3.5 h-3.5 text-rose-600" />
                        <span>Select Vendor Bank Account (Paid To)</span>
                      </label>
                    </div>
                    {!selectedPartyId ? (
                      <div className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-400 text-[11px]">
                        Select a vendor first to choose their bank account
                      </div>
                    ) : vendorBankOptions.length > 0 ? (
                      <SearchableSelect
                        options={vendorBankOptions}
                        value={selectedVendorBankAccount}
                        onChange={(val) => setSelectedVendorBankAccount(val)}
                        placeholder="-- Select Vendor Bank Account --"
                      />
                    ) : (
                      <div className="px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-[11px]">
                        No bank accounts saved for this vendor yet. You can add bank accounts in Suppliers.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Reference / UTR / Cheque #
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter UTR / Cheque / Ref #"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Notes / Remarks</label>
                  </div>
                  <input
                    type="text"
                    placeholder={
                      activeTab === 'customer'
                        ? 'e.g. Received against monthly bill'
                        : 'e.g. Settled vendor invoice via NEFT'
                    }
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Selected Invoice / Bill Partial vs Full Live Balance Summary */}
              {selectedInvoiceId && (() => {
                const doc =
                  activeTab === 'customer'
                    ? allUnpaidInvoices.find((i) => i.id === selectedInvoiceId)
                    : allUnpaidBills.find((b) => b.id === selectedInvoiceId);
                if (!doc) return null;
                const due = new Decimal(doc.balance_amount || 0);
                let payingNow = new Decimal(0);
                try {
                  const allocVal = allocations[doc.id] || paymentAmount || '0';
                  if (Number(allocVal) > 0) payingNow = new Decimal(allocVal);
                } catch {
                  payingNow = new Decimal(0);
                }
                const remainingAfter = Decimal.max(new Decimal(0), due.sub(payingNow));
                const docLabel = activeTab === 'customer' ? (doc as Invoice).invoice_number : (doc as PurchaseInvoice).bill_number;
                return (
                  <div className="p-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 grid grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-500">Selected Document</div>
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-100">{docLabel}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Current Balance Due</div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">{formatIndianCurrency(due.toFixed(2))}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">{paymentType === 'PARTIAL' ? 'Partial Amount Now' : 'Paying Now'}</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400">{formatIndianCurrency(payingNow.toFixed(2))}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Remaining Balance</div>
                      <div className={`font-bold ${remainingAfter.gt(0) ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {formatIndianCurrency(remainingAfter.toFixed(2))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Existing Customer Invoices Drawer (opened via Show More) */}
              {activeTab === 'customer' && selectedPartyId && showMoreInvoices && (() => {
                const partyInvoices = allCompanyInvoices
                  .filter((i) => i.customer_id === selectedPartyId)
                  .sort((a, b) => {
                    const aPending = a.status === 'FINALIZED' && new Decimal(a.balance_amount || 0).gt(0) ? 0 : 1;
                    const bPending = b.status === 'FINALIZED' && new Decimal(b.balance_amount || 0).gt(0) ? 0 : 1;
                    return aPending - bPending;
                  });
                return (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Customer Existing Invoices ({partyInvoices.length}) — Click to Select or Enter Split Amount:
                      </span>
                      <div className="flex items-center space-x-2">
                        {unpaidInvoices.length > 0 && (
                          <button
                            type="button"
                            onClick={handleAutoAllocate}
                            className="inline-flex items-center space-x-1 text-brand-600 font-bold hover:underline"
                          >
                            <Wand2 className="w-3 h-3" />
                            <span>Auto-Allocate</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowMoreInvoices(false)}
                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                          title="Close invoices list"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {partyInvoices.length === 0 ? (
                      <div className="text-[11px] text-slate-500 py-3 text-center">
                        No existing invoices found for this customer yet. You can still record an On-Account Advance receipt.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {partyInvoices.map((inv) => {
                          const due = new Decimal(inv.balance_amount || 0);
                          const isPayable = inv.status === 'FINALIZED' && due.gt(0);
                          const isPaid = inv.status === 'FINALIZED' && due.lte(0);
                          const isPicked = inv.id === selectedInvoiceId;
                          return (
                            <div
                              key={inv.id}
                              onClick={() => {
                                if (isPayable) handleInvoiceOrBillSelect(inv.id);
                              }}
                              className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded border transition-colors ${
                                isPayable ? 'cursor-pointer' : 'opacity-75'
                              } ${
                                isPicked
                                  ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-600'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                    {inv.invoice_number}
                                  </span>
                                  <span className="text-[10px] text-slate-400">({isoToDisplayDate(inv.invoice_date) || inv.invoice_date})</span>
                                  {isPaid ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                      PAID
                                    </span>
                                  ) : inv.status === 'DRAFT' ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">
                                      DRAFT (Finalize first)
                                    </span>
                                  ) : new Decimal(inv.paid_amount || 0).gt(0) ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-700">
                                      PARTIAL
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700">
                                      UNPAID
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Total: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatIndianCurrency(inv.grand_total)}</span>
                                  {' • '}
                                  Paid: <span className="font-semibold text-emerald-700">{formatIndianCurrency(inv.paid_amount)}</span>
                                  {' • '}
                                  Due: <span className="font-bold text-rose-600">{formatIndianCurrency(inv.balance_amount)}</span>
                                </div>
                              </div>

                              {isPayable && (
                                <div
                                  className="flex items-center space-x-1.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleInvoiceOrBillSelect(inv.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                      isPicked
                                        ? 'bg-brand-600 text-white border-brand-700'
                                        : 'bg-brand-50 hover:bg-brand-100 text-brand-700 border-brand-200'
                                    }`}
                                  >
                                    {isPicked ? 'Selected' : 'Select'}
                                  </button>
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
                                    placeholder="Partial / Amt"
                                    max={inv.balance_amount}
                                    value={allocations[inv.id] || ''}
                                    onChange={(e) => handleAllocationInputChange(inv.id, e.target.value)}
                                    className="w-28 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-right font-mono bg-white dark:bg-slate-900"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Existing Supplier Purchase Bills Drawer (opened via Show More) */}
              {activeTab === 'supplier' && selectedPartyId && showMoreInvoices && (() => {
                const partyBills = allCompanyBills
                  .filter((b) => b.supplier_id === selectedPartyId)
                  .sort((a, b) => {
                    const aPending = a.is_finalized && new Decimal(a.balance_amount || 0).gt(0) ? 0 : 1;
                    const bPending = b.is_finalized && new Decimal(b.balance_amount || 0).gt(0) ? 0 : 1;
                    return aPending - bPending;
                  });
                return (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Supplier Existing Purchase Bills ({partyBills.length}) — Click to Select or Enter Split Amount:
                      </span>
                      <div className="flex items-center space-x-2">
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
                        <button
                          type="button"
                          onClick={() => setShowMoreInvoices(false)}
                          className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                          title="Close bills list"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {partyBills.length === 0 ? (
                      <div className="text-[11px] text-slate-500 py-2 text-center">
                        No purchase bills found for this supplier. This payment will be recorded as a Vendor Advance / On-Account payment.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {partyBills.map((bill) => {
                          const due = new Decimal(bill.balance_amount || 0);
                          const isPayable = bill.is_finalized && due.gt(0);
                          const isPicked = bill.id === selectedInvoiceId;
                          return (
                            <div
                              key={bill.id}
                              onClick={() => {
                                if (isPayable) handleInvoiceOrBillSelect(bill.id);
                              }}
                              className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded border ${
                                isPayable ? 'cursor-pointer' : 'opacity-75'
                              } ${
                                isPicked
                                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-700'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div>
                                <span className="font-mono font-bold">{bill.bill_number}</span>
                                <span className="text-slate-400 ml-2">({isoToDisplayDate(bill.bill_date) || bill.bill_date})</span>
                                <span className="text-rose-600 ml-2 font-semibold">
                                  Owed: {formatIndianCurrency(bill.balance_amount)}
                                </span>
                                {!bill.is_finalized && (
                                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">
                                    DRAFT
                                  </span>
                                )}
                              </div>
                              {isPayable && (
                                <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleInvoiceOrBillSelect(bill.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                      isPicked
                                        ? 'bg-rose-600 text-white border-rose-700'
                                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                    }`}
                                  >
                                    {isPicked ? 'Selected' : 'Select'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFillSingleDoc(bill.id, bill.balance_amount)}
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-semibold"
                                  >
                                    Full
                                  </button>
                                  <span>₹</span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Partial / Amt"
                                    max={bill.balance_amount}
                                    value={allocations[bill.id] || ''}
                                    onChange={(e) => handleAllocationInputChange(bill.id, e.target.value)}
                                    className="w-28 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-right font-mono bg-white dark:bg-slate-900"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                  : editingPayment
                  ? activeTab === 'customer'
                    ? 'Update Customer Receipt'
                    : 'Update Vendor Payment'
                  : activeTab === 'customer'
                  ? 'Save Customer Receipt'
                  : 'Save Vendor Payment'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
