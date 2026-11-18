// src/renderer/components/DateInput.tsx - Standard DD/MM/YYYY Date Input with Arrow Navigation & Calendar Picker
import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

export interface DateInputProps {
  value?: string; // Expects ISO "YYYY-MM-DD" or ""
  onChange: (isoDate: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  min?: string;
  max?: string;
  autoFocus?: boolean;
}

// Convert ISO "YYYY-MM-DD" to Display "DD/MM/YYYY"
export function isoToDisplayDate(isoStr?: string | null): string {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.trim().slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return '';
}

// Convert Display "DD/MM/YYYY" to ISO "YYYY-MM-DD"
export function displayToIsoDate(displayStr?: string | null): string {
  if (!displayStr || typeof displayStr !== 'string') return '';
  const clean = displayStr.trim();
  const parts = clean.split('/');
  if (parts.length === 3) {
    let [d, m, y] = parts;
    d = d.padStart(2, '0');
    m = m.padStart(2, '0');
    if (y.length === 2) y = '20' + y;
    if (y.length === 4) {
      const dayNum = parseInt(d, 10);
      const monthNum = parseInt(m, 10);
      const yearNum = parseInt(y, 10);
      if (
        monthNum >= 1 &&
        monthNum <= 12 &&
        dayNum >= 1 &&
        dayNum <= 31 &&
        yearNum >= 1900 &&
        yearNum <= 2100
      ) {
        return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }
  return '';
}

export function formatSmartDateTyping(newVal: string, oldVal: string): string {
  // If user hit backspace on a trailing slash (e.g. '09/' -> '09'), delete the digit before the slash as well so they aren't trapped
  if (oldVal.endsWith('/') && newVal === oldVal.slice(0, -1)) {
    return newVal.slice(0, -1);
  }

  // If user is deleting characters from the end or within, let them delete freely
  if (newVal.length < oldVal.length && oldVal.startsWith(newVal)) {
    return newVal;
  }

  // Strip anything that is not numeric or forward slash
  const raw = newVal.replace(/[^\d/]/g, '');

  // Handle slashes typed explicitly by user (e.g. "9/" -> "09/")
  if (raw.endsWith('/')) {
    const parts = raw.split('/');
    if (parts.length === 2 && parts[0].length === 1) {
      return `0${parts[0]}/`;
    }
    if (parts.length === 3 && parts[1].length === 1) {
      return `${parts[0]}/0${parts[1]}/`;
    }
    return raw;
  }

  const parts = raw.split('/');

  // 1. Day segment
  if (parts.length === 1) {
    const d = parts[0];
    if (d.length === 1) {
      const num = parseInt(d, 10);
      // If user typed 4, 5, 6, 7, 8, 9 (cannot be first digit of 31-day month), auto-pad to 0X/
      if (num > 3) {
        return `0${num}/`;
      }
      return d;
    }
    if (d.length === 2) {
      let num = parseInt(d, 10);
      if (num === 0) num = 1;
      if (num > 31) num = 31;
      return `${String(num).padStart(2, '0')}/`;
    }
    if (d.length > 2) {
      const day = d.slice(0, 2);
      const rest = d.slice(2);
      return `${day}/${rest}`;
    }
  }

  // 2. Month segment
  if (parts.length === 2) {
    let day = parts[0];
    const m = parts[1];
    if (day.length === 1) {
      day = `0${day}`;
    }
    if (m.length === 1) {
      const num = parseInt(m, 10);
      // If user typed 2-9 for month (cannot be first digit of 12-month year), auto-pad to 0X/
      if (num > 1) {
        return `${day}/0${num}/`;
      }
      return `${day}/${m}`;
    }
    if (m.length === 2) {
      let num = parseInt(m, 10);
      if (num === 0) num = 1;
      if (num > 12) num = 12;
      return `${day}/${String(num).padStart(2, '0')}/`;
    }
    if (m.length > 2) {
      const month = m.slice(0, 2);
      const rest = m.slice(2);
      return `${day}/${month}/${rest}`;
    }
  }

  // 3. Year segment
  if (parts.length >= 3) {
    let day = parts[0];
    if (day.length === 1) day = `0${day}`;
    let month = parts[1];
    if (month.length === 1) month = `0${month}`;
    const year = parts[2].slice(0, 4);
    return `${day.slice(0, 2)}/${month.slice(0, 2)}/${year}`;
  }

  return raw;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  className = '',
  disabled = false,
  required = false,
  id,
  name,
  min,
  max,
  autoFocus = false,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => isoToDisplayDate(value));
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayValue(isoToDisplayDate(value));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;
    const transformed = formatSmartDateTyping(inputVal, displayValue);
    setDisplayValue(transformed);

    const iso = displayToIsoDate(transformed);
    if (iso) {
      onChange(iso);
    } else if (!transformed.trim()) {
      onChange('');
    }
  };

  const handleBlur = () => {
    if (!displayValue.trim()) {
      onChange('');
      return;
    }
    // Auto-pad on blur if user typed single digits, e.g. "9/12/2026" -> "09/12/2026"
    const parts = displayValue.split('/');
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (d.length === 1) d = `0${d}`;
      if (m.length === 1) m = `0${m}`;
      if (y.length === 2) y = `20${y}`;
      const padded = `${d}/${m}/${y}`;
      const iso = displayToIsoDate(padded);
      if (iso) {
        setDisplayValue(padded);
        onChange(iso);
        return;
      }
    }
    // If invalid on blur, reset back to last valid prop value
    setDisplayValue(isoToDisplayDate(value));
  };

  const handleCalendarPickerClick = () => {
    if (disabled) return;
    try {
      if (hiddenDateRef.current) {
        if (typeof hiddenDateRef.current.showPicker === 'function') {
          hiddenDateRef.current.showPicker();
        } else {
          hiddenDateRef.current.focus();
          hiddenDateRef.current.click();
        }
      }
    } catch {
      // ignore
    }
  };

  const handleHiddenDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoVal = e.target.value;
    if (isoVal) {
      setDisplayValue(isoToDisplayDate(isoVal));
      onChange(isoVal);
    }
  };

  return (
    <div className={`relative inline-flex items-center w-full ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      <input
        type="text"
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        required={required}
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10}
        autoComplete="off"
        spellCheck="false"
        className={`w-full pr-8 text-left ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={handleCalendarPickerClick}
        title="Open calendar picker"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-colors p-0.5 rounded cursor-pointer"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <input
        type="date"
        ref={hiddenDateRef}
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={handleHiddenDateChange}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none"
      />
    </div>
  );
};
