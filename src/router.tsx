import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
import ProtectedRoute from "./components/ProtectedRoute";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import JournalEntries from "./pages/JournalEntries";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import GeneralLedger from "./pages/GeneralLedger";
import Budgets from "./pages/Budgets";
import RecurringEntries from "./pages/RecurringEntries";
import Vendors from "./pages/Vendors";
import VendorDetail from "./pages/VendorDetail";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Bills from "./pages/Bills";
import PayBills from "./pages/PayBills";
import ReceivePayments from "./pages/ReceivePayments";
import Products from "./pages/Products";
import Reconciliation from "./pages/Reconciliation";
import Import from "./pages/Import";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Employees from "./pages/Employees";
import PayrollRuns from "./pages/PayrollRuns";
import PayrollRunDetail from "./pages/PayrollRunDetail";
import PayrollReports from "./pages/PayrollReports";
import Loans from "./pages/Loans";
import LoanDetail from "./pages/LoanDetail";
import FixedAssets from "./pages/FixedAssets";
import AssetCategories from "./pages/AssetCategories";
import AssetDetail from "./pages/AssetDetail";
import FinancialStatements from "./pages/FinancialStatements";
import CreateCompany from "./pages/CreateCompany";
import ErrorBoundary from "./components/ErrorBoundary";
import Chat from "./pages/Chat";
import Quotes from "./pages/Quotes";
import QuoteDetail from "./pages/QuoteDetail";
import TaxRates from "./pages/TaxRates";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import TimeTracking from "./pages/TimeTracking";
import RecurringInvoices from "./pages/RecurringInvoices";
import TaxReport from "./pages/TaxReport";
import RecurringBills from "./pages/RecurringBills";
import PurchaseOrders from "./pages/PurchaseOrders";
import PurchaseOrderDetail from "./pages/PurchaseOrderDetail";
import FinancialCalendar from "./pages/FinancialCalendar";

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create-company" element={<CreateCompany />} />
        <Route path="/calendar" element={<FinancialCalendar />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/recurring-invoices" element={<RecurringInvoices />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/pay-bills" element={<PayBills />} />
        <Route path="/recurring-bills" element={<RecurringBills />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="/receive-payments" element={<ReceivePayments />} />
        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/journal-entries" element={<JournalEntries />} />
        <Route path="/recurring-entries" element={<RecurringEntries />} />
        <Route path="/general-ledger" element={<GeneralLedger />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/financial-statements" element={<FinancialStatements />} />
        <Route path="/tax-report" element={<TaxReport />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:id" element={<VendorDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/import" element={<Import />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/payroll-runs" element={<PayrollRuns />} />
        <Route path="/payroll-runs/:id" element={<PayrollRunDetail />} />
        <Route path="/payroll-reports" element={<PayrollReports />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/loans/:id" element={<LoanDetail />} />
        <Route path="/fixed-assets" element={<FixedAssets />} />
        <Route path="/fixed-assets/:id" element={<AssetDetail />} />
        <Route path="/asset-categories" element={<AssetCategories />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/tax-rates" element={<TaxRates />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/time-tracking" element={<TimeTracking />} />
      </Route>
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};