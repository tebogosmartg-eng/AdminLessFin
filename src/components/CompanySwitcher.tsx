/**
 * Global company switcher.
 *
 * Lists only the companies the server says this user belongs to (user-session,
 * from company_users), with a second line that tells same-named companies
 * apart, the user's role in each, recently used companies first, and a search
 * box once the list is long. Choosing one calls AuthContext.switchCompany, the
 * only way the active company changes; the switch itself (server check, cache
 * cleared, page remounted) is not this component's business.
 */
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, Loader2, PlusCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command';
import { cn } from '../lib/utils';
import { showError } from '../utils/toast';
import {
  companyIdentifier,
  companyInitials,
  companyMatches,
  groupCompaniesForSwitcher,
  listPathAfterSwitch,
  readRecentCompanyIds,
  roleLabel,
  switcherNeedsSearch,
  type SwitchableCompany,
} from '../lib/companyContext/switching';

function CompanyBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
    >
      {companyInitials(name)}
    </span>
  );
}

function CompanyRow({
  company,
  displayName,
  active,
}: {
  company: SwitchableCompany;
  displayName: string;
  active: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <CompanyBadge name={displayName} className="h-7 w-7" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{displayName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {companyIdentifier(company)} · {roleLabel(company.user_role)}
        </div>
      </div>
      <Check className={cn('h-4 w-4 shrink-0 text-primary', active ? 'opacity-100' : 'opacity-0')} aria-hidden />
    </div>
  );
}

const CompanySwitcher = ({ className }: { className?: string }) => {
  const { activeCompany, companies, switchCompany, switchingTo, user } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const list = useMemo(() => (companies ?? []) as SwitchableCompany[], [companies]);
  const recentIds = useMemo(() => (open ? readRecentCompanyIds(user?.id) : []), [open, user?.id]);
  const { recent, all } = useMemo(
    () => groupCompaniesForSwitcher(list, activeCompany?.id, recentIds),
    [list, activeCompany?.id, recentIds],
  );
  const searchable = switcherNeedsSearch(list.length);
  const searching = query.trim().length > 0;
  const visible = useMemo(() => all.filter((c) => companyMatches(c, query)), [all, query]);

  if (!activeCompany) {
    return (
      <Button onClick={() => navigate('/create-company')} className={className}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Create Company
      </Button>
    );
  }

  const activeName = identity?.name || activeCompany.name;
  const nameFor = (c: SwitchableCompany) => (c.id === activeCompany.id ? activeName : c.name);

  const handleSelect = async (companyId: string) => {
    setOpen(false);
    setQuery('');
    if (companyId === activeCompany.id) return;
    // A record page belongs to the company it came from: land on its list.
    const listPath = listPathAfterSwitch(location.pathname);
    if (listPath) navigate(listPath);
    try {
      await switchCompany(companyId);
    } catch (error) {
      // RB-004: surface the server's own reason, never a silent stale company.
      const message = error instanceof Error ? error.message : '';
      showError(message.trim() || 'Could not switch company. Please try again.');
    }
  };

  const switching = !!switchingTo;

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Company: ${activeName}. Change company`}
          data-testid="company-switcher"
          data-company-id={activeCompany.id}
          data-switching={switching ? 'true' : 'false'}
          disabled={switching}
          className={cn('h-11 min-w-0 justify-between gap-2 px-2 text-left md:w-72', className)}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {switching ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              </span>
            ) : (
              <CompanyBadge name={activeName} />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight" data-testid="active-company-name">
                {switching ? `Switching to ${switchingTo?.name ?? 'company'}…` : activeName}
              </span>
              <span className="hidden truncate text-xs font-normal leading-tight text-muted-foreground sm:block">
                {companyIdentifier(activeCompany)} · {roleLabel(activeCompany.user_role)}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        align="start"
        collisionPadding={8}
      >
        <Command shouldFilter={false} label="Switch company">
          {searchable && (
            <CommandInput
              placeholder="Search companies or tax number…"
              value={query}
              onValueChange={setQuery}
              aria-label="Search companies"
            />
          )}
          <CommandList className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-3.5rem))]">
            <CommandEmpty>No company matches “{query}”.</CommandEmpty>
            {!searching && recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((company) => (
                  <CommandItem
                    key={`recent-${company.id}`}
                    value={`recent-${company.id}`}
                    onSelect={() => { void handleSelect(company.id); }}
                  >
                    <CompanyRow company={company} displayName={nameFor(company)} active={false} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {visible.length > 0 && (
              <CommandGroup heading={searching ? 'Matching companies' : list.length > 1 ? 'All companies' : 'Your company'}>
                {visible.map((company) => (
                  <CommandItem
                    key={company.id}
                    value={company.id}
                    onSelect={() => { void handleSelect(company.id); }}
                    data-testid="company-option"
                    data-company-id={company.id}
                    aria-current={company.id === activeCompany.id ? 'true' : undefined}
                  >
                    <CompanyRow company={company} displayName={nameFor(company)} active={company.id === activeCompany.id} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="create-company" onSelect={() => { setOpen(false); navigate('/create-company'); }}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create new company
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CompanySwitcher;
