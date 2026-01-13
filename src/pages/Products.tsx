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
import { PlusCircle, MoreHorizontal, Download, PackageOpen, History } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import ProductForm from '../components/ProductForm';
import InventoryAdjustmentDialog from '../components/InventoryAdjustmentDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { productsQuery } from '../lib/queries';
import { downloadCSV } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import ProductHistory from '../components/ProductHistory';

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  type: 'service' | 'inventory';
  quantity_on_hand: number;
  income_account_id: string | null;
  cogs_account_id: string | null;
  income_account?: { name: string };
  cogs_account?: { name: string };
};

const Products = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    ...productsQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('products', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          productId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', activeCompany?.id] });
      showSuccess('Item deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting item: ${error.message}`);
    },
  });

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsFormOpen(true);
  };

  const handleAdjust = (product: Product) => {
    setSelectedProduct(product);
    setIsAdjustmentOpen(true);
  };
  
  const handleHistory = (product: Product) => {
    setSelectedProduct(product);
    setIsHistoryOpen(true);
  };

  const handleAddNew = () => {
    setSelectedProduct(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = () => {
    if (!products) return;
    const data = products.map(p => ({
      Name: p.name,
      Type: p.type,
      'Qty on Hand': p.type === 'inventory' ? p.quantity_on_hand : '',
      Price: p.price ? p.price.toFixed(2) : '',
      Cost: p.cost ? p.cost.toFixed(2) : '',
      Description: p.description,
    }));
    downloadCSV(data, 'products-services.csv');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Products and Services</CardTitle>
              <CardDescription>Manage items you frequently buy or sell.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleExport} disabled={!products || products.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Button onClick={handleAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Item
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty on Hand</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Income Account</TableHead>
                <TableHead>COGS Account</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center">Loading items...</TableCell></TableRow>
              ) : products && products.length > 0 ? (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="capitalize">{product.type}</TableCell>
                    <TableCell>{product.type === 'inventory' ? product.quantity_on_hand : 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono">{product.price ? formatCurrency(product.price) : ''}</TableCell>
                    <TableCell className="text-right font-mono">{product.cost ? formatCurrency(product.cost) : ''}</TableCell>
                    <TableCell>{product.income_account?.name || 'N/A'}</TableCell>
                    <TableCell>{product.cogs_account?.name || 'N/A'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(product)}>Edit</DropdownMenuItem>
                          {product.type === 'inventory' && (
                            <>
                                <DropdownMenuItem onClick={() => handleAdjust(product)}>
                                    <PackageOpen className="mr-2 h-4 w-4" /> Adjust Stock
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleHistory(product)}>
                                    <History className="mr-2 h-4 w-4" /> View History
                                </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(product.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={8} className="text-center">No items found. Add one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ProductForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        product={selectedProduct}
      />
      {selectedProduct && (
        <InventoryAdjustmentDialog
          isOpen={isAdjustmentOpen}
          setIsOpen={setIsAdjustmentOpen}
          product={selectedProduct}
        />
      )}
      {selectedProduct && (
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Stock History: {selectedProduct.name}</DialogTitle>
                    <DialogDescription>
                        Tracking movement for {selectedProduct.name} (Current Qty: {selectedProduct.quantity_on_hand})
                    </DialogDescription>
                </DialogHeader>
                <ProductHistory productId={selectedProduct.id} />
            </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default Products;