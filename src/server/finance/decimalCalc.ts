// src/server/finance/decimalCalc.ts - High-precision monetary and tax arithmetic
import Decimal from 'decimal.js';

// Configure Decimal.js precision and rounding mode strictly for financial accuracy
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface LineItemCalculationInput {
  quantity: string | number;
  rate: string | number;
  discountPercentage?: string | number;
  discountAmount?: string | number;
  gstRate: string | number;
  isTaxInclusive?: boolean;
  isInterState: boolean;
}

export interface LineItemCalculationResult {
  quantity: string;
  rate: string;
  baseAmount: string;
  discountAmount: string;
  taxableValue: string;
  gstRate: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  totalTax: string;
  lineTotal: string;
}

export interface DocumentTotalsInput {
  items: LineItemCalculationResult[];
  overallDiscountPercentage?: string | number;
  overallDiscountAmount?: string | number;
  additionalCharges?: string | number;
}

export interface DocumentTotalsResult {
  subtotal: string;
  overallDiscountAmount: string;
  totalTaxableValue: string;
  totalCgst: string;
  totalSgst: string;
  totalIgst: string;
  totalTax: string;
  additionalCharges: string;
  roundOff: string;
  grandTotal: string;
}

/**
 * Calculates a single line item with strict Decimal precision, supporting both tax-inclusive and tax-exclusive pricing.
 */
export function calculateLineItem(input: LineItemCalculationInput): LineItemCalculationResult {
  const qty = new Decimal(input.quantity || 0);
  const rate = new Decimal(input.rate || 0);
  const gstRate = new Decimal(input.gstRate || 0);
  const isTaxInclusive = Boolean(input.isTaxInclusive);
  const isInterState = Boolean(input.isInterState);

  let taxableValue: Decimal;
  let lineTotal: Decimal;
  let totalTax: Decimal;
  let discountAmount = new Decimal(0);

  if (isTaxInclusive) {
    // Inclusive pricing: Gross line price = qty * rate
    const grossAmount = qty.mul(rate);

    // Apply discount
    if (input.discountAmount && new Decimal(input.discountAmount).gt(0)) {
      discountAmount = new Decimal(input.discountAmount);
    } else if (input.discountPercentage && new Decimal(input.discountPercentage).gt(0)) {
      const discountPct = new Decimal(input.discountPercentage);
      discountAmount = grossAmount.mul(discountPct).div(100);
    }
    const discountedGross = Decimal.max(0, grossAmount.sub(discountAmount));

    // Taxable Value = Discounted Gross / (1 + (GstRate / 100))
    const taxFactor = new Decimal(1).add(gstRate.div(100));
    taxableValue = discountedGross.div(taxFactor);
    totalTax = discountedGross.sub(taxableValue);
    lineTotal = discountedGross;
  } else {
    // Exclusive pricing: Base amount = qty * rate
    const baseAmount = qty.mul(rate);

    // Apply discount
    if (input.discountAmount && new Decimal(input.discountAmount).gt(0)) {
      discountAmount = new Decimal(input.discountAmount);
    } else if (input.discountPercentage && new Decimal(input.discountPercentage).gt(0)) {
      const discountPct = new Decimal(input.discountPercentage);
      discountAmount = baseAmount.mul(discountPct).div(100);
    }
    taxableValue = Decimal.max(0, baseAmount.sub(discountAmount));

    // Tax = Taxable Value * (GstRate / 100)
    totalTax = taxableValue.mul(gstRate).div(100);
    lineTotal = taxableValue.add(totalTax);
  }

  // Split Tax into CGST/SGST or IGST
  let cgstRate = new Decimal(0);
  let cgstAmount = new Decimal(0);
  let sgstRate = new Decimal(0);
  let sgstAmount = new Decimal(0);
  let igstRate = new Decimal(0);
  let igstAmount = new Decimal(0);

  if (isInterState) {
    igstRate = gstRate;
    igstAmount = totalTax;
  } else {
    cgstRate = gstRate.div(2);
    sgstRate = gstRate.div(2);
    cgstAmount = totalTax.div(2);
    sgstAmount = totalTax.div(2);
  }

  return {
    quantity: qty.toFixed(2),
    rate: rate.toFixed(2),
    baseAmount: qty.mul(rate).toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxableValue: taxableValue.toFixed(2),
    gstRate: gstRate.toFixed(2),
    cgstRate: cgstRate.toFixed(2),
    cgstAmount: cgstAmount.toFixed(2),
    sgstRate: sgstRate.toFixed(2),
    sgstAmount: sgstAmount.toFixed(2),
    igstRate: igstRate.toFixed(2),
    igstAmount: igstAmount.toFixed(2),
    totalTax: totalTax.toFixed(2),
    lineTotal: lineTotal.toFixed(2),
  };
}

/**
 * Aggregates all line items into overall document totals with round-off computation.
 */
export function calculateDocumentTotals(input: DocumentTotalsInput): DocumentTotalsResult {
  let subtotal = new Decimal(0);
  let totalTaxableValue = new Decimal(0);
  let totalCgst = new Decimal(0);
  let totalSgst = new Decimal(0);
  let totalIgst = new Decimal(0);
  let totalTax = new Decimal(0);

  for (const item of input.items) {
    const taxableVal = (item as any).taxableValue !== undefined ? (item as any).taxableValue : ((item as any).taxable_value || 0);
    const cgst = (item as any).cgstAmount !== undefined ? (item as any).cgstAmount : ((item as any).cgst_amount || 0);
    const sgst = (item as any).sgstAmount !== undefined ? (item as any).sgstAmount : ((item as any).sgst_amount || 0);
    const igst = (item as any).igstAmount !== undefined ? (item as any).igstAmount : ((item as any).igst_amount || 0);
    const tax = (item as any).totalTax !== undefined ? (item as any).totalTax : ((item as any).total_tax || 0);

    subtotal = subtotal.add(new Decimal(taxableVal));
    totalTaxableValue = totalTaxableValue.add(new Decimal(taxableVal));
    totalCgst = totalCgst.add(new Decimal(cgst));
    totalSgst = totalSgst.add(new Decimal(sgst));
    totalIgst = totalIgst.add(new Decimal(igst));
    totalTax = totalTax.add(new Decimal(tax));
  }

  // Apply overall discount if any
  let overallDiscount = new Decimal(0);
  if (input.overallDiscountAmount && new Decimal(input.overallDiscountAmount).gt(0)) {
    overallDiscount = new Decimal(input.overallDiscountAmount);
  } else if (input.overallDiscountPercentage && new Decimal(input.overallDiscountPercentage).gt(0)) {
    overallDiscount = totalTaxableValue.mul(new Decimal(input.overallDiscountPercentage)).div(100);
  }

  const additionalCharges = new Decimal(input.additionalCharges || 0);

  // Raw Total = Taxable Value - Overall Discount + Total Tax + Additional Charges
  const rawTotal = Decimal.max(0, totalTaxableValue.sub(overallDiscount)).add(totalTax).add(additionalCharges);

  // Round off to nearest integer
  const roundedGrandTotal = rawTotal.round();
  const roundOff = roundedGrandTotal.sub(rawTotal);

  return {
    subtotal: subtotal.toFixed(2),
    overallDiscountAmount: overallDiscount.toFixed(2),
    totalTaxableValue: Decimal.max(0, totalTaxableValue.sub(overallDiscount)).toFixed(2),
    totalCgst: totalCgst.toFixed(2),
    totalSgst: totalSgst.toFixed(2),
    totalIgst: totalIgst.toFixed(2),
    totalTax: totalTax.toFixed(2),
    additionalCharges: additionalCharges.toFixed(2),
    roundOff: roundOff.toFixed(2),
    grandTotal: roundedGrandTotal.toFixed(2),
  };
}

/**
 * Formats a monetary number in Indian Rupee style (e.g. 1,23,45,678.90)
 */
export function formatIndianCurrency(amount: string | number, showSymbol = true): string {
  const d = new Decimal(amount || 0);
  const isNegative = d.isNegative();
  const absVal = d.abs().toFixed(2);
  const parts = absVal.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const result = (isNegative ? '-' : '') + formattedInteger + '.' + decimalPart;

  return showSymbol ? `₹ ${result}` : result;
}
