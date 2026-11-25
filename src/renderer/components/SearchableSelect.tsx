import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  code?: string;
  badge?: string;
  icon?: React.ReactNode;
  isAction?: boolean; // For "+ Add New..." items
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  showSearchIcon?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  emptyMessage?: string;
  freeTextValue?: string;
  onFreeTextChange?: (text: string) => void;
  hideSelectedMeta?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select or type to search...',
  className = '',
  disabled = false,
  required = false,
  id,
  name,
  autoFocus = false,
  showSearchIcon = false,
  clearable = false,
  size = 'md',
  emptyMessage = 'No matching options found',
  freeTextValue,
  onFreeTextChange,
  hideSelectedMeta = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasTyped, setHasTyped] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  // Auto-detect whether to open upward or downward
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  // Find currently selected option with flexible matching (value, code, or label)
  const selectedOption = useMemo(() => {
    if (!value) return null;
    const vStr = String(value).trim().toLowerCase();
    return (
      options.find(
        (opt) =>
          opt.value.toLowerCase() === vStr ||
          (opt.code && opt.code.toLowerCase() === vStr) ||
          opt.label.toLowerCase() === vStr
      ) || null
    );
  }, [options, value]);

  // Sync display text with selected option (or freeTextValue) when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery(selectedOption ? selectedOption.label : (onFreeTextChange ? (freeTextValue || '') : ''));
      setHasTyped(false);
    }
  }, [selectedOption, isOpen, freeTextValue, onFreeTextChange]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!isOpen) return options;
    if (!hasTyped) return options;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    return options.filter((opt) => {
      // Always show action items like "+ Add New..." at top or bottom if needed
      if (opt.isAction) return true;

      const labelMatch = opt.label.toLowerCase().includes(q);
      const codeMatch = opt.code ? opt.code.toLowerCase().includes(q) : false;
      const sublabelMatch = opt.sublabel ? opt.sublabel.toLowerCase().includes(q) : false;
      const badgeMatch = opt.badge ? opt.badge.toLowerCase().includes(q) : false;
      return labelMatch || codeMatch || sublabelMatch || badgeMatch;
    });
  }, [options, searchQuery, isOpen, hasTyped]);

  // Adjust highlighted index when filtered list changes
  useEffect(() => {
    if (isOpen) {
      // Try to highlight current selected option if present in filtered list
      const idx = filteredOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : filteredOptions.length > 0 ? 0 : -1);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, filteredOptions, value]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const itemEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (itemEl && typeof itemEl.scrollIntoView === 'function') {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset query text to current selected label (or preserve custom free text)
        if (!onFreeTextChange) {
          setSearchQuery(selectedOption ? selectedOption.label : '');
        }
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [selectedOption, onFreeTextChange]);

  const handleSelect = (option: SelectOption) => {
    onChange(option.value);
    setSearchQuery(option.label);
    setHasTyped(false);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    if (onFreeTextChange) onFreeTextChange('');
    setSearchQuery('');
    setHasTyped(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHasTyped(false);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const next = prev + 1;
        return next >= filteredOptions.length ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHasTyped(false);
        return;
      }
      setHighlightedIndex((prev) => {
        if (filteredOptions.length === 0) return -1;
        const next = prev - 1;
        return next < 0 ? filteredOptions.length - 1 : next;
      });
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (isOpen && onFreeTextChange) {
        e.preventDefault();
        setIsOpen(false);
        setHasTyped(false);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setHasTyped(false);
        if (!onFreeTextChange) {
          setSearchQuery(selectedOption ? selectedOption.label : '');
        }
      }
    } else if (e.key === 'Tab') {
      if (!onFreeTextChange && isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        // Optionally select on Tab
        handleSelect(filteredOptions[highlightedIndex]);
      }
      setIsOpen(false);
      setHasTyped(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setSearchQuery(nextVal);
    setHasTyped(true);
    if (onFreeTextChange) {
      onFreeTextChange(nextVal);
    }
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      setHasTyped(false);
      if (!onFreeTextChange) {
        // Select text so typing immediately replaces and filters
        inputRef.current?.select();
      }
    }
  };

  const toggleDropdown = () => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      setHasTyped(false);
      if (!onFreeTextChange) {
        setSearchQuery(selectedOption ? selectedOption.label : '');
      }
    } else {
      setIsOpen(true);
      setHasTyped(false);
      inputRef.current?.focus();
      if (!onFreeTextChange) {
        inputRef.current?.select();
      }
    }
  };

  const sizeClasses = {
    sm: 'text-xs py-1 px-2.5',
    md: 'text-xs sm:text-sm py-1.5 px-3',
    lg: 'text-sm py-2 px-3.5',
  };

  // Active code to display on the other side (right side)
  const activeCode = useMemo(() => {
    if (hideSelectedMeta) return null;
    if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]?.code) {
      return filteredOptions[highlightedIndex].code;
    }
    return selectedOption?.code || null;
  }, [hideSelectedMeta, isOpen, highlightedIndex, filteredOptions, selectedOption]);

  const activeBadge = useMemo(() => {
    if (hideSelectedMeta) return null;
    if (activeCode) return null;
    if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]?.badge) {
      return filteredOptions[highlightedIndex].badge;
    }
    return selectedOption?.badge || null;
  }, [hideSelectedMeta, activeCode, isOpen, highlightedIndex, filteredOptions, selectedOption]);

  const rightPadding = useMemo(() => {
    if (activeCode && clearable && value) return 'pr-28';
    if (activeCode) return 'pr-20';
    if (activeBadge && clearable && value) return 'pr-28';
    if (activeBadge) return 'pr-20';
    if (clearable && value) return 'pr-14';
    return 'pr-8';
  }, [activeCode, activeBadge, clearable, value]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full text-left font-normal ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      {/* Hidden input for form requirements if necessary */}
      {required && (
        <input
          type="text"
          name={name}
          id={id ? `${id}-required` : undefined}
          value={value}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Input container */}
      <div
        className={`relative flex items-center ${size === 'sm' ? 'h-8' : size === 'lg' ? 'h-10' : 'h-9'} bg-white dark:bg-slate-700 border rounded-lg transition-all shadow-sm ${
          isOpen
            ? 'border-brand-500 ring-2 ring-brand-500/20 dark:border-brand-400'
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
        }`}
      >
        {showSearchIcon && (
          <div className="pl-2.5 text-slate-400 dark:text-slate-500 pointer-events-none">
            <Search className="w-3.5 h-3.5" />
          </div>
        )}

        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          disabled={disabled}
          autoFocus={autoFocus}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`w-full h-full bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-400 outline-none ${rightPadding} ${sizeClasses[size]}`}
        />

        {/* Right side / other side: Code badge and action icons */}
        <div className="absolute right-1.5 flex items-center space-x-1.5">
          {activeCode && (
            <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 select-none shadow-xs pointer-events-none">
              {activeCode}
            </span>
          )}
          {activeBadge && (
            <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 pointer-events-none">
              {activeBadge}
            </span>
          )}

          {clearable && value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={toggleDropdown}
            className={`p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-brand-600' : ''
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className={`custom-dropdown-scrollbar absolute left-0 right-0 max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 divide-y divide-slate-100 dark:divide-slate-700/60 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {filteredOptions.length === 0 ? (
            onFreeTextChange && searchQuery.trim() ? (
              <div
                onClick={() => {
                  setIsOpen(false);
                  setHasTyped(false);
                }}
                className="px-3.5 py-2.5 text-xs text-brand-700 dark:text-brand-300 bg-brand-50/40 dark:bg-brand-950/30 hover:bg-brand-50 cursor-pointer flex items-center justify-between"
              >
                <span>
                  Use custom item: <strong className="font-semibold">"{searchQuery.trim()}"</strong>
                </span>
                <span className="text-[10px] text-slate-400">Enter</span>
              </div>
            ) : (
              <div className="px-3.5 py-3 text-xs text-slate-400 dark:text-slate-500 text-center italic">
                {emptyMessage}
              </div>
            )
          ) : (
            filteredOptions.map((opt, index) => {
              const isSelected = opt.value === value;
              const isHighlighted = index === highlightedIndex;

              if (opt.isAction) {
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 text-xs font-semibold cursor-pointer flex items-center justify-between transition-colors ${
                      isHighlighted
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'bg-slate-50/70 text-brand-600 dark:bg-slate-700/50 dark:text-brand-400 hover:bg-brand-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {opt.icon}
                      <span>{opt.label}</span>
                    </div>
                    {opt.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2 text-xs sm:text-sm cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted
                      ? 'bg-sky-50 dark:bg-sky-950/50 text-brand-900 dark:text-sky-200 font-medium'
                      : isSelected
                      ? 'bg-brand-50/50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-xs text-slate-400 dark:text-slate-400 truncate">
                        • {opt.sublabel}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 ml-2 shrink-0">
                    {opt.code && (
                      <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 shadow-xs">
                        {opt.code}
                      </span>
                    )}
                    {opt.badge && (
                      <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 stroke-[2.5]" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
