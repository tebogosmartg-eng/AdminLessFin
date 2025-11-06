import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from './ui/table';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

const InvoicePreview = ({ formData, customers, company }) => {
  const customer = customers?.find(c => c.id === formData.customer_id);
  const lineItems = formData.items?.map(item => ({
    ...item,
    description: item.description,
    total: (item.quantity || 0) * (item.unit_price || 0),
  })) || [];
  const totalAmount = lineItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-background">
      <Card className="shadow-none border-none">
        <CardHeader className="grid grid-cols-2 gap-4">
          <div>
            <img src="/logo.png" alt="SmaAcc Logo" className="h-12 w-auto mb-2" />
            <CardTitle className="text-base">{company?.name || 'Your Company'}</CardTitle>
            <p className="text-sm text-muted-foreground">{company?.address || 'Your Company Address'}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight">INVOICE</p>
            <p className="text-sm text-muted-foreground"># {formData.invoice_number || 'INV-XXXXX'}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div>
              <h3 className="font-semibold mb-1">Bill To:</h3>
              <p>{customer?.name || 'Select a customer'}</p>
              <p>{customer?.address}</p>
              <p>{customer?.email}</p>
            </div>
            <div className="text-right">
              <p><span className="font-semibold">Invoice Date:</span> {formData.invoice_date ? format(new Date(formData.invoice_date), 'PPP') : ''}</p>
              <p><span className="font-semibold">Due Date:</span> {formData.due_date ? format(new Date(formData.due_date), 'PPP') : ''}</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="text-lg font-bold bg-gray-50 dark:bg-gray-800">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoicePreview;