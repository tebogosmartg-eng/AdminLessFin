import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Download, Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import { showError, showSuccess, showLoading, dismissToast } from '../utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Skeleton } from '../components/ui/skeleton';

type CsvRow = {
  Date: string;
  Description: string;
  Account: string;
  Debit: string;
  Credit: string;
  Vendor?: string;
  Customer?: string;
};

type ValidatedEntry = {
  entry_date: string;
  description: string;
  vendor_id: string | null;
  customer_id: string | null;
  items: {
    account_id: string;
    type: 'debit' | 'credit';
    amount: number;
  }[];
};

type ReferenceData = {
  accounts: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  customers: { id: string; name: string }[];
};

const Import = () => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ValidatedEntry[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { data: referenceData, isLoading: isLoadingReferences } = useQuery<ReferenceData>({
    queryKey: ['import_references', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return { accounts: [], vendors: [], customers: [] };
      const { data, error } = await supabase.functions.invoke('data-import', {
        body: {
          method: 'GET_REFERENCES',
          company_id: activeCompany.id,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedData([]);
      setValidationErrors([]);
      parseAndValidateFile(selectedFile);
    }
  };

  const parseAndValidateFile = (fileToParse: File) => {
    Papa.parse(fileToParse, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as CsvRow[];
        const errors: string[] = [];
        
        if (!referenceData) {
          errors.push("Could not load required data (accounts, vendors, customers). Please refresh and try again.");
          setValidationErrors(errors);
          return;
        }

        const { accounts, vendors, customers } = referenceData;
        const accountMap = new Map(accounts.map(a => [a.name.toLowerCase(), a.id]));
        const vendorMap = new Map(vendors.map(v => [v.name.toLowerCase(), v.id]));
        const customerMap = new Map(customers.map(c => [c.name.toLowerCase(), c.id]));

        const groupedByEntry = rows.reduce((acc, row, index) => {
          const key = `${row.Date}_${row.Description}`;
          if (!acc[key]) {
            acc[key] = { date: row.Date, description: row.Description, vendor: row.Vendor, customer: row.Customer, items: [], originalRows: [] };
          }
          acc[key].items.push({ ...row, originalRow: index + 2 });
          return acc;
        }, {} as Record<string, any>);

        const validatedEntries: ValidatedEntry[] = [];

        for (const key in groupedByEntry) {
          const entry = groupedByEntry[key];
          let totalDebits = 0;
          let totalCredits = 0;
          const entryItems: ValidatedEntry['items'] = [];

          for (const item of entry.items) {
            const debit = parseFloat(item.Debit) || 0;
            const credit = parseFloat(item.Credit) || 0;
            totalDebits += debit;
            totalCredits += credit;

            const accountId = accountMap.get(item.Account?.toLowerCase());
            if (!accountId) {
              errors.push(`Row ${item.originalRow}: Account "${item.Account}" not found.`);
            } else {
              entryItems.push({
                account_id: accountId,
                type: debit > 0 ? 'debit' : 'credit',
                amount: debit > 0 ? debit : credit,
              });
            }
          }

          if (Math.abs(totalDebits - totalCredits) > 0.001) {
            errors.push(`Entry "${entry.description}" on ${entry.date}: Debits (${totalDebits.toFixed(2)}) do not equal Credits (${totalCredits.toFixed(2)}).`);
          }

          const vendorId = entry.vendor ? vendorMap.get(entry.vendor.toLowerCase()) : null;
          if (entry.vendor && !vendorId) {
            errors.push(`Entry "${entry.description}" on ${entry.date}: Vendor "${entry.vendor}" not found.`);
          }

          const customerId = entry.customer ? customerMap.get(entry.customer.toLowerCase()) : null;
          if (entry.customer && !customerId) {
            errors.push(`Entry "${entry.description}" on ${entry.date}: Customer "${entry.customer}" not found.`);
          }
          
          validatedEntries.push({
            entry_date: entry.date,
            description: entry.description,
            vendor_id: vendorId || null,
            customer_id: customerId || null,
            items: entryItems,
          });
        }

        if (errors.length > 0) {
          setValidationErrors(errors);
          setParsedData([]);
        } else {
          setValidationErrors([]);
          setParsedData(validatedEntries);
        }
      },
    });
  };

  const importMutation = useMutation({
    mutationFn: async (entries: ValidatedEntry[]) => {
      if (!activeCompany) throw new Error("No active company selected");
      const toastId = showLoading("Importing entries...");

      try {
        const { error } = await supabase.functions.invoke('data-import', {
          body: {
            method: 'IMPORT_ENTRIES',
            company_id: activeCompany.id,
            entries: entries,
          },
        });
        if (error) throw error;
        dismissToast(toastId);
      } catch (error) {
        dismissToast(toastId);
        throw error;
      }
    },
    onSuccess: () => {
      showSuccess(`${parsedData.length} journal entries imported successfully!`);
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      setFile(null);
      setParsedData([]);
    },
    onError: (error: any) => {
      showError(`Import failed: ${error.message}`);
    },
  });

  const handleDownloadTemplate = () => {
    const csvContent = "Date,Description,Account,Debit,Credit,Vendor,Customer\n" +
                       "YYYY-MM-DD,\"Sample Expense\",\"Rent Expense\",1500.00,,\"Sample Vendor\",\n" +
                       "YYYY-MM-DD,\"Sample Expense\",\"Checking Account\",,1500.00,\"Sample Vendor\",\n" +
                       "YYYY-MM-DD,\"Sample Sale\",\"Accounts Receivable\",500.00,,\"Sample Customer\"\n" +
                       "YYYY-MM-DD,\"Sample Sale\",\"Sales Revenue\",,500.00,,\"Sample Customer\"";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Import Data</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>Follow these steps to import your journal entries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>1. Download the CSV template file. This ensures your data is in the correct format.</p>
            <p>2. Fill out the template with your transaction data. Each line represents a debit or a credit. All lines for a single journal entry must have the exact same <strong>Date</strong> and <strong>Description</strong>.</p>
            <p>3. The <strong>Account</strong>, <strong>Vendor</strong>, and <strong>Customer</strong> names must exactly match the names in your SmaAcc account.</p>
            <p>4. Upload the completed file below. The system will validate it before importing.</p>
            <Button onClick={handleDownloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upload & Validate</CardTitle>
            <CardDescription>Select your CSV file to begin the process.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept=".csv" onChange={handleFileChange} disabled={isLoadingReferences} />
            {validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation Failed</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1 max-h-40 overflow-y-auto">
                    {validationErrors.map((error, i) => <li key={i}>{error}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {parsedData.length > 0 && validationErrors.length === 0 && (
              <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-300">Validation Successful!</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Found {parsedData.length} journal entries ready for import.
                </AlertDescription>
              </Alert>
            )}
            <Button 
              onClick={() => importMutation.mutate(parsedData)} 
              disabled={parsedData.length === 0 || validationErrors.length > 0 || importMutation.isPending}
              className="w-full"
            >
              {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Import {parsedData.length > 0 ? `${parsedData.length} Entries` : ''}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Reference</CardTitle>
          <CardDescription>Use these exact names in your CSV file to ensure a successful import.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingReferences ? <Skeleton className="h-72 w-full" /> : (
            <Tabs defaultValue="accounts">
              <TabsList>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
                <TabsTrigger value="customers">Customers</TabsTrigger>
              </TabsList>
              <TabsContent value="accounts">
                <ScrollArea className="h-72 rounded-md border p-4">
                  <ul className="space-y-1">
                    {referenceData?.accounts?.map(a => <li key={a.id} className="text-sm">{a.name}</li>)}
                  </ul>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="vendors">
                <ScrollArea className="h-72 rounded-md border p-4">
                  <ul className="space-y-1">
                    {referenceData?.vendors?.map(v => <li key={v.id} className="text-sm">{v.name}</li>)}
                  </ul>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="customers">
                <ScrollArea className="h-72 rounded-md border p-4">
                  <ul className="space-y-1">
                    {referenceData?.customers?.map(c => <li key={c.id} className="text-sm">{c.name}</li>)}
                  </ul>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Import;