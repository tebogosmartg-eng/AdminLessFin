import * as React from "react";
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  User,
  Search,
  FileText,
  Building,
  Briefcase,
  Box,
  Receipt
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

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const { activeCompany } = useAuth();

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

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'Customer': return <User className="mr-2 h-4 w-4" />;
      case 'Vendor': return <Building className="mr-2 h-4 w-4" />;
      case 'Invoice': return <FileText className="mr-2 h-4 w-4" />;
      case 'Bill': return <Receipt className="mr-2 h-4 w-4" />;
      case 'Project': return <Briefcase className="mr-2 h-4 w-4" />;
      case 'Product': return <Box className="mr-2 h-4 w-4" />;
      default: return <FileText className="mr-2 h-4 w-4" />;
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-[0.5rem] text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
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
          
          {searchResults && searchResults.length > 0 && (
            <CommandGroup heading="Search Results">
              {searchResults.map((result) => (
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
            <CommandItem onSelect={() => runCommand(() => navigate("/invoices"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Invoices</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/bills"))}>
              <Receipt className="mr-2 h-4 w-4" />
              <span>Bills</span>
            </CommandItem>
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