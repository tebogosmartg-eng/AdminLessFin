import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import AssetCategoryForm from '../components/AssetCategoryForm';
import { useAuth } from '../contexts/AuthContext';

type AssetCategory = {
  id: string;
  name: string;
};

const AssetCategories = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | undefined>(undefined);
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: categories, isLoading } = useQuery<AssetCategory[]>({
    queryKey: ['asset_categories', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.from('asset_categories').select('*').eq('company_id', activeCompany.id).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('asset_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset_categories', activeCompany?.id] });
      showSuccess('Category deleted.');
    },
    onError: (error: any) => showError(error.message),
  });

  const handleEdit = (category: AssetCategory) => {
    setSelectedCategory(category);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedCategory(undefined);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure? Deleting a category may affect existing assets.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Asset Categories</CardTitle>
              <CardDescription>Manage the categories for your fixed assets.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={2} className="text-center">Loading...</TableCell></TableRow>
              ) : categories && categories.length > 0 ? (
                categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(cat)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(cat.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={2} className="text-center">No categories found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AssetCategoryForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        category={selectedCategory}
      />
    </>
  );
};

export default AssetCategories;