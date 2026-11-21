// tests/lan_data_transfer.test.ts - Automated Verification of LAN Connection Mode and Multi-PC Data Transfer
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { startServer, stopServer } from '../src/server/index';

const TEST_PORT = 4299;
const HOST_BASE = `http://127.0.0.1:${TEST_PORT}`;

function makeHttpRequest(
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      `${HOST_BASE}${urlPath}`,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('LAN Connection Mode & Real-time Data Transfer Verification', () => {
  let tempDir: string;
  let testCompanyId: string;
  let defaultBranchId: string;

  beforeAll(async () => {
    // 1. Isolate test database in temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-lan-test-'));
    process.env.APP_DATA_DIR = tempDir;
    process.env.SERVER_HOST = '0.0.0.0'; // Bound to all network interfaces like Main Office PC

    // 2. Start embedded server in LAN Host mode on TEST_PORT
    await startServer(TEST_PORT);
  });

  afterAll(async () => {
    await stopServer();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it('1. Verifies LAN Host service is running and health probe succeeds', async () => {
    const res = await makeHttpRequest('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('2. Verifies network-info endpoint reports serverHost and available LAN IP addresses', async () => {
    const res = await makeHttpRequest('GET', '/api/network-info');
    expect(res.status).toBe(200);
    expect(res.body.serverHost).toBe('0.0.0.0');
    expect(res.body.serverPort).toBe(TEST_PORT);
    expect(Array.isArray(res.body.localIps)).toBe(true);
  });

  it('3. Host PC (MD Admin) creates a company and configures a Staff Member with permissions', async () => {
    // Create company from Host
    const companyRes = await makeHttpRequest(
      'POST',
      '/api/companies',
      {
        name: 'Apex Global Traders',
        legal_name: 'Apex Global Traders Private Limited',
        registered_address: '101 Cyber City, Gurugram',
        state: 'Haryana',
        state_code: '06',
        pin_code: '122002',
        phone: '+91 98111 22334',
        email: 'accounts@apexglobal.example',
      },
      {
        'x-eim-device-id': 'pc-host-main',
        'x-eim-device-name': 'Main Office Host PC',
        'x-eim-admin-pin': '1234',
      }
    );
    expect(companyRes.status).toBe(201);
    testCompanyId = companyRes.body.id;

    // Retrieve default branch
    const branchRes = await makeHttpRequest('GET', `/api/companies/${testCompanyId}/branches`);
    expect(branchRes.status).toBe(200);
    expect(branchRes.body.length).toBeGreaterThan(0);
    defaultBranchId = branchRes.body[0].id;

    // Create staff member "Priya Billing" with restricted menus (Invoices & Customers only, NO Reports or Settings)
    const staffRes = await makeHttpRequest(
      'POST',
      '/api/workstations/staff',
      {
        staff_name: 'Priya Billing',
        allowed_menus: ['invoices', 'quotations', 'customers', 'products'],
        can_open_settings: false,
      },
      {
        'x-eim-device-id': 'pc-host-main',
        'x-eim-device-name': 'Main Office Host PC',
        'x-eim-admin-pin': '1234',
      }
    );
    expect(staffRes.status).toBe(201);
    expect(staffRes.body.success).toBe(true);
    expect(staffRes.body.workstation.staff_name).toBe('Priya Billing');
  });

  it('4. Client Computer 2 connects as "Priya Billing" and accesses the system', async () => {
    // Client 2 sends initial registration / touch
    const clientRes = await makeHttpRequest(
      'GET',
      '/api/workstations/me',
      null,
      {
        'x-eim-device-id': 'pc-staff-laptop-02',
        'x-eim-device-name': 'Billing Desk Laptop',
        'x-eim-staff-name': 'Priya Billing',
      }
    );
    expect(clientRes.status).toBe(200);
    expect(clientRes.body.workstation).toBeDefined();
    // Priya Billing should inherit the assigned permissions
    expect(clientRes.body.workstation.allowed_menus).toContain('invoices');
    expect(clientRes.body.workstation.allowed_menus).toContain('customers');
    expect(clientRes.body.workstation.allowed_menus).not.toContain('reports');
  });

  it('5. Client Computer 2 creates a Customer over the LAN network', async () => {
    const custRes = await makeHttpRequest(
      'POST',
      `/api/companies/${testCompanyId}/customers`,
      {
        name: 'Zenith Logistics Ltd',
        company_name: 'Zenith Logistics Limited',
        contact_person: 'Vikram Mehta',
        mobile: '+91 99887 76655',
        email: 'vikram@zenithlogistics.example',
        billing_address: 'Sector 18, Commercial Belt, Noida',
        city: 'Noida',
        state: 'Uttar Pradesh',
        state_code: '09',
        pin_code: '201301',
        gstin: '09AAACZ1234M1Z2',
      },
      {
        'x-eim-device-id': 'pc-staff-laptop-02',
        'x-eim-device-name': 'Billing Desk Laptop',
        'x-eim-staff-name': 'Priya Billing',
      }
    );
    expect(custRes.status).toBe(201);
    expect(custRes.body.id).toBeDefined();
    expect(custRes.body.name).toBe('Zenith Logistics Ltd');

    // Host PC immediately verifies the Customer is in the shared database
    const verifyCust = await makeHttpRequest(
      'GET',
      `/api/companies/${testCompanyId}/customers?search=Zenith`,
      null,
      {
        'x-eim-device-id': 'pc-host-main',
        'x-eim-device-name': 'Main Office Host PC',
      }
    );
    expect(verifyCust.status).toBe(200);
    expect(Array.isArray(verifyCust.body)).toBe(true);
    expect(verifyCust.body.length).toBeGreaterThan(0);
    expect(verifyCust.body[0].name).toBe('Zenith Logistics Ltd');
    expect(verifyCust.body[0].gstin).toBe('09AAACZ1234M1Z2');
  });

  it('6. Client Computer 2 creates an Invoice over the LAN network and Host PC verifies instant synchronization', async () => {
    // 1. Create a Product first
    const prodRes = await makeHttpRequest(
      'POST',
      `/api/companies/${testCompanyId}/products`,
      {
        name: 'Managed Switch 24G',
        unit: 'NOS',
        hsn_or_sac: '85176290',
        selling_price: '18500.00',
        purchase_price: '14000.00',
        current_stock: '50.00',
      },
      {
        'x-eim-device-id': 'pc-staff-laptop-02',
        'x-eim-device-name': 'Billing Desk Laptop',
        'x-eim-staff-name': 'Priya Billing',
      }
    );
    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.id;

    // 2. Fetch Customers to get the Customer ID
    const custListRes = await makeHttpRequest('GET', `/api/companies/${testCompanyId}/customers`);
    expect(custListRes.status).toBe(200);
    const customer = custListRes.body[0];

    // 3. Client Computer 2 creates an Invoice
    const invoicePayload = {
      branch_id: defaultBranchId,
      document_type: 'TAX_INVOICE',
      customer_id: customer.id,
      customer_name: customer.name,
      customer_gstin: customer.gstin,
      billing_address: customer.billing_address,
      place_of_supply_state: customer.state,
      place_of_supply_code: customer.state_code,
      invoice_date: '2026-11-21',
      items: [
        {
          item_id: productId,
          item_type: 'PRODUCT',
          item_name: 'Managed Switch 24G',
          quantity: 2,
          rate: '18500.00',
          gst_rate: 18,
          hsn_or_sac: '85176290',
        },
      ],
    };

    const invRes = await makeHttpRequest(
      'POST',
      `/api/companies/${testCompanyId}/invoices`,
      invoicePayload,
      {
        'x-eim-device-id': 'pc-staff-laptop-02',
        'x-eim-device-name': 'Billing Desk Laptop',
        'x-eim-staff-name': 'Priya Billing',
      }
    );
    expect(invRes.status).toBe(201);
    expect(invRes.body.id).toBeDefined();
    expect(invRes.body.invoice_number).toBeDefined();
    // 2 * 18,500 = 37,000 + 18% IGST (6,660) = 43,660.00
    expect(invRes.body.grand_total).toBe('43660.00');
    expect(invRes.body.created_by_device_id).toBe('pc-staff-laptop-02');
    expect(invRes.body.created_by_device_name).toBe('Priya Billing');

    // 4. Host PC immediately inspects the shared database - verifies exact match & origin
    const hostQuery = await makeHttpRequest(
      'GET',
      `/api/companies/${testCompanyId}/invoices/${invRes.body.id}`,
      null,
      {
        'x-eim-device-id': 'pc-host-main',
        'x-eim-device-name': 'Main Office Host PC',
      }
    );
    expect(hostQuery.status).toBe(200);
    expect(hostQuery.body.invoice_number).toBe(invRes.body.invoice_number);
    expect(hostQuery.body.grand_total).toBe('43660.00');
    expect(hostQuery.body.created_by_device_id).toBe('pc-staff-laptop-02');
    expect(hostQuery.body.created_by_device_name).toBe('Priya Billing');
  });

  it('7. Verifies Staff Activity report on Host PC accurately tracks Client 2 activity', async () => {
    const activityRes = await makeHttpRequest(
      'GET',
      `/api/companies/${testCompanyId}/reports/staff-activity`,
      null,
      {
        'x-eim-device-id': 'pc-host-main',
        'x-eim-device-name': 'Main Office Host PC',
        'x-eim-admin-pin': '1234',
      }
    );
    expect(activityRes.status).toBe(200);
    const activityList = activityRes.body;
    expect(Array.isArray(activityList)).toBe(true);

    const priyaActivity = activityList.find(
      (a: any) => a.device_id === 'pc-staff-laptop-02' || a.device_name === 'Priya Billing'
    );
    expect(priyaActivity).toBeDefined();
    expect(Number(priyaActivity.invoices_count)).toBe(1);
    expect(parseFloat(priyaActivity.invoices_total)).toBe(43660.0);
  });
});
