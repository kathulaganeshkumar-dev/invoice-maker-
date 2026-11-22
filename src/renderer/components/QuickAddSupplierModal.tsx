// src/renderer/components/QuickAddSupplierModal.tsx - Fast Inline Supplier Creator for Purchase Bill Modals
import React, { useState, useMemo } from 'react';
import { Supplier } from '../../shared/types';
import { api } from '../services/api';
import { INDIAN_STATES } from '../../shared/constants';
import { SearchableSelect } from './SearchableSelect';
import { ModalPortal } from './ModalPortal';
import {
  Truck,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Landmark,
} from 'lucide-react';

interface QuickAddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onSupplierCreated: (newSupplier: Supplier) => void;
  initialName?: string;
  defaultState?: string;
}

export const QuickAddSupplierModal: React.FC<QuickAddSupplierModalProps> = ({
  isOpen,
  onClose,
  companyId,
  onSupplierCreated,
  initialName = '',
  defaultState = 'Telangana',
}) => {
  const [name, setName] = useState<string>(initialName);
  const [companyName, setCompanyName] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [mobile, setMobile] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [gstin, setGstin] = useState<string>('');
  const [pan, setPan] = useState<string>('');
  const [state, setState] = useState<string>(defaultState);
  const [stateCode, setStateCode] = useState<string>(
    INDIAN_STATES.find((s) => s.name.toLowerCase() === defaultState.toLowerCase())?.code || '36'
  );
  const [city, setCity] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(0);

  // Bank Details
  const [bankName, setBankName] = useState<string>('');
  const [bankAccountNo, setBankAccountNo] = useState<string>('');
  const [bankIfsc, setBankIfsc] = useState<string>('');
  const [bankBranch, setBankBranch] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.name,
      label: s.name,
      code: s.code,
    }));
  }, []);

  if (!isOpen) return null;

  const handleGstinChange = (val: string) => {
    const raw = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    setGstin(raw);
    const prefix = raw.substring(0, 2);
    const matched = INDIAN_STATES.find((s) => s.code === prefix);
    if (matched) {
      setState(matched.name);
      setStateCode(matched.code);
    }
    if (raw.length >= 12 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(raw)) {
      setPan(raw.substring(2, 12));
    }
  };

  const handleStateChange = (selectedStateName: string) => {
    setState(selectedStateName);
    const matched = INDIAN_STATES.find((s) => s.name.toLowerCase() === selectedStateName.toLowerCase());
    if (matched) {
      setStateCode(matched.code);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter supplier or vendor company name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload: Partial<Supplier> = {
        name: cleanName,
        company_name: companyName.trim() || cleanName,
        contact_person: contactPerson.trim() || undefined,
        mobile: mobile.trim() || '9999999999',
        email: email.trim() || undefined,
        gstin: gstin.trim() || undefined,
        pan: pan.trim() || undefined,
        address: address.trim(),
        state: state,
        state_code: stateCode,
        pin_code: pinCode.trim(),
        payment_terms_days: Math.max(0, paymentTermsDays),
        bank_name: bankName.trim() || undefined,
        bank_account_no: bankAccountNo.trim() || undefined,
        bank_ifsc: bankIfsc.trim().toUpperCase() || undefined,
        bank_branch: bankBranch.trim() || undefined,
        upi_id: upiId.trim() || undefined,
        opening_balance: '0.00',
      };

      const newSupplier = await api.createSupplier(companyId, payload);
      onSupplierCreated(newSupplier);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create supplier. Please check the fields and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 rounded-lg">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <span>Quick Add New Supplier</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                    Auto-Selects on Save
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Quickly register a vendor to continue recording your purchase bill
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Basic Information */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>Vendor Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Supplier / Business Name *
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acer India Pvt Ltd"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Trading / Legal Name (Optional)
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Trade name if different"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Contact Person</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Sales Manager"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Mobile / Phone *</label>
                  </div>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="10-digit mobile"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                  </div>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      placeholder="vendor@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tax & GST Information */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>Tax & GST Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      GST Number (15 Digits)
                    </label>
                  </div>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 36AABCU9603R1ZM (Auto-detects State)"
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono uppercase font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">PAN Number</label>
                  </div>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Auto-extracted or PAN"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Address & State */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>Address & Location</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">State *</label>
                  </div>
                  <SearchableSelect
                    options={stateOptions}
                    value={state}
                    onChange={handleStateChange}
                    placeholder="Select State"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">City</label>
                  </div>
                  <input
                    type="text"
                    placeholder="City name"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">PIN Code</label>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6-digit PIN"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Office / Warehouse Address</label>
                </div>
                <textarea
                  rows={2}
                  placeholder="Plot/Door No, Street, Landmark..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>

            {/* Payment Terms & Bank Details */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 pb-1 border-b border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
                <Landmark className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>Payment Terms & Bank Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Credit Days</label>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    placeholder="e.g. 30"
                    value={paymentTermsDays || ''}
                    onChange={(e) => setPaymentTermsDays(Number(e.target.value) || 0)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Bank Name</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Account Number</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={bankAccountNo}
                    onChange={(e) => setBankAccountNo(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">IFSC Code</label>
                  </div>
                  <input
                    type="text"
                    maxLength={11}
                    placeholder="e.g. HDFC0001234"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Branch Name</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Banjara Hills"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">UPI ID / VPA</label>
                  </div>
                  <input
                    type="text"
                    placeholder="vendor@okhdfcbank"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl shadow-xs flex items-center space-x-1.5 disabled:opacity-50 transition cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save &amp; Select Supplier</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
