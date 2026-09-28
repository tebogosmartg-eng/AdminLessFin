import { useMemo } from 'react';
import type { LineItem } from '../../../lib/financialStatements/publication/lineItems';
import type { DocumentOverridesApi } from '../../../lib/financialStatements/document/documentStore';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';

/** A figure, as opposed to a placeholder or an empty cell. */
function carriesFigures(item: LineItem): boolean {
  return item.cells.slice(1).some((c) => /\d/.test(String(c ?? '')) && !/^\[.*\]$/.test(String(c).trim()));
}

/**
 * Which lines of this note's tables print.
 *
 * Every table line is listed with what it will print and a switch. Lines the
 * framework asks for but nobody has filled in are held back by default, so a
 * note never prints a row of "[ — ]"; the preparer can switch any line on or
 * off, and put it back to the default. The choice is part of the document's
 * presentation, so the Live Preview, the PDF and the Word document follow it.
 */
export default function NoteLineItems({
  items,
  overridesApi,
  locked,
}: {
  items: LineItem[];
  overridesApi: DocumentOverridesApi;
  locked: boolean;
}) {
  const tables = useMemo(() => {
    const byTable = new Map<string, LineItem[]>();
    for (const item of items) {
      if (!byTable.has(item.table)) byTable.set(item.table, []);
      byTable.get(item.table)!.push(item);
    }
    return [...byTable.entries()];
  }, [items]);

  if (items.length === 0) return null;
  const heldBack = items.filter((i) => !i.printed).length;

  return (
    <section className="space-y-3 rounded-md border p-3" data-testid="afs-line-items">
      <div>
        <h4 className="text-sm font-medium">Lines that print</h4>
        <p className="text-xs text-muted-foreground">
          {heldBack === 0
            ? 'Every line of this note’s tables prints.'
            : `${heldBack} of ${items.length} lines are held back from the printed note.`}{' '}
          A line with a figure still waiting for input is held back until it is filled in or you
          switch it on.
        </p>
      </div>
      {tables.map(([table, lines]) => {
        const printed = lines.filter((l) => l.printed).length;
        return (
          <div key={table} className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {table}
              {printed === 0 && <span className="ml-2 normal-case">— not printed: no line is switched on</span>}
            </p>
            <ul className="divide-y rounded-md border">
              {lines.map((item) => {
                // Only a line the preparer switched off, in a table that still
                // prints, leaves a printed total that no longer adds up.
                const warn = item.choice === false && carriesFigures(item) && printed > 0;
                return (
                  <li
                    key={item.key}
                    className="flex items-start gap-3 px-2.5 py-1.5 text-sm"
                    data-testid="afs-line-item"
                    data-line-key={item.key}
                    data-line-label={item.label}
                    data-printed={item.printed}
                  >
                    <Switch
                      checked={item.printed}
                      disabled={locked}
                      aria-label={`${item.printed ? 'Stop printing' : 'Print'} ${item.label}`}
                      data-testid="afs-line-switch"
                      onCheckedChange={(on) =>
                        // Choosing the default is forgetting the choice.
                        overridesApi.setLine(item.key, on === !item.placeholder ? null : on)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(!item.printed && 'text-muted-foreground line-through')}>
                          {item.label || 'Untitled line'}
                        </span>
                        {item.placeholder && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {item.unfilled ? 'Not filled in' : 'Incomplete'}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs tabular-nums text-muted-foreground">
                        {item.cells.slice(1).join('   ')}
                      </p>
                      {warn && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          This line carries figures. The table’s total still includes them, so the
                          printed table will not add up.
                        </p>
                      )}
                    </div>
                    {item.choice !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={locked}
                        onClick={() => overridesApi.setLine(item.key, null)}
                      >
                        Default
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
