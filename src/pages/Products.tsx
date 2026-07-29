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
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSortableData } from '../hooks/useSortableData';
import { SortableHeader } from '../components/SortableHeader';
import { Skeleton } from '../components/ui/skeleton';
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
  useDocumentTitle('Products & Services');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    ...productsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { items: sortedProducts, sort, requestSort } = useSortableData(products ?? [], (p, key) => {
    switch (key) {
      case 'quantity_on_hand': return p.type === 'inventory' ? p.quantity_on_hand : null;
      case 'price': return p.price ?? null;
      case 'cost': return p.cost ?? null;
      case 'income_account': return p.income_account?.name ?? '';
      case 'cogs_account': return p.cogs_account?.name ?? '';
      default: return (p as unknown as Record<string, string>)[key];
    }
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
                <SortableHeader sortKey="name" sort={sort} onSort={requestSort}>Name</SortableHeader>
                <SortableHeader sortKey="type" sort={sort} onSort={requestSort}>Type</SortableHeader>
                <SortableHeader sortKey="quantity_on_hand" sort={sort} onSort={requestSort}>Qty on Hand</SortableHeader>
                <SortableHeader sortKey="price" sort={sort} onSort={requestSort} align="right">Sale Price</SortableHeader>
                <SortableHeader sortKey="cost" sort={sort} onSort={requestSort} align="right">Cost</SortableHeader>
                <SortableHeader sortKey="income_account" sort={sort} onSort={requestSort}>Income Account</SortableHeader>
                <SortableHeader sortKey="cogs_account" sort={sort} onSort={requestSort}>COGS Account</SortableHeader>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : products && products.length > 0 ? (
                sortedProducts.map((product) => (
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
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={PackageOpen}
                      title="No products or services yet"
                      description="Add the items you sell to speed up invoicing and keep inventory and valuations accurate."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Item</Button>}
                    />
                  </TableCell>
                </TableRow>
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