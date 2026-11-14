// src/shared/types.ts - Core domain models and interfaces

export type OperatingMode = 'SINGLE_COMPUTER' | 'LOCAL_NETWORK_CLIENT' | 'LOCAL_NETWORK_SERVER';

export type DatabaseType = 'sqlite' | 'postgres';

export interface AppSettings {
  id: string;
  operating_mode: OperatingMode;
  db_type: DatabaseType;
  pg_host?: string;
  pg_port?: number;
  pg_database?: string;
  pg_user?: string;
  pg_password?: string;
  server_port?: number;
  show_company_selector_on_startup: boolean;
  theme: 'light' | 'dark' | 'system';
  invoice_save_path?: string;
  quotation_save_path?: string;
  purchase_save_path?: string;
  report_save_path?: string;
  backup_save_path?: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  business_type: string;
  logo_url?: string;
  registered_address: string;
  gstin?: string;
  pan?: string;
  state: string;
  state_code: string;
  pin_code: string;
  phone: string;
  email: string;
  website?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  upi_id?: string;
  default_invoice_terms?: string;
  default_quotation_terms?: string;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  company_id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  gstin?: string;
  state: string;
  state_code: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  use_company_bank?: boolean;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  invoice_overdue_days: number;
  print_invoice_after_save: boolean;
  show_postal_code_before_city: boolean;
  include_additional_notes_in_search: boolean;
  sort_invoices_by_number: boolean;
  show_amount_in_words: boolean;
  zero_not_displayed: boolean;
  indian_number_style: boolean;
  currency_name: string;
  currency_symbol: string;
  decimal_name: string;
  printed_date_format: string;
  allow_negative_stock: boolean;
  inventory_valuation_method: 'FIFO' | 'WEIGHTED_AVERAGE';
  enable_reverse_charge_by_default: boolean;
  invoice_save_path?: string;
  quotation_save_path?: string;
  purchase_save_path?: string;
  report_save_path?: string;
  backup_save_path?: string;
  default_invoice_notes?: string;
  default_quotation_notes?: string;
  quotation_validity_days?: number;
  default_tax_inclusive?: boolean;
  created_at: string;
  updated_at: string;
}

export type CustomerType = 'INDIVIDUAL' | 'BUSINESS';

export interface CustomerAddress {
  id: string;
  customer_id: string;
  address_type: 'BILLING' | 'SHIPPING' | 'BOTH';
  street: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  is_default: boolean;
}

export interface Customer {
  id: string;
  company_id: string;
  customer_type: CustomerType;
  name: string;
  company_name?: string;
  contact_person?: string;
  mobile: string;
  alternate_phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  billing_address: string;
  shipping_address: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  opening_balance: string; // Decimal string representation
  current_balance: string; // Decimal string representation
  credit_limit: string;
  payment_terms_days: number;
  notes?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  company_name?: string;
  contact_person?: string;
  mobile: string;
  email?: string;
  gstin?: string;
  pan?: string;
  address: string;
  state: string;
  state_code: string;
  pin_code: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  upi_id?: string;
  opening_balance: string;
  current_balance: string;
  payment_terms_days: number;
  notes?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  company_id: string;
  name: string;
  code: string; // e.g. PCS, KGS, BOX, MTR, NOS
  is_decimal_allowed: boolean;
}

export type ItemType = 'PRODUCT' | 'SERVICE';

export interface Product {
  id: string;
  company_id: string;
  item_type: ItemType;
  name: string;
  sku?: string;
  product_code?: string;
  barcode?: string;
  category_id?: string;
  category_name?: string;
  description?: string;
  image_url?: string;
  unit: string;
  hsn_or_sac: string;
  gst_rate: string; // e.g. "18.00"
  purchase_price: string;
  selling_price: string;
  is_tax_inclusive: boolean;
  minimum_stock: string;
  current_stock: string;
  preferred_supplier_id?: string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | 'STANDARD_INVOICE'
  | 'TAX_INVOICE'
  | 'BILL_OF_SUPPLY'
  | 'PROFORMA_INVOICE'
  | 'SERVICE_INVOICE'
  | 'COMMERCIAL_INVOICE'
  | 'EXPORT_INVOICE'
  | 'RECURRING_INVOICE'
  | 'ADVANCE_PAYMENT_INVOICE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'DELIVERY_CHALLAN';

export type InvoiceStatus = 'DRAFT' | 'REVIEW' | 'FINALIZED' | 'CANCELLED';

export type QuotationStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED'
  | 'CANCELLED';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_id?: string;
  item_type: ItemType;
  item_name: string;
  description?: string;
  hsn_or_sac: string;
  quantity: string;
  unit: string;
  rate: string;
  discount_percentage: string;
  discount_amount: string;
  is_tax_inclusive: boolean;
  taxable_value: string;
  gst_rate: string;
  cgst_rate: string;
  cgst_amount: string;
  sgst_rate: string;
  sgst_amount: string;
  igst_rate: string;
  igst_amount: string;
  total_tax: string;
  line_total: string;
  sort_order: number;
}

export interface Invoice {
  id: string;
  company_id: string;
  branch_id: string;
  document_type: DocumentType;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  customer_name: string;
  customer_gstin?: string;
  customer_pan?: string;
  billing_address: string;
  shipping_address: string;
  place_of_supply_state: string;
  place_of_supply_code: string;
  is_inter_state: boolean;
  is_reverse_charge: boolean;
  reference_number?: string;
  purchase_order_number?: string;
  payment_terms?: string;
  items: InvoiceItem[];
  subtotal: string;
  overall_discount_percentage: string;
  overall_discount_amount: string;
  total_taxable_value: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_tax: string;
  additional_charges: string;
  round_off: string;
  grand_total: string;
  amount_in_words: string;
  paid_amount: string;
  balance_amount: string;
  status: InvoiceStatus;
  finalized_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  letterhead_template_id?: string;
  notes?: string;
  terms_conditions?: string;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  item_id?: string;
  item_type: ItemType;
  item_name: string;
  description?: string;
  hsn_or_sac: string;
  quantity: string;
  unit: string;
  rate: string;
  discount_percentage: string;
  discount_amount: string;
  taxable_value: string;
  gst_rate: string;
  cgst_rate: string;
  cgst_amount: string;
  sgst_rate: string;
  sgst_amount: string;
  igst_rate: string;
  igst_amount: string;
  total_tax: string;
  line_total: string;
  sort_order: number;
}

export interface Quotation {
  id: string;
  company_id: string;
  branch_id: string;
  quotation_number: string;
  revision_number: number;
  quotation_date: string;
  valid_until_date: string;
  customer_id: string;
  customer_name: string;
  customer_gstin?: string;
  billing_address: string;
  shipping_address: string;
  place_of_supply_state: string;
  place_of_supply_code: string;
  items: QuotationItem[];
  subtotal: string;
  overall_discount_amount: string;
  total_taxable_value: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_tax: string;
  additional_charges: string;
  round_off: string;
  grand_total: string;
  amount_in_words: string;
  status: QuotationStatus;
  converted_invoice_id?: string;
  converted_at?: string;
  letterhead_template_id?: string;
  notes?: string;
  terms_conditions?: string;
  created_at: string;
  updated_at: string;
}

export type PurchaseOrderStatus = 'DRAFT' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id?: string;
  item_name: string;
  hsn_code: string;
  quantity: string;
  unit: string;
  rate: string;
  discount_amount: string;
  gst_rate: string;
  taxable_value: string;
  total_tax: string;
  line_total: string;
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  branch_id: string;
  po_number: string;
  po_date: string;
  expected_delivery_date?: string;
  supplier_id: string;
  supplier_name: string;
  supplier_gstin?: string;
  items: PurchaseOrderItem[];
  subtotal: string;
  total_tax: string;
  grand_total: string;
  status: PurchaseOrderStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  purchase_invoice_id: string;
  product_id?: string;
  item_name: string;
  hsn_code: string;
  quantity: string;
  unit: string;
  rate: string;
  discount_amount: string;
  gst_rate: string;
  taxable_value: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total_tax: string;
  line_total: string;
}

export interface PurchaseInvoice {
  id: string;
  company_id: string;
  branch_id: string;
  purchase_order_id?: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  supplier_id: string;
  supplier_name: string;
  supplier_gstin?: string;
  warehouse_id: string;
  items: PurchaseInvoiceItem[];
  subtotal: string;
  total_tax: string;
  grand_total: string;
  paid_amount: string;
  balance_amount: string;
  is_finalized: boolean;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  company_id: string;
  branch_id: string;
  name: string;
  code: string;
  address: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type InventoryMovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RETURN'
  | 'SALES_DISPATCH'
  | 'SALES_RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_ADD'
  | 'ADJUSTMENT_REDUCE';

export interface InventoryTransaction {
  id: string;
  company_id: string;
  branch_id: string;
  warehouse_id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity: string; // Positive for inward, negative for outward
  unit_cost: string;
  total_cost: string;
  reference_document_type: string;
  reference_document_id: string;
  reference_document_number: string;
  batch_number?: string;
  serial_numbers?: string[];
  notes?: string;
  transaction_date: string;
  created_at: string;
}

export interface StockBalance {
  id: string;
  company_id: string;
  warehouse_id: string;
  product_id: string;
  quantity_on_hand: string;
  average_unit_cost: string;
  total_stock_value: string;
  last_updated_at: string;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  document_type: 'INVOICE' | 'PURCHASE_INVOICE';
  document_id: string;
  document_number: string;
  allocated_amount: string;
  allocated_at: string;
}

export interface CustomerPayment {
  id: string;
  company_id: string;
  branch_id: string;
  payment_number: string;
  payment_date: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
  allocations: PaymentAllocation[];
  unallocated_amount: string;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  company_id: string;
  branch_id: string;
  payment_number: string;
  payment_date: string;
  supplier_id: string;
  supplier_name: string;
  amount: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
  allocations: PaymentAllocation[];
  unallocated_amount: string;
  created_at: string;
}

export interface NumberingSequence {
  id: string;
  company_id: string;
  branch_id?: string;
  document_type: string;
  prefix: string;
  suffix: string;
  padding_length: number;
  current_number: number;
  include_financial_year: boolean;
  fy_format: 'YYYY-YY' | 'YY-YY' | 'YYYY';
  separator: string;
  custom_format?: string;
  last_generated_number?: string;
  updated_at: string;
}

export interface LayoutCoordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  alignment?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export interface LayoutConfiguration {
  id: string;
  template_id: string;
  invoice_number: LayoutCoordinates;
  invoice_date: LayoutCoordinates;
  due_date?: LayoutCoordinates;
  customer_name: LayoutCoordinates;
  billing_address: LayoutCoordinates;
  shipping_address?: LayoutCoordinates;
  place_of_supply?: LayoutCoordinates;
  customer_gstin?: LayoutCoordinates;
  table_top_y: number;
  table_bottom_margin: number;
  table_columns: {
    sr_no: { width: number; label: string };
    item_name: { width: number; label: string };
    hsn_sac: { width: number; label: string };
    qty: { width: number; label: string };
    rate: { width: number; label: string };
    discount: { width: number; label: string };
    taxable: { width: number; label: string };
    gst: { width: number; label: string };
    total: { width: number; label: string };
  };
  total_taxable_value: LayoutCoordinates;
  cgst: LayoutCoordinates;
  sgst: LayoutCoordinates;
  igst: LayoutCoordinates;
  round_off: LayoutCoordinates;
  grand_total: LayoutCoordinates;
  amount_in_words: LayoutCoordinates;
  bank_details?: LayoutCoordinates;
  terms_conditions?: LayoutCoordinates;
  signature: LayoutCoordinates;
  footer: LayoutCoordinates;
}

export interface LetterheadTemplate {
  id: string;
  company_id: string;
  branch_id?: string;
  name: string;
  file_path: string;
  file_type: 'PDF' | 'PNG' | 'JPG' | 'DOCX' | 'XLSX';
  page_size: 'A4';
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  is_default: boolean;
  layout_config: LayoutConfiguration;
  created_at: string;
  updated_at: string;
}

export interface LetterheadOCRResult {
  raw_text: string;
  confidence: number;
  stored_file_path?: string;
  detected_file_type?: 'PDF' | 'PNG' | 'JPG';
  page_width_pt?: number;
  page_height_pt?: number;
  page_count?: number;
  recommended_orientation?: 'PORTRAIT' | 'LANDSCAPE';
  detected_entities: {
    company_name?: string;
    legal_name?: string;
    gstin?: string;
    pan?: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    bank_account_no?: string;
    bank_ifsc?: string;
    bank_name?: string;
    upi_id?: string;
  };
  detected_zones: {
    header_box: { y_start: number; y_end: number };
    footer_box: { y_start: number; y_end: number };
    left_margin: number;
    right_margin: number;
    printable_area: { top: number; bottom: number; left: number; right: number };
    logo_candidate?: { x: number; y: number; width: number; height: number };
    signature_box?: { x: number; y: number; width: number; height: number };
  };
}

export interface AuditLog {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'FINALIZE' | 'CANCEL' | 'DELETE' | 'BACKUP' | 'RESTORE';
  details: string;
  timestamp: string;
}
