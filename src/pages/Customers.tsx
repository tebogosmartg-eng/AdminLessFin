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
import { PlusCircle, MoreHorizontal, Download, Users } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSortableData } from '../hooks/useSortableData';
import { SortableHeader } from '../components/SortableHeader';
import { Skeleton } from '../components/ui/skeleton';
import { showError, showSuccess } from '../utils/toast';
import CustomerForm from '../components/CustomerForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useAuth } from '../contexts/AuthContext';
import { customersQuery } from '../lib/queries';
import { downloadCSV } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export type Customer = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id?: string | null;
  payment_terms?: number | null;
};

const Customers = () => {
  useDocumentTitle('Customers');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    ...customersQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { items: sortedCustomers, sort, requestSort } = useSortableData(customers ?? []);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('customers', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          customerId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', activeCompany?.id] });
      showSuccess('Customer deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting customer: ${error.message}`);
    },
  });

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedCustomer(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = () => {
    if (!customers) return;
    const data = customers.map(c => ({
      Name: c.name,
      Contact: c.contact_name,
      Email: c.email,
      Phone: c.phone,
      Address: c.address,
      'Tax ID': c.tax_id || '',
      'Payment Terms': c.payment_terms || '',
    }));
    downloadCSV(data, 'customers.csv');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Customers</CardTitle>
              <CardDescription>Manage your list of customers.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleExport} disabled={!customers || customers.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Button onClick={handleAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Customer
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="name" sort={sort} onSort={requestSort}>Name</SortableHeader>
                <SortableHeader sortKey="contact_name" sort={sort} onSort={requestSort}>Contact</SortableHeader>
                <SortableHeader sortKey="email" sort={sort} onSort={requestSort}>Email</SortableHeader>
                <SortableHeader sortKey="phone" sort={sort} onSort={requestSort}>Phone</SortableHeader>
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
              ) : customers && customers.length > 0 ? (
                sortedCustomers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer" onClick={() => navigate(`/customers/${customer.id}`)}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.contact_name}</TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/customers/${customer.id}`)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(customer); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(customer.id); }} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Users}
                      title="No customers yet"
                      description="Add your customers to start sending quotes and invoices and tracking what they owe."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Customer</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CustomerForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        customer={selectedCustomer}
      />
    </>
  );
};

export default Customers;