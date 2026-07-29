import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Users } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError, showSuccess } from '../utils/toast';
import EmployeeForm from '../components/EmployeeForm';
import EmployeePreviewDialog from '../components/payroll/EmployeePreviewDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { formatCurrency } from '../lib/utils';
import { filterAndRankEmployees } from '../lib/employeeIdentity';
import { EmployeeIdentityCell } from '../components/hr/EmployeeIdentity';
import { useAuth } from '../contexts/AuthContext';
import { employeesQuery, expenseClaimsQuery, fixedAssetsQuery } from '../lib/queries';

export type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  id_number: string | null;
  tax_number: string | null;
  bank_name: string | null;
  bank_branch_code?: string | null;
  bank_account_number: string | null;
  employment_type: 'permanent' | 'contract' | 'intern' | 'casual';
  department: string | null;
  branch?: string | null;
  position: string | null;
  employment_status?: string | null;
  start_date: string;
  end_date: string | null;
  salary_amount: number | null;
  salary_period: 'monthly' | 'weekly' | 'fortnightly' | null;
};

const Employees = () => {
  useDocumentTitle('Employees');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>(undefined);
  const [previewEmployee, setPreviewEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: employees, isLoading } = useQuery<Employee[]>({
    ...employeesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: claims = [] } = useQuery({
    ...expenseClaimsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: assets = [] } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  // Map fixed-asset rows to the preview dialog's Asset shape (name from description).
  const previewAssets = useMemo(
    () =>
      (assets ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? a.description ?? a.asset_code,
        status: a.status,
        assigned_to_employee_id: a.assigned_to_employee_id,
      })),
    [assets]
  );

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return filterAndRankEmployees(employees, searchQuery);
  }, [employees, searchQuery]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('employees', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          employeeId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', activeCompany?.id] });
      showSuccess('Employee deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting employee: ${error.message}`);
    },
  });

  const handlePreview = (employee: Employee) => {
    setPreviewEmployee(employee);
  };

  const handleEdit = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedEmployee(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Employees</CardTitle>
              <CardDescription>Manage your company's employee records.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Employee
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by employee number, name, ID, email, or mobile…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <EmployeeIdentityCell
                        employee={employee}
                        onClick={() => handlePreview(employee)}
                      />
                    </TableCell>
                    <TableCell>{employee.position}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{employee.employment_type}</Badge></TableCell>
                    <TableCell>
                      {employee.salary_amount ? `${formatCurrency(employee.salary_amount)} / ${employee.salary_period}` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(employee)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(employee.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : employees && employees.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No employees match your search.
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Users}
                      title="No employees yet"
                      description="Add your team to run payroll, track expense claims and manage employment details."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Employee</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <EmployeeForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        employee={selectedEmployee}
      />
      <EmployeePreviewDialog
        employee={previewEmployee}
        isOpen={!!previewEmployee}
        onClose={() => setPreviewEmployee(null)}
        claims={claims}
        assets={previewAssets}
        onEdit={(emp) => { setSelectedEmployee(emp); setIsFormOpen(true); }}
      />
    </>
  );
};

export default Employees;