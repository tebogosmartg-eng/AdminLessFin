import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

type PaymentMethod =
  | 'GET_AR_BALANCES'
  | 'GET_AP_BALANCES'
  | 'GET_CUSTOMER_OPEN_INVOICES'
  | 'GET_INVOICE_SETTLEMENT'
  | 'RECORD_CUSTOMER_RECEIPT'
  | 'RECORD_CUSTOMER_PAYMENT'
  | 'RECORD_VENDOR_PAYMENT'
  | 'RECORD_INVOICE_PAYMENT';

/** One invoice a receipt may be applied to. */
type ReceiptAllocation = { invoice_id: string; amount: number };

type CustomerPaymentData = {
  payment_date: string;
  deposit_account_id: string;
  accounts_receivable_id: string;
  amount: number;
  description?: string;
};

type VendorPaymentData = {
  payment_date: string;
  payment_account_id: string;
  accounts_payable_id: string;
  amount: number;
  description?: string;
};

type PaymentsRequestBody = {
  method: PaymentMethod;
  company_id: string;
  customerId?: string;
  vendorId?: string;
  billId?: string;
  paymentData?: CustomerPaymentData | VendorPaymentData;
  invoice_id?: string;
  payment_date?: string;
  asset_account_id?: string;
  ar_account_id?: string;
  amount?: number;
  deposit_account_id?: string;
  accounts_receivable_id?: string;
  allocations?: ReceiptAllocation[];
  description?: string;
  idempotency_key?: string;
};

function isPaymentsRequestBody(value: unknown): value is PaymentsRequestBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.method === 'string' && typeof body.company_id === 'string';
}

function isCustomerPaymentData(value: unknown): value is CustomerPaymentData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.payment_date === 'string' &&
    typeof data.deposit_account_id === 'string' &&
    typeof data.accounts_receivable_id === 'string' &&
    typeof data.amount === 'number'
  );
}

function isVendorPaymentData(value: unknown): value is VendorPaymentData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.payment_date === 'string' &&
    typeof data.payment_account_id === 'string' &&
    typeof data.accounts_payable_id === 'string' &&
    typeof data.amount === 'number'
  );
}

serve(withEnterprisePlatform('payments', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const rawBody: unknown = await req.json();
    if (!isPaymentsRequestBody(rawBody)) {
      throw new Error("Invalid request payload.");
    }
    const body = rawBody;
    const { method, company_id } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

    // Security Check
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // User-impersonated client for RPC calls
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data: unknown = null;
    let error: unknown = null;

    switch (method) {
      case 'GET_AR_BALANCES': {
        ({ data, error } = await userSupabase.rpc('get_customer_ar_balances', { p_company_id: company_id }));
        break;
      }

      case 'GET_AP_BALANCES': {
        ({ data, error } = await userSupabase.rpc('get_vendor_ap_balances', { p_company_id: company_id }));
        break;
      }

      /**
       * The customer's unpaid invoices, with what is actually left on each.
       * The receipt dialog needs this to let a clerk say what the money
       * settles; outstanding comes from the same allocation table the posting
       * writes, so the screen and the books cannot disagree.
       */
      case 'GET_CUSTOMER_OPEN_INVOICES': {
        if (!body.customerId) throw new Error("customerId is required.");
        const { data: invoices, error: invErr } = await supabaseAdmin
          .from('invoices')
          .select('id, invoice_number, invoice_date, due_date, status')
          .eq('company_id', company_id)
          .eq('customer_id', body.customerId)
          // invoice_status has no 'cancelled' label; naming one here is an
          // error from PostgREST, not an empty filter.
          .not('status', 'in', '("void","draft","paid")')
          // Same order the engine allocates in, invoice_number included. Two
          // invoices raised on one day would otherwise be listed in one order
          // and settled in another, so the screen's oldest-first preview would
          // not be what actually happens.
          .order('invoice_date', { ascending: true })
          .order('invoice_number', { ascending: true });
        if (invErr) throw invErr;

        const rows = [];
        for (const inv of invoices ?? []) {
          const [{ data: gross }, { data: allocated }] = await Promise.all([
            supabaseAdmin.rpc('invoice_gross_amount', { p_invoice_id: inv.id }),
            supabaseAdmin.rpc('invoice_allocated_amount', { p_invoice_id: inv.id }),
          ]);
          const outstanding = Math.round((Number(gross ?? 0) - Number(allocated ?? 0)) * 100) / 100;
          if (outstanding <= 0) continue;
          rows.push({ ...inv, gross: Number(gross ?? 0), allocated: Number(allocated ?? 0), outstanding });
        }
        data = rows;
        break;
      }

      /**
       * What one invoice is worth, what has been settled against it, and what
       * is therefore left. The per-invoice payment dialog defaults to the
       * outstanding figure: defaulting to the invoice TOTAL would over-pay any
       * invoice that has already had something against it, which the engine now
       * refuses outright.
       */
      case 'GET_INVOICE_SETTLEMENT': {
        if (!body.invoice_id) throw new Error("invoice_id is required.");
        const { data: inv, error: invErr } = await supabaseAdmin
          .from('invoices')
          .select('id, invoice_number, status')
          .eq('id', body.invoice_id)
          .eq('company_id', company_id)
          .maybeSingle();
        if (invErr) throw invErr;
        if (!inv) throw new Error("Invoice not found in this company.");
        const [{ data: gross }, { data: allocated }] = await Promise.all([
          supabaseAdmin.rpc('invoice_gross_amount', { p_invoice_id: inv.id }),
          supabaseAdmin.rpc('invoice_allocated_amount', { p_invoice_id: inv.id }),
        ]);
        data = {
          ...inv,
          gross: Number(gross ?? 0),
          allocated: Number(allocated ?? 0),
          outstanding: Math.round((Number(gross ?? 0) - Number(allocated ?? 0)) * 100) / 100,
        };
        break;
      }

      /**
       * Receive money from a customer and say which invoices it settles.
       *
       * Everything below the authorisation check happens inside one RPC and one
       * transaction: the journal, the allocations and the resulting invoice
       * statuses. Sending an idempotency_key makes a retry safe -- and a replay
       * is reported as such rather than as a second success, because telling a
       * user their payment was recorded twice when it was banked once is the
       * one outcome worse than an error.
       */
      case 'RECORD_CUSTOMER_RECEIPT': {
        if (!body.customerId) throw new Error("customerId is required.");
        if (typeof body.amount !== 'number') throw new Error("amount is required.");
        if (!body.payment_date) throw new Error("payment_date is required.");
        if (!body.deposit_account_id) throw new Error("deposit_account_id is required.");
        if (body.allocations !== undefined && !Array.isArray(body.allocations)) {
          throw new Error("allocations must be a list of { invoice_id, amount }.");
        }
        ({ data, error } = await supabaseAdmin.rpc('record_customer_receipt_atomic', {
          p_company_id: company_id,
          p_customer_id: body.customerId,
          p_payment_date: body.payment_date,
          p_deposit_account_id: body.deposit_account_id,
          p_amount: body.amount,
          p_allocations: body.allocations ?? null,
          p_description: body.description ?? null,
          p_idempotency_key: body.idempotency_key ?? null,
          p_actor_user_id: user.id,
          p_accounts_receivable_id: body.accounts_receivable_id ?? null,
        }));
        break;
      }

      case 'RECORD_CUSTOMER_PAYMENT': {
        // General Payment on Account (not linked to specific invoice)
        const { customerId, paymentData } = body;
        if (!customerId) throw new Error("customerId is required.");
        if (!isCustomerPaymentData(paymentData)) throw new Error("Invalid customer payment data.");
        ({ data, error } = await supabaseAdmin.rpc('record_customer_payment_on_account_atomic', {
          p_company_id: company_id,
          p_customer_id: customerId,
          p_payment_date: paymentData.payment_date,
          p_deposit_account_id: paymentData.deposit_account_id,
          p_accounts_receivable_id: paymentData.accounts_receivable_id,
          p_amount: paymentData.amount,
          p_description: paymentData.description ?? null,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'RECORD_VENDOR_PAYMENT': {
        // General Payment on Account or Specific Bill
        const { vendorId, billId, paymentData: vendorPaymentData } = body;
        if (!isVendorPaymentData(vendorPaymentData)) throw new Error("Invalid vendor payment data.");
        
        if (billId) {
          // Paying a specific bill
          ({ data, error } = await supabaseAdmin.rpc('pay_specific_bill', {
            p_bill_id: billId,
            p_payment_date: vendorPaymentData.payment_date,
            p_payment_account_id: vendorPaymentData.payment_account_id,
            p_ap_account_id: vendorPaymentData.accounts_payable_id,
            p_amount: vendorPaymentData.amount,
          }));
        } else {
          // General payment to vendor (Balance Forward)
          if (!vendorId) throw new Error("vendorId is required.");
          ({ data, error } = await supabaseAdmin.rpc('record_vendor_payment_on_account_atomic', {
            p_company_id: company_id,
            p_vendor_id: vendorId,
            p_payment_date: vendorPaymentData.payment_date,
            p_payment_account_id: vendorPaymentData.payment_account_id,
            p_accounts_payable_id: vendorPaymentData.accounts_payable_id,
            p_amount: vendorPaymentData.amount,
            p_description: vendorPaymentData.description ?? null,
            p_actor_user_id: user.id,
          }));
        }
        break;
      }

      case 'RECORD_INVOICE_PAYMENT': {
        if (!body.invoice_id) throw new Error("invoice_id is required.");
        // The membership check above proves the caller may act for company_id.
        // It says nothing about this invoice, and the RPC takes its company
        // from the invoice itself -- so without this, a member of one company
        // could pay an invoice belonging to another.
        const { data: owned, error: ownErr } = await supabaseAdmin
          .from('invoices')
          .select('id')
          .eq('id', body.invoice_id)
          .eq('company_id', company_id)
          .maybeSingle();
        if (ownErr) throw ownErr;
        if (!owned) throw new Error("Invoice not found in this company.");
        if (!body.payment_date) throw new Error("payment_date is required.");
        if (!body.asset_account_id) throw new Error("asset_account_id is required.");
        if (!body.ar_account_id) throw new Error("ar_account_id is required.");
        if (typeof body.amount !== 'number') throw new Error("amount is required.");
        ({ data, error } = await userSupabase.rpc('record_invoice_payment', {
          p_invoice_id: body.invoice_id,
          p_payment_date: body.payment_date,
          p_asset_account_id: body.asset_account_id,
          p_ar_account_id: body.ar_account_id,
          p_amount: body.amount,
        }));
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: unknown) {
    return edgeFailure(_ctx, error);
  }
}))
