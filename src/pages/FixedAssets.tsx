import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { formatCurrency } from '../lib/utils';
import AssetForm from '../components/AssetForm';
import { format } from 'date-fns';

type FixedAsset = {
  id: string;
  asset_code: string;
  description: string;
  purchase_date: string;
  purchase_cost: number;
  net_book_value: number;
  status: string;
  asset_categories: { name: string } | null;
};

const FixedAssets = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(undefined);

  const { data: assets, isLoading } = useQuery<FixedAsset[]>({
    queryKey: ['fixed_assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*, asset_categories(name)')
        .order('purchase_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data.map(asset => ({
        ...asset,
        net_book_value: asset.purchase_cost - asset.accumulated_depreciation,
      }));
    },
  });

  const handleAddNew = () => {
    setSelectedAssetId(undefined);
    setIsFormOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Fixed Asset Register</CardTitle>
              <CardDescription>A list of all tangible assets owned by the company.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Asset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Purchase Date</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Net Book Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center">Loading assets...</TableCell></TableRow>
              ) : assets && assets.length > 0 ? (
                assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono">{asset.asset_code}</TableCell>
                    <TableCell className="font-medium">{asset.description}</TableCell>
                    <TableCell>{asset.asset_categories?.name || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(asset.purchase_date), 'PPP')}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(asset.purchase_cost)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(asset.net_book_value)}</TableCell>
                    <TableCell className="capitalize">{asset.status}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled>View Details</DropdownMenuItem>
                          <DropdownMenuItem disabled>Edit</DropdownMenuItem>
                          <DropdownMenuItem disabled className="text-red-600">Dispose</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={8} className="text-center">No assets found. Add one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AssetForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        assetId={selectedAssetId}
      />
    </>
  );
};

export default FixedAssets;