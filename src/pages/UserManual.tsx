import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Printer } from "lucide-react";

const UserManual = () => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Manual & Guide</h1>
          <p className="text-muted-foreground">Comprehensive documentation for the SmaAcc platform.</p>
        </div>
        <Button onClick={handlePrint} className="shrink-0">
          <Download className="mr-2 h-4 w-4" /> Download / Print PDF
        </Button>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none print:prose-sm">
        <Card className="print:shadow-none print:border-none">
          <CardContent className="p-8 print:p-0">
            <div className="mb-8 border-b pb-4">
              <h1 className="text-4xl font-extrabold mb-2">SmaAcc User Guide</h1>
              <p className="text-xl text-muted-foreground">The All-In-One Business Management System</p>
            </div>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">1. Introduction</h2>
              <p>
                SmaAcc is a comprehensive ERP (Enterprise Resource Planning) solution designed to streamline your business operations. 
                From tracking sales and inventory to managing complex accounting and payroll, SmaAcc provides a unified platform 
                for business owners, accountants, and team members.
              </p>
              
              <h3 className="text-lg font-semibold">Key Capabilities</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Financial Management:</strong> Complete double-entry bookkeeping, general ledger, and financial reporting.</li>
                <li><strong>Operations:</strong> Inventory tracking, project management, and time tracking.</li>
                <li><strong>HR & Payroll:</strong> Employee management, payslip generation, and expense claims.</li>
                <li><strong>Automation:</strong> Recurring invoices/bills and automated depreciation schedules.</li>
              </ul>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">2. Roles & Security</h2>
              <p>SmaAcc uses a strict Role-Based Access Control (RBAC) system to protect your data.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4 print:grid-cols-3">
                <div className="border p-4 rounded-md">
                  <strong className="block text-lg mb-2">👑 Owner</strong>
                  <p className="text-sm">Full access to everything. Can delete the company, manage billing, and assign Admins.</p>
                </div>
                <div className="border p-4 rounded-md">
                  <strong className="block text-lg mb-2">🛡️ Admin</strong>
                  <p className="text-sm">Full operational access. Can view sensitive financials (Payroll, Loans, Reports) and manage master data (Chart of Accounts).</p>
                </div>
                <div className="border p-4 rounded-md">
                  <strong className="block text-lg mb-2">👤 Member</strong>
                  <p className="text-sm">Restricted access. Can manage Sales, Purchases, and Time Tracking. Cannot see Payroll, Banking, or Financial Reports.</p>
                </div>
              </div>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">3. Sales & Revenue</h2>
              <p>Manage the entire Order-to-Cash cycle.</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Quotes:</strong> Create estimates for clients. Once accepted, convert them directly into Invoices.</li>
                <li><strong>Invoices:</strong> Issue professional invoices. Support for inventory items, services, and multi-line taxes.</li>
                <li><strong>Recurring Invoices:</strong> Automate billing for subscriptions or retainers. Invoices are generated automatically on schedule.</li>
                <li><strong>Payments:</strong> Record customer payments against invoices to update Accounts Receivable in real-time.</li>
                <li><strong>Credit Notes:</strong> Manage refunds and returns by issuing credits allocating them to unpaid invoices.</li>
              </ul>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">4. Purchasing & Expenses</h2>
              <p>Control your spending and manage vendor relationships.</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Purchase Orders (PO):</strong> Send formal orders to suppliers. Convert POs to Bills upon delivery.</li>
                <li><strong>Bills:</strong> Record incoming invoices from vendors to track Accounts Payable.</li>
                <li><strong>Expense Claims:</strong> Employees can submit out-of-pocket expenses. Admins approve and reimburse them.</li>
                <li><strong>Vendor Credits:</strong> Track refunds from suppliers and allocate them to reduce future bill payments.</li>
              </ul>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">5. Inventory & Projects</h2>
              <div className="space-y-2">
                <h4 className="font-bold">Inventory Management</h4>
                <p>Track stock levels automatically. Selling items reduces stock; buying items increases it. Use <strong>Stock Adjustments</strong> for shrinkage or corrections.</p>
                
                <h4 className="font-bold mt-4">Project Management</h4>
                <p>Create projects linked to customers. Track profitability by assigning revenue (Invoices) and costs (Bills/Expenses) to specific projects.</p>
                
                <h4 className="font-bold mt-4">Time Tracking</h4>
                <p>Log hours against projects. Admins can pull "Unbilled Time" directly into new Invoices.</p>
              </div>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">6. Accounting & Finance (Admin Only)</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Chart of Accounts:</strong> Customize your ledger accounts.</li>
                <li><strong>Journal Entries:</strong> Record manual adjustments, depreciation, or complex transactions.</li>
                <li><strong>Bank Reconciliation:</strong> Match your book records with bank statements to ensure accuracy.</li>
                <li><strong>Fixed Assets:</strong> Register assets, track net book value, and dispose of assets.</li>
                <li><strong>Loans:</strong> Track liability amortization and interest expenses.</li>
              </ul>
            </section>

            <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">7. Reporting</h2>
              <p>Gain actionable insights with real-time reports.</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Financial Statements:</strong> Balance Sheet, Income Statement (P&L), Cash Flow.</li>
                <li><strong>Comparative Reports:</strong> Compare P&L and Balance Sheet against prior periods.</li>
                <li><strong>Operational Reports:</strong> Aged Receivables/Payables, Inventory Valuation, Project Profitability.</li>
                <li><strong>Tax Report:</strong> Summary of Input vs. Output tax to determine net liability.</li>
              </ul>
            </section>

             <section className="space-y-4 mb-8">
              <h2 className="text-2xl font-bold">8. Getting Support</h2>
              <p>
                If you encounter issues or need to update company settings, navigate to the <strong>Settings</strong> page. 
                Use the <strong>Audit Log</strong> (Admin only) to trace data changes.
              </p>
            </section>

            <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground print:text-xs">
              <p>Generated by SmaAcc Application</p>
              <p>{new Date().toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserManual;