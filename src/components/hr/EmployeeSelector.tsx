import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  filterAndRankEmployees,
  resolveEmployeeById,
  type EmployeeIdentityFields,
} from '../../lib/employeeIdentity';
import { EmployeeIdentity } from './EmployeeIdentity';

type Props = {
  employees: EmployeeIdentityFields[];
  value?: string;
  onValueChange: (employeeId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Exclude terminated/archived by default */
  activeOnly?: boolean;
};

/**
 * Smart employee selector — shared across all modules.
 * Typing "Sarah" or "EMP-000245" finds the employee immediately.
 */
export function EmployeeSelector({
  employees,
  value,
  onValueChange,
  placeholder = 'Search by name or employee number…',
  disabled = false,
  className,
  activeOnly = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const pool = useMemo(() => {
    if (!activeOnly) return employees;
    return employees.filter(
      (e) => !e.employment_status || !['terminated', 'archived'].includes(e.employment_status)
    );
  }, [employees, activeOnly]);

  const filtered = useMemo(
    () => (search.trim() ? filterAndRankEmployees(pool, search) : pool),
    [pool, search]
  );

  const selected = value ? resolveEmployeeById(pool, value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-auto min-h-10 py-2', className)}
        >
          {selected ? (
            <EmployeeIdentity
              employee={selected}
              variant="selector"
              size="sm"
              showDepartment
              showBranch
              showStatus
            />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Name, number, department…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 50).map((employee) => (
                <CommandItem
                  key={employee.id}
                  value={employee.id ?? employee.employee_number}
                  onSelect={() => {
                    onValueChange(employee.id!);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="py-2"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === employee.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <EmployeeIdentity
                    employee={employee}
                    variant="selector"
                    size="sm"
                    showDepartment
                    showBranch
                    showStatus
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
