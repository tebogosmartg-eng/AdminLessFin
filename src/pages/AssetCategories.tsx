import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PlusCircle, Tags } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/EmptyState';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import AssetCategoryForm from '../components/AssetCategoryForm';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { assetCategoriesQuery } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { showError, showSuccess } from '../utils/toast';
import { AssetCategoryIntelligence } from '../lib/assets/eamTypes';

const AssetCategories = () => {
  useDocumentTitle('Asset Categories');
  const navigate = useNavigate();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategoryIntelligence | undefined>();
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: categories, isLoading } = useQuery<AssetCategoryIntelligence[]>({
    ...assetCategoriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('asset-categories', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          categoryId: id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset_categories', activeCompany?.id] });
      showSuccess('Category deleted.');
    },
    onError: (error: Error) => showError(error.message),
  });

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
          <div className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Asset Categories</CardTitle>
              <CardDescription>
                Category intelligence defaults for useful life, residual, capitalisation, and verification.
              </CardDescription>
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
                <TableHead>Useful Life</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Residual %</TableHead>
                <TableHead>Cap Threshold</TableHead>
                <TableHead>Component Accounting</TableHead>
                <TableHead>Verification Frequency</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : categories && categories.length > 0 ? (
                categories.map((cat) => (
                  <TableRow
                    key={cat.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/asset-categories/${cat.id}`)}
                  >
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>{cat.useful_life_years ?? 5} yrs</TableCell>
                    <TableCell className="capitalize">
                      {(cat.depreciation_method || 'straight-line').replace(/-/g, ' ')}
                    </TableCell>
                    <TableCell>{Number(cat.residual_value_pct ?? 0)}%</TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(Number(cat.capitalisation_threshold ?? 0))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.component_accounting_enabled ? 'success' : 'secondary'}>
                        {cat.component_accounting_enabled ? 'Enabled' : 'Off'}
                      </Badge>
                    </TableCell>
                    <TableCell>{cat.default_verification_frequency_months ?? 12} mo</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/asset-categories/${cat.id}`)}>
                            Edit workspace
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedCategory(cat);
                              setIsFormOpen(true);
                            }}
                          >
                            Quick edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(cat.id)}
                            className="text-red-600"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Tags}
                      title="No asset categories"
                      description="Create categories to drive useful life, residual, and GL defaults for new assets."
                      action={
                        <Button onClick={handleAddNew}>
                          <PlusCircle className="mr-2 h-4 w-4" /> New Category
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
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
