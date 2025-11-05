import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import JournalEntries from "./pages/JournalEntries";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import GeneralLedger from "./pages/GeneralLedger";
import Budgets from "./pages/Budgets";
import RecurringEntries from "./pages/RecurringEntries";
import Vendors from "./pages/Vendors";
import Customers from "./pages/Customers";
import Sales from "./pages/Sales";
import Bills from "./pages/Bills";
import PayBills from "./pages/PayBills";
import ReceivePayments from "./pages/ReceivePayments";
import Products from "./pages/Products";
import Reconciliation from "./pages/Reconciliation";
import Import from "./pages/Import";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Employees from "./pages/Employees";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/pay-bills" element={<PayBills />} />
              <Route path="/receive-payments" element={<ReceivePayments />} />
              <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="/journal-entries" element={<JournalEntries />} />
              <Route path="/recurring-entries" element={<RecurringEntries />} />
              <Route path="/general-ledger" element={<GeneralLedger />} />
              <Route path="/reconciliation" element={<Reconciliation />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/import" element={<Import />} />
              <Route path="/employees" element={<Employees />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;