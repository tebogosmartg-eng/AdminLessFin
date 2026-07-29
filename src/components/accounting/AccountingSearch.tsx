import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingApi } from '../../lib/accountingWorkspace';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

type Props = {
  onSelectTrace?: (result: { journal_entry_id?: string; posting_request_id?: string; account_id?: string }) => void;
};

export default function AccountingSearch({ onSelectTrace }: Props) {
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['accounting-search', activeCompany?.id, debounced],
    queryFn: () => accountingApi.search(activeCompany!.id, debounced),
    enabled: !!activeCompany && debounced.length >= 2,
  });

  const results = data?.results || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full md:w-[320px] justify-start text-muted-foreground font-normal">
          <Search className="mr-2 h-4 w-4" />
          Search journals, postings, accounts…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3" align="start">
        <Input
          autoFocus
          placeholder="Journal #, invoice, account, reference…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
          {isFetching && <Skeleton className="h-8 w-full" />}
          {!isFetching && debounced.length >= 2 && results.length === 0 && (
            <p className="text-sm text-muted-foreground px-1 py-2">No matches.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              className="w-full text-left rounded-md px-2 py-2 hover:bg-accent text-sm"
              onClick={() => {
                setOpen(false);
                if (onSelectTrace && (r.journal_entry_id || r.posting_request_id || r.account_id)) {
                  onSelectTrace({
                    journal_entry_id: r.journal_entry_id,
                    posting_request_id: r.posting_request_id,
                    account_id: r.account_id,
                  });
                } else {
                  navigate(r.route);
                }
              }}
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground capitalize">{r.kind}{r.subtitle ? ` · ${r.subtitle}` : ''}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
