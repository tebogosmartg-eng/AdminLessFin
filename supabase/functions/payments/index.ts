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
  | 'RECORD_CUSTOMER_PAYMENT'
  | 'RECORD_VENDOR_PAYMENT'
  | 'RECORD_INVOICE_PAYMENT';

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
        ({ data, error } = await userSupabase.rpc('get_customer_ar_balances'));
        break;
      }

      case 'GET_AP_BALANCES': {
        ({ data, error } = await userSupabase.rpc('get_vendor_ap_balances'));
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
