import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { TableHead } from './ui/table';
import { cn } from '../lib/utils';
import type { SortState } from '../hooks/useSortableData';

interface SortableHeaderProps {
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
  /** Right-align the label (for numeric columns). */
  align?: 'left' | 'right';
}

/**
 * A table header cell that toggles sorting for its column. Shows a neutral
 * chevron by default and an up/down chevron once its column is active.
 */
export function SortableHeader({ sortKey, sort, onSort, children, className, align = 'left' }: SortableHeaderProps) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ChevronUp : ChevronDown;

  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'group inline-flex items-center gap-1 -mx-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {children}
        <Icon className={cn('h-3.5 w-3.5 shrink-0 transition-opacity', active ? 'opacity-100 text-primary' : 'opacity-40 group-hover:opacity-70')} />
      </button>
    </TableHead>
  );
}
