// scratch/test-endpoints.js
const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4200,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resData);
          resolve({ status: res.status, ok: res.statusCode >= 200 && res.statusCode < 300, data: parsed, statusCode: res.statusCode });
        } catch (e) {
          resolve({ status: res.statusCode, ok: false, raw: resData });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:4200${path}`, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resData);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: parsed, statusCode: res.statusCode });
        } catch (e) {
          resolve({ ok: false, raw: resData, statusCode: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- Fetching Companies ---');
  const comps = await get('/api/companies');
  console.log('Companies count:', comps.data?.length);
  const comp = comps.data[0];
  const compId = comp.id;
  console.log('Using Company:', comp.name, compId);

  console.log('\n--- 1. Testing Customer Creation ---');
  const custRes = await post(`/api/companies/${compId}/customers`, {
    name: 'Test Customer Pvt Ltd',
    entity_type: 'COMPANY',
    contact_person: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul@test.com',
    gstin: '27AABCV1234F1Z5',
    pan: 'AABCV1234F',
    billing_address: 'Andheri East, Mumbai',
    city: 'Mumbai',
    state: 'Maharashtra',
    state_code: '27',
    pin_code: '400069',
  });
  console.log('Customer result:', custRes);

  console.log('\n--- 2. Testing Product Creation ---');
  const prodRes = await post(`/api/companies/${compId}/products`, {
    name: 'Industrial Valve 2-inch',
    item_type: 'PRODUCT',
    sku: 'VALVE-002',
    hsn_code: '84818090',
    gst_rate: 18,
    purchase_price: 1200,
    selling_price: 1800,
    unit: 'PCS',
  });
  console.log('Product result:', prodRes);

  console.log('\n--- 3. Testing Invoice Creation ---');
  const invRes = await post(`/api/companies/${compId}/invoices`, {
    document_type: 'TAX_INVOICE',
    customer_id: custRes.data?.id,
    customer_name: 'Test Customer Pvt Ltd',
    customer_gstin: '27AABCV1234F1Z5',
    place_of_supply_state_code: '27',
    place_of_supply_state_name: 'Maharashtra',
    billing_address: 'Andheri East, Mumbai',
    items: [
      {
        product_id: prodRes.data?.id,
        item_name: 'Industrial Valve 2-inch',
        description: 'High quality industrial valve',
        hsn_code: '84818090',
        quantity: 2,
        unit: 'PCS',
        unit_price: 1800,
        discount_percentage: 0,
        gst_rate: 18,
        is_tax_inclusive: false,
      }
    ]
  });
  console.log('Invoice result:', invRes);

  console.log('\n--- 4. Testing Quotation Creation ---');
  const quoteRes = await post(`/api/companies/${compId}/quotations`, {
    customer_id: custRes.data?.id,
    customer_name: 'Test Customer Pvt Ltd',
    items: [
      {
        product_id: prodRes.data?.id,
        item_name: 'Industrial Valve 2-inch',
        quantity: 5,
        unit: 'PCS',
        unit_price: 1750,
        gst_rate: 18,
      }
    ]
  });
  console.log('Quotation result:', quoteRes);

  console.log('\n--- 5. Testing Supplier Creation ---');
  const suppRes = await post(`/api/companies/${compId}/suppliers`, {
    name: 'Metal Supplies Ltd',
    contact_person: 'Anil Gupta',
    phone: '9811122233',
    gstin: '23AABCM9876K1Z1',
  });
  console.log('Supplier result:', suppRes);
}

run().catch(console.error);
