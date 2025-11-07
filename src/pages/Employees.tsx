import { useState } from 'react';
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
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import EmployeeForm from '../components/EmployeeForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  id_number: string | null;
  tax_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  employment_type: 'permanent' | 'contract' | 'intern' | 'casual';
  department: string | null;
  position: string | null;
  start_date: string;
  end_date: string | null;
  salary_amount: number | null;
  salary_period: 'monthly' | 'weekly' | 'fortnightly' | null;
};

const Employees = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>(undefined);
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const fetchEmployees = async () => {
    if (!activeCompany) return [];
    const { data, error } = await supabase.functions.invoke('employees', {
      body: {
        method: 'GET',
        company_id: activeCompany.id,
      },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', activeCompany?.id],
    queryFn: fetchEmployees,
    enabled: !!activeCompany,
  });

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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">Loading employees...</TableCell>
                </TableRow>
              ) : employees && employees.length > 0 ? (
                employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.first_name} {employee.last_name}</TableCell>
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
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No employees found. Add one to get started.</TableCell>
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
    </>
  );
};

export default Employees;