// src/renderer/components/QuickAddCustomerModal.tsx - Fast Inline Customer Creator for Sales & Quotation Modals
import React, { useState, useMemo } from 'react';
import { Customer, CustomerType, CUSTOMER_TYPE_OPTIONS } from '../../shared/types';
import { api } from '../services/api';
import { INDIAN_STATES } from '../../shared/constants';
import { SearchableSelect } from './SearchableSelect';
import { ModalPortal } from './ModalPortal';
import {
  UserPlus,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface QuickAddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onCustomerCreated: (newCustomer: Customer) => void;
  initialName?: string;
  defaultState?: string;
}

export const QuickAddCustomerModal: React.FC<QuickAddCustomerModalProps> = ({
  isOpen,
  onClose,
  companyId,
  onCustomerCreated,
  initialName = '',
  defaultState = 'Telangana',
}) => {
  const [name, setName] = useState<string>(initialName);
  const [companyName, setCompanyName] = useState<string>('');
  const [customerType, setCustomerType] = useState<CustomerType>('CORPORATE');
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
  const [billingAddress, setBillingAddress] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(true);
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.name,
      label: s.name,
      code: s.code,
    }));
  }, []);

  const customerTypeOptions = useMemo(() => {
    return CUSTOMER_TYPE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
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
      setError('Please enter customer or business name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload: Partial<Customer> = {
        name: cleanName,
        company_name: companyName.trim() || cleanName,
        customer_type: customerType,
        mobile: mobile.trim() || '9999999999',
        email: email.trim() || undefined,
        gstin: gstin.trim() || undefined,
        pan: pan.trim() || undefined,
        billing_address: billingAddress.trim(),
        shipping_address: sameAsBilling ? billingAddress.trim() : shippingAddress.trim() || billingAddress.trim(),
        city: city.trim(),
        state: state,
        state_code: stateCode,
        pin_code: pinCode.trim(),
        payment_terms_days: Math.max(0, paymentTermsDays),
        opening_balance: '0.00',
      };

      const newCust = await api.createCustomer(companyId, payload);
      onCustomerCreated(newCust);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create customer. Please check the fields and try again.');
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
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
                  <span>Quick Add New Customer</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    Auto-Selects upon save
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fill in customer details. It will be immediately chosen in your document.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Primary Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Customer / Business Name *
                  </label>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Acme Technologies Pvt Ltd or Rajesh Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Trading / Display Name
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Optional display name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Customer Category</label>
                </div>
                <select
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                  className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {customerTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Mobile / Phone Number *
                  </label>
                </div>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full h-9 pl-8 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                </div>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="billing@customer.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-9 pl-8 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Tax & GST Details */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
              <span className="font-bold text-[11px] text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                GST &amp; Tax Information
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-1">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      State (Place of Supply) *
                    </label>
                  </div>
                  <SearchableSelect
                    options={stateOptions}
                    value={state}
                    onChange={handleStateChange}
                    placeholder="Select State..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Default Payment Terms
                    </label>
                  </div>
                  <select
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-medium"
                  >
                    <option value={0}>Immediate Payment (0 Days)</option>
                    <option value={7}>7 Days Credit</option>
                    <option value={15}>15 Days Credit</option>
                    <option value={30}>30 Days Credit</option>
                    <option value={45}>45 Days Credit</option>
                    <option value={60}>60 Days Credit</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Address Information */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between h-6 mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-brand-600" />
                    <span>Billing Address</span>
                  </label>
                </div>
                <textarea
                  rows={2}
                  placeholder="Street address, building, landmark..."
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">City</label>
                  </div>
                  <input
                    type="text"
                    placeholder="City / Town"
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
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={sameAsBilling}
                    onChange={(e) => setSameAsBilling(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-brand-600 border-slate-300 dark:border-slate-600"
                  />
                  <span className="font-semibold text-xs">Shipping address is identical to billing address</span>
                </label>

                {!sameAsBilling && (
                  <div>
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Shipping / Delivery Address
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Delivery site or warehouse address..."
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Customer is saved directly to office database.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-md flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save &amp; Select Customer</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
