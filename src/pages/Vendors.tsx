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
import VendorForm from '../components/VendorForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

export type Vendor = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

const Vendors = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | undefined>(undefined);
  const queryClient = useQueryClient();

  const fetchVendors = async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: vendors, isLoading } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: fetchVendors,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      showSuccess('Vendor deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting vendor: ${error.message}`);
    },
  });

  const handleEdit = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedVendor(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this vendor?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Vendors</CardTitle>
              <CardDescription>Manage your list of suppliers and service providers.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Vendor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">Loading vendors...</TableCell>
                </TableRow>
              ) : vendors && vendors.length > 0 ? (
                vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.name}</TableCell>
                    <TableCell>{vendor.contact_name}</TableCell>
                    <TableCell>{vendor.email}</TableCell>
                    <TableCell>{vendor.phone}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(vendor)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(vendor.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No vendors found. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <VendorForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        vendor={selectedVendor}
      />
    </>
  );
};

export default Vendors;