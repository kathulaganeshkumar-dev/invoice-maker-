import { describe, it, expect } from 'vitest';
import {
  isoToDisplayDate,
  displayToIsoDate,
  formatSmartDateTyping,
} from '../src/renderer/components/DateInput';

describe('Standard DD/MM/YYYY DateInput Utility Tests', () => {
  it('formats ISO dates to DD/MM/YYYY display format', () => {
    expect(isoToDisplayDate('2026-11-18')).toBe('18/11/2026');
    expect(isoToDisplayDate('2026-12-09')).toBe('09/12/2026');
    expect(isoToDisplayDate('2026-01-05')).toBe('05/01/2026');
    expect(isoToDisplayDate('')).toBe('');
    expect(isoToDisplayDate(null)).toBe('');
  });

  it('parses DD/MM/YYYY strings to standard ISO format', () => {
    expect(displayToIsoDate('18/11/2026')).toBe('2026-11-18');
    expect(displayToIsoDate('09/12/2026')).toBe('2026-12-09');
    expect(displayToIsoDate('9/12/2026')).toBe('2026-12-09');
    expect(displayToIsoDate('09/5/2026')).toBe('2026-05-09');
    expect(displayToIsoDate('invalid')).toBe('');
  });

  it('auto-pads single digit days (e.g. typing 9 becomes 09/)', () => {
    expect(formatSmartDateTyping('9', '')).toBe('09/');
    expect(formatSmartDateTyping('4', '')).toBe('04/');
    expect(formatSmartDateTyping('9/', '')).toBe('09/');
    expect(formatSmartDateTyping('1', '')).toBe('1');
    expect(formatSmartDateTyping('18', '1')).toBe('18/');
  });

  it('auto-pads months (e.g. typing 12 becomes 12/, typing 9 for month becomes 09/)', () => {
    expect(formatSmartDateTyping('09/12', '09/')).toBe('09/12/');
    expect(formatSmartDateTyping('09/9', '09/')).toBe('09/09/');
    expect(formatSmartDateTyping('09/1/', '09/')).toBe('09/01/');
  });

  it('formats full DD/MM/YYYY dates accurately without blocking side arrow keys', () => {
    expect(formatSmartDateTyping('09/12/2026', '09/12/')).toBe('09/12/2026');
    expect(formatSmartDateTyping('18/11/2026', '18/11/')).toBe('18/11/2026');
  });

  it('allows natural backspace deletion without force-inserting slashes', () => {
    expect(formatSmartDateTyping('18/11/202', '18/11/2026')).toBe('18/11/202');
    expect(formatSmartDateTyping('18/11/', '18/11/2026')).toBe('18/11/');
    expect(formatSmartDateTyping('18/1', '18/11/')).toBe('18/1');
    expect(formatSmartDateTyping('09', '09/')).toBe('0');
  });

  it('handles selecting existing date and typing 9 to start fresh day', () => {
    expect(formatSmartDateTyping('9', '18/11/2026')).toBe('09/');
    expect(formatSmartDateTyping('4', '18/11/2026')).toBe('04/');
  });
});
