// tests/finance.test.ts - Unit tests for high precision calculations and number-to-words
import { describe, it, expect } from 'vitest';
import { calculateLineItem, calculateDocumentTotals, formatIndianCurrency } from '../src/server/finance/decimalCalc';
import { convertAmountToWords } from '../src/server/finance/numberToWords';

describe('Financial Engine & Decimal Precision', () => {
  it('correctly calculates tax-exclusive line item with intra-state CGST/SGST', () => {
    const result = calculateLineItem({
      quantity: '2',
      rate: '1000',
      discountPercentage: '10',
      gstRate: '18',
      isTaxInclusive: false,
      isInterState: false,
    });

    // 2 * 1000 = 2000; 10% discount = 200; taxable = 1800
    expect(result.taxableValue).toBe('1800.00');
    // 18% of 1800 = 324; CGST = 162, SGST = 162
    expect(result.cgstAmount).toBe('162.00');
    expect(result.sgstAmount).toBe('162.00');
    expect(result.igstAmount).toBe('0.00');
    expect(result.totalTax).toBe('324.00');
    expect(result.lineTotal).toBe('2124.00');
  });

  it('correctly calculates tax-inclusive line item', () => {
    const result = calculateLineItem({
      quantity: '1',
      rate: '1180',
      gstRate: '18',
      isTaxInclusive: true,
      isInterState: false,
    });

    // 1180 gross / 1.18 = 1000 taxable
    expect(result.taxableValue).toBe('1000.00');
    expect(result.totalTax).toBe('180.00');
    expect(result.cgstAmount).toBe('90.00');
    expect(result.sgstAmount).toBe('90.00');
    expect(result.lineTotal).toBe('1180.00');
  });

  it('correctly calculates inter-state IGST', () => {
    const result = calculateLineItem({
      quantity: '1',
      rate: '10000',
      gstRate: '18',
      isTaxInclusive: false,
      isInterState: true,
    });

    expect(result.cgstAmount).toBe('0.00');
    expect(result.sgstAmount).toBe('0.00');
    expect(result.igstAmount).toBe('1800.00');
    expect(result.lineTotal).toBe('11800.00');
  });

  it('formats Indian currency with correct commas for lakhs and crores', () => {
    expect(formatIndianCurrency('12345678.50', false)).toBe('1,23,45,678.50');
    expect(formatIndianCurrency('100000', false)).toBe('1,00,000.00');
  });

  it('converts monetary amount into Indian English Words', () => {
    const words = convertAmountToWords('123456.75');
    expect(words).toBe('Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Five Paise Only');
  });
});
