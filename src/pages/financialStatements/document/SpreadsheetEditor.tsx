import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Italic,
  Indent,
  Minus,
  Outdent,
  Plus,
  Redo2,
  Rows3,
  Table2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import type {
  Cell,
  CellFormat,
  DisclosureRow,
  GeneratedTable,
  NumberFormat,
} from '../../../lib/financialStatements/disclosures/types';
import { formatCellValue, parseCellValue } from '../../../lib/financialStatements/disclosures/format';
import { recalculate } from '../../../lib/financialStatements/disclosures/merge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip';

type Position = { row: number; col: number };

const ORIGIN_STYLE: Record<Cell['origin'], string> = {
  linked: 'border-l-2 border-l-emerald-500/70',
  calculated: 'border-l-2 border-l-sky-500/70',
  manual: 'border-l-2 border-l-transparent',
};

const ORIGIN_TITLE: Record<Cell['origin'], string> = {
  linked: 'Linked to the ledger — the figure follows your accounting records',
  calculated: 'Calculated from the rows it adds up',
  manual: 'Yours to enter',
};

function clone(table: GeneratedTable): GeneratedTable {
  return JSON.parse(JSON.stringify(table)) as GeneratedTable;
}

function ToolbarButton({
  label,
  onClick,
  active,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground',
            'hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-muted text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A disclosure table, edited the way a table wants to be edited.
 *
 * Rows and columns can be added, removed and moved; cells can be formatted,
 * merged and given a number format. What it will not do is let an accounting
 * figure be typed over: a cell drawn from the ledger can be formatted and moved
 * but its value belongs to the accounting records, and a calculated cell belongs
 * to the rows it adds up. Everything else is the preparer's.
 */
export default function SpreadsheetEditor({
  table,
  readOnly,
  onChange,
  onViewSource,
}: {
  table: GeneratedTable;
  readOnly?: boolean;
  onChange: (next: GeneratedTable) => void;
  onViewSource?: (cell: Cell) => void;
}) {
  const [selection, setSelection] = useState<Position | null>(null);
  const [anchor, setAnchor] = useState<Position | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const undoStack = useRef<GeneratedTable[]>([]);
  const redoStack = useRef<GeneratedTable[]>([]);
  const [, forceRender] = useState(0);

  const width = useMemo(
    () => Math.max(table.columns.length, ...table.rows.map((r) => r.cells.length)),
    [table],
  );

  const commit = useCallback(
    (next: GeneratedTable, { recompute = true }: { recompute?: boolean } = {}) => {
      undoStack.current.push(clone(table));
      if (undoStack.current.length > 60) undoStack.current.shift();
      redoStack.current = [];
      onChange(recompute ? { ...next, rows: recalculate(next.rows) } : next);
      forceRender((n) => n + 1);
    },
    [table, onChange],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(clone(table));
    onChange(previous);
    forceRender((n) => n + 1);
  }, [table, onChange]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(clone(table));
    onChange(next);
    forceRender((n) => n + 1);
  }, [table, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const cellAt = (row: number, col: number): Cell | undefined => table.rows[row]?.cells[col];
  const selected = selection ? cellAt(selection.row, selection.col) : undefined;

  /** The rectangle between the anchor and the selection, for merging. */
  const range = useMemo(() => {
    if (!selection || !anchor) return null;
    return {
      top: Math.min(anchor.row, selection.row),
      bottom: Math.max(anchor.row, selection.row),
      left: Math.min(anchor.col, selection.col),
      right: Math.max(anchor.col, selection.col),
    };
  }, [selection, anchor]);

  const inRange = (row: number, col: number) =>
    !!range && row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;

  // ── mutations ────────────────────────────────────────────────────────────

  const patchFormat = (patch: Partial<CellFormat>) => {
    if (!selection || readOnly) return;
    const next = clone(table);
    const apply = (r: number, c: number) => {
      const target = next.rows[r]?.cells[c];
      if (target) target.format = { ...target.format, ...patch };
    };
    if (range) {
      for (let r = range.top; r <= range.bottom; r += 1) {
        for (let c = range.left; c <= range.right; c += 1) apply(r, c);
      }
    } else {
      apply(selection.row, selection.col);
    }
    commit(next, { recompute: false });
  };

  const toggleFormat = (key: 'bold' | 'italic' | 'underline') => {
    const currently = !!selected?.format?.[key];
    patchFormat({ [key]: !currently });
  };

  const setValue = (row: number, col: number, text: string) => {
    const target = cellAt(row, col);
    if (!target || readOnly || target.origin !== 'manual') return;
    const next = clone(table);
    next.rows[row].cells[col].value = parseCellValue(text);
    commit(next);
  };

  const blankCell = (template?: Cell): Cell => ({
    value: null,
    origin: 'manual',
    format: template?.format ? { ...template.format } : undefined,
  });

  const addRow = (at?: number) => {
    if (readOnly) return;
    const next = clone(table);
    const index = at ?? (selection ? selection.row + 1 : next.rows.length);
    const template = next.rows[Math.max(0, index - 1)];
    next.rows.splice(index, 0, {
      key: `added-${Date.now()}`,
      cells: Array.from({ length: width }, (_, c) => blankCell(template?.cells[c])),
    });
    commit(next);
  };

  const duplicateRow = () => {
    if (readOnly || !selection) return;
    const next = clone(table);
    const source = next.rows[selection.row];
    if (!source) return;
    // A copy is the preparer's own row: it must not claim to be linked.
    next.rows.splice(selection.row + 1, 0, {
      key: `copy-${Date.now()}`,
      kind: source.kind,
      cells: source.cells.map((c) => ({
        ...c,
        origin: 'manual',
        source: undefined,
        sums: undefined,
        formula: undefined,
      })),
    });
    commit(next);
  };

  const removeRow = (index: number) => {
    if (readOnly || table.rows.length <= 1) return;
    const next = clone(table);
    next.rows.splice(index, 1);
    setSelection(null);
    setAnchor(null);
    commit(next);
  };

  const moveRow = (index: number, by: -1 | 1) => {
    if (readOnly) return;
    const target = index + by;
    if (target < 0 || target >= table.rows.length) return;
    const next = clone(table);
    const [row] = next.rows.splice(index, 1);
    next.rows.splice(target, 0, row);
    setSelection({ row: target, col: selection?.col ?? 0 });
    setAnchor(null);
    commit(next);
  };

  const addColumn = () => {
    if (readOnly) return;
    const next = clone(table);
    const at = selection ? selection.col + 1 : width;
    next.columns.splice(at, 0, { label: '', align: 'right' });
    for (const row of next.rows) row.cells.splice(at, 0, blankCell());
    commit(next);
  };

  const removeColumn = (index: number) => {
    if (readOnly || width <= 2) return;
    const next = clone(table);
    next.columns.splice(index, 1);
    for (const row of next.rows) row.cells.splice(index, 1);
    setSelection(null);
    setAnchor(null);
    commit(next);
  };

  const setColumnLabel = (index: number, text: string) => {
    if (readOnly) return;
    const next = clone(table);
    if (!next.columns[index]) next.columns[index] = { label: text };
    else next.columns[index] = { ...next.columns[index], label: text };
    commit(next, { recompute: false });
  };

  const resizeColumn = (index: number, by: number) => {
    if (readOnly) return;
    const next = clone(table);
    const current = next.columns[index]?.width ?? 160;
    next.columns[index] = { ...next.columns[index], width: Math.max(80, current + by) };
    commit(next, { recompute: false });
  };

  const mergeSelection = () => {
    if (readOnly || !range) return;
    if (range.top === range.bottom && range.left === range.right) return;
    const next = clone(table);
    const anchorCell = next.rows[range.top].cells[range.left];
    anchorCell.colSpan = range.right - range.left + 1;
    anchorCell.rowSpan = range.bottom - range.top + 1;
    // Cells swallowed by the merge are marked so the renderer skips them.
    for (let r = range.top; r <= range.bottom; r += 1) {
      for (let c = range.left; c <= range.right; c += 1) {
        if (r === range.top && c === range.left) continue;
        next.rows[r].cells[c] = { value: null, origin: 'manual', colSpan: 0 };
      }
    }
    setAnchor(null);
    commit(next, { recompute: false });
  };

  const splitSelection = () => {
    if (readOnly || !selection) return;
    const target = cellAt(selection.row, selection.col);
    if (!target?.colSpan && !target?.rowSpan) return;
    const next = clone(table);
    const rows = target.rowSpan ?? 1;
    const cols = target.colSpan ?? 1;
    for (let r = selection.row; r < selection.row + rows; r += 1) {
      for (let c = selection.col; c < selection.col + cols; c += 1) {
        if (!next.rows[r]) continue;
        if (r === selection.row && c === selection.col) {
          delete next.rows[r].cells[c].colSpan;
          delete next.rows[r].cells[c].rowSpan;
        } else {
          next.rows[r].cells[c] = { value: null, origin: 'manual' };
        }
      }
    }
    commit(next, { recompute: false });
  };

  const indent = (by: 1 | -1) => {
    const current = selected?.format?.indent ?? 0;
    patchFormat({ indent: Math.max(0, current + by) });
  };

  const setNumberFormat = (kind: NumberFormat) => patchFormat({ numberFormat: kind });
  const setDecimals = (decimals: number) => patchFormat({ decimals });

  // ── render ───────────────────────────────────────────────────────────────

  const renderCell = (row: DisclosureRow, rowIndex: number, col: number) => {
    const value = row.cells[col];
    if (!value || value.colSpan === 0) return null;

    const active = selection?.row === rowIndex && selection?.col === col;
    const editing = active && draft !== null;
    const editable = !readOnly && value.origin === 'manual';
    const format = value.format;

    return (
      <td
        key={col}
        colSpan={value.colSpan && value.colSpan > 1 ? value.colSpan : undefined}
        rowSpan={value.rowSpan && value.rowSpan > 1 ? value.rowSpan : undefined}
        title={ORIGIN_TITLE[value.origin]}
        onMouseDown={(e) => {
          if (e.shiftKey && selection) setAnchor(selection);
          else setAnchor(null);
          setSelection({ row: rowIndex, col });
          setDraft(null);
        }}
        onDoubleClick={() => {
          if (editable) setDraft(value.value == null ? '' : String(value.value));
        }}
        className={cn(
          'relative border-b border-r px-2 py-1 align-middle text-sm',
          ORIGIN_STYLE[value.origin],
          active && 'outline outline-2 -outline-offset-2 outline-primary',
          inRange(rowIndex, col) && !active && 'bg-primary/10',
          format?.borderTop && 'border-t',
          format?.borderBottom && 'border-b-2',
          format?.doubleBottom && 'border-b-4 border-double',
          !editable && 'bg-muted/20',
        )}
        style={{ width: table.columns[col]?.width }}
        data-testid={`cell-${rowIndex}-${col}`}
        data-origin={value.origin}
      >
        {editing ? (
          <input
            autoFocus
            className="w-full bg-transparent outline-none"
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setValue(rowIndex, col, draft ?? '');
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setValue(rowIndex, col, draft ?? '');
                setDraft(null);
              } else if (e.key === 'Escape') {
                setDraft(null);
              }
            }}
          />
        ) : (
          <span
            className={cn(
              'block truncate',
              format?.bold && 'font-semibold',
              format?.italic && 'italic',
              format?.underline && 'underline',
              format?.align === 'right' && 'text-right',
              format?.align === 'center' && 'text-center',
              typeof value.value === 'number' && 'tabular-nums',
            )}
            style={format?.indent ? { paddingLeft: format.indent * 14 } : undefined}
          >
            {formatCellValue(value.value, format)}
          </span>
        )}
      </td>
    );
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="space-y-2" data-testid="afs-spreadsheet">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/30 p-1">
          <ToolbarButton label="Undo" onClick={undo} disabled={readOnly} testId="ss-undo">
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={redo} disabled={readOnly} testId="ss-redo">
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          <ToolbarButton
            label="Bold"
            active={!!selected?.format?.bold}
            onClick={() => toggleFormat('bold')}
            disabled={readOnly || !selection}
            testId="ss-bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={!!selected?.format?.italic}
            onClick={() => toggleFormat('italic')}
            disabled={readOnly || !selection}
            testId="ss-italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={!!selected?.format?.underline}
            onClick={() => toggleFormat('underline')}
            disabled={readOnly || !selection}
            testId="ss-underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          <ToolbarButton
            label="Align left"
            active={selected?.format?.align === 'left'}
            onClick={() => patchFormat({ align: 'left' })}
            disabled={readOnly || !selection}
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align centre"
            active={selected?.format?.align === 'center'}
            onClick={() => patchFormat({ align: 'center' })}
            disabled={readOnly || !selection}
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            active={selected?.format?.align === 'right'}
            onClick={() => patchFormat({ align: 'right' })}
            disabled={readOnly || !selection}
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Decrease indent"
            onClick={() => indent(-1)}
            disabled={readOnly || !selection}
          >
            <Outdent className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Increase indent"
            onClick={() => indent(1)}
            disabled={readOnly || !selection}
          >
            <Indent className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          {/* Number formats */}
          <select
            aria-label="Number format"
            data-testid="ss-number-format"
            disabled={readOnly || !selection}
            value={selected?.format?.numberFormat ?? 'currency'}
            onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
            className="h-7 rounded border bg-background px-1 text-xs disabled:opacity-40"
          >
            <option value="currency">Currency</option>
            <option value="number">Number</option>
            <option value="percent">Percent</option>
            <option value="text">Text</option>
          </select>
          <select
            aria-label="Decimal places"
            disabled={readOnly || !selection}
            value={String(selected?.format?.decimals ?? 2)}
            onChange={(e) => setDecimals(Number(e.target.value))}
            className="h-7 rounded border bg-background px-1 text-xs disabled:opacity-40"
          >
            {[0, 1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d} dp
              </option>
            ))}
          </select>
          <ToolbarButton
            label="Negatives in brackets"
            active={selected?.format?.negativeParens !== false}
            onClick={() => patchFormat({ negativeParens: selected?.format?.negativeParens === false })}
            disabled={readOnly || !selection}
          >
            <span className="text-[11px]">()</span>
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          {/* Borders */}
          <ToolbarButton
            label="Rule above"
            active={!!selected?.format?.borderTop}
            onClick={() => patchFormat({ borderTop: !selected?.format?.borderTop })}
            disabled={readOnly || !selection}
          >
            <span className="text-[11px] leading-none">‾</span>
          </ToolbarButton>
          <ToolbarButton
            label="Rule below"
            active={!!selected?.format?.borderBottom}
            onClick={() => patchFormat({ borderBottom: !selected?.format?.borderBottom })}
            disabled={readOnly || !selection}
          >
            <span className="text-[11px] leading-none">_</span>
          </ToolbarButton>
          <ToolbarButton
            label="Double rule below"
            active={!!selected?.format?.doubleBottom}
            onClick={() => patchFormat({ doubleBottom: !selected?.format?.doubleBottom })}
            disabled={readOnly || !selection}
          >
            <span className="text-[11px] leading-none">=</span>
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          {/* Structure */}
          <ToolbarButton label="Add row" onClick={() => addRow()} disabled={readOnly} testId="ss-add-row">
            <Rows3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Duplicate row"
            onClick={duplicateRow}
            disabled={readOnly || !selection}
            testId="ss-duplicate-row"
          >
            <Copy className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move row up"
            onClick={() => selection && moveRow(selection.row, -1)}
            disabled={readOnly || !selection}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move row down"
            onClick={() => selection && moveRow(selection.row, 1)}
            disabled={readOnly || !selection}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Delete row"
            onClick={() => selection && removeRow(selection.row)}
            disabled={readOnly || !selection}
            testId="ss-delete-row"
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Add column" onClick={addColumn} disabled={readOnly} testId="ss-add-column">
            <Plus className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Merge cells"
            onClick={mergeSelection}
            disabled={readOnly || !range}
            testId="ss-merge"
          >
            <Table2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Split cell"
            onClick={splitSelection}
            disabled={readOnly || !(selected?.colSpan || selected?.rowSpan)}
          >
            <span className="text-[11px] leading-none">⇲</span>
          </ToolbarButton>

          {selected?.origin === 'linked' && onViewSource && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={() => onViewSource(selected)}
              data-testid="ss-view-source"
            >
              View source
            </Button>
          )}
        </div>

        {/* Grid */}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                {Array.from({ length: width }, (_, c) => (
                  <th
                    key={c}
                    className="border-b border-r p-1 text-left"
                    style={{ width: table.columns[c]?.width, minWidth: table.columns[c]?.width }}
                  >
                    <div className="flex items-center gap-0.5">
                      <Input
                        value={table.columns[c]?.label ?? ''}
                        readOnly={readOnly}
                        placeholder={c === 0 ? 'Description' : `Column ${c}`}
                        onChange={(e) => setColumnLabel(c, e.target.value)}
                        className="h-7 border-0 bg-transparent text-xs font-medium shadow-none focus-visible:ring-1"
                      />
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            aria-label={`Narrow column ${c + 1}`}
                            className="text-muted-foreground/60 hover:text-foreground"
                            onClick={() => resizeColumn(c, -40)}
                          >
                            <ChevronUp className="h-3 w-3 -rotate-90" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Widen column ${c + 1}`}
                            className="text-muted-foreground/60 hover:text-foreground"
                            onClick={() => resizeColumn(c, 40)}
                          >
                            <ChevronDown className="h-3 w-3 -rotate-90" />
                          </button>
                          {width > 2 && (
                            <button
                              type="button"
                              aria-label={`Delete column ${c + 1}`}
                              className="text-muted-foreground/60 hover:text-destructive"
                              onClick={() => removeColumn(c)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr
                  key={row.key ?? rowIndex}
                  className={cn(
                    row.kind === 'header' && 'bg-muted/30',
                    row.kind === 'spacer' && 'h-3',
                  )}
                >
                  {Array.from({ length: width }, (_, c) => renderCell(row, rowIndex, c))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend — what the colours down the left of each cell mean. */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-emerald-500/70" /> Linked to the ledger
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-sky-500/70" /> Calculated
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-border" /> Yours to enter
          </span>
          <span className="ml-auto">Double-click a cell to edit. Shift-click to select a range.</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
