import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Building, ChevronsUpDown, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showError } from '../utils/toast';

const CompanySwitcher = () => {
  const { activeCompany, companies, switchCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const navigate = useNavigate();

  // RB-004: switchCompany rethrows on failure. Awaiting inside a guarded handler
  // turns a silent unhandled rejection (stale active company, no feedback) into a
  // visible error toast, and prevents the fire-and-forget promise from escaping.
  const handleSwitch = async (companyId: string) => {
    try {
      await switchCompany(companyId);
    } catch {
      showError('Could not switch company. Please try again.');
    }
  };

  if (!activeCompany) {
    return (
      <Button onClick={() => navigate('/create-company')}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Create Company
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-56 justify-between">
          <div className="flex items-center truncate">
            <Building className="mr-2 h-4 w-4" />
            <span className="truncate">{identity?.name || 'Company'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Select Company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies?.map(company => (
          <DropdownMenuItem key={company.id} onSelect={() => { void handleSwitch(company.id); }}>
            {company.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/create-company')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create New Company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CompanySwitcher;