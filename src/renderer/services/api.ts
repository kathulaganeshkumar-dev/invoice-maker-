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

async function requestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
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
  testDatabaseConnection: (data: any) =>
    request<{ success: boolean; message?: string }>('/settings/test-db', { method: 'POST', body: JSON.stringify(data) }),

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

  // Export & Download URLs
  getCustomersExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/customers`,
  getProductsExportUrl: (companyId: string) => `${BASE_URL}/companies/${companyId}/export/products`,
  getCustomerImportTemplateUrl: () => `${BASE_URL}/export/template/customers`,

  // Backup & Restore
  getBackups: () => request<any[]>('/backups'),
  createBackup: () => request<any>('/backups', { method: 'POST' }),
  restoreBackup: (filename: string) => request<any>('/backups/restore', { method: 'POST', body: JSON.stringify({ filename }) }),
};
