import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Terminal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { formatCurrency } from '../lib/utils';
import AssetForm from '../components/AssetForm';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import AssetDisposalForm from '../components/AssetDisposalForm';
import { useAuth } from '../contexts/AuthContext';

type FixedAsset = {
  id: string;
  asset_code: string;
  description: string;
  purchase_date: string;
  purchase_cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
  status: string;
  asset_categories: { name: string } | null;
};

const FixedAssets = () => {
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [isDisposalFormOpen, setIsDisposalFormOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | undefined>(undefined);
  const navigate = useNavigate();
  const { activeCompany } = useAuth();

  const { data: assets, isLoading } = useQuery<FixedAsset[]>({
    queryKey: ['fixed_assets', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'GET_ALL',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data.map((asset: any) => ({
        ...asset,
        net_book_value: asset.purchase_cost - asset.accumulated_depreciation,
      }));
    },
    enabled: !!activeCompany,
  });

  const handleAddNew = () => {
    setSelectedAsset(undefined);
    setIsAssetFormOpen(true);
  };

  const handleDispose = (asset: FixedAsset) => {
    setSelectedAsset(asset);
    setIsDisposalFormOpen(true);
  };

  return (
    <>
      <Alert className="mb-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Automate Your Depreciation!</AlertTitle>
        <AlertDescription>
          To have depreciation entries post automatically, you need to set up a schedule. 
          Go to your Supabase dashboard, find the `run-depreciation` Edge Function, and create a cron job to run it monthly.
        </AlertDescription>
      </Alert>
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
                  <TableRow key={asset.id} className="cursor-pointer" onClick={() => navigate(`/fixed-assets/${asset.id}`)}>
                    <TableCell className="font-mono">{asset.asset_code}</TableCell>
                    <TableCell className="font-medium">{asset.description}</TableCell>
                    <TableCell>{asset.asset_categories?.name || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(asset.purchase_date), 'PPP')}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(asset.purchase_cost)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(asset.net_book_value)}</TableCell>
                    <TableCell className="capitalize">{asset.status}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/fixed-assets/${asset.id}`)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem disabled>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDispose(asset); }} className="text-red-600" disabled={asset.status === 'disposed'}>Dispose</DropdownMenuItem>
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
        isOpen={isAssetFormOpen}
        setIsOpen={setIsAssetFormOpen}
        assetId={selectedAsset?.id}
      />
      {selectedAsset && (
        <AssetDisposalForm
          isOpen={isDisposalFormOpen}
          setIsOpen={setIsDisposalFormOpen}
          asset={selectedAsset}
        />
      )}
    </>
  );
};

export default FixedAssets;