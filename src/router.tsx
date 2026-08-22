import { lazy } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import BetaAnalyticsRoute from "./components/BetaAnalyticsRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import FinancialStatementsGate from "./components/financialStatements/FinancialStatementsGate";
import FinancialCloseGate from "./components/financialClose/FinancialCloseGate";
import AccountingReadyGate from "./components/accounting/AccountingReadyGate";

// Phase P1.1 — delivery layer only. Auth entry points (Landing/AuthPage) and
// the trivial NotFound page stay eagerly imported: they're what an
// unauthenticated visitor sees first, and lazy-loading them would add a
// network round trip to the very page this phase is trying to make faster.
// Route guards (ProtectedRoute/AdminRoute/the two Gate components) are not
// page content and also stay eager, per the explicit "do not lazy-load
// auth" requirement.
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Public marketing/legal pages. Eager (like Landing/Auth) — they are part of the
// unauthenticated front door, are lightweight, and render outside Layout's
// Suspense boundary, so lazy-loading them would need a separate boundary here.
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import TermsOfService from "./pages/legal/TermsOfService";
import SecurityPolicy from "./pages/legal/SecurityPolicy";
import ContactSales from "./pages/ContactSales";

// Every actual workspace/page below is lazy — each import() call is an
// independent chunk boundary Rollup splits automatically. Rendered only
// inside Layout's <Outlet/>, which already has a Suspense boundary
// (see src/components/Layout.tsx), so the sidebar/header shell never
// suspends — only the routed content does.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CreateCompany = lazy(() => import("./pages/CreateCompany"));
const FinancialCalendar = lazy(() => import("./pages/FinancialCalendar"));
const Chat = lazy(() => import("./pages/Chat"));
const UserManual = lazy(() => import("./pages/UserManual"));
const OnboardingGuide = lazy(() => import("./pages/OnboardingGuide"));

const RevenueWorkspace = lazy(() => import("./pages/RevenueWorkspace"));
const Quotes = lazy(() => import("./pages/Quotes"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const CreditNotes = lazy(() => import("./pages/CreditNotes"));
const RecurringInvoices = lazy(() => import("./pages/RecurringInvoices"));
const ReceivePayments = lazy(() => import("./pages/ReceivePayments"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));

const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const PurchaseOrderDetail = lazy(() => import("./pages/PurchaseOrderDetail"));
const PurchasesWorkspace = lazy(() => import("./pages/PurchasesWorkspace"));
const QuickCaptureExpense = lazy(() => import("./pages/QuickCaptureExpense"));
const Bills = lazy(() => import("./pages/Bills"));
const PayBills = lazy(() => import("./pages/PayBills"));
const VendorCredits = lazy(() => import("./pages/VendorCredits"));
const RecurringBills = lazy(() => import("./pages/RecurringBills"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));

const Products = lazy(() => import("./pages/Products"));
const InventoryWorkspace = lazy(() => import("./pages/inventory/InventoryWorkspace"));
const InventoryRegister = lazy(() => import("./pages/inventory/InventoryRegister"));
const InventoryWarehouses = lazy(() => import("./pages/inventory/InventoryWarehouses"));
const InventoryMovements = lazy(() => import("./pages/inventory/InventoryMovements"));
const InventoryReceipts = lazy(() => import("./pages/inventory/InventoryReceipts"));
const InventoryTransfers = lazy(() => import("./pages/inventory/InventoryTransfers"));
const InventoryCounts = lazy(() => import("./pages/inventory/InventoryCounts"));
const InventoryCosting = lazy(() => import("./pages/inventory/InventoryCosting"));
const InventoryAnalytics = lazy(() => import("./pages/inventory/InventoryAnalytics"));
const TimeTracking = lazy(() => import("./pages/TimeTracking"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));

const WorkExecutiveDashboard = lazy(() => import("./pages/work/WorkExecutiveDashboard"));
const WorkProjects = lazy(() => import("./pages/work/WorkProjects"));
const WorkProjectCommandCentre = lazy(() => import("./pages/work/WorkProjectCommandCentre"));
const WorkTime = lazy(() => import("./pages/work/WorkTime"));
const WorkResources = lazy(() => import("./pages/work/WorkResources"));
const WorkClocking = lazy(() => import("./pages/work/WorkClocking"));

const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const JournalEntries = lazy(() => import("./pages/JournalEntries"));
const RecurringEntries = lazy(() => import("./pages/RecurringEntries"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const AccountingDashboard = lazy(() => import("./pages/accounting/AccountingDashboard"));
const TrialBalance = lazy(() => import("./pages/accounting/TrialBalance"));
const PostingRequests = lazy(() => import("./pages/accounting/PostingRequests"));
const FinancialPeriods = lazy(() => import("./pages/accounting/FinancialPeriods"));
const FinancialYears = lazy(() => import("./pages/accounting/FinancialYears"));
const ReconciliationCentre = lazy(() => import("./pages/accounting/ReconciliationCentre"));
const ExceptionsCentre = lazy(() => import("./pages/accounting/ExceptionsCentre"));
const AccountingAuditTrail = lazy(() => import("./pages/accounting/AccountingAuditTrail"));
const AccountingTimeline = lazy(() => import("./pages/accounting/AccountingTimeline"));
const FinancialHealth = lazy(() => import("./pages/accounting/FinancialHealth"));
const PeriodCloseReadiness = lazy(() => import("./pages/accounting/PeriodCloseReadiness"));
const AccountingSetupWizard = lazy(() => import("./pages/accounting/AccountingSetupWizard"));

const Reports = lazy(() => import("./pages/Reports"));
const FinancialStatements = lazy(() => import("./pages/FinancialStatements"));
const FinancialStatementsWorkspaceHome = lazy(() => import("./pages/financialStatements/FinancialStatementsWorkspaceHome"));
const FinancialStatementsWorkspaceDashboard = lazy(() => import("./pages/financialStatements/FinancialStatementsWorkspaceDashboard"));
const FinancialCloseHome = lazy(() => import("./pages/financialClose/FinancialCloseHome"));
const FinancialCloseWorkspace = lazy(() => import("./pages/financialClose/FinancialCloseWorkspace"));
const ProjectProfitabilityReport = lazy(() => import("./pages/ProjectProfitabilityReport"));
const InventoryValuation = lazy(() => import("./pages/InventoryValuation"));
const TaxReport = lazy(() => import("./pages/TaxReport"));
const ComparativePL = lazy(() => import("./pages/ComparativePL"));
const ComparativeBalanceSheet = lazy(() => import("./pages/ComparativeBalanceSheet"));
const Budgets = lazy(() => import("./pages/Budgets"));

const Banking = lazy(() => import("./pages/Banking"));
const BankAccountsWorkspace = lazy(() => import("./pages/BankAccountsWorkspace"));
const BankAccountDetail = lazy(() => import("./pages/BankAccountDetail"));
const BankTransactions = lazy(() => import("./pages/BankTransactions"));
const BankTransfers = lazy(() => import("./pages/BankTransfers"));
const PettyCash = lazy(() => import("./pages/PettyCash"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const Settings = lazy(() => import("./pages/Settings"));
const PayrollWorkspace = lazy(() => import("./pages/PayrollWorkspace"));
const Employees = lazy(() => import("./pages/Employees"));
const ExpenseClaims = lazy(() => import("./pages/ExpenseClaims"));
const PayrollRuns = lazy(() => import("./pages/PayrollRuns"));
const PayrollRunDetail = lazy(() => import("./pages/PayrollRunDetail"));
const PayrollReports = lazy(() => import("./pages/PayrollReports"));
const StatutoryReturns = lazy(() => import("./pages/StatutoryReturns"));
const AuditComplianceReports = lazy(() => import("./pages/AuditComplianceReports"));
const Loans = lazy(() => import("./pages/Loans"));
const LoanDetail = lazy(() => import("./pages/LoanDetail"));
const FixedAssets = lazy(() => import("./pages/FixedAssets"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const AssetCategories = lazy(() => import("./pages/AssetCategories"));
const AssetCategoryWorkspace = lazy(() => import("./pages/AssetCategoryWorkspace"));
const AssetAcquisitions = lazy(() => import("./pages/AssetAcquisitions"));
const AssetFinancialCockpit = lazy(() => import("./pages/AssetFinancialCockpit"));
const AssetHealthDashboard = lazy(() => import("./pages/AssetHealthDashboard"));
const AssetAnalyticsDashboard = lazy(() => import("./pages/AssetAnalyticsDashboard"));
const AssetVerificationDashboard = lazy(() => import("./pages/AssetVerificationDashboard"));
const AssetMaintenanceDashboard = lazy(() => import("./pages/AssetMaintenanceDashboard"));
const AssetReports = lazy(() => import("./pages/AssetReports"));
const TaxRates = lazy(() => import("./pages/TaxRates"));
const Import = lazy(() => import("./pages/Import"));
const BetaAnalyticsDashboard = lazy(() => import("./pages/admin/BetaAnalyticsDashboard"));

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/security" element={<SecurityPolicy />} />
      <Route path="/contact" element={<ContactSales />} />
      <Route element={<ProtectedRoute />}>
        {/* Common Routes - Accessible by everyone */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/create-company" element={<CreateCompany />} />
        <Route path="/accounting-setup" element={<AccountingSetupWizard />} />
        <Route path="/calendar" element={<FinancialCalendar />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/manual" element={<UserManual />} />
        <Route path="/onboarding-guide" element={<OnboardingGuide />} />

        <Route path="/sales" element={<RevenueWorkspace />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/invoices" element={<AccountingReadyGate module="invoices"><Invoices /></AccountingReadyGate>} />
        <Route path="/invoices/:id" element={<AccountingReadyGate module="invoices"><InvoiceDetail /></AccountingReadyGate>} />
        <Route path="/credit-notes" element={<CreditNotes />} />
        <Route path="/recurring-invoices" element={<RecurringInvoices />} />
        <Route path="/receive-payments" element={<ReceivePayments />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />

        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="/purchases" element={<PurchasesWorkspace />} />
        <Route path="/purchases/quick-capture" element={<QuickCaptureExpense />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/pay-bills" element={<PayBills />} />
        <Route path="/vendor-credits" element={<VendorCredits />} />
        <Route path="/recurring-bills" element={<RecurringBills />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:id" element={<VendorDetail />} />

        <Route path="/products" element={<Products />} />
        <Route path="/inventory" element={<InventoryWorkspace />} />
        <Route path="/inventory/register" element={<InventoryRegister />} />
        <Route path="/inventory/warehouses" element={<InventoryWarehouses />} />
        <Route path="/inventory/movements" element={<InventoryMovements />} />
        <Route path="/inventory/receipts" element={<InventoryReceipts />} />
        <Route path="/inventory/transfers" element={<InventoryTransfers />} />
        <Route path="/inventory/counts" element={<InventoryCounts />} />
        <Route path="/inventory/costing" element={<InventoryCosting />} />
        <Route path="/inventory/analytics" element={<InventoryAnalytics />} />
        <Route path="/time-tracking" element={<TimeTracking />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />

        <Route path="/work" element={<WorkExecutiveDashboard />} />
        <Route path="/work/projects" element={<WorkProjects />} />
        <Route path="/work/projects/:id" element={<WorkProjectCommandCentre />} />
        <Route path="/work/time" element={<WorkTime />} />
        <Route path="/work/resources" element={<WorkResources />} />
        <Route path="/work/clocking" element={<WorkClocking />} />

        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/journal-entries" element={<AccountingReadyGate module="journal_entries"><JournalEntries /></AccountingReadyGate>} />
        <Route path="/recurring-entries" element={<RecurringEntries />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/general-ledger" element={<GeneralLedger />} />
        <Route path="/accounting" element={<AccountingDashboard />} />
        <Route path="/accounting/dashboard" element={<AccountingDashboard />} />
        <Route path="/trial-balance" element={<TrialBalance />} />
        <Route path="/accounting/posting-requests" element={<PostingRequests />} />
        <Route path="/accounting/periods" element={<FinancialPeriods />} />
        <Route path="/accounting/years" element={<FinancialYears />} />
        <Route path="/accounting/reconciliation" element={<ReconciliationCentre />} />
        <Route path="/accounting/exceptions" element={<ExceptionsCentre />} />
        <Route path="/accounting/audit-trail" element={<AccountingAuditTrail />} />
        <Route path="/accounting/timeline" element={<AccountingTimeline />} />
        <Route path="/accounting/health" element={<FinancialHealth />} />
        <Route path="/accounting/period-close" element={<PeriodCloseReadiness />} />


        <Route path="/reports" element={<Reports />} />
        {/* Legacy path retained for sidebar/dashboard links (V6.4.0 dual-track) */}
        <Route path="/reports/live-financial-statements" element={<Navigate to="/financial-statements" replace />} />
        {/*
          Operational LIVE financial statements — deliberately NOT behind
          AccountingReadyGate. That gate protects POSTING: it stops modules
          writing to the ledger before the foundation is validated. This route
          only READS the ledger, and reporting on what has been posted so far is
          exactly what is needed while the period is still being prepared —
          blocking it made statements look available only after closure.
          The page shows a non-blocking readiness advisory instead.
          Statutory AFS (/financial-statements-workspace) keeps its own close,
          validation, review and approval workflow, untouched.
        */}
        <Route path="/financial-statements" element={<FinancialStatements />} />
        {/* Statutory Financial Statements Workspace — Phase A foundation; flag-gated; no sidebar */}
        <Route
          path="/financial-statements-workspace"
          element={
            <FinancialStatementsGate>
              <FinancialStatementsWorkspaceHome />
            </FinancialStatementsGate>
          }
        />
        <Route
          path="/financial-statements-workspace/:workspaceId"
          element={
            <FinancialStatementsGate>
              <FinancialStatementsWorkspaceDashboard />
            </FinancialStatementsGate>
          }
        />
        {/* Financial Close Platform — EFCP V6.8.0; additive; flag-gated */}
        <Route
          path="/financial-close"
          element={
            <FinancialCloseGate>
              <FinancialCloseHome />
            </FinancialCloseGate>
          }
        />
        <Route
          path="/financial-close/:closeId"
          element={
            <FinancialCloseGate>
              <FinancialCloseWorkspace />
            </FinancialCloseGate>
          }
        />
        <Route path="/project-profitability" element={<ProjectProfitabilityReport />} />
        <Route path="/inventory-valuation" element={<InventoryValuation />} />
        <Route path="/tax-report" element={<TaxReport />} />
        <Route path="/comparative-pl" element={<ComparativePL />} />
        <Route path="/comparative-bs" element={<ComparativeBalanceSheet />} />
        <Route path="/budgets" element={<Budgets />} />

        {/* Platform beta analytics — email allowlist, not company RBAC */}
        <Route element={<BetaAnalyticsRoute />}>
          <Route path="/admin/beta-analytics" element={<BetaAnalyticsDashboard />} />
        </Route>

        {/* Admin Only Routes - Protected by AdminRoute */}
        <Route element={<AdminRoute />}>
          <Route path="/banking" element={<AccountingReadyGate module="banking"><Banking /></AccountingReadyGate>} />
          <Route path="/banking/accounts" element={<AccountingReadyGate module="banking"><BankAccountsWorkspace /></AccountingReadyGate>} />
          <Route path="/banking/accounts/:id" element={<AccountingReadyGate module="banking"><BankAccountDetail /></AccountingReadyGate>} />
          <Route path="/banking/transactions" element={<AccountingReadyGate module="banking"><BankTransactions /></AccountingReadyGate>} />
          <Route path="/banking/transfers" element={<AccountingReadyGate module="banking"><BankTransfers /></AccountingReadyGate>} />
          <Route path="/banking/petty-cash" element={<AccountingReadyGate module="banking"><PettyCash /></AccountingReadyGate>} />
          <Route path="/banking/reconciliation" element={<AccountingReadyGate module="banking"><BankReconciliation /></AccountingReadyGate>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/payroll" element={<AccountingReadyGate module="payroll"><PayrollWorkspace /></AccountingReadyGate>} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/expense-claims" element={<ExpenseClaims />} />
          <Route path="/payroll-runs" element={<AccountingReadyGate module="payroll"><PayrollRuns /></AccountingReadyGate>} />
          <Route path="/payroll-runs/:id" element={<AccountingReadyGate module="payroll"><PayrollRunDetail /></AccountingReadyGate>} />
          <Route path="/payroll-reports" element={<AccountingReadyGate module="payroll"><PayrollReports /></AccountingReadyGate>} />
          <Route path="/statutory-returns" element={<StatutoryReturns />} />
          <Route path="/audit-compliance-reports" element={<AuditComplianceReports />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/loans/:id" element={<LoanDetail />} />
          <Route path="/fixed-assets" element={<FixedAssets />} />
          <Route path="/fixed-assets/:id" element={<AssetDetail />} />
          <Route path="/asset-categories" element={<AssetCategories />} />
          <Route path="/asset-categories/:id" element={<AssetCategoryWorkspace />} />
          <Route path="/assets" element={<Navigate to="/fixed-assets" replace />} />
          <Route path="/assets/register" element={<FixedAssets />} />
          <Route path="/assets/acquisitions" element={<AssetAcquisitions />} />
          <Route path="/assets/cockpit" element={<AssetFinancialCockpit />} />
          <Route path="/assets/health" element={<AssetHealthDashboard />} />
          <Route path="/assets/analytics" element={<AssetAnalyticsDashboard />} />
          <Route path="/assets/verification" element={<AssetVerificationDashboard />} />
          <Route path="/assets/maintenance" element={<AssetMaintenanceDashboard />} />
          <Route path="/assets/reports" element={<AssetReports />} />
          <Route path="/tax-rates" element={<TaxRates />} />
          <Route path="/import" element={<Import />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
