'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import * as React from 'react';

import {
  cleanPhoneDisplay,
  countries,
  extractDialCode,
  formatPhoneValue,
  formatStandardPhone,
  parsePhoneString,
  type PhoneValue,
} from '@/lib/phone';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { ScrollArea } from './scroll-area';

// Re-export the framework-agnostic phone utilities so existing client
// consumers can keep importing them from this module. The implementations
// live in `@/lib/phone` (server-safe) to avoid the Next.js client/server
// boundary violation that occurs when server code invokes a function
// exported from a `'use client'` module.
export {
  cleanPhoneDisplay,
  countries,
  extractDialCode,
  formatPhoneValue,
  formatStandardPhone,
  parsePhoneString,
};
export type { PhoneValue };

interface PhoneInputProps {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = 'Phone number',
  disabled = false,
  className,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Filter countries based on search
  const filteredCountries = React.useMemo(() => {
    if (!search) return countries;
    const searchLower = search.toLowerCase();
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(searchLower) ||
        country.isoCode.toLowerCase().includes(searchLower) ||
        country.dialCode.includes(search)
    );
  }, [search]);

  // Handle keyboard navigation
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstItem = listRef.current?.querySelector('[data-country-item]') as HTMLButtonElement;
      firstItem?.focus();
    } else if (e.key === 'Enter' && filteredCountries.length === 1) {
      selectCountry(filteredCountries[0].selectKey);
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, selectKey: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectCountry(selectKey);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = e.currentTarget.nextElementSibling as HTMLButtonElement;
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = e.currentTarget.previousElementSibling as HTMLButtonElement;
      if (prev?.hasAttribute('data-country-item')) {
        prev.focus();
      } else {
        searchInputRef.current?.focus();
      }
    }
  };

  const selectCountry = (selectKey: string) => {
    onChange({ ...value, countryCode: selectKey || null });
    setOpen(false);
    setSearch('');
  };

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  // Find selected country info - match by selectKey or legacy dialCode
  const selectedCountry = countries.find(
    (c) => c.selectKey === value.countryCode || c.dialCode === value.countryCode
  );
  // Get dial code for display (extract from selectKey if needed)
  const displayDialCode = value.countryCode?.includes('::')
    ? value.countryCode.split('::')[0]
    : value.countryCode;

  return (
    <div ref={containerRef} className={cn('relative flex gap-2', className)}>
      {/* Country Code Selector */}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="h-9 w-[100px] justify-between px-2 font-normal"
        >
          <span className="flex items-center gap-1 truncate">
            {value.countryCode ? (
              <>
                {selectedCountry?.flag && <span>{selectedCountry.flag}</span>}
                <span className="text-sm">{displayDialCode}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Code</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-[320px] rounded-lg border bg-popover p-0 shadow-md">
            {/* Search Input */}
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search country or code..."
                  className="h-8 pl-8"
                />
              </div>
            </div>

            {/* Country List */}
            <ScrollArea className="h-[200px]">
              <div ref={listRef} className="p-1">
                {/* None option */}
                <button
                  type="button"
                  data-country-item
                  onClick={() => selectCountry('')}
                  onKeyDown={(e) => handleItemKeyDown(e, '')}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent',
                    !value.countryCode && 'bg-accent'
                  )}
                >
                  <span className="w-5 text-center text-muted-foreground">—</span>
                  <span className="flex-1 text-left">None</span>
                  {!value.countryCode && <Check className="h-4 w-4" />}
                </button>

                {filteredCountries.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No country found
                  </div>
                ) : (
                  filteredCountries.map((country) => {
                    const isSelected =
                      value.countryCode === country.selectKey ||
                      value.countryCode === country.dialCode;
                    return (
                      <button
                        key={country.selectKey}
                        type="button"
                        data-country-item
                        onClick={() => selectCountry(country.selectKey)}
                        onKeyDown={(e) => handleItemKeyDown(e, country.selectKey)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent',
                          isSelected && 'bg-accent'
                        )}
                      >
                        <span className="w-5 shrink-0 text-center">{country.flag}</span>
                        <span className="min-w-0 flex-1 truncate text-left">
                          {country.name}{' '}
                          <span className="tabular-nums text-muted-foreground">
                            ({country.dialCode})
                          </span>
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Phone Number Input */}
      <Input
        type="tel"
        value={value.number}
        onChange={(e) => onChange({ ...value, number: e.target.value })}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
