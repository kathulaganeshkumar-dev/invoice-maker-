// src/shared/constants.ts - GST States, default rates and configurations

export interface IndianState {
  code: string;
  name: string;
  isUnionTerritory: boolean;
  hasLegislature: boolean; // Delhi, Puducherry, J&K have legislature => SGST; others => UTGST
}

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', isUnionTerritory: true, hasLegislature: true },
  { code: '02', name: 'Himachal Pradesh', isUnionTerritory: false, hasLegislature: true },
  { code: '03', name: 'Punjab', isUnionTerritory: false, hasLegislature: true },
  { code: '04', name: 'Chandigarh', isUnionTerritory: true, hasLegislature: false },
  { code: '05', name: 'Uttarakhand', isUnionTerritory: false, hasLegislature: true },
  { code: '06', name: 'Haryana', isUnionTerritory: false, hasLegislature: true },
  { code: '07', name: 'Delhi', isUnionTerritory: true, hasLegislature: true },
  { code: '08', name: 'Rajasthan', isUnionTerritory: false, hasLegislature: true },
  { code: '09', name: 'Uttar Pradesh', isUnionTerritory: false, hasLegislature: true },
  { code: '10', name: 'Bihar', isUnionTerritory: false, hasLegislature: true },
  { code: '11', name: 'Sikkim', isUnionTerritory: false, hasLegislature: true },
  { code: '12', name: 'Arunachal Pradesh', isUnionTerritory: false, hasLegislature: true },
  { code: '13', name: 'Nagaland', isUnionTerritory: false, hasLegislature: true },
  { code: '14', name: 'Manipur', isUnionTerritory: false, hasLegislature: true },
  { code: '15', name: 'Mizoram', isUnionTerritory: false, hasLegislature: true },
  { code: '16', name: 'Tripura', isUnionTerritory: false, hasLegislature: true },
  { code: '17', name: 'Meghalaya', isUnionTerritory: false, hasLegislature: true },
  { code: '18', name: 'Assam', isUnionTerritory: false, hasLegislature: true },
  { code: '19', name: 'West Bengal', isUnionTerritory: false, hasLegislature: true },
  { code: '20', name: 'Jharkhand', isUnionTerritory: false, hasLegislature: true },
  { code: '21', name: 'Odisha', isUnionTerritory: false, hasLegislature: true },
  { code: '22', name: 'Chhattisgarh', isUnionTerritory: false, hasLegislature: true },
  { code: '23', name: 'Madhya Pradesh', isUnionTerritory: false, hasLegislature: true },
  { code: '24', name: 'Gujarat', isUnionTerritory: false, hasLegislature: true },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', isUnionTerritory: true, hasLegislature: false },
  { code: '27', name: 'Maharashtra', isUnionTerritory: false, hasLegislature: true },
  { code: '28', name: 'Andhra Pradesh (Old)', isUnionTerritory: false, hasLegislature: true },
  { code: '29', name: 'Karnataka', isUnionTerritory: false, hasLegislature: true },
  { code: '30', name: 'Goa', isUnionTerritory: false, hasLegislature: true },
  { code: '31', name: 'Lakshadweep', isUnionTerritory: true, hasLegislature: false },
  { code: '32', name: 'Kerala', isUnionTerritory: false, hasLegislature: true },
  { code: '33', name: 'Tamil Nadu', isUnionTerritory: false, hasLegislature: true },
  { code: '34', name: 'Puducherry', isUnionTerritory: true, hasLegislature: true },
  { code: '35', name: 'Andaman and Nicobar Islands', isUnionTerritory: true, hasLegislature: false },
  { code: '36', name: 'Telangana', isUnionTerritory: false, hasLegislature: true },
  { code: '37', name: 'Andhra Pradesh (New)', isUnionTerritory: false, hasLegislature: true },
  { code: '38', name: 'Ladakh', isUnionTerritory: true, hasLegislature: false },
  { code: '97', name: 'Other Territory', isUnionTerritory: true, hasLegislature: false },
  { code: '99', name: 'Centre Jurisdiction', isUnionTerritory: false, hasLegislature: false },
];

export const GST_RATES = ['0.00', '0.10', '0.25', '1.50', '3.00', '5.00', '6.00', '7.50', '12.00', '18.00', '28.00'];

export const STANDARD_UNITS = [
  { code: 'PCS', name: 'Pieces', is_decimal_allowed: false },
  { code: 'NOS', name: 'Numbers', is_decimal_allowed: false },
  { code: 'BOX', name: 'Boxes', is_decimal_allowed: false },
  { code: 'PAC', name: 'Packs', is_decimal_allowed: false },
  { code: 'SET', name: 'Sets', is_decimal_allowed: false },
  { code: 'KGS', name: 'Kilograms', is_decimal_allowed: true },
  { code: 'GMS', name: 'Grams', is_decimal_allowed: true },
  { code: 'MTR', name: 'Meters', is_decimal_allowed: true },
  { code: 'LTR', name: 'Liters', is_decimal_allowed: true },
  { code: 'MLT', name: 'Milliliters', is_decimal_allowed: true },
  { code: 'SQF', name: 'Square Feet', is_decimal_allowed: true },
  { code: 'SQM', name: 'Square Meters', is_decimal_allowed: true },
  { code: 'TON', name: 'Tonnes', is_decimal_allowed: true },
  { code: 'BAG', name: 'Bags', is_decimal_allowed: false },
  { code: 'CAN', name: 'Cans', is_decimal_allowed: false },
  { code: 'BTL', name: 'Bottles', is_decimal_allowed: false },
  { code: 'ROL', name: 'Rolls', is_decimal_allowed: false },
  { code: 'DRM', name: 'Drums', is_decimal_allowed: false },
];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  STANDARD_INVOICE: 'Standard Invoice',
  TAX_INVOICE: 'Tax Invoice (GST)',
  BILL_OF_SUPPLY: 'Bill of Supply',
  PROFORMA_INVOICE: 'Proforma Invoice',
  SERVICE_INVOICE: 'Service Invoice',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  EXPORT_INVOICE: 'Export Invoice',
  RECURRING_INVOICE: 'Recurring Invoice',
  ADVANCE_PAYMENT_INVOICE: 'Advance Payment Voucher',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  DELIVERY_CHALLAN: 'Delivery Challan',
};
