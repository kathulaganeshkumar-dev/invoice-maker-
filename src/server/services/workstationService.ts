// src/server/services/workstationService.ts - Per-PC Menu Permissions, MD Admin PIN & Staff Activity Analytics
import crypto from 'crypto';
import Decimal from 'decimal.js';
import { Knex } from 'knex';

export const ALL_MENU_IDS = [
  'dashboard',
  'invoices',
  'invoices_other',
  'quotations',
  'customers',
  'suppliers',
  'products',
  'purchases',
  'inventory',
  'payments',
  'letterheads',
  'reports',
  'work_summary',
  'import_export',
  'backup_restore',
] as const;

export type MenuId = (typeof ALL_MENU_IDS)[number];

export const MENU_CATALOG: { id: MenuId; label: string; group: 'Insights' | 'Operations' | 'Administration' }[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Insights' },
  { id: 'reports', label: 'Reports & GST', group: 'Insights' },
  { id: 'work_summary', label: 'Work Summary', group: 'Insights' },
  { id: 'invoices', label: 'Invoices (Sales)', group: 'Operations' },
  { id: 'invoices_other', label: 'Invoices (Other)', group: 'Operations' },
  { id: 'quotations', label: 'Quotations', group: 'Operations' },
  { id: 'customers', label: 'Customers', group: 'Operations' },
  { id: 'suppliers', label: 'Suppliers', group: 'Operations' },
  { id: 'products', label: 'Products & Services', group: 'Operations' },
  { id: 'purchases', label: 'Purchases', group: 'Operations' },
  { id: 'inventory', label: 'Inventory & Stock', group: 'Operations' },
  { id: 'payments', label: 'Payments (AR/AP)', group: 'Operations' },
  { id: 'letterheads', label: 'Print Templates', group: 'Administration' },
  { id: 'import_export', label: 'Excel Import/Export', group: 'Administration' },
  { id: 'backup_restore', label: 'Backup & Restore', group: 'Administration' },
];

export const DEFAULT_STAFF_MENUS: MenuId[] = [
  ...ALL_MENU_IDS,
];

export const PRESET_PERMISSIONS = {
  MD_FULL_ADMIN: {
    label: 'Owner / Full Admin (All Access)',
    is_admin: true,
    can_open_settings: true,
    allowed_menus: [...ALL_MENU_IDS],
  },
  MANAGER_PARTNER: {
    label: 'Manager / Partner (Operations + Reports)',
    is_admin: false,
    can_open_settings: true,
    allowed_menus: [
      'dashboard',
      'reports',
      'work_summary',
      'invoices',
      'invoices_other',
      'quotations',
      'customers',
      'suppliers',
      'products',
      'purchases',
      'inventory',
      'payments',
    ] as MenuId[],
  },
  BILLING_STAFF: {
    label: 'Billing Staff (Sales & Quotations)',
    is_admin: false,
    can_open_settings: true,
    allowed_menus: ['invoices', 'invoices_other', 'quotations', 'customers', 'products'] as MenuId[],
  },
  ACCOUNTS_STAFF: {
    label: 'Accounts & Inventory Staff',
    is_admin: false,
    can_open_settings: true,
    allowed_menus: [...DEFAULT_STAFF_MENUS],
  },
  INVENTORY_WAREHOUSE: {
    label: 'Warehouse & Stock Staff',
    is_admin: false,
    can_open_settings: true,
    allowed_menus: ['products', 'purchases', 'inventory'] as MenuId[],
  },
  VIEW_ONLY_AUDIT: {
    label: 'Audit / View Only (Dashboard & Reports)',
    is_admin: false,
    can_open_settings: true,
    allowed_menus: ['dashboard', 'reports', 'work_summary'] as MenuId[],
  },
};

export interface WorkstationPermission {
  device_id: string;
  device_name: string;
  staff_name?: string | null;
  role: 'ADMIN' | 'STAFF';
  is_admin: boolean;
  allowed_menus: MenuId[];
  can_open_settings: boolean;
  last_ip?: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface StaffActivityRow {
  device_id: string;
  device_name: string;
  invoices_count: number;
  invoices_total: string;
  quotations_count: number;
  quotations_total: string;
  purchases_count: number;
  purchases_total: string;
  customer_payments_count: number;
  customer_payments_total: string;
  supplier_payments_count: number;
  supplier_payments_total: string;
  total_documents: number;
}

const VALID_MENU_SET = new Set<string>(ALL_MENU_IDS);

export function sanitizeMenuList(menus: unknown): MenuId[] {
  if (!Array.isArray(menus)) return [...ALL_MENU_IDS];
  const filtered = menus.filter((m): m is MenuId => typeof m === 'string' && VALID_MENU_SET.has(m));
  return Array.from(new Set(filtered));
}

export function hashAdminPin(pin: string): string {
  const clean = String(pin || '').trim();
  if (!/^\d{4}$/.test(clean)) {
    throw new Error('MD / Admin PIN must be exactly 4 numeric digits (0-9).');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyAdminPin(pin: string, storedHash?: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const clean = String(pin || '').trim();
  if (!/^\d{4}$/.test(clean)) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(clean, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sanitizeDeviceId(raw?: string | null): string {
  const clean = String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
  return clean;
}

export function sanitizeDeviceName(raw?: string | null, fallback = 'Office PC'): string {
  const clean = String(raw || '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, 64);
  return clean || fallback;
}

export class WorkstationService {
  constructor(private db: Knex) {}

  private hydrate(row: any): WorkstationPermission {
    let menus: MenuId[] = [...ALL_MENU_IDS];
    try {
      const parsed = JSON.parse(row.allowed_menus_json || '[]');
      menus = sanitizeMenuList(parsed);
    } catch {
      menus = [...ALL_MENU_IDS];
    }
    const isAdmin = Boolean(row.is_admin);
    return {
      device_id: row.device_id,
      device_name: row.device_name,
      staff_name: row.staff_name || row.device_name,
      role: isAdmin ? 'ADMIN' : 'STAFF',
      is_admin: isAdmin,
      allowed_menus: isAdmin ? [...ALL_MENU_IDS] : menus,
      can_open_settings: isAdmin ? true : Boolean(row.can_open_settings),
      last_ip: row.last_ip || null,
      last_seen_at: row.last_seen_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async hasAdminPin(): Promise<boolean> {
    return true; // 4-digit PIN is always active (default: '1234')
  }

  async isCustomAdminPinSet(): Promise<boolean> {
    const settings = await this.db('app_settings').first();
    return Boolean(settings?.admin_pin_hash);
  }

  async checkAdminPin(pin?: string | null): Promise<boolean> {
    const clean = String(pin || '').trim();
    if (!/^\d{4}$/.test(clean)) return false;
    const settings = await this.db('app_settings').first();
    if (!settings?.admin_pin_hash) {
      // Default 4-digit PIN is '1234' until customized by MD
      return clean === '1234';
    }
    return verifyAdminPin(clean, settings.admin_pin_hash);
  }

  async setAdminPin(newPin: string | null, currentPin?: string | null): Promise<{ has_admin_pin: boolean }> {
    const cleanNew = String(newPin || '').trim();
    if (!/^\d{4}$/.test(cleanNew)) {
      throw new Error('MD / Admin PIN must be exactly 4 numeric digits (0-9).');
    }
    const settings = await this.db('app_settings').first();
    if (settings?.admin_pin_hash) {
      if (!currentPin || !verifyAdminPin(currentPin, settings.admin_pin_hash)) {
        throw new Error('Current 4-digit MD / Admin PIN is incorrect.');
      }
    } else {
      const cleanCur = String(currentPin || '').trim();
      if (cleanCur && cleanCur !== '1234') {
        throw new Error('Current 4-digit PIN is incorrect (default PIN is 1234).');
      }
    }

    const nextHash = hashAdminPin(cleanNew);
    const now = new Date().toISOString();

    if (settings) {
      await this.db('app_settings').where({ id: settings.id }).update({
        admin_pin_hash: nextHash,
        updated_at: now,
      });
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await this.db('app_settings').insert({
        id: uuidv4(),
        operating_mode: 'LOCAL_NETWORK_SERVER',
        db_type: 'sqlite',
        server_port: 4200,
        show_company_selector_on_startup: true,
        theme: 'light',
        admin_pin_hash: nextHash,
        created_at: now,
        updated_at: now,
      });
    }
    return { has_admin_pin: true };
  }

  async getDefaultStaffMenus(): Promise<MenuId[]> {
    const settings = await this.db('app_settings').first();
    if (settings?.default_staff_menus_json) {
      try {
        return sanitizeMenuList(JSON.parse(settings.default_staff_menus_json));
      } catch {
        // fallback below
      }
    }
    return [...DEFAULT_STAFF_MENUS];
  }

  async setDefaultStaffMenus(menus: MenuId[]): Promise<MenuId[]> {
    const clean = sanitizeMenuList(menus);
    const now = new Date().toISOString();
    const settings = await this.db('app_settings').first();
    if (settings) {
      await this.db('app_settings').where({ id: settings.id }).update({
        default_staff_menus_json: JSON.stringify(clean),
        updated_at: now,
      });
    }
    return clean;
  }

  async createStaffMember(
    staffName: string,
    allowedMenus?: MenuId[],
    canOpenSettings = true,
    isAdmin = false
  ): Promise<WorkstationPermission> {
    const rawNames = String(staffName || '')
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawNames.length === 0) {
      throw new Error('Please enter at least one staff member name.');
    }

    if (rawNames.length > 1) {
      let lastCreated: WorkstationPermission | null = null;
      for (const singleName of rawNames) {
        lastCreated = await this._createSingleStaff(singleName, allowedMenus, canOpenSettings, isAdmin);
      }
      return lastCreated!;
    }

    return this._createSingleStaff(rawNames[0], allowedMenus, canOpenSettings, isAdmin);
  }

  async createStaffMembersBatch(
    staffList: Array<{
      staff_name: string;
      allowed_menus?: MenuId[];
      can_open_settings?: boolean;
      is_admin?: boolean;
    }>
  ): Promise<WorkstationPermission[]> {
    const results: WorkstationPermission[] = [];
    for (const item of staffList) {
      const clean = String(item.staff_name || '').trim();
      if (!clean) continue;
      const splitNames = clean.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
      for (const singleName of splitNames) {
        const created = await this._createSingleStaff(
          singleName,
          item.allowed_menus,
          item.can_open_settings ?? true,
          item.is_admin ?? false
        );
        results.push(created);
      }
    }
    return results;
  }

  private async _createSingleStaff(
    staffName: string,
    allowedMenus?: MenuId[],
    canOpenSettings = true,
    isAdmin = false
  ): Promise<WorkstationPermission> {
    const cleanName = sanitizeDeviceName(staffName, '').trim();
    if (!cleanName) {
      throw new Error('Please enter a staff member name.');
    }
    const now = new Date().toISOString();
    const defaultMenus = await this.getDefaultStaffMenus();
    const cleanMenus = isAdmin
      ? [...ALL_MENU_IDS]
      : allowedMenus && Array.isArray(allowedMenus) && allowedMenus.length > 0
      ? sanitizeMenuList(allowedMenus)
      : defaultMenus;

    // Check if staff member with this name already exists (case-insensitive)
    const existing = await this.db('workstation_permissions')
      .whereRaw('LOWER(TRIM(device_name)) = LOWER(TRIM(?))', [cleanName])
      .first();

    if (existing) {
      await this.db('workstation_permissions')
        .where({ device_id: existing.device_id })
        .update({
          device_name: cleanName,
          staff_name: cleanName,
          role: isAdmin ? 'ADMIN' : 'STAFF',
          is_admin: Boolean(isAdmin),
          allowed_menus_json: JSON.stringify(cleanMenus),
          can_open_settings: isAdmin ? true : Boolean(canOpenSettings),
          updated_at: now,
        });
      const updated = await this.db('workstation_permissions').where({ device_id: existing.device_id }).first();
      return this.hydrate(updated);
    }

    const safeSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 24);
    const deviceId = `staff-${safeSlug || 'pc'}-${crypto.randomBytes(4).toString('hex')}`;
    const row = {
      device_id: deviceId,
      device_name: cleanName,
      staff_name: cleanName,
      role: isAdmin ? 'ADMIN' : 'STAFF',
      is_admin: Boolean(isAdmin),
      allowed_menus_json: JSON.stringify(cleanMenus),
      can_open_settings: isAdmin ? true : Boolean(canOpenSettings),
      last_ip: null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };
    await this.db('workstation_permissions').insert(row);
    return this.hydrate(row);
  }

  async registerOrTouchWorkstation(
    rawDeviceId: string,
    rawDeviceName: string | undefined,
    remoteIp: string | undefined,
    isLoopback: boolean,
    rawStaffName?: string | undefined
  ): Promise<WorkstationPermission> {
    const cleanStaffName = rawStaffName ? sanitizeDeviceName(rawStaffName, '').trim() : '';
    const now = new Date().toISOString();

    // 1. If staff name is provided by the client, match by staff name first
    if (cleanStaffName) {
      const matchByName = await this.db('workstation_permissions')
        .whereRaw('LOWER(TRIM(device_name)) = LOWER(TRIM(?))', [cleanStaffName])
        .first();

      if (matchByName) {
        await this.db('workstation_permissions')
          .where({ device_id: matchByName.device_id })
          .update({
            last_ip: remoteIp || matchByName.last_ip,
            last_seen_at: now,
          });
        const updated = await this.db('workstation_permissions').where({ device_id: matchByName.device_id }).first();
        return this.hydrate(updated);
      }

      // If staff name was not yet created on Host, auto-create it with default staff menus
      const defaultStaffMenus = await this.getDefaultStaffMenus();
      const safeSlug = cleanStaffName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 24);
      const newId = `staff-${safeSlug || 'pc'}-${crypto.randomBytes(4).toString('hex')}`;
      const newStaffRow = {
        device_id: newId,
        device_name: cleanStaffName,
        staff_name: cleanStaffName,
        role: 'STAFF',
        is_admin: false,
        allowed_menus_json: JSON.stringify(defaultStaffMenus),
        can_open_settings: true,
        last_ip: remoteIp || null,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      };
      try {
        await this.db('workstation_permissions').insert(newStaffRow);
        return this.hydrate(newStaffRow);
      } catch (insertErr: any) {
        const raceExisting = await this.db('workstation_permissions').where({ device_id: newStaffRow.device_id }).first();
        if (raceExisting) {
          return this.hydrate(raceExisting);
        }
        throw insertErr;
      }
    }

    // 2. Loopback Host PC is ALWAYS Server Admin if no staff name provided
    if (isLoopback && !cleanStaffName) {
      return {
        device_id: sanitizeDeviceId(rawDeviceId) || 'local-host-pc',
        device_name: sanitizeDeviceName(rawDeviceName, 'Office Server'),
        staff_name: null,
        role: 'ADMIN',
        is_admin: true,
        allowed_menus: [...ALL_MENU_IDS],
        can_open_settings: true,
        last_ip: remoteIp || '127.0.0.1',
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      };
    }

    // 3. Otherwise match remote LAN PC by device_id
    const deviceId = sanitizeDeviceId(rawDeviceId) || 'unknown-lan-pc';
    const existing = await this.db('workstation_permissions').where({ device_id: deviceId }).first();

    if (existing) {
      const nextName = rawDeviceName ? sanitizeDeviceName(rawDeviceName, existing.device_name) : existing.device_name;
      await this.db('workstation_permissions')
        .where({ device_id: deviceId })
        .update({
          device_name: nextName,
          last_ip: remoteIp || existing.last_ip,
          last_seen_at: now,
        });
      const updated = await this.db('workstation_permissions').where({ device_id: deviceId }).first();
      return this.hydrate(updated);
    }

    const defaultStaffMenus = await this.getDefaultStaffMenus();
    const isAdmin = false;
    const allowedMenus: MenuId[] = defaultStaffMenus;
    const deviceName = sanitizeDeviceName(rawDeviceName, `Staff PC (${remoteIp || 'LAN'})`);

    const row = {
      device_id: deviceId,
      device_name: deviceName,
      staff_name: deviceName,
      role: 'STAFF',
      is_admin: false,
      allowed_menus_json: JSON.stringify(allowedMenus),
      can_open_settings: true,
      last_ip: remoteIp || null,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db('workstation_permissions').insert(row);
      return this.hydrate(row);
    } catch (insertErr: any) {
      const raceExisting = await this.db('workstation_permissions').where({ device_id: deviceId }).first();
      if (raceExisting) {
        return this.hydrate(raceExisting);
      }
      throw insertErr;
    }
  }

  async getWorkstationPermission(deviceId: string): Promise<WorkstationPermission | null> {
    const cleanId = sanitizeDeviceId(deviceId);
    if (!cleanId) return null;
    const row = await this.db('workstation_permissions').where({ device_id: cleanId }).first();
    return row ? this.hydrate(row) : null;
  }

  async listWorkstations(options?: { staffOnly?: boolean }): Promise<WorkstationPermission[]> {
    let query = this.db('workstation_permissions').orderBy('last_seen_at', 'desc');
    if (options?.staffOnly === true) {
      query = query.where({ is_admin: false }).andWhereNot({ role: 'ADMIN' });
    }
    const rows = await query;
    return rows.map((r: any) => this.hydrate(r));
  }

  async updateWorkstationPermission(
    deviceId: string,
    patch: {
      device_name?: string;
      is_admin?: boolean;
      allowed_menus?: MenuId[];
      can_open_settings?: boolean;
    }
  ): Promise<WorkstationPermission> {
    const cleanId = sanitizeDeviceId(deviceId);
    const existing = await this.db('workstation_permissions').where({ device_id: cleanId }).first();
    if (!existing) {
      throw new Error('Workstation not found.');
    }

    const now = new Date().toISOString();
    const isAdmin = patch.is_admin !== undefined ? Boolean(patch.is_admin) : Boolean(existing.is_admin);
    const menus = isAdmin
      ? [...ALL_MENU_IDS]
      : patch.allowed_menus !== undefined
      ? sanitizeMenuList(patch.allowed_menus)
      : this.hydrate(existing).allowed_menus;

    if (!isAdmin && menus.length === 0) {
      throw new Error('A workstation must have at least one menu enabled.');
    }

    const updateRow: Record<string, any> = {
      role: isAdmin ? 'ADMIN' : 'STAFF',
      is_admin: isAdmin,
      allowed_menus_json: JSON.stringify(menus),
      can_open_settings: isAdmin
        ? true
        : patch.can_open_settings !== undefined
        ? Boolean(patch.can_open_settings)
        : Boolean(existing.can_open_settings),
      updated_at: now,
    };

    if (patch.device_name !== undefined && String(patch.device_name).trim()) {
      const cleanName = sanitizeDeviceName(patch.device_name, existing.device_name);
      updateRow.device_name = cleanName;
      updateRow.staff_name = cleanName;
    }

    await this.db('workstation_permissions').where({ device_id: cleanId }).update(updateRow);
    const updated = await this.db('workstation_permissions').where({ device_id: cleanId }).first();
    return this.hydrate(updated);
  }

  async deleteWorkstation(deviceId: string): Promise<void> {
    const cleanId = sanitizeDeviceId(deviceId);
    await this.db('workstation_permissions').where({ device_id: cleanId }).del();
  }

  /**
   * Aggregates document counts and monetary totals per Staff PC / Workstation for MD oversight.
   */
  async getStaffActivityReport(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<StaffActivityRow[]> {
    let invQ = this.db('invoices').where({ company_id: companyId }).whereNot('status', 'CANCELLED');
    if (startDate) invQ = invQ.andWhere('invoice_date', '>=', startDate);
    if (endDate) invQ = invQ.andWhere('invoice_date', '<=', endDate);

    let quoQ = this.db('quotations').where({ company_id: companyId });
    if (startDate) quoQ = quoQ.andWhere('quotation_date', '>=', startDate);
    if (endDate) quoQ = quoQ.andWhere('quotation_date', '<=', endDate);

    let purQ = this.db('purchase_invoices').where({ company_id: companyId });
    if (startDate) purQ = purQ.andWhere('bill_date', '>=', startDate);
    if (endDate) purQ = purQ.andWhere('bill_date', '<=', endDate);

    let cpQ = this.db('customer_payments').where({ company_id: companyId });
    if (startDate) cpQ = cpQ.andWhere('payment_date', '>=', startDate);
    if (endDate) cpQ = cpQ.andWhere('payment_date', '<=', endDate);

    let spQ = this.db('supplier_payments').where({ company_id: companyId });
    if (startDate) spQ = spQ.andWhere('payment_date', '>=', startDate);
    if (endDate) spQ = spQ.andWhere('payment_date', '<=', endDate);

    const [invoices, quotations, purchases, custPays, supPays, registered] = await Promise.all([
      invQ.select('created_by_device_id', 'created_by_device_name', 'grand_total'),
      quoQ.select('created_by_device_id', 'created_by_device_name', 'grand_total'),
      purQ.select('created_by_device_id', 'created_by_device_name', 'grand_total'),
      cpQ.select('created_by_device_id', 'created_by_device_name', 'amount'),
      spQ.select('created_by_device_id', 'created_by_device_name', 'amount'),
      this.listWorkstations({ staffOnly: false }),
    ]);

    const nameById = new Map<string, string>();
    for (const w of registered) {
      nameById.set(w.device_id, w.device_name);
    }

    type Bucket = {
      device_id: string;
      device_name: string;
      invoices_count: number;
      invoices_total: Decimal;
      quotations_count: number;
      quotations_total: Decimal;
      purchases_count: number;
      purchases_total: Decimal;
      customer_payments_count: number;
      customer_payments_total: Decimal;
      supplier_payments_count: number;
      supplier_payments_total: Decimal;
    };

    const buckets = new Map<string, Bucket>();
    const getBucket = (rawId?: string | null, rawName?: string | null): Bucket => {
      const id = sanitizeDeviceId(rawId) || 'legacy-untagged';
      const label =
        nameById.get(id) ||
        (rawName ? sanitizeDeviceName(rawName, 'Main Office PC') : id === 'legacy-untagged' ? 'Main Office PC (Prior Records)' : id);
      let b = buckets.get(id);
      if (!b) {
        b = {
          device_id: id,
          device_name: label,
          invoices_count: 0,
          invoices_total: new Decimal(0),
          quotations_count: 0,
          quotations_total: new Decimal(0),
          purchases_count: 0,
          purchases_total: new Decimal(0),
          customer_payments_count: 0,
          customer_payments_total: new Decimal(0),
          supplier_payments_count: 0,
          supplier_payments_total: new Decimal(0),
        };
        buckets.set(id, b);
      }
      return b;
    };

    for (const r of invoices) {
      const b = getBucket(r.created_by_device_id, r.created_by_device_name);
      b.invoices_count += 1;
      b.invoices_total = b.invoices_total.add(new Decimal(r.grand_total || 0));
    }
    for (const r of quotations) {
      const b = getBucket(r.created_by_device_id, r.created_by_device_name);
      b.quotations_count += 1;
      b.quotations_total = b.quotations_total.add(new Decimal(r.grand_total || 0));
    }
    for (const r of purchases) {
      const b = getBucket(r.created_by_device_id, r.created_by_device_name);
      b.purchases_count += 1;
      b.purchases_total = b.purchases_total.add(new Decimal(r.grand_total || 0));
    }
    for (const r of custPays) {
      const b = getBucket(r.created_by_device_id, r.created_by_device_name);
      b.customer_payments_count += 1;
      b.customer_payments_total = b.customer_payments_total.add(new Decimal(r.amount || 0));
    }
    for (const r of supPays) {
      const b = getBucket(r.created_by_device_id, r.created_by_device_name);
      b.supplier_payments_count += 1;
      b.supplier_payments_total = b.supplier_payments_total.add(new Decimal(r.amount || 0));
    }

    // Also include registered workstations with 0 docs so MD sees every office PC
    for (const w of registered) {
      getBucket(w.device_id, w.device_name);
    }

    return Array.from(buckets.values())
      .map((b) => ({
        device_id: b.device_id,
        device_name: b.device_name,
        invoices_count: b.invoices_count,
        invoices_total: b.invoices_total.toFixed(2),
        quotations_count: b.quotations_count,
        quotations_total: b.quotations_total.toFixed(2),
        purchases_count: b.purchases_count,
        purchases_total: b.purchases_total.toFixed(2),
        customer_payments_count: b.customer_payments_count,
        customer_payments_total: b.customer_payments_total.toFixed(2),
        supplier_payments_count: b.supplier_payments_count,
        supplier_payments_total: b.supplier_payments_total.toFixed(2),
        total_documents:
          b.invoices_count +
          b.quotations_count +
          b.purchases_count +
          b.customer_payments_count +
          b.supplier_payments_count,
      }))
      .sort((a, b) => b.total_documents - a.total_documents);
  }
}
