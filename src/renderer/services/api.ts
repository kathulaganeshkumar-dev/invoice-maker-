// src/renderer/services/api.ts - Typed REST API Client
import {
  Company,
  Branch,
  CompanySettings,
  Customer,
  Supplier,
  Product,
  Category,
  Unit,
  NumberingSequence,
  Invoice,
  Quotation,
  PurchaseOrder,
  PurchaseInvoice,
  Warehouse,
  StockBalance,
  InventoryTransaction,
  CustomerPayment,
  SupplierPayment,
  LetterheadTemplate,
  LetterheadOCRResult,
  AppSettings,
} from '../../shared/types';

const getBaseUrl = (): string => {
  if (typeof window === 'undefined') return 'http://127.0.0.1:4200/api';
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:4200/api';
  if (window.location.origin && window.location.origin.startsWith('http')) {
    if (window.location.port === '5173') return 'http://127.0.0.1:4200/api';
    return `${window.location.origin}/api`;
  }
  return '/api';
};

export const BASE_URL = getBaseUrl();

let cachedDeviceId = '';
let cachedDeviceName = '';
let cachedStaffName = '';
let sessionAdminPin = '';

export function setSessionAdminPin(pin: string) {
  sessionAdminPin = String(pin || '').trim();
}

export function getSessionAdminPin(): string {
  return sessionAdminPin;
}

export function setLocalDeviceIdentity(deviceId: string, deviceName?: string, staffName?: string) {
  if (deviceId) cachedDeviceId = deviceId;
  if (deviceName !== undefined) cachedDeviceName = deviceName;
  if (staffName !== undefined) cachedStaffName = staffName;
  try {
    if (deviceId) localStorage.setItem('eim_device_id', deviceId);
    if (deviceName !== undefined) localStorage.setItem('eim_device_name', deviceName);
    if (staffName !== undefined) localStorage.setItem('eim_staff_name', staffName);
  } catch {
    // ignore storage errors
  }
}

export async function initDeviceIdentity(): Promise<{ deviceId: string; deviceName: string; staffName?: string }> {
  try {
    const electronAPI = (window as any)?.electronAPI;
    if (electronAPI?.getLanConfig) {
      const info = await electronAPI.getLanConfig();
      const dId = info?.config?.deviceId;
      const dName = info?.config?.deviceName;
      const sName = info?.config?.staffName;
      if (dId) {
        setLocalDeviceIdentity(dId, dName || 'Office PC', sName || '');
        return { deviceId: cachedDeviceId, deviceName: cachedDeviceName, staffName: cachedStaffName };
      }
    }
  } catch {
    // fallback to browser localStorage
  }

  try {
    let id = localStorage.getItem('eim_device_id') || '';
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `web-${crypto.randomUUID()}`
          : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('eim_device_id', id);
    }
    const name = localStorage.getItem('eim_device_name') || 'Office PC';
    const sName = localStorage.getItem('eim_staff_name') || '';
    cachedDeviceId = id;
    cachedDeviceName = name;
    cachedStaffName = sName;
  } catch {
    cachedDeviceId = cachedDeviceId || 'local-host-pc';
    cachedDeviceName = cachedDeviceName || 'Office PC';
    cachedStaffName = cachedStaffName || '';
  }
  return { deviceId: cachedDeviceId, deviceName: cachedDeviceName, staffName: cachedStaffName };
}

function getIdentityHeaders(): Record<string, string> {
  if (!cachedDeviceId) {
    try {
      cachedDeviceId = localStorage.getItem('eim_device_id') || '';
      cachedDeviceName = localStorage.getItem('eim_device_name') || '';
      cachedStaffName = localStorage.getItem('eim_staff_name') || '';
    } catch {
      // ignore
    }
  }
  const h: Record<string, string> = {};
  if (cachedDeviceId) h['X-EIM-Device-Id'] = cachedDeviceId;
  if (cachedDeviceName) h['X-EIM-Device-Name'] = cachedDeviceName;
  if (cachedStaffName) h['X-EIM-Staff-Name'] = cachedStaffName;
  if (sessionAdminPin) h['X-EIM-Admin-Pin'] = sessionAdminPin;
  return h;
}

async function requestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: getIdentityHeaders(),
    body: formData,
  });
  if (!res.ok) {
    let errMsg = `Upload failed with status ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.error) errMsg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  return res.json();
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getIdentityHeaders(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errMsg = `Request failed with status ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.error) errMsg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  // App Settings
  getAppSettings: () => request<AppSettings>('/settings'),
  updateAppSettings: (data: Partial<AppSettings>) =>
    request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  applySoftwareIcon: (software_icon: string | null) =>
    request<{
      success: boolean;
      software_icon: string | null;
      desktopUpdated: boolean;
      iconPath?: string;
      shortcutsUpdated: string[];
      message: string;
    }>('/settings/software-icon', { method: 'POST', body: JSON.stringify({ software_icon }) }),
  testDatabaseConnection: (data: any) =>
    request<{ success: boolean; message?: string }>('/settings/test-db', { method: 'POST', body: JSON.stringify(data) }),
  getNetworkInfo: () =>
    request<{ localIps: string[]; serverHost: string; serverPort: number }>('/network-info'),

  // Workstation Menu Permissions & MD Staff Oversight
  getMyWorkstationPermission: () =>
    request<{
      workstation: {
        device_id: string;
        device_name: string;
        role: 'ADMIN' | 'STAFF';
        is_admin: boolean;
        allowed_menus: string[];
        can_open_settings: boolean;
        last_ip?: string | null;
        last_seen_at: string;
      };
      has_admin_pin: boolean;
      has_custom_pin?: boolean;
      menu_catalog: { id: string; label: string; group: string }[];
      presets: Record<string, { label: string; is_admin: boolean; can_open_settings: boolean; allowed_menus: string[] }>;
    }>('/workstations/me'),
  getWorkstations: () =>
    request<{
      workstations: any[];
      default_staff_menus: string[];
      has_admin_pin: boolean;
      has_custom_pin?: boolean;
      menu_catalog: { id: string; label: string; group: string }[];
      presets: Record<string, { label: string; is_admin: boolean; can_open_settings: boolean; allowed_menus: string[] }>;
    }>('/workstations'),
  createStaffMember: (staff_name: string, allowed_menus: string[], can_open_settings?: boolean, admin_pin?: string) =>
    request<{ success: boolean; workstation: any }>('/workstations/staff', {
      method: 'POST',
      headers: admin_pin ? { 'X-EIM-Admin-Pin': admin_pin } : undefined,
      body: JSON.stringify({ staff_name, allowed_menus, can_open_settings, admin_pin }),
    }),
  updateWorkstationPermission: (
    deviceId: string,
    patch: { device_name?: string; is_admin?: boolean; allowed_menus?: string[]; can_open_settings?: boolean },
    admin_pin?: string
  ) =>
    request<{ success: boolean; workstation: any }>(`/workstations/${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: admin_pin ? { 'X-EIM-Admin-Pin': admin_pin } : undefined,
      body: JSON.stringify({ ...patch, admin_pin }),
    }),
  deleteWorkstation: (deviceId: string, admin_pin?: string) =>
    request<{ success: boolean }>(`/workstations/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      headers: admin_pin ? { 'X-EIM-Admin-Pin': admin_pin } : undefined,
      body: admin_pin ? JSON.stringify({ admin_pin }) : undefined,
    }),
  updateDefaultStaffMenus: (allowed_menus: string[], admin_pin?: string) =>
    request<{ success: boolean; default_staff_menus: string[] }>('/workstations/default-staff-menus', {
      method: 'PUT',
      headers: admin_pin ? { 'X-EIM-Admin-Pin': admin_pin } : undefined,
      body: JSON.stringify({ allowed_menus, admin_pin }),
    }),
  setAdminPin: (new_pin: string | null, current_pin?: string | null) =>
    request<{ success: boolean; has_admin_pin: boolean }>('/workstations/admin-pin', {
      method: 'POST',
      body: JSON.stringify({ new_pin, current_pin }),
    }),
  verifyAdminPin: (pin: string) =>
    request<{ valid: boolean }>('/workstations/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  getStaffActivityReport: (companyId: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (startDate) q.set('start_date', startDate);
    if (endDate) q.set('end_date', endDate);
    const qs = q.toString();
    return request<any[]>(`/companies/${companyId}/reports/staff-activity${qs ? `?${qs}` : ''}`);
  },
  resetAllData: () =>
    request<{ success: boolean; message: string }>('/reset-all-data', {
      method: 'POST',
      headers: { 'X-EIM-Confirm-Reset': 'CONFIRM_RESET_ALL_DATA' },
      body: JSON.stringify({ confirm: 'RESET_ALL_DATA' }),
    }),

  // Companies & Branches
  getCompanies: () => request<Company[]>('/companies'),
  getCompany: (id: string) => request<Company>(`/companies/${id}`),
  createCompany: (data: Partial<Company>) => request<Company>('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id: string, data: Partial<Company>) => request<Company>(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCompany: (id: string) => request<{ success: boolean }>(`/companies/${id}`, { method: 'DELETE' }),
  setDefaultCompany: (id: string) => request<{ success: boolean }>(`/companies/${id}/default`, { method: 'POST' }),

  getBranches: (companyId: string) => request<Branch[]>(`/companies/${companyId}/branches`),
  createBranch: (companyId: string, data: Partial<Branch>) =>
    request<Branch>(`/companies/${companyId}/branches`, { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (companyId: string, branchId: string, data: Partial<Branch>) =>
    request<Branch>(`/companies/${companyId}/branches/${branchId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBranch: (companyId: string, branchId: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/branches/${branchId}`, { method: 'DELETE' }),

  getCompanySettings: (companyId: string) => request<CompanySettings>(`/companies/${companyId}/settings`),
  updateCompanySettings: (companyId: string, data: Partial<CompanySettings>) =>
    request<CompanySettings>(`/companies/${companyId}/settings`, { method: 'PUT', body: JSON.stringify(data) }),

  // Customers & Suppliers
  getCustomers: (companyId: string, search?: string) =>
    request<Customer[]>(`/companies/${companyId}/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createCustomer: (companyId: string, data: Partial<Customer>) =>
    request<Customer>(`/companies/${companyId}/customers`, { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (companyId: string, id: string, data: Partial<Customer>) =>
    request<Customer>(`/companies/${companyId}/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/customers/${id}`, { method: 'DELETE' }),

  getSuppliers: (companyId: string, search?: string) =>
    request<Supplier[]>(`/companies/${companyId}/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createSupplier: (companyId: string, data: Partial<Supplier>) =>
    request<Supplier>(`/companies/${companyId}/suppliers`, { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (companyId: string, id: string, data: Partial<Supplier>) =>
    request<Supplier>(`/companies/${companyId}/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/suppliers/${id}`, { method: 'DELETE' }),

  // Products & Services
  getProducts: (companyId: string, params?: { item_type?: string; category_id?: string; search?: string }) => {
    const qs = new URLSearchParams(params as any).toString();
    return request<Product[]>(`/companies/${companyId}/products${qs ? `?${qs}` : ''}`);
  },
  createProduct: (companyId: string, data: Partial<Product>) =>
    request<Product>(`/companies/${companyId}/products`, { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (companyId: string, id: string, data: Partial<Product>) =>
    request<Product>(`/companies/${companyId}/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/products/${id}`, { method: 'DELETE' }),

  getCategories: (companyId: string) => request<Category[]>(`/companies/${companyId}/categories`),
  createCategory: (companyId: string, name: string, description?: string) =>
    request<Category>(`/companies/${companyId}/categories`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  deleteCategory: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/categories/${id}`, { method: 'DELETE' }),

  getUnits: (companyId: string) => request<Unit[]>(`/companies/${companyId}/units`),

  // Numbering Sequences
  getSequences: (companyId: string) => request<NumberingSequence[]>(`/companies/${companyId}/sequences`),
  updateSequence: (companyId: string, seqId: string, data: Partial<NumberingSequence>) =>
    request<NumberingSequence>(`/companies/${companyId}/sequences/${seqId}`, { method: 'PUT', body: JSON.stringify(data) }),
  previewNextNumber: (companyId: string, docType: string, branchId?: string) =>
    request<{ preview: string }>(`/companies/${companyId}/sequences/preview?document_type=${docType}${branchId ? `&branch_id=${branchId}` : ''}`),

  // Invoices
  getInvoices: (companyId: string, filters?: { document_type?: string; status?: string; search?: string }) => {
    const qs = new URLSearchParams(filters as any).toString();
    return request<Invoice[]>(`/companies/${companyId}/invoices${qs ? `?${qs}` : ''}`);
  },
  getInvoice: (companyId: string, id: string) => request<Invoice>(`/companies/${companyId}/invoices/${id}`),
  createInvoice: (companyId: string, data: any) =>
    request<Invoice>(`/companies/${companyId}/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  finalizeInvoice: (companyId: string, id: string) =>
    request<Invoice>(`/companies/${companyId}/invoices/${id}/finalize`, { method: 'POST' }),
  markInvoiceAsPaid: (
    companyId: string,
    id: string,
    data?: {
      amount?: string | number;
      payment_method?: string;
      payment_date?: string;
      reference_number?: string;
      notes?: string;
      close_remaining_balance?: boolean;
    }
  ) =>
    request<Invoice>(`/companies/${companyId}/invoices/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  closeInvoice: (
    companyId: string,
    id: string,
    data?: { reason?: string; notes?: string }
  ) =>
    request<Invoice>(`/companies/${companyId}/invoices/${id}/close`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  cancelInvoice: (companyId: string, id: string, reason: string) =>
    request<Invoice>(`/companies/${companyId}/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteInvoice: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/invoices/${id}`, { method: 'DELETE' }),
  getInvoicePdfUrl: (companyId: string, id: string, mode = 'DIGITAL_LETTERHEAD', templateId?: string) =>
    `${BASE_URL}/companies/${companyId}/invoices/${id}/pdf?mode=${mode}${templateId ? `&template_id=${encodeURIComponent(templateId)}` : ''}`,

  // Quotations
  getQuotations: (companyId: string, search?: string) =>
    request<Quotation[]>(`/companies/${companyId}/quotations${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createQuotation: (companyId: string, data: any) =>
    request<Quotation>(`/companies/${companyId}/quotations`, { method: 'POST', body: JSON.stringify(data) }),
  updateQuotationStatus: (companyId: string, id: string, status: string) =>
    request<Quotation>(`/companies/${companyId}/quotations/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  convertQuotationToInvoice: (companyId: string, id: string) =>
    request<Invoice>(`/companies/${companyId}/quotations/${id}/convert-to-invoice`, { method: 'POST' }),
  deleteQuotation: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/quotations/${id}`, { method: 'DELETE' }),
  getQuotationPdfUrl: (companyId: string, id: string, mode = 'DIGITAL_LETTERHEAD', templateId?: string) =>
    `${BASE_URL}/companies/${companyId}/quotations/${id}/pdf?mode=${mode}${templateId ? `&template_id=${encodeURIComponent(templateId)}` : ''}`,

  // Purchases
  getPurchaseOrders: (companyId: string) => request<PurchaseOrder[]>(`/companies/${companyId}/purchases/orders`),
  createPurchaseOrder: (companyId: string, data: any) =>
    request<PurchaseOrder>(`/companies/${companyId}/purchases/orders`, { method: 'POST', body: JSON.stringify(data) }),
  deletePurchaseOrder: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/purchases/orders/${id}`, { method: 'DELETE' }),
  getPurchaseInvoices: (companyId: string) => request<PurchaseInvoice[]>(`/companies/${companyId}/purchases/invoices`),
  createPurchaseInvoice: (companyId: string, data: any) =>
    request<PurchaseInvoice>(`/companies/${companyId}/purchases/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  finalizePurchaseInvoice: (companyId: string, id: string) =>
    request<PurchaseInvoice>(`/companies/${companyId}/purchases/invoices/${id}/finalize`, { method: 'POST' }),
  deletePurchaseInvoice: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/purchases/invoices/${id}`, { method: 'DELETE' }),

  // Inventory
  getWarehouses: (companyId: string) => request<Warehouse[]>(`/companies/${companyId}/inventory/warehouses`),
  createWarehouse: (companyId: string, data: Partial<Warehouse>) =>
    request<Warehouse>(`/companies/${companyId}/inventory/warehouses`, { method: 'POST', body: JSON.stringify(data) }),
  updateWarehouse: (companyId: string, warehouseId: string, data: Partial<Warehouse>) =>
    request<Warehouse>(`/companies/${companyId}/inventory/warehouses/${warehouseId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWarehouse: (companyId: string, warehouseId: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/inventory/warehouses/${warehouseId}`, { method: 'DELETE' }),
  getStockBalances: (companyId: string, warehouseId?: string) =>
    request<StockBalance[]>(`/companies/${companyId}/inventory/balances${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`),
  getInventoryTransactions: (companyId: string, productId?: string) =>
    request<InventoryTransaction[]>(`/companies/${companyId}/inventory/transactions${productId ? `?product_id=${productId}` : ''}`),
  recordStockAdjustment: (companyId: string, data: any) =>
    request<{ success: boolean }>(`/companies/${companyId}/inventory/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  transferStock: (companyId: string, data: { product_id: string; from_warehouse_id: string; to_warehouse_id: string; quantity: number; notes?: string }) =>
    request<{ success: boolean }>(`/companies/${companyId}/inventory/transfer`, { method: 'POST', body: JSON.stringify(data) }),

  // Payments
  getCustomerPayments: (companyId: string) => request<CustomerPayment[]>(`/companies/${companyId}/payments/customer`),
  recordCustomerPayment: (companyId: string, data: any) =>
    request<CustomerPayment>(`/companies/${companyId}/payments/customer`, { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomerPayment: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/payments/customer/${id}`, { method: 'DELETE' }),
  getSupplierPayments: (companyId: string) => request<SupplierPayment[]>(`/companies/${companyId}/payments/supplier`),
  recordSupplierPayment: (companyId: string, data: any) =>
    request<SupplierPayment>(`/companies/${companyId}/payments/supplier`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSupplierPayment: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/payments/supplier/${id}`, { method: 'DELETE' }),

  // Reports
  getDashboardMetrics: (companyId: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const qs = params.toString();
    return request<any>(`/companies/${companyId}/reports/dashboard${qs ? `?${qs}` : ''}`);
  },
  getGstSalesReport: (companyId: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const qs = params.toString();
    return request<any>(`/companies/${companyId}/reports/gst-sales${qs ? `?${qs}` : ''}`);
  },

  // Letterheads
  getLetterheads: (companyId: string) => request<LetterheadTemplate[]>(`/companies/${companyId}/letterheads`),
  createLetterhead: (companyId: string, data: any) =>
    request<LetterheadTemplate>(`/companies/${companyId}/letterheads`, { method: 'POST', body: JSON.stringify(data) }),
  updateLetterhead: (companyId: string, id: string, data: any) =>
    request<LetterheadTemplate>(`/companies/${companyId}/letterheads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLetterhead: (companyId: string, id: string) =>
    request<{ success: boolean }>(`/companies/${companyId}/letterheads/${id}`, { method: 'DELETE' }),
  analyzeLetterheadPath: (companyId: string, filePath: string) =>
    request<LetterheadOCRResult>(`/companies/${companyId}/letterheads/analyze`, {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    }),
  analyzeLetterheadFile: (companyId: string, formData: FormData) =>
    requestFormData<LetterheadOCRResult & { suggested_name?: string }>(
      `/companies/${companyId}/letterheads/analyze-file`,
      formData
    ),
  importLetterhead: (companyId: string, formData: FormData) =>
    requestFormData<{ template: LetterheadTemplate; analysis: LetterheadOCRResult }>(
      `/companies/${companyId}/letterheads/import`,
      formData
    ),
  getLetterheadFileUrl: (companyId: string, templateId: string) =>
    `${BASE_URL}/companies/${companyId}/letterheads/${templateId}/file`,

  // Export & Import URLs
  getCustomersExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/customers`,
  getProductsExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/products`,
  getSuppliersExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/suppliers`,
  getPurchasesExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/purchases`,
  getInventoryExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/inventory`,
  getPaymentsReceivableExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/payments-receivable`,
  getPaymentsToSuppliersExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/payments-suppliers`,
  getCustomerImportTemplateUrl: () => `${BASE_URL}/export/template/customers`,
  getImportTemplateUrl: (category: string) => `${BASE_URL}/export/template/${category}`,
  importExcelData: (companyId: string, category: string, formData: FormData) =>
    requestFormData<{
      category: string;
      imported: number;
      updated: number;
      skipped: number;
      extraColumnsCaptured: string[];
      errors: string[];
    }>(`/companies/${companyId}/import/${category}`, formData),

  // Backup & Restore (strictly isolated per company)
  getBackups: (companyId?: string) =>
    request<any[]>(`/backups${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  createBackup: (companyId?: string) =>
    request<any>('/backups', {
      method: 'POST',
      body: JSON.stringify(companyId ? { companyId } : {}),
    }),
  inspectBackup: (filename: string, companyId?: string) =>
    request<{ companies: any[] }>(
      `/backups/${encodeURIComponent(filename)}/inspect${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`
    ),
  inspectUploadedBackup: (formData: FormData) =>
    requestFormData<{ companies: any[] }>('/backups/inspect-upload', formData),
  restoreBackup: (
    filename: string,
    options?: { mode?: 'INTO_COMPANY' | 'FULL_REPLACE'; targetCompanyId?: string; sourceCompanyId?: string }
  ) =>
    request<any>('/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ filename, ...options }),
    }),
  getBackupDownloadUrl: (filename: string, companyId?: string) =>
    `${BASE_URL}/backups/${encodeURIComponent(filename)}/download${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`,
  uploadRestoreBackup: (formData: FormData) => requestFormData<any>('/backups/upload-restore', formData),
};
