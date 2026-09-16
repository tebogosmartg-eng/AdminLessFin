import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from './ui/table';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { CompanyLogo } from './brand';
import { quoteTotals } from '../lib/quotes/quoteDocument';

const QuotePreview = ({ formData, customers, company, taxRates }) => {
  const customer = customers?.find(c => c.id === formData.customer_id);
  
  // Rounding per line, through the same function the saved quotation and the
  // quotes list use. This preview was the only view that showed VAT at all,
  // and it still rounded differently from the invoice the quote becomes, so a
  // cent could move between drafting and billing.
  const lineItems = formData.items?.map(item => {
    const line = quoteTotals([item], taxRates);
    return { ...item, subtotal: line.subtotal, taxAmount: line.taxTotal, total: line.total };
  }) || [];

  const { subtotal, taxTotal: totalTax, total: totalAmount } = quoteTotals(formData.items, taxRates);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-background">
      <Card className="shadow-none border-none">
        <CardHeader className="grid grid-cols-2 gap-4">
          <div>
            <CompanyLogo src={company?.logo_url} className="mb-2" />
            <CardTitle className="text-base">{company?.name || 'Your Company'}</CardTitle>
            <p className="text-sm text-muted-foreground">{company?.address || 'Your Company Address'}</p>
            {company?.email && <p className="text-sm text-muted-foreground">{company.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight">QUOTE</p>
            <p className="text-sm text-muted-foreground"># {formData.quote_number || 'QTE-XXXXX'}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div>
              <h3 className="font-semibold mb-1">To:</h3>
              <p>{customer?.name || 'Select a customer'}</p>
              <p>{customer?.address}</p>
              <p>{customer?.email}</p>
            </div>
            <div className="text-right">
              <p><span className="font-semibold">Quote Date:</span> {formData.quote_date ? format(new Date(formData.quote_date), 'PPP') : ''}</p>
              <p><span className="font-semibold">Expiry Date:</span> {formData.expiry_date ? format(new Date(formData.expiry_date), 'PPP') : ''}</p>
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
                  <TableCell className="text-right font-mono">{formatCurrency(item.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right">Subtotal</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(subtotal)}</TableCell>
              </TableRow>
              {totalTax > 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-right">Tax</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalTax)}</TableCell>
                </TableRow>
              )}
              <TableRow className="text-lg font-bold bg-gray-50 dark:bg-gray-800">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {formData?.terms ? (
            <div className="mt-6 border-t pt-4">
              <div className="text-sm font-semibold mb-1">Terms &amp; Conditions</div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{formData.terms}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default QuotePreview;