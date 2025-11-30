'use client'

import * as React from "react"
import { ChevronDown, Check, Search, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface SearchableSelectProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> {
  options?: SelectOption[]
  value?: string | string[]
  defaultValue?: string | string[]
  placeholder?: string
  multiple?: boolean
  disabled?: boolean
  required?: boolean
  label?: string
  description?: string
  error?: string
  searchable?: boolean
  clearable?: boolean
  loading?: boolean
  name?: string
  onChange?: (value: string | string[]) => void
  onOpenChange?: (open: boolean) => void
}

const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  (
    {
      className,
      options = [],
      value,
      defaultValue,
      placeholder = "Select an option",
      multiple = false,
      disabled = false,
      required = false,
      label,
      description,
      error,
      searchable = false,
      clearable = false,
      loading = false,
      id,
      name,
      onChange,
      onOpenChange,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [searchTerm, setSearchTerm] = React.useState("")

    // Generate unique ID if not provided
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`

    // Filter options based on search
    const filteredOptions = searchable && searchTerm
      ? options.filter(option =>
          option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          option.value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      : options

    // Get selected option(s) for display
    const getSelectedDisplay = () => {
      if (!value) return placeholder

      if (multiple) {
        const valueArray = Array.isArray(value) ? value : []
        const selectedOptions = options.filter(opt => valueArray.includes(opt.value))
        if (selectedOptions.length === 0) return placeholder
        if (selectedOptions.length === 1) return selectedOptions[0].label
        return `${selectedOptions.length} items selected`
      }

      const selectedOption = options.find(opt => opt.value === value)
      return selectedOption ? selectedOption.label : placeholder
    }

    const handleToggle = () => {
      if (!disabled) {
        const newIsOpen = !isOpen
        setIsOpen(newIsOpen)
        onOpenChange?.(newIsOpen)
        if (!newIsOpen) {
          setSearchTerm("")
        }
      }
    }

    const handleOptionSelect = (option: SelectOption) => {
      if (multiple) {
        const valueArray = Array.isArray(value) ? value : []
        const updatedValue = valueArray.includes(option.value)
          ? valueArray.filter(v => v !== option.value)
          : [...valueArray, option.value]
        onChange?.(updatedValue)
      } else {
        onChange?.(option.value)
        setIsOpen(false)
        onOpenChange?.(false)
      }
    }

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange?.(multiple ? [] : '')
    }

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value)
    }

    const isSelected = (optionValue: string) => {
      if (multiple) {
        const valueArray = Array.isArray(value) ? value : []
        return valueArray.includes(optionValue)
      }
      return value === optionValue
    }

    const hasValue = multiple
      ? (Array.isArray(value) && value.length > 0)
      : (value !== undefined && value !== '')

    // Close dropdown when clicking outside
    React.useEffect(() => {
      if (!isOpen) return

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (!target.closest(`#${selectId}-container`)) {
          setIsOpen(false)
          onOpenChange?.(false)
          setSearchTerm("")
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, selectId, onOpenChange])

    return (
      <div id={`${selectId}-container`} className={cn("relative", className)}>
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block",
              error ? "text-destructive" : "text-foreground"
            )}
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <button
            ref={ref}
            id={selectId}
            type="button"
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive focus:ring-destructive",
              !hasValue && "text-muted-foreground"
            )}
            onClick={handleToggle}
            disabled={disabled}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={label || placeholder}
            {...props}
          >
            <span className="truncate">{getSelectedDisplay()}</span>

            <div className="flex items-center gap-1">
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}

              {clearable && hasValue && !loading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 hover:bg-transparent"
                  onClick={handleClear}
                  type="button"
                  tabIndex={-1}
                  aria-label="Clear selection"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}

              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </button>

          {/* Hidden native select for form submission */}
          <select
            name={name}
            value={multiple ? undefined : (value as string || '')}
            onChange={() => {}} // Controlled by our custom logic
            className="sr-only"
            tabIndex={-1}
            multiple={multiple}
            required={required}
            aria-hidden="true"
          >
            <option value="">Select...</option>
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown */}
          {isOpen && (
            <div
              className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-md shadow-md"
              role="listbox"
              aria-label={label || placeholder}
            >
              {searchable && (
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search options..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                      className="pl-8"
                      autoFocus
                      aria-label="Search options"
                    />
                  </div>
                </div>
              )}

              <div className="py-1 max-h-60 overflow-auto">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {searchTerm ? 'No options found' : 'No options available'}
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <div
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                        isSelected(option.value) && "bg-accent/50",
                        option.disabled && "pointer-events-none opacity-50"
                      )}
                      onClick={() => !option.disabled && handleOptionSelect(option)}
                      role="option"
                      aria-selected={isSelected(option.value)}
                      aria-disabled={option.disabled}
                    >
                      <span className="flex-1">{option.label}</span>
                      {multiple && isSelected(option.value) && (
                        <Check className="h-4 w-4 shrink-0" />
                      )}
                      {option.description && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {option.description}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {description && !error && (
          <p className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive mt-1" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }
)

SearchableSelect.displayName = "SearchableSelect"

export { SearchableSelect }
