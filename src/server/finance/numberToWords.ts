// src/server/finance/numberToWords.ts - Indian English Currency Amount to Words Converter
import Decimal from 'decimal.js';

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertLessThanOneThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ONES[n % 10] : '');
  } else if (n > 0) {
    str += ONES[n];
  }
  return str.trim();
}

/**
 * Converts a number or decimal string to Indian Rupees Words
 * Format: "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only"
 */
export function convertAmountToWords(
  amount: string | number,
  currencyName = 'Rupees',
  decimalName = 'Paise'
): string {
  const d = new Decimal(amount || 0);
  if (d.isZero()) {
    return `${currencyName} Zero Only`;
  }

  const isNegative = d.isNegative();
  const absD = d.abs();
  const [rupeesStr, paiseStr] = absD.toFixed(2).split('.');

  let rupees = parseInt(rupeesStr, 10);
  const paise = parseInt(paiseStr || '0', 10);

  if (rupees === 0 && paise === 0) {
    return `${currencyName} Zero Only`;
  }

  const parts: string[] = [];

  // Crores: 1,00,00,000
  if (rupees >= 10000000) {
    const crore = Math.floor(rupees / 10000000);
    parts.push(convertAmountToWords(crore, '', '').replace('Only', '').trim() + ' Crore');
    rupees %= 10000000;
  }

  // Lakhs: 1,00,000
  if (rupees >= 100000) {
    const lakh = Math.floor(rupees / 100000);
    parts.push(convertLessThanOneThousand(lakh) + ' Lakh');
    rupees %= 100000;
  }

  // Thousands: 1,000
  if (rupees >= 1000) {
    const thousand = Math.floor(rupees / 1000);
    parts.push(convertLessThanOneThousand(thousand) + ' Thousand');
    rupees %= 1000;
  }

  // Hundreds & units
  if (rupees > 0) {
    parts.push(convertLessThanOneThousand(rupees));
  }

  let words = (isNegative ? 'Negative ' : '') + currencyName + ' ' + parts.join(' ').trim();

  if (paise > 0) {
    words += ' and ' + convertLessThanOneThousand(paise) + ' ' + decimalName;
  }

  return words.trim() + ' Only';
}
