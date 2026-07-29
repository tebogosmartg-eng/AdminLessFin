import * as React from "react";
import {
  Calculator,
  Settings,
  User,
  Users,
  Search,
  FileText,
  Building,
  Briefcase,
  Box,
  Receipt,
  Calendar,
  MessageSquare,
  Quote,
  HandCoins,
  Repeat,
  ReceiptText,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Banknote,
  Store,
  TicketMinus,
  Landmark,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "./ui/button";
import { bankAccountsQuery, bankTransactionsQuery, bankTransfersQuery } from "../lib/queries";

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const { activeCompany, role } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['global_search', debouncedQuery, activeCompany?.id],
    queryFn: async () => {
      if (!debouncedQuery || !activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('global-search', {
        body: { query: debouncedQuery, company_id: activeCompany.id }
      });
      if (error) throw error;
      return data as { type: string; id: string; title: string; subtitle: string; url: string }[];
    },
    enabled: open && debouncedQuery.length >= 2,
  });

  // Banking search: the global-search edge function is frozen this phase, so
  // Bank Accounts / Transactions / Transfers are surfaced by filtering the
  // existing `banking` edge function's own GET_* results client-side instead
  // of adding a new global-search data source. Gated identically to the main
  // search query (2+ typed characters) rather than just `open` — Phase 3D
  // perf review found the original `enabled: open` fired 3 extra network
  // requests on every Cmd+K open, app-wide, before the user typed anything.
  // Also gated on isAdmin: the banking edge function is admin-only (Phase 3D
  // RBAC fix), so a non-admin's request would just error and log noise.
  const bankingSearchEnabled = open && debouncedQuery.length >= 2 && !!activeCompany && isAdmin;
  const { data: bankAccountsForSearch } = useQuery({ ...bankAccountsQuery(activeCompany?.id ?? ''), enabled: bankingSearchEnabled });
  const { data: bankTransactionsForSearch } = useQuery({ ...bankTransactionsQuery(activeCompany?.id ?? ''), enabled: bankingSearchEnabled });
  const { data: bankTransfersForSearch } = useQuery({ ...bankTransfersQuery(activeCompany?.id ?? ''), enabled: bankingSearchEnabled });

  const bankingSearchResults = React.useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const term = debouncedQuery.toLowerCase();
    const accountMatches = (bankAccountsForSearch ?? [])
      .filter((a) => a.name.toLowerCase().includes(term) || (a.bank_name ?? '').toLowerCase().includes(term))
      .slice(0, 5)
      .map((a) => ({ type: 'Bank Account', id: a.id, title: a.name, subtitle: a.bank_name ?? a.account_type, url: `/banking/accounts/${a.id}` }));
    const txnMatches = (bankTransactionsForSearch ?? [])
      .filter((t) => (t.description ?? '').toLowerCase().includes(term) || (t.reference ?? '').toLowerCase().includes(term))
      .slice(0, 5)
      .map((t) => ({ type: 'Bank Transaction', id: t.id, title: t.description || t.reference || 'Bank transaction', subtitle: t.bank_accounts?.name ?? '', url: '/banking/transactions' }));
    const transferMatches = (bankTransfersForSearch ?? [])
      .filter((t) => (t.description ?? '').toLowerCase().includes(term) || t.from_bank_account_name.toLowerCase().includes(term) || t.to_bank_account_name.toLowerCase().includes(term))
      .slice(0, 5)
      .map((t) => ({ type: 'Transfer', id: t.transfer_id, title: `${t.from_bank_account_name} → ${t.to_bank_account_name}`, subtitle: t.description ?? '', url: '/banking/transfers' }));
    return [...accountMatches, ...txnMatches, ...transferMatches];
  }, [debouncedQuery, bankAccountsForSearch, bankTransactionsForSearch, bankTransfersForSearch]);

  const combinedResults = [...(searchResults ?? []), ...bankingSearchResults];

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'Customer': return <User className="mr-2 h-4 w-4" />;
      case 'Employee': return <Users className="mr-2 h-4 w-4" />;
      case 'Vendor': return <Building className="mr-2 h-4 w-4" />;
      case 'Invoice': return <FileText className="mr-2 h-4 w-4" />;
      case 'Quote': return <Quote className="mr-2 h-4 w-4" />;
      case 'Credit Note': return <ReceiptText className="mr-2 h-4 w-4" />;
      case 'Bill': return <Receipt className="mr-2 h-4 w-4" />;
      case 'Purchase Order': return <ShoppingBag className="mr-2 h-4 w-4" />;
      case 'Vendor Credit': return <TicketMinus className="mr-2 h-4 w-4" />;
      case 'Recurring Bill': return <Repeat className="mr-2 h-4 w-4" />;
      case 'Project': return <Briefcase className="mr-2 h-4 w-4" />;
      case 'Product': return <Box className="mr-2 h-4 w-4" />;
      case 'Bank Account': return <Landmark className="mr-2 h-4 w-4" />;
      case 'Bank Transaction': return <Wallet className="mr-2 h-4 w-4" />;
      case 'Transfer': return <Repeat className="mr-2 h-4 w-4" />;
      default: return <FileText className="mr-2 h-4 w-4" />;
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start gap-2 rounded-md bg-muted/40 text-sm text-muted-foreground hover:bg-muted sm:pr-12 md:max-w-xs"
        onClick={() => setOpen(true)}
        aria-label="Open command menu"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span>Search or jump to…</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Type a command or search..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          {combinedResults.length > 0 && (
            <CommandGroup heading="Search Results">
              {combinedResults.map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  value={`${result.title} ${result.subtitle}`} // Helps fuzzy search match
                  onSelect={() => runCommand(() => navigate(result.url))}
                >
                  {getIcon(result.type)}
                  <span>{result.title}</span>
                  {result.subtitle && <span className="ml-2 text-muted-foreground text-xs">- {result.subtitle}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          
          <CommandGroup heading="Quick Navigation">
            <CommandItem onSelect={() => runCommand(() => navigate("/sales"))}>
              <TrendingUp className="mr-2 h-4 w-4" />
              <span>Revenue</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/calendar"))}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>Operations Calendar</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/chat"))}>
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>Collaboration Hub</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/quotes"))}>
              <Quote className="mr-2 h-4 w-4" />
              <span>Quotes</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/invoices"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Invoices</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/receive-payments"))}>
              <HandCoins className="mr-2 h-4 w-4" />
              <span>Receive Payments</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/credit-notes"))}>
              <ReceiptText className="mr-2 h-4 w-4" />
              <span>Credit Notes</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/recurring-invoices"))}>
              <Repeat className="mr-2 h-4 w-4" />
              <span>Recurring Invoices</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/purchases"))}>
              <Wallet className="mr-2 h-4 w-4" />
              <span>Spend Management</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/purchase-orders"))}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              <span>Purchase Orders</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/bills"))}>
              <Receipt className="mr-2 h-4 w-4" />
              <span>Bills</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/pay-bills"))}>
              <Banknote className="mr-2 h-4 w-4" />
              <span>Pay Bills</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/vendor-credits"))}>
              <TicketMinus className="mr-2 h-4 w-4" />
              <span>Vendor Credits</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/recurring-bills"))}>
              <Repeat className="mr-2 h-4 w-4" />
              <span>Recurring Bills</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/vendors"))}>
              <Store className="mr-2 h-4 w-4" />
              <span>Vendors</span>
            </CommandItem>
            {isAdmin && (
              <CommandItem onSelect={() => runCommand(() => navigate("/banking"))}>
                <Landmark className="mr-2 h-4 w-4" />
                <span>Banking</span>
              </CommandItem>
            )}
            <CommandItem onSelect={() => runCommand(() => navigate("/reports"))}>
              <Calculator className="mr-2 h-4 w-4" />
              <span>Reports</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/customers"))}>
              <User className="mr-2 h-4 w-4" />
              <span>Customers</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}