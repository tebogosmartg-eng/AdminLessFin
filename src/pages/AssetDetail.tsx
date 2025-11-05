import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Building2 } from 'lucide-react';

const AssetDetail = () => {
  const { id } = useParams();

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset_detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select(`
          *,
          asset_categories ( name ),
          vendors ( name ),
          employees ( first_name, last_name ),
          asset_account:asset_account_id ( name ),
          accum_depr_account:accumulated_depreciation_account_id ( name ),
          depr_expense_account:depreciation_expense_account_id ( name )
        `)
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!asset) {
    return <div>Asset not found.</div>;
  }

  const netBookValue = asset.purchase_cost - asset.accumulated_depreciation;

  const DetailItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-semibold">{value || 'N/A'}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center"><Building2 className="mr-3 h-6 w-6" /> {asset.description}</CardTitle>
              <CardDescription>Asset Code: {asset.asset_code}</CardDescription>
            </div>
            <Badge variant="outline" className="capitalize text-lg">{asset.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader><CardTitle>Financials</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DetailItem label="Purchase Cost" value={formatCurrency(asset.purchase_cost)} />
                <DetailItem label="Accumulated Depreciation" value={formatCurrency(asset.accumulated_depreciation)} />
                <DetailItem label="Net Book Value" value={formatCurrency(netBookValue)} />
                <DetailItem label="Residual Value" value={formatCurrency(asset.residual_value)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DetailItem label="Category" value={asset.asset_categories?.name} />
                <DetailItem label="Purchase Date" value={format(new Date(asset.purchase_date), 'PPP')} />
                <DetailItem label="Vendor" value={asset.vendors?.name} />
                <DetailItem label="Serial Number" value={asset.serial_number} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Assignment</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DetailItem label="Location" value={asset.location} />
                <DetailItem label="Assigned To" value={asset.employees ? `${asset.employees.first_name} ${asset.employees.last_name}` : 'N/A'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Depreciation</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <DetailItem label="Method" value={asset.depreciation_method} />
                <DetailItem label="Useful Life" value={`${asset.useful_life_years} years`} />
                <DetailItem label="Last Depreciation" value={asset.last_depreciation_date ? format(new Date(asset.last_depreciation_date), 'PPP') : 'Never'} />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Accounting Details</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4 text-sm">
          <DetailItem label="Asset Account" value={asset.asset_account?.name} />
          <DetailItem label="Accumulated Depreciation Account" value={asset.accum_depr_account?.name} />
          <DetailItem label="Depreciation Expense Account" value={asset.depr_expense_account?.name} />
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetDetail;