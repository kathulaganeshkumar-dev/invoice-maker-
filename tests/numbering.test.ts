// tests/numbering.test.ts - Unit tests for numbering engine and FY calculations
import { describe, it, expect } from 'vitest';
import { getIndianFinancialYear, formatDocumentNumber } from '../src/server/services/numberingService';
import { NumberingSequence } from '../src/shared/types';

describe('Numbering Engine & Indian Financial Year', () => {
  it('correctly calculates Indian Financial Year', () => {
    // November 2026 falls in FY 2026-27
    expect(getIndianFinancialYear('2026-11-09', 'YYYY-YY')).toBe('2026-27');
    expect(getIndianFinancialYear('2026-11-09', 'YY-YY')).toBe('26-27');

    // January 2027 falls in FY 2026-27
    expect(getIndianFinancialYear('2027-01-15', 'YYYY-YY')).toBe('2026-27');

    // April 2027 starts FY 2027-28
    expect(getIndianFinancialYear('2027-04-01', 'YYYY-YY')).toBe('2027-28');
  });

  it('correctly formats the next invoice number matching prompt requirement VS/2026-27/0046', () => {
    const seq: NumberingSequence = {
      id: 'test-1',
      company_id: 'c1',
      document_type: 'TAX_INVOICE',
      prefix: 'VS',
      suffix: '',
      padding_length: 4,
      current_number: 45,
      include_financial_year: true,
      fy_format: 'YYYY-YY',
      separator: '/',
      updated_at: new Date().toISOString(),
    };

    const nextFormatted = formatDocumentNumber(seq, 46, '2026-11-09');
    expect(nextFormatted).toBe('VS/2026-27/0046');
  });
});
