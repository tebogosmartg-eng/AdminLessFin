import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  CopyPlus,
  Italic,
  Indent,
  Minus,
  Outdent,
  Plus,
  Redo2,
  Rows3,
  Scissors,
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
import {
  blockToTsv,
  clearBlock,
  describePaste,
  pasteBlock,
  readBlock,
  tsvToBlock,
  type CellBlock,
  type Rect,
} from '../../../lib/financialStatements/disclosures/clipboard';
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

/** Typefaces a set of financial statements is actually set in. */
const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, monospace' },
];

function clone(table: GeneratedTable): GeneratedTable {
  return JSON.parse(JSON.stringify(table)) as GeneratedTable;
}

/**
 * A keystroke inside a column heading belongs to that box, not to the grid —
 * otherwise typing a column name would start editing a cell instead.
 */
function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
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
          // Keep focus in the grid: a toolbar button that steals it would break
          // the next keystroke and the clipboard events that ride on focus.
          onMouseDown={(e) => e.preventDefault()}
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
 * Rows and columns can be added, removed, duplicated and moved; cells can be
 * formatted, merged, navigated with the keyboard and copied in and out of Excel.
 * What it will not do is let an accounting figure be typed or pasted over: a
 * cell drawn from the ledger can be formatted and moved but its value belongs to
 * the accounting records, and a calculated cell belongs to the rows it adds up.
 * Everything else is the preparer's.
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
  const [notice, setNotice] = useState<{ message: string; protective: boolean } | null>(null);
  /** The row a delete is waiting to be confirmed on, when it is the ledger's. */
  const [confirmRow, setConfirmRow] = useState<number | null>(null);
  const undoStack = useRef<GeneratedTable[]>([]);
  const redoStack = useRef<GeneratedTable[]>([]);
  /** Full-fidelity copy, so formatting survives a copy and paste in-app. */
  const clipboard = useRef<{ block: CellBlock; tsv: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<Position | null>(null);
  const [, forceRender] = useState(0);

  const width = useMemo(
    () => Math.max(table.columns.length, ...table.rows.map((r) => r.cells.length)),
    [table],
  );

  const pushUndo = useCallback(() => {
    undoStack.current.push(clone(table));
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  }, [table]);

  const commit = useCallback(
    (next: GeneratedTable, { recompute = true }: { recompute?: boolean } = {}) => {
      pushUndo();
      onChange(recompute ? { ...next, rows: recalculate(next.rows) } : next);
      forceRender((n) => n + 1);
    },
    [pushUndo, onChange],
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

  /** What the clipboard acts on: the range, or the one selected cell. */
  const rect = useCallback((): Rect | null => {
    if (range) return range;
    if (!selection) return null;
    return { top: selection.row, bottom: selection.row, left: selection.col, right: selection.col };
  }, [range, selection]);

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

  /**
   * Deleting a row that came from the ledger needs asking about.
   *
   * The structure the preparer saves is what the note keeps, so removing a row
   * of linked figures removes an asset class from the disclosure for good, and
   * the note quietly stops agreeing with the trial balance — the total falls by
   * exactly the figure that is no longer shown, with nothing on screen to say
   * why. A row the preparer typed themselves is theirs to remove without
   * ceremony; a row the accounting records put there is not.
   */
  const removeRow = (index: number) => {
    if (readOnly || table.rows.length <= 1) return;
    const row = table.rows[index];
    const linked = (row?.cells || []).filter((c) => c.origin === 'linked');
    if (linked.length > 0 && confirmRow !== index) {
      setConfirmRow(index);
      const label = row.cells.find((c) => typeof c.value === 'string' && c.value)?.value;
      setNotice({
        message: `${label ? `"${label}"` : 'This row'} comes from the ledger. Deleting it takes it out of the note for good and the total will no longer agree with your accounting records. Press delete again to remove it.`,
        protective: true,
      });
      return;
    }
    const next = clone(table);
    next.rows.splice(index, 1);
    setSelection(null);
    setAnchor(null);
    setConfirmRow(null);
    setNotice(null);
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

  const duplicateColumn = () => {
    if (readOnly || !selection) return;
    const at = selection.col;
    const next = clone(table);
    next.columns.splice(at + 1, 0, {
      ...next.columns[at],
      label: next.columns[at]?.label ? `${next.columns[at].label} (copy)` : '',
    });
    for (const row of next.rows) {
      const source = row.cells[at];
      // As with a duplicated row: the copy is the preparer's, not the ledger's.
      row.cells.splice(at + 1, 0, {
        ...(source ?? { value: null, origin: 'manual' }),
        origin: 'manual',
        source: undefined,
        sums: undefined,
        formula: undefined,
      });
    }
    commit(next, { recompute: false });
  };

  const moveColumn = (index: number, by: -1 | 1) => {
    if (readOnly) return;
    const target = index + by;
    if (target < 0 || target >= width) return;
    const next = clone(table);
    const [column] = next.columns.splice(index, 1);
    next.columns.splice(target, 0, column);
    for (const row of next.rows) {
      const [cellMoved] = row.cells.splice(index, 1);
      row.cells.splice(target, 0, cellMoved);
    }
    setSelection({ row: selection?.row ?? 0, col: target });
    setAnchor(null);
    commit(next, { recompute: false });
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

  const setColumnWidth = (index: number, value: number, { silent = false } = {}) => {
    if (readOnly) return;
    const next = clone(table);
    next.columns[index] = { ...next.columns[index], width: Math.max(72, Math.round(value)) };
    if (silent) onChange(next);
    else commit(next, { recompute: false });
  };

  const resizeColumn = (index: number, by: number) => {
    setColumnWidth(index, (table.columns[index]?.width ?? 160) + by);
  };

  /** Drag the edge of a column heading, as a spreadsheet does. */
  const beginResize = (index: number, event: React.MouseEvent) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth =
      table.columns[index]?.width ??
      gridRef.current?.querySelectorAll('thead th')[index]?.getBoundingClientRect().width ??
      160;
    // One undo entry for the whole drag, not one per pixel.
    pushUndo();
    const move = (e: MouseEvent) => setColumnWidth(index, startWidth + (e.clientX - startX), { silent: true });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
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

  // ── clipboard ────────────────────────────────────────────────────────────

  const copySelection = useCallback((): string | null => {
    const area = rect();
    if (!area) return null;
    const block = readBlock(table.rows, area);
    const tsv = blockToTsv(block);
    clipboard.current = { block, tsv };
    return tsv;
  }, [rect, table.rows]);

  const cutSelection = useCallback(() => {
    if (readOnly) return null;
    const area = rect();
    const tsv = copySelection();
    if (!area || tsv === null) return null;
    const { rows, kept } = clearBlock(table.rows, area);
    commit({ ...table, rows }, { recompute: true });
    setNotice(
      kept > 0
        ? {
            message: `Cut — ${kept} ${kept === 1 ? 'cell keeps its' : 'cells keep their'} figure from the ledger.`,
            protective: true,
          }
        : null,
    );
    return tsv;
  }, [readOnly, rect, copySelection, table, commit]);

  const applyPaste = useCallback(
    (text: string) => {
      if (readOnly || !selection) return;
      // Text identical to what we put on the clipboard means this is our own
      // copy coming back: use the block we kept, so formatting survives.
      const block =
        clipboard.current && clipboard.current.tsv === text ? clipboard.current.block : tsvToBlock(text);
      if (block.length === 0) return;
      const result = pasteBlock(table.rows, selection, block, { width });
      commit({ ...table, rows: result.rows }, { recompute: true });
      setNotice(describePaste(result));
      // Select what was pasted, as a spreadsheet does.
      setAnchor(selection);
      setSelection({
        row: Math.min(selection.row + block.length - 1, result.rows.length - 1),
        col: Math.min(selection.col + Math.max(...block.map((r) => r.length)) - 1, width - 1),
      });
    },
    [readOnly, selection, table, width, commit],
  );

  /** The toolbar's paste, which has to go and ask the system for the text. */
  const pasteFromSystem = useCallback(async () => {
    if (readOnly || !selection) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        applyPaste(text);
        return;
      }
    } catch {
      // Reading the clipboard needs permission the browser may not give.
    }
    if (clipboard.current) applyPaste(clipboard.current.tsv);
    else setNotice({ message: 'Press Ctrl+V to paste — this browser will not hand over the clipboard.', protective: false });
  }, [readOnly, selection, applyPaste]);

  const onCopy = (e: React.ClipboardEvent) => {
    if (draft !== null || inTextField(e.target)) return;
    const tsv = copySelection();
    if (tsv === null) return;
    e.clipboardData.setData('text/plain', tsv);
    e.preventDefault();
  };

  const onCut = (e: React.ClipboardEvent) => {
    if (draft !== null || readOnly || inTextField(e.target)) return;
    const tsv = cutSelection();
    if (tsv === null) return;
    e.clipboardData.setData('text/plain', tsv);
    e.preventDefault();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (draft !== null || readOnly || inTextField(e.target)) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    applyPaste(text);
  };

  // ── keyboard ─────────────────────────────────────────────────────────────

  const move = (dRow: number, dCol: number, extend: boolean) => {
    if (!selection) return;
    const row = Math.min(Math.max(0, selection.row + dRow), table.rows.length - 1);
    const col = Math.min(Math.max(0, selection.col + dCol), width - 1);
    if (extend) setAnchor(anchor ?? selection);
    else setAnchor(null);
    setSelection({ row, col });
  };

  const beginEdit = (initial?: string) => {
    if (readOnly || !selection) return;
    const target = cellAt(selection.row, selection.col);
    if (!target || target.origin !== 'manual') {
      setNotice({
        message:
          target?.origin === 'linked'
            ? 'This figure comes from the ledger. Change the accounting records, not the note.'
            : 'This figure is calculated from the rows it adds up.',
        protective: true,
      });
      return;
    }
    setDraft(initial ?? (target.value == null ? '' : String(target.value)));
  };

  const clearSelection = () => {
    const area = rect();
    if (readOnly || !area) return;
    const { rows, kept } = clearBlock(table.rows, area);
    commit({ ...table, rows });
    if (kept > 0) {
      setNotice({
        message: `${kept} ${kept === 1 ? 'cell keeps its' : 'cells keep their'} figure from the ledger.`,
        protective: true,
      });
    }
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (draft !== null) return; // the cell's own input is handling this
    if (inTextField(e.target)) return; // a column heading is being typed into
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (ctrl && (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    // Copy, cut and paste ride on the browser's own events, which fire after
    // this one; letting them through is what puts the text on the system
    // clipboard. Only the paste that the browser cannot deliver is handled here.
    if (ctrl && ['c', 'x', 'v', 'C', 'X', 'V', 'a', 'A'].includes(e.key)) {
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setAnchor({ row: 0, col: 0 });
        setSelection({ row: table.rows.length - 1, col: width - 1 });
      }
      return;
    }
    if (!selection) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        move(-1, 0, e.shiftKey);
        return;
      case 'ArrowDown':
        e.preventDefault();
        move(1, 0, e.shiftKey);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        move(0, -1, e.shiftKey);
        return;
      case 'ArrowRight':
        e.preventDefault();
        move(0, 1, e.shiftKey);
        return;
      case 'Tab': {
        e.preventDefault();
        const last = width - 1;
        if (!e.shiftKey && selection.col >= last) {
          setAnchor(null);
          setSelection({ row: Math.min(selection.row + 1, table.rows.length - 1), col: 0 });
        } else if (e.shiftKey && selection.col <= 0) {
          setAnchor(null);
          setSelection({ row: Math.max(selection.row - 1, 0), col: last });
        } else {
          move(0, e.shiftKey ? -1 : 1, false);
        }
        return;
      }
      case 'Enter':
        e.preventDefault();
        move(e.shiftKey ? -1 : 1, 0, false);
        return;
      case 'F2':
        e.preventDefault();
        beginEdit();
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        clearSelection();
        return;
      case 'Escape':
        setAnchor(null);
        return;
      default:
        break;
    }

    // Typing over a cell replaces it, as a spreadsheet does.
    if (!ctrl && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      beginEdit(e.key);
    }
  };

  // Dragging across cells selects a range; the button may come up anywhere.
  useEffect(() => {
    const stop = () => {
      dragFrom.current = null;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

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
          dragFrom.current = { row: rowIndex, col };
          setSelection({ row: rowIndex, col });
          setDraft(null);
          // The grid must hold focus for the arrow keys and the clipboard.
          gridRef.current?.focus({ preventScroll: true });
        }}
        onMouseEnter={() => {
          const from = dragFrom.current;
          if (!from) return;
          if (from.row === rowIndex && from.col === col) return;
          setAnchor(from);
          setSelection({ row: rowIndex, col });
        }}
        onDoubleClick={() => beginEdit()}
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
        data-selected={active ? 'true' : undefined}
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
              // Inside the cell the keys belong to the input, not the grid.
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                setValue(rowIndex, col, draft ?? '');
                setDraft(null);
                if (e.key === 'Tab') move(0, e.shiftKey ? -1 : 1, false);
                else move(e.shiftKey ? -1 : 1, 0, false);
                gridRef.current?.focus();
              } else if (e.key === 'Escape') {
                setDraft(null);
                gridRef.current?.focus();
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
            style={{
              paddingLeft: format?.indent ? format.indent * 14 : undefined,
              fontFamily: format?.fontFamily || undefined,
              fontSize: format?.fontSize ? `${format.fontSize}px` : undefined,
            }}
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
          <ToolbarButton label="Undo (Ctrl+Z)" onClick={undo} disabled={readOnly} testId="ss-undo">
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Redo (Ctrl+Y)" onClick={redo} disabled={readOnly} testId="ss-redo">
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />

          {/* Clipboard */}
          <ToolbarButton
            label="Copy (Ctrl+C)"
            onClick={() => {
              const tsv = copySelection();
              if (tsv) void navigator.clipboard?.writeText(tsv).catch(() => undefined);
            }}
            disabled={!selection}
            testId="ss-copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Cut (Ctrl+X)"
            onClick={() => {
              const tsv = cutSelection();
              if (tsv) void navigator.clipboard?.writeText(tsv).catch(() => undefined);
            }}
            disabled={readOnly || !selection}
            testId="ss-cut"
          >
            <Scissors className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Paste (Ctrl+V)"
            onClick={() => void pasteFromSystem()}
            disabled={readOnly || !selection}
            testId="ss-paste"
          >
            <Clipboard className="h-3.5 w-3.5" />
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

          <select
            aria-label="Font"
            data-testid="ss-font"
            disabled={readOnly || !selection}
            value={selected?.format?.fontFamily ?? ''}
            onChange={(e) => patchFormat({ fontFamily: e.target.value })}
            className="h-7 rounded border bg-background px-1 text-xs disabled:opacity-40"
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Font size"
            data-testid="ss-font-size"
            disabled={readOnly || !selection}
            value={String(selected?.format?.fontSize ?? 14)}
            onChange={(e) => patchFormat({ fontSize: Number(e.target.value) })}
            className="h-7 rounded border bg-background px-1 text-xs disabled:opacity-40"
          >
            {[9, 10, 11, 12, 14, 16, 18, 20].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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

          {/* Rows */}
          <ToolbarButton label="Add row" onClick={() => addRow()} disabled={readOnly} testId="ss-add-row">
            <Rows3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Duplicate row"
            onClick={duplicateRow}
            disabled={readOnly || !selection}
            testId="ss-duplicate-row"
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move row up"
            onClick={() => selection && moveRow(selection.row, -1)}
            disabled={readOnly || !selection}
            testId="ss-move-row-up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move row down"
            onClick={() => selection && moveRow(selection.row, 1)}
            disabled={readOnly || !selection}
            testId="ss-move-row-down"
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
          <span className="mx-1 h-5 w-px bg-border" />

          {/* Columns */}
          <ToolbarButton label="Add column" onClick={addColumn} disabled={readOnly} testId="ss-add-column">
            <Plus className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Duplicate column"
            onClick={duplicateColumn}
            disabled={readOnly || !selection}
            testId="ss-duplicate-column"
          >
            <Columns3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move column left"
            onClick={() => selection && moveColumn(selection.col, -1)}
            disabled={readOnly || !selection}
            testId="ss-move-column-left"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Move column right"
            onClick={() => selection && moveColumn(selection.col, 1)}
            disabled={readOnly || !selection}
            testId="ss-move-column-right"
          >
            <ChevronRight className="h-3.5 w-3.5" />
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
            testId="ss-split"
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

        {/* What the last action did, where it is worth saying. */}
        {notice && (
          <div
            data-testid="ss-notice"
            className={cn(
              'flex items-start justify-between gap-2 rounded-md border px-3 py-1.5 text-xs',
              notice.protective
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            <span>{notice.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          role="grid"
          aria-label={`${table.title} table`}
          onKeyDown={onGridKeyDown}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          className="overflow-x-auto rounded-md border outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                {Array.from({ length: width }, (_, c) => (
                  <th
                    key={c}
                    className="relative border-b border-r p-1 text-left"
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
                    {!readOnly && (
                      // The draggable edge, as in any spreadsheet.
                      <span
                        role="separator"
                        aria-label={`Resize column ${c + 1}`}
                        data-testid={`ss-col-grip-${c}`}
                        onMouseDown={(e) => beginResize(c, e)}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
                      />
                    )}
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
          <span className="ml-auto">
            Arrows, Tab and Enter move. Type or F2 to edit. Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z.
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
