// src/server/finance/gstEngine.ts - Complete Indian GST Calculation & Validation Engine
import Decimal from 'decimal.js';
import { INDIAN_STATES } from '../../shared/constants';
import { InvoiceItem } from '../../shared/types';

export interface GstDetermination {
  isInterState: boolean;
  isUnionTerritory: boolean;
  hasLegislature: boolean;
  supplyType: 'INTRA_STATE' | 'INTER_STATE';
  applicableTaxes: ('CGST' | 'SGST' | 'UTGST' | 'IGST')[];
}

export interface HsnSummaryRow {
  hsn_sac: string;
  description: string;
  uqc: string;
  total_quantity: string;
  total_value: string;
  taxable_value: string;
  integrated_tax: string;
  central_tax: string;
  state_ut_tax: string;
  total_tax: string;
}

/**
 * Validates 15-character Indian GSTIN format
 * Structure: 2 digits (state) + 10 chars (PAN) + 1 entity code + 1 'Z' + 1 checksum char
 */
export function validateGSTIN(gstin: string): boolean {
  if (!gstin) return false;
  const clean = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(clean)) return false;

  const stateCode = clean.substring(0, 2);
  return INDIAN_STATES.some((s) => s.code === stateCode);
}

/**
 * Validates 10-character Indian PAN format
 * Structure: 5 letters + 4 digits + 1 letter
 */
export function validatePAN(pan: string): boolean {
  if (!pan) return false;
  const clean = pan.trim().toUpperCase();
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(clean);
}

/**
 * Determines tax applicability based on Supplier State and Customer Place of Supply (POS)
 */
export function determineGstApplicability(
  supplierStateCode: string,
  placeOfSupplyCode: string
): GstDetermination {
  const cleanSupplier = (supplierStateCode || '').padStart(2, '0');
  const cleanPos = (placeOfSupplyCode || '').padStart(2, '0');

  const posState = INDIAN_STATES.find((s) => s.code === cleanPos);
  const isInterState = cleanSupplier !== cleanPos;

  if (isInterState) {
    return {
      isInterState: true,
      isUnionTerritory: posState?.isUnionTerritory ?? false,
      hasLegislature: posState?.hasLegislature ?? true,
      supplyType: 'INTER_STATE',
      applicableTaxes: ['IGST'],
    };
  }

  // Intra-state
  if (posState?.isUnionTerritory && !posState.hasLegislature) {
    return {
      isInterState: false,
      isUnionTerritory: true,
      hasLegislature: false,
      supplyType: 'INTRA_STATE',
      applicableTaxes: ['CGST', 'UTGST'],
    };
  }

  return {
    isInterState: false,
    isUnionTerritory: false,
    hasLegislature: true,
    supplyType: 'INTRA_STATE',
    applicableTaxes: ['CGST', 'SGST'],
  };
}

/**
 * Generates an HSN/SAC summary table required for GST invoices and GSTR-1
 */
export function generateHsnSummary(items: InvoiceItem[]): HsnSummaryRow[] {
  const map = new Map<string, {
    hsn: string;
    unit: string;
    qty: Decimal;
    totalVal: Decimal;
    taxableVal: Decimal;
    cgst: Decimal;
    sgst: Decimal;
    igst: Decimal;
    totalTax: Decimal;
  }>();

  for (const item of items) {
    const key = (item.hsn_or_sac || 'OTHER').trim();
    const existing = map.get(key) || {
      hsn: key,
      unit: item.unit || 'NOS',
      qty: new Decimal(0),
      totalVal: new Decimal(0),
      taxableVal: new Decimal(0),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      totalTax: new Decimal(0),
    };

    existing.qty = existing.qty.add(new Decimal(item.quantity || 0));
    existing.taxableVal = existing.taxableVal.add(new Decimal(item.taxable_value || 0));
    existing.cgst = existing.cgst.add(new Decimal(item.cgst_amount || 0));
    existing.sgst = existing.sgst.add(new Decimal(item.sgst_amount || 0));
    existing.igst = existing.igst.add(new Decimal(item.igst_amount || 0));
    existing.totalTax = existing.totalTax.add(new Decimal(item.total_tax || 0));
    existing.totalVal = existing.totalVal.add(new Decimal(item.line_total || 0));

    map.set(key, existing);
  }

  return Array.from(map.values()).map((val) => ({
    hsn_sac: val.hsn,
    description: `HSN/SAC: ${val.hsn}`,
    uqc: val.unit,
    total_quantity: val.qty.toFixed(2),
    total_value: val.totalVal.toFixed(2),
    taxable_value: val.taxableVal.toFixed(2),
    central_tax: val.cgst.toFixed(2),
    state_ut_tax: val.sgst.toFixed(2),
    integrated_tax: val.igst.toFixed(2),
    total_tax: val.totalTax.toFixed(2),
  }));
}
