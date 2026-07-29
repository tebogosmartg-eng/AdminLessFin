import * as React from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import type { QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { QuickCreateDialog, type QuickCreateConfig } from './QuickCreateDialog';

/**
 * SmartSelect — the platform-standard searchable selector for AdminLess Fin.
 *
 * This is the single selection experience used everywhere in the product: every
 * searchable dropdown adopts it so users learn one interaction pattern and meet it
 * everywhere. See docs/ux/SMART_SELECT_STANDARD.md.
 *
 * A dropdown must never be a dead end. If the record the user needs does not exist,
 * they create it inline — without leaving the surrounding form. Capabilities:
 * search, keyboard navigation, type-ahead filtering, clear selection, friendly
 * empty state, a recently-used section, create-on-the-fly, and automatic selection
 * of the record once created.
 */

export interface SmartSelectOption {
  value: string;
  label: string;
  /** Secondary line (e.g. account code, customer email). */
  description?: string;
  /** Extra tokens matched during search, in addition to the label. */
  keywords?: string[];
}

export interface SmartSelectProps {
  options: SmartSelectOption[];
  value?: string | null;
  onChange: (value: string) => void;
  /** Singular, lowercase noun for copy — e.g. "customer", "income account". */
  entityLabel: string;
  placeholder?: string;
  /**
   * Stable scope key for the recently-used memory (e.g. "customer"). Callers fold
   * in the active company id (`customer:${companyId}`) so tenants never share
   * history. Omit to disable the recently-used section.
   */
  recentScope?: string;
  /** Config for the inline create modal. Omit to hide the create affordance. */
  createConfig?: QuickCreateConfig;
  /** React Query keys to invalidate after a successful inline create. */
  invalidateKeys?: QueryKey[];
  /** Notified after an inline create, with the freshly created option. */
  onCreated?: (option: SmartSelectOption) => void;
  allowClear?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  id?: string;
  className?: string;
  /** Width of the popdown; defaults to matching the trigger. */
  contentClassName?: string;
}

const RECENT_LIMIT = 5;

function recentStorageKey(scope: string): string {
  return `smartselect:recent:${scope}`;
}

function readRecent(scope: string | undefined): string[] {
  if (!scope) return [];
  try {
    const raw = window.localStorage.getItem(recentStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(scope: string | undefined, value: string): void {
  if (!scope) return;
  try {
    const next = [value, ...readRecent(scope).filter((v) => v !== value)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(recentStorageKey(scope), JSON.stringify(next));
  } catch {
    /* storage unavailable — recently-used is a nicety, never a hard dependency */
  }
}

export function SmartSelect({
  options,
  value,
  onChange,
  entityLabel,
  placeholder,
  recentScope,
  createConfig,
  invalidateKeys,
  onCreated,
  allowClear = true,
  disabled = false,
  isLoading = false,
  id,
  className,
  contentClassName,
}: SmartSelectProps) {
  const queryClient = useQueryClient();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  // Options created inline are held locally so the new record is selectable and
  // labelled immediately, before the parent query has a chance to refetch.
  const [locallyCreated, setLocallyCreated] = React.useState<SmartSelectOption[]>([]);

  const mergedOptions = React.useMemo(() => {
    const byValue = new Map<string, SmartSelectOption>();
    for (const opt of options) byValue.set(opt.value, opt);
    // Locally created options take precedence only until the real record arrives.
    for (const opt of locallyCreated) if (!byValue.has(opt.value)) byValue.set(opt.value, opt);
    return Array.from(byValue.values());
  }, [options, locallyCreated]);

  const selected = React.useMemo(
    () => mergedOptions.find((o) => o.value === value) ?? null,
    [mergedOptions, value],
  );

  const recentValues = React.useMemo(() => {
    if (!recentScope || search) return [];
    const known = new Set(mergedOptions.map((o) => o.value));
    return readRecent(recentScope).filter((v) => known.has(v) && v !== value);
  }, [recentScope, search, mergedOptions, value]);

  const recentOptions = React.useMemo(
    () =>
      recentValues
        .map((v) => mergedOptions.find((o) => o.value === v))
        .filter((o): o is SmartSelectOption => !!o),
    [recentValues, mergedOptions],
  );

  const canCreate = !!createConfig;
  const trimmedSearch = search.trim();

  const commit = React.useCallback(
    (next: string) => {
      onChange(next);
      pushRecent(recentScope, next);
      setOpen(false);
      setSearch('');
    },
    [onChange, recentScope],
  );

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange('');
    },
    [onChange],
  );

  const handleCreated = React.useCallback(
    (option: SmartSelectOption) => {
      setLocallyCreated((prev) => [option, ...prev.filter((o) => o.value !== option.value)]);
      if (invalidateKeys?.length) {
        for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key });
      }
      onCreated?.(option);
      commit(option.value);
      setCreateOpen(false);
      // Return focus to this field so keyboard users land back on the logical
      // control they were completing and can tab straight to the next field.
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [invalidateKeys, queryClient, onCreated, commit],
  );

  const renderOption = (opt: SmartSelectOption) => (
    <CommandItem
      key={opt.value}
      value={opt.value}
      keywords={[opt.label, ...(opt.description ? [opt.description] : []), ...(opt.keywords ?? [])]}
      onSelect={() => commit(opt.value)}
    >
      <Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{opt.label}</span>
        {opt.description ? (
          <span className="truncate text-xs text-muted-foreground">{opt.description}</span>
        ) : null}
      </span>
    </CommandItem>
  );

  const triggerLabel = selected
    ? selected.label
    : isLoading
      ? 'Loading…'
      : (placeholder ?? `Select ${entityLabel}`);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={triggerLabel}
            disabled={disabled || isLoading}
            className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
          >
            <span className="truncate">{triggerLabel}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {allowClear && selected && !disabled ? (
                <X
                  role="button"
                  tabIndex={0}
                  className="h-4 w-4 opacity-50 hover:opacity-100"
                  onClick={handleClear}
                  aria-label={`Clear ${entityLabel}`}
                />
              ) : null}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn('w-[--radix-popover-trigger-width] min-w-[240px] p-0', contentClassName)}
          align="start"
        >
          <Command>
            <CommandInput
              placeholder={`Search ${entityLabel}…`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center gap-3 px-3 py-4 text-sm">
                  <span className="text-muted-foreground">No matching results found.</span>
                  {canCreate ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create {trimmedSearch ? `"${trimmedSearch}"` : `new ${entityLabel}`}
                    </Button>
                  ) : null}
                </div>
              </CommandEmpty>

              {recentOptions.length > 0 ? (
                <CommandGroup heading="Recently used">{recentOptions.map(renderOption)}</CommandGroup>
              ) : null}

              {mergedOptions.length > 0 ? (
                <CommandGroup heading={recentOptions.length > 0 ? 'All' : undefined}>
                  {mergedOptions.map(renderOption)}
                </CommandGroup>
              ) : null}

              {canCreate ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__smartselect_create__"
                      keywords={['create', 'new', 'add', entityLabel]}
                      onSelect={() => setCreateOpen(true)}
                      className="text-primary"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create {trimmedSearch ? `"${trimmedSearch}"` : `new ${entityLabel}`}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {createConfig ? (
        <QuickCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          config={createConfig}
          initialName={trimmedSearch}
          onCreated={handleCreated}
        />
      ) : null}
    </>
  );
}

export default SmartSelect;
