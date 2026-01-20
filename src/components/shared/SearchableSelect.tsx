import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

interface Option {
    label: string;
    value: string;
    group?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    className?: string;
    disabled?: boolean;
}

export function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'Select option...',
    searchPlaceholder = 'Search...',
    emptyMessage = 'No options found.',
    className,
    disabled = false,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);

    const groupedOptions = React.useMemo(() => {
        const groups: Record<string, Option[]> = {};
        const sortedOptions = [...options].sort((a, b) =>
            (a.group || '').localeCompare(b.group || '')
        );
        sortedOptions.forEach(option => {
            const groupName = option.group || '';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(option);
        });
        return groups;
    }, [options]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('w-full justify-between', className)}
                    disabled={disabled}
                >
                    <span className={cn('truncate', !value && 'text-muted-foreground')}>
                        {value
                            ? options.find((option) => option.value === value)?.label
                            : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} />
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        {Object.entries(groupedOptions).map(([groupName, groupOptions]) => (
                            <CommandGroup key={groupName} heading={groupName || undefined}>
                                {groupOptions.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={`${groupName} ${option.label}`} // Combine group and label for search
                                        onSelect={() => {
                                            onChange(option.value === value ? '' : option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                value === option.value ? 'opacity-100' : 'opacity-0'
                                            )}
                                        />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
