
"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

export type ComboboxOption = {
  value: string
  label: string
}

type ComboboxProps = {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyPlaceholder?: string
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No options found.",
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])
  
  const handleSelect = (currentValue: string) => {
    const newValue = currentValue === value ? "" : currentValue
    onChange(newValue)
    setInputValue(newValue) // Also update the visual input
    setOpen(false)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = event.target.value;
    setInputValue(val)
    onChange(val);
    if(val) {
        setOpen(true);
    } else {
        setOpen(false);
    }
  }


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative w-full", className)}>
            <Input 
                value={inputValue}
                onChange={handleInputChange}
                placeholder={placeholder}
                role="combobox"
                aria-expanded={open}
                className="w-full pr-10"
            />
            <Button
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setOpen(!open)}
            >
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
            filter={(value, search) => {
                // value is the option.value, search is the input
                const option = options.find(opt => opt.value === value);
                if (option?.label.toLowerCase().includes(search.toLowerCase())) return 1;
                return 0;
            }}
        >
          <CommandList>
            <CommandEmpty>{emptyPlaceholder}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
