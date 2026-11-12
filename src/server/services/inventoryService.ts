// src/server/services/inventoryService.ts - Stock Ledgers, Warehouses, Valuation & Movement Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { Warehouse, InventoryTransaction, StockBalance, InventoryMovementType } from '../../shared/types';

export class InventoryService {
  constructor(private db: Knex) {}

  // Warehouses
  async getWarehouses(companyId: string): Promise<Warehouse[]> {
    return this.db('warehouses').where({ company_id: companyId, is_active: true }).orderBy('name', 'asc');
  }

  async createWarehouse(companyId: string, data: Partial<Warehouse>): Promise<Warehouse> {
    return this.db.transaction(async (trx) => {
      const id = uuidv4();
      const now = new Date().toISOString();

      let branchId: string = data.branch_id || '';
      if (!branchId || branchId === 'DEFAULT_BRANCH') {
        const defaultBranch =
          (await trx('branches').where({ company_id: companyId, is_default: true, is_archived: false }).first()) ||
          (await trx('branches').where({ company_id: companyId, is_archived: false }).first());
        branchId = defaultBranch?.id || 'DEFAULT_BRANCH';
      }

      const existingWarehouses = await trx('warehouses').where({ company_id: companyId, is_active: true });
      const shouldBeDefault = data.is_default !== undefined ? Boolean(data.is_default) : existingWarehouses.length === 0;

      if (shouldBeDefault) {
        await trx('warehouses').where({ company_id: companyId }).update({ is_default: false });
      }

      const wh: Warehouse = {
        id,
        company_id: companyId,
        branch_id: branchId,
        name: (data.name || 'Warehouse').trim(),
        code: (data.code || `WH${String(existingWarehouses.length + 1).padStart(2, '0')}`).trim().toUpperCase(),
        address: data.address || '',
        is_default: shouldBeDefault,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      await trx('warehouses').insert(wh);
      return wh;
    });
  }

  async updateWarehouse(companyId: string, warehouseId: string, data: Partial<Warehouse>): Promise<Warehouse> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('warehouses').where({ company_id: companyId, id: warehouseId }).first();
      if (!existing) throw new Error('Warehouse not found');

      const now = new Date().toISOString();
      const updatePayload: any = { updated_at: now };

      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.code !== undefined) updatePayload.code = data.code.trim().toUpperCase();
      if (data.address !== undefined) updatePayload.address = data.address;
      if (data.branch_id !== undefined) updatePayload.branch_id = data.branch_id;
      if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);
      if (data.is_default !== undefined) {
        updatePayload.is_default = Boolean(data.is_default);
        if (updatePayload.is_default) {
          await trx('warehouses').where({ company_id: companyId }).whereNot({ id: warehouseId }).update({ is_default: false });
        }
      }

      await trx('warehouses').where({ company_id: companyId, id: warehouseId }).update(updatePayload);
      return trx('warehouses').where({ company_id: companyId, id: warehouseId }).first();
    });
  }

  async deleteWarehouse(companyId: string, warehouseId: string): Promise<void> {
    return this.db.transaction(async (trx) => {
      const wh = await trx('warehouses').where({ company_id: companyId, id: warehouseId }).first();
      if (!wh) throw new Error('Warehouse not found');

      const balances = await trx('stock_balances').where({ company_id: companyId, warehouse_id: warehouseId });
      for (const bal of balances) {
        if (!new Decimal(bal.quantity_on_hand || 0).eq(0)) {
          throw new Error('Cannot delete warehouse with non-zero stock. Transfer or adjust stock to zero first.');
        }
      }

      const invTxCount = await trx('inventory_transactions')
        .where({ company_id: companyId, warehouse_id: warehouseId })
        .count('* as cnt')
        .first();
      const purInvCount = await trx('purchase_invoices')
        .where({ company_id: companyId, warehouse_id: warehouseId })
        .count('* as cnt')
        .first();

      const hasHistory = Number((invTxCount as any)?.cnt || 0) > 0 || Number((purInvCount as any)?.cnt || 0) > 0;

      await trx('stock_balances').where({ company_id: companyId, warehouse_id: warehouseId }).del();

      const now = new Date().toISOString();
      if (hasHistory) {
        await trx('warehouses').where({ id: warehouseId, company_id: companyId }).update({
          is_active: false,
          is_default: false,
          updated_at: now,
        });
      } else {
        await trx('warehouses').where({ id: warehouseId, company_id: companyId }).del();
      }

      if (wh.is_default) {
        const nextWh = await trx('warehouses')
          .where({ company_id: companyId, is_active: true })
          .orderBy('created_at', 'asc')
          .first();
        if (nextWh) {
          await trx('warehouses').where({ id: nextWh.id }).update({ is_default: true, updated_at: now });
        }
      }
    });
  }

  // Stock Balances & Ledger
  async getStockBalances(companyId: string, warehouseId?: string): Promise<StockBalance[]> {
    let query = this.db('stock_balances')
      .join('products', 'stock_balances.product_id', 'products.id')
      .join('warehouses', 'stock_balances.warehouse_id', 'warehouses.id')
      .select(
        'stock_balances.*',
        'products.name as product_name',
        'products.sku as product_sku',
        'products.unit as product_unit',
        'products.minimum_stock as minimum_stock',
        'warehouses.name as warehouse_name'
      )
      .where('stock_balances.company_id', companyId);

    if (warehouseId) {
      query = query.andWhere('stock_balances.warehouse_id', warehouseId);
    }

    return query.orderBy('products.name', 'asc');
  }

  async getInventoryTransactions(
    companyId: string,
    filters?: { productId?: string; warehouseId?: string; startDate?: string; endDate?: string }
  ): Promise<InventoryTransaction[]> {
    let query = this.db('inventory_transactions')
      .join('products', 'inventory_transactions.product_id', 'products.id')
      .join('warehouses', 'inventory_transactions.warehouse_id', 'warehouses.id')
      .select(
        'inventory_transactions.*',
        'products.name as product_name',
        'products.unit as product_unit',
        'warehouses.name as warehouse_name'
      )
      .where('inventory_transactions.company_id', companyId);

    if (filters?.productId) {
      query = query.andWhere('inventory_transactions.product_id', filters.productId);
    }
    if (filters?.warehouseId) {
      query = query.andWhere('inventory_transactions.warehouse_id', filters.warehouseId);
    }
    if (filters?.startDate) {
      query = query.andWhere('inventory_transactions.transaction_date', '>=', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.andWhere('inventory_transactions.transaction_date', '<=', filters.endDate);
    }

    return query.orderBy('inventory_transactions.created_at', 'desc');
  }

  /**
   * Manual Stock Adjustment (Add or Reduce)
   */
  async recordStockAdjustment(
    companyId: string,
    input: {
      branchId: string;
      warehouseId: string;
      productId: string;
      movementType: 'ADJUSTMENT_ADD' | 'ADJUSTMENT_REDUCE';
      quantity: string | number;
      unitCost?: string | number;
      notes: string;
      date?: string;
    }
  ): Promise<void> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const qtyDec = new Decimal(input.quantity);
      const isAdd = input.movementType === 'ADJUSTMENT_ADD';
      const actualQty = isAdd ? qtyDec : qtyDec.negated();

      const product = await trx('products').where({ id: input.productId, company_id: companyId }).first();
      if (!product) throw new Error('Product not found');

      const unitCost = input.unitCost !== undefined ? new Decimal(input.unitCost) : new Decimal(product.purchase_price || 0);

      // Record transaction
      await trx('inventory_transactions').insert({
        id: uuidv4(),
        company_id: companyId,
        branch_id: input.branchId,
        warehouse_id: input.warehouseId,
        product_id: input.productId,
        movement_type: input.movementType,
        quantity: actualQty.toFixed(2),
        unit_cost: unitCost.toFixed(2),
        total_cost: qtyDec.mul(unitCost).toFixed(2),
        reference_document_type: 'STOCK_ADJUSTMENT',
        reference_document_id: 'MANUAL',
        reference_document_number: `ADJ-${Date.now()}`,
        notes: input.notes,
        transaction_date: input.date || now.split('T')[0],
        created_at: now,
      });

      // Update product current stock using Decimal precision
      const currentProdStock = new Decimal(product.current_stock || 0);
      const nextProdStock = isAdd ? currentProdStock.add(qtyDec) : currentProdStock.sub(qtyDec);
      await trx('products')
        .where({ id: input.productId, company_id: companyId })
        .update({
          current_stock: nextProdStock.toFixed(2),
          updated_at: now,
        });

      // Update stock_balances
      const existing = await trx('stock_balances')
        .where({ company_id: companyId, warehouse_id: input.warehouseId, product_id: input.productId })
        .first();

      if (existing) {
        const newQty = isAdd
          ? new Decimal(existing.quantity_on_hand).add(qtyDec)
          : new Decimal(existing.quantity_on_hand).sub(qtyDec);

        const newStockVal = newQty.mul(unitCost);

        await trx('stock_balances').where({ id: existing.id }).update({
          quantity_on_hand: newQty.toFixed(2),
          average_unit_cost: unitCost.toFixed(2),
          total_stock_value: newStockVal.toFixed(2),
          last_updated_at: now,
        });
      } else {
        await trx('stock_balances').insert({
          id: uuidv4(),
          company_id: companyId,
          warehouse_id: input.warehouseId,
          product_id: input.productId,
          quantity_on_hand: actualQty.toFixed(2),
          average_unit_cost: unitCost.toFixed(2),
          total_stock_value: actualQty.mul(unitCost).toFixed(2),
          last_updated_at: now,
        });
      }
    });
  }

  /**
   * Inter-Warehouse Stock Transfer
   */
  async transferStock(
    companyId: string,
    input: {
      branchId?: string;
      branch_id?: string;
      fromWarehouseId?: string;
      from_warehouse_id?: string;
      toWarehouseId?: string;
      to_warehouse_id?: string;
      productId?: string;
      product_id?: string;
      quantity: string | number;
      notes?: string;
    }
  ): Promise<void> {
    const fromWarehouseId = input.fromWarehouseId || input.from_warehouse_id || '';
    const toWarehouseId = input.toWarehouseId || input.to_warehouse_id || '';
    const productId = input.productId || input.product_id || '';

    if (!fromWarehouseId || !toWarehouseId || !productId) {
      throw new Error('Source warehouse, destination warehouse, and product are required.');
    }
    if (fromWarehouseId === toWarehouseId) {
      throw new Error('Source and destination warehouses cannot be the same.');
    }

    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const qtyDec = new Decimal(input.quantity || 0);
      if (qtyDec.lte(0)) {
        throw new Error('Transfer quantity must be greater than zero.');
      }

      const product = await trx('products').where({ id: productId, company_id: companyId }).first();
      if (!product) throw new Error('Product not found');

      let branchId = input.branchId || input.branch_id;
      if (!branchId || branchId === 'DEFAULT_BRANCH') {
        const defaultBranch =
          (await trx('branches').where({ company_id: companyId, is_default: true, is_archived: false }).first()) ||
          (await trx('branches').where({ company_id: companyId, is_archived: false }).first());
        branchId = defaultBranch?.id || 'DEFAULT_BRANCH';
      }

      const sourceBal = await trx('stock_balances')
        .where({ company_id: companyId, warehouse_id: fromWarehouseId, product_id: productId })
        .first();
      const sourceQty = new Decimal(sourceBal?.quantity_on_hand || 0);
      if (sourceQty.lt(qtyDec)) {
        throw new Error(`Insufficient stock in source warehouse (available: ${sourceQty.toFixed(2)}).`);
      }

      const unitCost = new Decimal(sourceBal?.average_unit_cost || product.purchase_price || 0);
      const transferDocNum = `TRF-${Date.now()}`;

      // 1. Transfer Out
      await trx('inventory_transactions').insert({
        id: uuidv4(),
        company_id: companyId,
        branch_id: branchId,
        warehouse_id: fromWarehouseId,
        product_id: productId,
        movement_type: 'TRANSFER_OUT',
        quantity: qtyDec.negated().toFixed(2),
        unit_cost: unitCost.toFixed(2),
        total_cost: qtyDec.mul(unitCost).toFixed(2),
        reference_document_type: 'INTER_WH_TRANSFER',
        reference_document_id: transferDocNum,
        reference_document_number: transferDocNum,
        notes: `Transfer Out to warehouse. ${input.notes || ''}`.trim(),
        transaction_date: now.split('T')[0],
        created_at: now,
      });

      const nextSourceQty = sourceQty.sub(qtyDec);
      await trx('stock_balances')
        .where({ id: sourceBal.id })
        .update({
          quantity_on_hand: nextSourceQty.toFixed(2),
          total_stock_value: nextSourceQty.mul(unitCost).toFixed(2),
          last_updated_at: now,
        });

      // 2. Transfer In
      await trx('inventory_transactions').insert({
        id: uuidv4(),
        company_id: companyId,
        branch_id: branchId,
        warehouse_id: toWarehouseId,
        product_id: productId,
        movement_type: 'TRANSFER_IN',
        quantity: qtyDec.toFixed(2),
        unit_cost: unitCost.toFixed(2),
        total_cost: qtyDec.mul(unitCost).toFixed(2),
        reference_document_type: 'INTER_WH_TRANSFER',
        reference_document_id: transferDocNum,
        reference_document_number: transferDocNum,
        notes: `Transfer In from warehouse. ${input.notes || ''}`.trim(),
        transaction_date: now.split('T')[0],
        created_at: now,
      });

      const destBalance = await trx('stock_balances')
        .where({ company_id: companyId, warehouse_id: toWarehouseId, product_id: productId })
        .first();

      if (destBalance) {
        const prevDestQty = new Decimal(destBalance.quantity_on_hand || 0);
        const prevDestVal = new Decimal(destBalance.total_stock_value || 0);
        const nextDestQty = prevDestQty.add(qtyDec);
        const nextDestVal = prevDestVal.add(qtyDec.mul(unitCost));
        const nextAvgCost = nextDestQty.gt(0) ? nextDestVal.div(nextDestQty) : unitCost;

        await trx('stock_balances')
          .where({ id: destBalance.id })
          .update({
            quantity_on_hand: nextDestQty.toFixed(2),
            average_unit_cost: nextAvgCost.toFixed(2),
            total_stock_value: nextDestVal.toFixed(2),
            last_updated_at: now,
          });
      } else {
        await trx('stock_balances').insert({
          id: uuidv4(),
          company_id: companyId,
          warehouse_id: toWarehouseId,
          product_id: productId,
          quantity_on_hand: qtyDec.toFixed(2),
          average_unit_cost: unitCost.toFixed(2),
          total_stock_value: qtyDec.mul(unitCost).toFixed(2),
          last_updated_at: now,
        });
      }
    });
  }
}
