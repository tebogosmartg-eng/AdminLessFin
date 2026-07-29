// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import {
  beginEdgeRequest,
  bootstrapTenantRequest,
  edgeSuccess,
  edgeFailure,
  optionsResponse,
} from '../_shared/enterpriseEdgePlatform.ts'

/**
 * Quick Capture Expense — additive entry point under Purchases.
 * Bank/cash/petty: calls existing record_bank_transaction_atomic (unchanged),
 * then records capture metadata + optional attachment_url.
 * Owner-paid: calls record_owner_paid_expense_atomic → posting_engine_submit.
 */

type Method =
  | 'GET_CATEGORIES'
  | 'SEED_CATEGORIES'
  | 'CAPTURE'
  | 'SUGGEST_CATEGORY'
  | 'EXTRACT_RECEIPT'
  | 'GET_CAPTURES'

serve(async (req: Request) => {
  const ctx = beginEdgeRequest(req, 'quick-capture-expense', 'tenant')
  if (req.method === 'OPTIONS') return optionsResponse(ctx)

  try {
    const { user, admin, body, company_id } = await bootstrapTenantRequest(req, ctx)
    const method = body.method as Method
    let data: unknown = null

    switch (method) {
      case 'GET_CATEGORIES': {
        const { data: rows, error } = await admin
          .from('quick_expense_categories')
          .select('id, label, expense_account_id, sort_order, is_active, chart_of_accounts(name, account_number, type)')
          .eq('company_id', company_id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (error) throw error
        data = rows
        break
      }

      case 'SEED_CATEGORIES': {
        const { data: seeded, error } = await admin.rpc('seed_quick_expense_categories', {
          p_company_id: company_id,
        })
        if (error) throw error
        data = seeded
        break
      }

      case 'SUGGEST_CATEGORY': {
        const { data: suggestion, error } = await admin.rpc('suggest_quick_expense_category', {
          p_company_id: company_id,
          p_vendor_name: body.vendor_name ?? null,
          p_description: body.description ?? null,
        })
        if (error) throw error
        data = suggestion
        break
      }

      case 'GET_CAPTURES': {
        const { data: rows, error } = await admin
          .from('quick_expense_captures')
          .select('*, quick_expense_categories(label)')
          .eq('company_id', company_id)
          .order('expense_date', { ascending: false })
          .limit(body.limit ?? 50)
        if (error) throw error
        data = rows
        break
      }

      case 'CAPTURE': {
        const paymentSource = body.payment_source_kind as 'bank_account' | 'owner_paid'
        const amount = Number(body.amount)
        const expenseDate = body.expense_date
        const expenseAccountId = body.expense_account_id
        const categoryId = body.category_id ?? null
        const description = body.description ?? null
        const vendorName = body.vendor_name ?? null
        const attachmentUrl = body.attachment_url ?? null

        if (!paymentSource || !['bank_account', 'owner_paid'].includes(paymentSource)) {
          throw new Error('payment_source_kind must be bank_account or owner_paid')
        }
        if (!(amount > 0)) throw new Error('amount must be positive')
        if (!expenseDate) throw new Error('expense_date is required')
        if (!expenseAccountId) throw new Error('expense_account_id is required')

        if (paymentSource === 'owner_paid') {
          // Branch: owner-paid → new additive RPC (not Banking withdrawal).
          const { data: result, error } = await admin.rpc('record_owner_paid_expense_atomic', {
            p_company_id: company_id,
            p_expense_account_id: expenseAccountId,
            p_amount: amount,
            p_expense_date: expenseDate,
            p_description: description,
            p_vendor_name: vendorName,
            p_category_id: categoryId,
            p_attachment_url: attachmentUrl,
            p_actor_user_id: user.id,
          })
          if (error) throw error
          data = { payment_source_kind: 'owner_paid', ...result }
          break
        }

        // Branch: bank/cash/petty → existing Banking withdrawal RPC unchanged.
        const bankAccountId = body.bank_account_id
        if (!bankAccountId) throw new Error('bank_account_id is required for bank_account payment source')

        const { data: bankResult, error: bankError } = await admin.rpc('record_bank_transaction_atomic', {
          p_company_id: company_id,
          p_bank_account_id: bankAccountId,
          p_transaction_type: 'withdrawal',
          p_direction: 'decrease',
          p_transaction_date: expenseDate,
          p_amount: amount,
          p_contra_account_id: expenseAccountId,
          p_description: description,
          p_reference: vendorName ? `QC:${vendorName}` : 'quick-capture',
          p_actor_user_id: user.id,
        })
        if (bankError) throw bankError

        const bankTransactionId = bankResult?.bank_transaction_id
        if (!bankTransactionId) throw new Error('Banking RPC did not return bank_transaction_id')

        const { data: captureResult, error: captureError } = await admin.rpc('record_bank_paid_quick_capture', {
          p_company_id: company_id,
          p_bank_account_id: bankAccountId,
          p_bank_transaction_id: bankTransactionId,
          p_expense_account_id: expenseAccountId,
          p_amount: amount,
          p_expense_date: expenseDate,
          p_description: description,
          p_vendor_name: vendorName,
          p_category_id: categoryId,
          p_attachment_url: attachmentUrl,
          p_actor_user_id: user.id,
        })
        if (captureError) throw captureError

        data = {
          payment_source_kind: 'bank_account',
          ...bankResult,
          ...captureResult,
        }
        break
      }

      case 'EXTRACT_RECEIPT': {
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
        if (!OPENAI_API_KEY) {
          // Signal to client that OpenAI vision is unavailable; UI falls back to local Tesseract.
          data = {
            provider: null,
            unavailable: true,
            reason: 'OPENAI_API_KEY is not configured on this project.',
            vendor_name: null,
            amount: null,
            expense_date: null,
            description: null,
            confidence: {
              vendor_name: 0,
              amount: 0,
              expense_date: 0,
              description: 0,
            },
          }
          break
        }
        const imageUrl = body.image_url as string | undefined
        const imageBase64 = body.image_base64 as string | undefined
        if (!imageUrl && !imageBase64) throw new Error('image_url or image_base64 is required')

        const imageContent = imageUrl
          ? { type: 'image_url', image_url: { url: imageUrl } }
          : {
              type: 'image_url',
              image_url: {
                url: imageBase64!.startsWith('data:')
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
              },
            }

        const systemPrompt = `You extract data from receipt photos for expense capture.
Respond ONLY with JSON in this exact shape:
{
  "vendor_name": string|null,
  "amount": number|null,
  "expense_date": "YYYY-MM-DD"|null,
  "description": string|null,
  "confidence": {
    "vendor_name": number,
    "amount": number,
    "expense_date": number,
    "description": number
  },
  "notes": string|null
}
Confidence is 0-1. Use low confidence (<0.6) when blurry/unclear. Do not invent values you cannot see.`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            temperature: 0.1,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Extract vendor name, total amount, date, and a short description from this receipt.' },
                  imageContent,
                ],
              },
            ],
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`OCR extraction failed: ${errText}`)
        }
        const ai = await response.json()
        const raw = ai.choices?.[0]?.message?.content
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        data = { provider: 'openai-gpt-4o-mini', unavailable: false, ...parsed }
        break
      }

      default:
        throw new Error(`Unsupported method: ${method}`)
    }

    return edgeSuccess(ctx, data)
  } catch (error) {
    return edgeFailure(ctx, error)
  }
})
