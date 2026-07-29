// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import {
  fetchRegisterFacets,
  fetchRegisterPage,
} from '../_shared/eamRegisterQuery.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

/** Identical straight-line monthly amount used by run-depreciation (do not diverge). */
function straightLineMonthly(cost, residual, usefulLifeYears) {
  const depreciable = Number(cost) - Number(residual || 0);
  if (!usefulLifeYears || usefulLifeYears <= 0 || depreciable <= 0) return 0;
  return depreciable / (usefulLifeYears * 12);
}

async function recordLifecycle(supabaseAdmin, {
  company_id, asset_id, event_type, user_id, user_name, reason, reference, attachment_url, metadata, event_date,
}) {
  try {
    await supabaseAdmin.from('asset_lifecycle_events').insert({
      company_id,
      asset_id,
      event_type,
      event_date: event_date || new Date().toISOString(),
      user_id: user_id || null,
      user_name: user_name || null,
      reason: reason || null,
      reference: reference || null,
      attachment_url: attachment_url || null,
      metadata: metadata || {},
    });
  } catch (_) {
    // Timeline is additive — never fail primary accounting operations.
  }
}

// ARCHITECTURE NOTE:
// Secure API gateway for fixed asset operations.
// V16.2: EAM methods. V16.3: lifecycle (acquisition, components, timeline, relationships, bulk).
// Existing GET_ALL / GET_ONE / POST / DISPOSE contracts preserved.
// POST journal structure UNCHANGED. Component depreciation is memo-only (no JE).
serve(withEnterprisePlatform('fixed-assets', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { method, company_id } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id, role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied: User is not a member of this company.");
    }

    const isAdmin = ['owner', 'admin'].includes(companyMember.role);
    const actorName = user.email || 'User';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .select('*, asset_categories(name), employees(employee_number, first_name, last_name, department)')
          .eq('company_id', company_id)
          .order('purchase_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .select(`
            *,
            asset_categories ( * ),
            vendors ( name ),
            employees ( employee_number, first_name, last_name, department ),
            asset_account:asset_account_id ( name ),
            accum_depr_account:accumulated_depreciation_account_id ( name ),
            depr_expense_account:depreciation_expense_account_id ( name )
          `)
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST': {
        const { payment_account_id, ...assetData } = body.assetData;
        if (!payment_account_id) throw new Error('payment_account_id is required.');

        // Atomic: asset row + balanced acquisition JE in one Postgres transaction.
        const { data: newAssetId, error: acquireErr } = await supabaseAdmin.rpc('acquire_fixed_asset_atomic', {
          p_company_id: company_id,
          p_asset: assetData,
          p_payment_account_id: payment_account_id,
          p_actor_user_id: user.id,
        });
        if (acquireErr) throw acquireErr;

        const { data: asset, error: fetchErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('id, asset_code, description')
          .eq('id', newAssetId)
          .eq('company_id', company_id)
          .single();
        if (fetchErr) throw fetchErr;

        const { data: jeRows } = await supabaseAdmin
          .from('journal_entries')
          .select('id')
          .eq('company_id', company_id)
          .ilike('description', `Acquisition of asset: ${(assetData.description || '').slice(0, 80)}%`)
          .order('created_at', { ascending: false })
          .limit(1);
        const entryId = jeRows?.[0]?.id || null;

        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'created',
          user_id: user.id, user_name: actorName,
          reason: 'Asset created via register',
          reference: entryId,
          metadata: { journal_entry_id: entryId },
        });
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'purchased',
          user_id: user.id, user_name: actorName,
          reason: 'Acquisition journal posted',
          reference: entryId,
        });
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'capitalised',
          user_id: user.id, user_name: actorName,
          reason: 'Capitalised on acquisition',
          reference: entryId,
        });

        data = asset;
        break;
      }

      case 'DISPOSE': {
        const { data: assetRow, error: assetLookupErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('id, company_id, status')
          .eq('id', body.asset_id)
          .eq('company_id', company_id)
          .maybeSingle();
        if (assetLookupErr) throw assetLookupErr;
        if (!assetRow) throw new Error('Asset not found or permission denied.');

        // Pass explicit company_id — do not rely on profiles.active_company_id.
        ({ data, error } = await supabaseAdmin.rpc('dispose_asset', {
          p_asset_id: body.asset_id,
          p_disposal_date: body.disposal_date,
          p_proceeds: body.proceeds,
          p_cash_account_id: body.cash_account_id,
          p_gain_loss_account_id: body.gain_loss_account_id,
          p_company_id: company_id,
          p_actor_user_id: user.id,
        }));
        if (!error) {
          await supabaseAdmin.from('fixed_assets').update({
            lifecycle_stage: 'disposed',
            updated_at: new Date().toISOString(),
          }).eq('id', body.asset_id).eq('company_id', company_id);
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.asset_id, event_type: 'disposed',
            user_id: user.id, user_name: actorName,
            reason: body.reason || 'Asset disposed',
            reference: body.disposal_date,
            metadata: { proceeds: body.proceeds },
          });
        }
        break;
      }

      case 'PATCH_METADATA': {
        const allowed = [
          'location', 'department', 'custodian_name', 'assigned_to_employee_id',
          'serial_number', 'asset_tag', 'qr_code', 'barcode', 'category_id',
          'description', 'parent_asset_id', 'lifecycle_stage',
        ];
        const patch = {};
        for (const key of allowed) {
          if (body.patch && Object.prototype.hasOwnProperty.call(body.patch, key)) {
            patch[key] = body.patch[key];
          }
        }
        patch.updated_at = new Date().toISOString();
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .update(patch)
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .select()
          .single());
        if (!error && (patch.location || patch.department || patch.custodian_name || patch.assigned_to_employee_id)) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.assetId, event_type: 'transferred',
            user_id: user.id, user_name: actorName,
            reason: body.reason || 'Metadata / custody update',
            metadata: patch,
          });
        }
        break;
      }

      case 'GET_WORKSPACE': {
        const assetId = body.assetId;
        const { data: asset, error: assetErr } = await supabaseAdmin
          .from('fixed_assets')
          .select(`
            *,
            asset_categories ( * ),
            vendors ( name ),
            employees ( employee_number, first_name, last_name, department ),
            asset_account:asset_account_id ( name ),
            accum_depr_account:accumulated_depreciation_account_id ( name ),
            depr_expense_account:depreciation_expense_account_id ( name )
          `)
          .eq('id', assetId)
          .eq('company_id', company_id)
          .single();
        if (assetErr) throw assetErr;

        const [docs, verifications, schedules, maintenance, audit, timeline, components, relParent, relChild] = await Promise.all([
          supabaseAdmin.from('asset_documents').select('*').eq('asset_id', assetId).eq('company_id', company_id).order('created_at', { ascending: false }),
          supabaseAdmin.from('asset_verification_history').select('*').eq('asset_id', assetId).eq('company_id', company_id).order('verified_at', { ascending: false }),
          supabaseAdmin.from('asset_maintenance_schedules').select('*').eq('asset_id', assetId).eq('company_id', company_id).order('next_service_date', { ascending: true }),
          supabaseAdmin.from('asset_maintenance_records').select('*').eq('asset_id', assetId).eq('company_id', company_id).order('service_date', { ascending: false }),
          supabaseAdmin.from('audit_logs').select('*').eq('company_id', company_id).eq('table_name', 'fixed_assets').eq('record_id', assetId).order('created_at', { ascending: false }).limit(50),
          supabaseAdmin.from('asset_lifecycle_events').select('*').eq('asset_id', assetId).eq('company_id', company_id).order('event_date', { ascending: false }).limit(200),
          supabaseAdmin.from('asset_components').select('*').eq('parent_asset_id', assetId).eq('company_id', company_id).order('component_code'),
          supabaseAdmin.from('asset_relationships').select('*, child:child_asset_id(id, asset_code, description, status)').eq('parent_asset_id', assetId).eq('company_id', company_id),
          supabaseAdmin.from('asset_relationships').select('*, parent:parent_asset_id(id, asset_code, description, status)').eq('child_asset_id', assetId).eq('company_id', company_id),
        ]);

        data = {
          asset,
          documents: docs.data || [],
          verifications: verifications.data || [],
          schedules: schedules.data || [],
          maintenance: maintenance.data || [],
          auditTrail: audit.data || [],
          timeline: timeline.data || [],
          components: components.data || [],
          relationships: {
            children: relParent.data || [],
            parents: relChild.data || [],
          },
        };
        break;
      }

      case 'ADD_DOCUMENT': {
        const doc = {
          ...body.document,
          company_id,
          asset_id: body.assetId,
          uploaded_by: user.id,
        };
        ({ data, error } = await supabaseAdmin.from('asset_documents').insert(doc).select().single());
        if (!error) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.assetId, event_type: 'document_uploaded',
            user_id: user.id, user_name: actorName,
            reason: doc.file_name,
            attachment_url: doc.file_url || null,
            metadata: { document_type: doc.document_type },
          });
        }
        break;
      }

      case 'DELETE_DOCUMENT':
        ({ data, error } = await supabaseAdmin
          .from('asset_documents')
          .delete()
          .eq('id', body.documentId)
          .eq('company_id', company_id));
        break;

      case 'RECORD_VERIFICATION': {
        const payload = body.verification || {};
        const verifiedAt = payload.verified_at || new Date().toISOString();
        const { data: hist, error: histErr } = await supabaseAdmin
          .from('asset_verification_history')
          .insert({
            company_id,
            asset_id: body.assetId,
            verified_at: verifiedAt,
            verifier_user_id: user.id,
            verifier_name: payload.verifier_name || user.email || 'Verifier',
            verification_method: payload.verification_method || 'manual',
            status: payload.status || 'verified',
            location_confirmed: payload.location_confirmed || null,
            notes: payload.notes || null,
          })
          .select()
          .single();
        if (histErr) throw histErr;

        const nextDue = payload.next_verification_due || null;
        const { data: updated, error: updErr } = await supabaseAdmin
          .from('fixed_assets')
          .update({
            verification_status: payload.status === 'disputed' ? 'disputed' : 'verified',
            last_verified_at: verifiedAt,
            next_verification_due: nextDue,
            verified_by_user_id: user.id,
            verified_by_name: payload.verifier_name || user.email || 'Verifier',
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .select()
          .single();
        if (updErr) throw updErr;
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: body.assetId, event_type: 'verified',
          user_id: user.id, user_name: payload.verifier_name || actorName,
          reason: payload.notes || 'Physical verification',
          reference: hist.id,
        });
        data = { history: hist, asset: updated };
        break;
      }

      case 'UPSERT_MAINTENANCE_SCHEDULE': {
        const schedule = { ...body.schedule, company_id, asset_id: body.assetId, updated_at: new Date().toISOString() };
        if (schedule.id) {
          const id = schedule.id;
          delete schedule.id;
          ({ data, error } = await supabaseAdmin
            .from('asset_maintenance_schedules')
            .update(schedule)
            .eq('id', id)
            .eq('company_id', company_id)
            .select()
            .single());
        } else {
          ({ data, error } = await supabaseAdmin
            .from('asset_maintenance_schedules')
            .insert(schedule)
            .select()
            .single());
        }
        break;
      }

      case 'ADD_MAINTENANCE_RECORD': {
        // Operational only — intentionally does NOT create journal entries.
        const record = {
          ...body.record,
          company_id,
          asset_id: body.assetId,
        };
        ({ data, error } = await supabaseAdmin
          .from('asset_maintenance_records')
          .insert(record)
          .select()
          .single());
        if (!error) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.assetId, event_type: 'maintained',
            user_id: user.id, user_name: actorName,
            reason: record.description,
            metadata: { cost: record.cost, downtime_hours: record.downtime_hours, record_type: record.record_type },
          });
        }
        break;
      }

      case 'LIST_VERIFICATION_DASHBOARD': {
        const { data: assets, error: aErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('id, asset_code, description, location, department, verification_status, last_verified_at, next_verification_due, verified_by_name, qr_code, barcode, asset_tag, status, asset_categories(name)')
          .eq('company_id', company_id)
          .neq('status', 'disposed')
          .order('next_verification_due', { ascending: true, nullsFirst: true });
        if (aErr) throw aErr;
        data = assets || [];
        break;
      }

      case 'LIST_MAINTENANCE_DASHBOARD': {
        const { data: schedules, error: sErr } = await supabaseAdmin
          .from('asset_maintenance_schedules')
          .select('*, fixed_assets(id, asset_code, description, status)')
          .eq('company_id', company_id)
          .order('next_service_date', { ascending: true, nullsFirst: true });
        if (sErr) throw sErr;
        const { data: recent, error: rErr } = await supabaseAdmin
          .from('asset_maintenance_records')
          .select('*, fixed_assets(id, asset_code, description)')
          .eq('company_id', company_id)
          .order('service_date', { ascending: false })
          .limit(100);
        if (rErr) throw rErr;
        data = { schedules: schedules || [], recent: recent || [] };
        break;
      }

      // ── V16.3 Acquisition Workbench ───────────────────────────────────────
      case 'LIST_ACQUISITIONS':
        ({ data, error } = await supabaseAdmin
          .from('asset_acquisitions')
          .select('*, vendors:supplier_id(name), asset_categories:category_id(name)')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false }));
        break;

      case 'UPSERT_ACQUISITION': {
        if (!isAdmin) throw new Error('Permission denied: admin required for acquisitions.');
        const row = { ...body.acquisition, company_id, updated_at: new Date().toISOString() };
        if (!row.id) {
          row.created_by = user.id;
          row.created_by_name = actorName;
          ({ data, error } = await supabaseAdmin.from('asset_acquisitions').insert(row).select().single());
        } else {
          const id = row.id;
          delete row.id;
          delete row.generated_asset_id;
          delete row.journal_entry_id;
          ({ data, error } = await supabaseAdmin
            .from('asset_acquisitions')
            .update(row)
            .eq('id', id)
            .eq('company_id', company_id)
            .select()
            .single());
        }
        break;
      }

      case 'ADVANCE_ACQUISITION': {
        if (!isAdmin) throw new Error('Permission denied: admin required.');
        const allowedFlow = {
          draft: ['purchased', 'cancelled'],
          purchased: ['received', 'cancelled'],
          received: ['pending_capitalisation', 'cancelled'],
          pending_capitalisation: ['capitalised', 'cancelled'],
        };
        const { data: acq, error: acqErr } = await supabaseAdmin
          .from('asset_acquisitions')
          .select('*')
          .eq('id', body.acquisitionId)
          .eq('company_id', company_id)
          .single();
        if (acqErr) throw acqErr;
        const next = body.nextStatus;
        if (!(allowedFlow[acq.status] || []).includes(next)) {
          throw new Error(`Invalid transition ${acq.status} → ${next}`);
        }
        const patch = { status: next, updated_at: new Date().toISOString() };
        if (next === 'received') patch.receipt_date = body.receipt_date || acq.receipt_date || new Date().toISOString().slice(0, 10);
        if (next === 'pending_capitalisation') {
          patch.capitalisation_approved = !!body.capitalisation_approved;
          if (body.capitalisation_approved) {
            patch.capitalisation_approved_by = user.id;
            patch.capitalisation_approved_by_name = actorName;
            patch.capitalisation_approved_at = new Date().toISOString();
          }
          patch.capitalisation_date = body.capitalisation_date || acq.capitalisation_date || new Date().toISOString().slice(0, 10);
        }
        ({ data, error } = await supabaseAdmin
          .from('asset_acquisitions')
          .update(patch)
          .eq('id', acq.id)
          .eq('company_id', company_id)
          .select()
          .single());
        break;
      }

      case 'PREVIEW_ACQUISITION_CAPITALISATION': {
        const { data: acq, error: acqErr } = await supabaseAdmin
          .from('asset_acquisitions')
          .select('*')
          .eq('id', body.acquisitionId)
          .eq('company_id', company_id)
          .single();
        if (acqErr) throw acqErr;
        const missing = [];
        if (!acq.asset_code) missing.push('asset_code');
        if (!acq.description) missing.push('description');
        if (!acq.category_id) missing.push('category_id');
        if (!acq.purchase_cost || Number(acq.purchase_cost) <= 0) missing.push('purchase_cost');
        if (!acq.asset_account_id) missing.push('asset_account_id');
        if (!acq.payment_account_id) missing.push('payment_account_id');
        if (!acq.purchase_date && !acq.capitalisation_date) missing.push('purchase_date');
        if (!acq.capitalisation_approved) missing.push('capitalisation_approval');
        data = {
          acquisition: acq,
          valid: missing.length === 0,
          missing,
          assetPreview: {
            asset_code: acq.asset_code,
            description: acq.description,
            category_id: acq.category_id,
            purchase_cost: acq.purchase_cost,
            purchase_date: acq.capitalisation_date || acq.purchase_date,
            vendor_id: acq.supplier_id,
            location: acq.location,
            department: acq.department,
            custodian_name: acq.custodian_name,
            serial_number: acq.serial_number,
            asset_account_id: acq.asset_account_id,
            depreciation_method: acq.depreciation_method,
            useful_life_years: acq.useful_life_years,
            residual_value: acq.residual_value,
            accumulated_depreciation_account_id: acq.accumulated_depreciation_account_id,
            depreciation_expense_account_id: acq.depreciation_expense_account_id,
          },
          journalPreview: {
            description: `Acquisition of asset: ${acq.description}`,
            entry_date: acq.capitalisation_date || acq.purchase_date,
            lines: [
              { type: 'debit', account_id: acq.asset_account_id, amount: acq.purchase_cost },
              { type: 'credit', account_id: acq.payment_account_id, amount: acq.purchase_cost },
            ],
            note: 'Journal structure identical to existing fixed-assets POST.',
          },
        };
        break;
      }

      case 'CAPITALISE_ACQUISITION': {
        if (!isAdmin) throw new Error('Permission denied: admin required.');
        const { data: acq, error: acqErr } = await supabaseAdmin
          .from('asset_acquisitions')
          .select('*')
          .eq('id', body.acquisitionId)
          .eq('company_id', company_id)
          .single();
        if (acqErr) throw acqErr;
        if (acq.status === 'capitalised' && acq.generated_asset_id) {
          data = { asset_id: acq.generated_asset_id, already: true };
          break;
        }
        if (!acq.capitalisation_approved) throw new Error('Capitalisation approval required.');
        if (!acq.asset_account_id || !acq.payment_account_id) throw new Error('GL accounts required.');
        if (!acq.asset_code || !acq.description) throw new Error('Asset code and description required.');

        const purchase_date = acq.capitalisation_date || acq.purchase_date || new Date().toISOString().slice(0, 10);
        // Reuse IDENTICAL POST insert + JE structure
        const seeded = {
          company_id,
          asset_code: acq.asset_code,
          description: acq.description,
          category_id: acq.category_id,
          purchase_date,
          purchase_cost: acq.purchase_cost,
          vendor_id: acq.supplier_id || null,
          location: acq.location || null,
          department: acq.department || null,
          custodian_name: acq.custodian_name || null,
          serial_number: acq.serial_number || null,
          asset_account_id: acq.asset_account_id,
          depreciation_method: acq.depreciation_method || null,
          useful_life_years: acq.useful_life_years || null,
          residual_value: acq.residual_value || 0,
          accumulated_depreciation_account_id: acq.accumulated_depreciation_account_id || null,
          depreciation_expense_account_id: acq.depreciation_expense_account_id || null,
          asset_tag: acq.asset_code,
          qr_code: `QR-${acq.asset_code}`,
          barcode: `BC-${acq.asset_code}`,
          verification_status: 'unverified',
          lifecycle_stage: 'capitalised',
          status: 'active',
        };
        const { data: asset, error: assetError } = await supabaseAdmin
          .from('fixed_assets')
          .insert(seeded)
          .select('id')
          .single();
        if (assetError) throw assetError;

        const { data: entry, error: entryError } = await supabaseAdmin.from('journal_entries').insert({
          company_id,
          entry_date: purchase_date,
          description: `Acquisition of asset: ${acq.description}`,
          vendor_id: acq.supplier_id || null,
        }).select('id').single();
        if (entryError) throw entryError;

        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert([
          { journal_entry_id: entry.id, account_id: acq.asset_account_id, type: 'debit', amount: acq.purchase_cost },
          { journal_entry_id: entry.id, account_id: acq.payment_account_id, type: 'credit', amount: acq.purchase_cost },
        ]);
        if (itemsError) throw itemsError;

        const { data: updatedAcq, error: updAcqErr } = await supabaseAdmin
          .from('asset_acquisitions')
          .update({
            status: 'capitalised',
            generated_asset_id: asset.id,
            journal_entry_id: entry.id,
            capitalisation_date: purchase_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', acq.id)
          .select()
          .single();
        if (updAcqErr) throw updAcqErr;

        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'purchased',
          user_id: user.id, user_name: actorName, reason: 'Acquisition workbench', reference: acq.id,
        });
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'capitalised',
          user_id: user.id, user_name: actorName, reason: 'Capitalised via workbench', reference: entry.id,
          metadata: { acquisition_id: acq.id },
        });
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'created',
          user_id: user.id, user_name: actorName, reason: 'Generated from acquisition', reference: acq.id,
        });

        data = { asset_id: asset.id, journal_entry_id: entry.id, acquisition: updatedAcq };
        break;
      }

      // ── Components (memo depreciation — no JE) ───────────────────────────
      case 'LIST_COMPONENTS':
        ({ data, error } = await supabaseAdmin
          .from('asset_components')
          .select('*')
          .eq('parent_asset_id', body.assetId)
          .eq('company_id', company_id)
          .order('component_code'));
        break;

      case 'UPSERT_COMPONENT': {
        const row = { ...body.component, company_id, parent_asset_id: body.assetId, updated_at: new Date().toISOString() };
        if (row.id) {
          const id = row.id;
          delete row.id;
          ({ data, error } = await supabaseAdmin.from('asset_components').update(row).eq('id', id).eq('company_id', company_id).select().single());
        } else {
          ({ data, error } = await supabaseAdmin.from('asset_components').insert(row).select().single());
          if (!error) {
            await recordLifecycle(supabaseAdmin, {
              company_id, asset_id: body.assetId, event_type: 'component_added',
              user_id: user.id, user_name: actorName,
              reason: `${row.component_code} — ${row.description}`,
              reference: data.id,
            });
          }
        }
        break;
      }

      case 'REPLACE_COMPONENT': {
        const { data: comp, error: cErr } = await supabaseAdmin
          .from('asset_components')
          .select('*')
          .eq('id', body.componentId)
          .eq('company_id', company_id)
          .single();
        if (cErr) throw cErr;
        const replacement = {
          ...body.replacement,
          company_id,
          parent_asset_id: comp.parent_asset_id,
          updated_at: new Date().toISOString(),
        };
        const { data: neu, error: nErr } = await supabaseAdmin.from('asset_components').insert(replacement).select().single();
        if (nErr) throw nErr;
        const { data: old, error: oErr } = await supabaseAdmin
          .from('asset_components')
          .update({
            status: 'replaced',
            replaced_by_component_id: neu.id,
            replacement_notes: body.notes || null,
            replacement_date: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq('id', comp.id)
          .select()
          .single();
        if (oErr) throw oErr;
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: comp.parent_asset_id, event_type: 'component_replaced',
          user_id: user.id, user_name: actorName,
          reason: body.notes || `Replaced ${comp.component_code}`,
          reference: neu.id,
        });
        data = { replaced: old, replacement: neu };
        break;
      }

      case 'DEPRECIATE_COMPONENT': {
        // Memo-only: same straight-line formula as run-depreciation; NO journal posting.
        const { data: comp, error: cErr } = await supabaseAdmin
          .from('asset_components')
          .select('*')
          .eq('id', body.componentId)
          .eq('company_id', company_id)
          .single();
        if (cErr) throw cErr;
        if (comp.status !== 'active') throw new Error('Component not active.');
        if (comp.depreciation_method && comp.depreciation_method !== 'straight-line') {
          throw new Error('Only straight-line memo depreciation supported for components.');
        }
        const monthly = straightLineMonthly(comp.cost, comp.residual_value, comp.useful_life_years);
        const depreciable = Number(comp.cost) - Number(comp.residual_value || 0);
        const remaining = depreciable - Number(comp.accumulated_depreciation || 0);
        const amount = Math.min(monthly, Math.max(remaining, 0));
        if (amount <= 0) {
          data = { component: comp, amount: 0, message: 'Nothing to depreciate.' };
          break;
        }
        const newAccum = Number(comp.accumulated_depreciation || 0) + amount;
        const { data: updated, error: uErr } = await supabaseAdmin
          .from('asset_components')
          .update({
            accumulated_depreciation: newAccum,
            last_depreciation_date: new Date().toISOString().slice(0, 10),
            status: newAccum >= depreciable ? 'disposed' : 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', comp.id)
          .select()
          .single();
        if (uErr) throw uErr;
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: comp.parent_asset_id, event_type: 'depreciated',
          user_id: user.id, user_name: actorName,
          reason: `Component ${comp.component_code} memo depreciation`,
          reference: comp.id,
          metadata: { amount, memo_only: true },
        });
        data = { component: updated, amount, memo_only: true };
        break;
      }

      // ── Timeline / relationships ─────────────────────────────────────────
      case 'LIST_TIMELINE':
        ({ data, error } = await supabaseAdmin
          .from('asset_lifecycle_events')
          .select('*')
          .eq('asset_id', body.assetId)
          .eq('company_id', company_id)
          .order('event_date', { ascending: false })
          .limit(body.limit || 200));
        break;

      case 'ADD_LIFECYCLE_EVENT': {
        const ev = {
          company_id,
          asset_id: body.assetId,
          event_type: body.event.event_type,
          event_date: body.event.event_date || new Date().toISOString(),
          user_id: user.id,
          user_name: body.event.user_name || actorName,
          reason: body.event.reason || null,
          reference: body.event.reference || null,
          attachment_url: body.event.attachment_url || null,
          metadata: body.event.metadata || {},
        };
        ({ data, error } = await supabaseAdmin.from('asset_lifecycle_events').insert(ev).select().single());
        break;
      }

      case 'ADD_RELATIONSHIP': {
        const rel = {
          company_id,
          parent_asset_id: body.parent_asset_id,
          child_asset_id: body.child_asset_id,
          relationship_type: body.relationship_type || 'parent_child',
          notes: body.notes || null,
          created_by: user.id,
        };
        ({ data, error } = await supabaseAdmin.from('asset_relationships').insert(rel).select().single());
        if (!error) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.parent_asset_id, event_type: 'relationship_linked',
            user_id: user.id, user_name: actorName,
            reason: body.notes || body.relationship_type,
            reference: body.child_asset_id,
          });
        }
        break;
      }

      case 'DELETE_RELATIONSHIP':
        ({ data, error } = await supabaseAdmin
          .from('asset_relationships')
          .delete()
          .eq('id', body.relationshipId)
          .eq('company_id', company_id));
        break;

      // ── Smart actions (non-accounting except dispose which uses existing RPC) ─
      case 'RECORD_IMPAIRMENT': {
        if (!isAdmin) throw new Error('Permission denied.');
        const amount = Number(body.amount || 0);
        if (amount < 0) throw new Error('Impairment must be >= 0');
        const { data: asset, error: aErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('impairment_amount')
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .single();
        if (aErr) throw aErr;
        const next = Number(asset.impairment_amount || 0) + amount;
        const impairPatch = {
          impairment_amount: next,
          updated_at: new Date().toISOString(),
        };
        if (amount > 0) impairPatch.lifecycle_stage = 'impaired';
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .update(impairPatch)
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .select()
          .single());
        // Indicator only — does NOT post journals (accounting impairment JE is out of scope).
        if (!error) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.assetId, event_type: 'impaired',
            user_id: user.id, user_name: actorName,
            reason: body.reason || 'Impairment indicator recorded',
            metadata: { amount, total: next, accounting_je: false },
          });
        }
        break;
      }

      case 'RECORD_REVALUATION': {
        if (!isAdmin) throw new Error('Permission denied.');
        const amount = Number(body.amount || 0);
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .update({
            revaluation_amount: amount,
            last_revaluation_date: body.revaluation_date || new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .select()
          .single());
        // Indicator / memo — does NOT post journals.
        if (!error) {
          await recordLifecycle(supabaseAdmin, {
            company_id, asset_id: body.assetId, event_type: 'revalued',
            user_id: user.id, user_name: actorName,
            reason: body.reason || 'Revaluation memo recorded',
            metadata: { amount, accounting_je: false },
          });
        }
        break;
      }

      case 'GENERATE_QR_LABEL': {
        const { data: asset, error: aErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('id, asset_code, description, qr_code, barcode, asset_tag')
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .single();
        if (aErr) throw aErr;
        const qr = asset.qr_code || `QR-${asset.asset_code}`;
        const barcode = asset.barcode || `BC-${asset.asset_code}`;
        const tag = asset.asset_tag || asset.asset_code;
        const { data: updated, error: uErr } = await supabaseAdmin
          .from('fixed_assets')
          .update({ qr_code: qr, barcode, asset_tag: tag, updated_at: new Date().toISOString() })
          .eq('id', asset.id)
          .select('id, asset_code, description, qr_code, barcode, asset_tag')
          .single();
        if (uErr) throw uErr;
        await recordLifecycle(supabaseAdmin, {
          company_id, asset_id: asset.id, event_type: 'label_generated',
          user_id: user.id, user_name: actorName,
          reason: 'QR / barcode / tag ensured',
          metadata: { qr, barcode, tag },
        });
        data = updated;
        break;
      }

      // ── Bulk operations ──────────────────────────────────────────────────
      case 'BULK_PREVIEW': {
        const ids = body.assetIds || [];
        const { data: assets, error: aErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('id, asset_code, description, status, location, department, custodian_name, category_id, verification_status')
          .eq('company_id', company_id)
          .in('id', ids);
        if (aErr) throw aErr;
        const validation_errors = [];
        for (const a of assets || []) {
          if (body.operation_type === 'disposal_preview' && a.status === 'disposed') {
            validation_errors.push({ asset_id: a.id, message: 'Already disposed' });
          }
        }
        const missing = ids.filter((id) => !(assets || []).some((a) => a.id === id));
        for (const id of missing) validation_errors.push({ asset_id: id, message: 'Not found' });
        data = {
          operation_type: body.operation_type,
          assets: assets || [],
          validation_errors,
          valid: validation_errors.length === 0,
          payload: body.payload || {},
        };
        break;
      }

      case 'BULK_CONFIRM': {
        if (!isAdmin) throw new Error('Permission denied: admin required for bulk operations.');
        const ids = body.assetIds || [];
        const op = body.operation_type;
        const payload = body.payload || {};
        const preview = await supabaseAdmin
          .from('fixed_assets')
          .select('id, asset_code, status')
          .eq('company_id', company_id)
          .in('id', ids);
        if (preview.error) throw preview.error;
        const validation_errors = [];
        const result = { updated: 0, skipped: 0, details: [] };

        for (const asset of preview.data || []) {
          try {
            if (op === 'transfer' || op === 'location_update' || op === 'custodian_update' || op === 'category_update') {
              const patch = { updated_at: new Date().toISOString() };
              if (op === 'transfer' || op === 'location_update') {
                if (payload.location !== undefined) patch.location = payload.location;
                if (payload.department !== undefined) patch.department = payload.department;
              }
              if (op === 'transfer' || op === 'custodian_update') {
                if (payload.custodian_name !== undefined) patch.custodian_name = payload.custodian_name;
                if (payload.assigned_to_employee_id !== undefined) patch.assigned_to_employee_id = payload.assigned_to_employee_id;
              }
              if (op === 'category_update' && payload.category_id) patch.category_id = payload.category_id;
              const { error: uErr } = await supabaseAdmin.from('fixed_assets').update(patch).eq('id', asset.id).eq('company_id', company_id);
              if (uErr) throw uErr;
              await recordLifecycle(supabaseAdmin, {
                company_id, asset_id: asset.id, event_type: op === 'transfer' ? 'transferred' : 'bulk_action',
                user_id: user.id, user_name: actorName,
                reason: payload.reason || `Bulk ${op}`,
                metadata: { operation: op, patch },
              });
              result.updated++;
            } else if (op === 'verification') {
              const verifiedAt = new Date().toISOString();
              await supabaseAdmin.from('asset_verification_history').insert({
                company_id, asset_id: asset.id, verified_at: verifiedAt,
                verifier_user_id: user.id, verifier_name: actorName,
                verification_method: 'manual', status: 'verified',
                notes: payload.notes || 'Bulk verification',
              });
              await supabaseAdmin.from('fixed_assets').update({
                verification_status: 'verified',
                last_verified_at: verifiedAt,
                verified_by_user_id: user.id,
                verified_by_name: actorName,
                next_verification_due: payload.next_verification_due || null,
                updated_at: verifiedAt,
              }).eq('id', asset.id);
              await recordLifecycle(supabaseAdmin, {
                company_id, asset_id: asset.id, event_type: 'verified',
                user_id: user.id, user_name: actorName, reason: 'Bulk verification',
              });
              result.updated++;
            } else if (op === 'maintenance_schedule') {
              await supabaseAdmin.from('asset_maintenance_schedules').insert({
                company_id, asset_id: asset.id,
                title: payload.title || 'Scheduled service',
                frequency_months: payload.frequency_months || 12,
                next_service_date: payload.next_service_date || null,
                status: 'active',
                notes: payload.notes || 'Bulk schedule',
              });
              result.updated++;
            } else if (op === 'label_generation') {
              const code = asset.asset_code;
              await supabaseAdmin.from('fixed_assets').update({
                qr_code: `QR-${code}`,
                barcode: `BC-${code}`,
                asset_tag: code,
                updated_at: new Date().toISOString(),
              }).eq('id', asset.id);
              await recordLifecycle(supabaseAdmin, {
                company_id, asset_id: asset.id, event_type: 'label_generated',
                user_id: user.id, user_name: actorName, reason: 'Bulk label generation',
              });
              result.updated++;
            } else if (op === 'disposal_preview') {
              // Preview/audit only — actual disposal remains per-asset via DISPOSE RPC.
              if (asset.status === 'disposed') {
                validation_errors.push({ asset_id: asset.id, message: 'Already disposed' });
                result.skipped++;
              } else {
                result.details.push({ asset_id: asset.id, action: 'ready_for_individual_dispose' });
                result.updated++;
              }
            } else {
              throw new Error(`Unsupported bulk operation: ${op}`);
            }
          } catch (e) {
            validation_errors.push({ asset_id: asset.id, message: e.message });
            result.skipped++;
          }
        }

        const { data: auditRow, error: auditErr } = await supabaseAdmin
          .from('asset_bulk_operations')
          .insert({
            company_id,
            operation_type: op,
            status: validation_errors.length ? 'failed' : 'confirmed',
            asset_ids: ids,
            payload,
            validation_errors,
            result_summary: result,
            performed_by: user.id,
            performed_by_name: actorName,
          })
          .select()
          .single();
        if (auditErr) throw auditErr;
        data = { audit: auditRow, result, validation_errors };
        break;
      }

      case 'LIST_BULK_OPERATIONS':
        ({ data, error } = await supabaseAdmin
          .from('asset_bulk_operations')
          .select('*')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(50));
        break;

      case 'FINANCIAL_COCKPIT': {
        const { data: assets, error: aErr } = await supabaseAdmin
          .from('fixed_assets')
          .select('*, asset_categories(name)')
          .eq('company_id', company_id);
        if (aErr) throw aErr;
        const { data: maint } = await supabaseAdmin
          .from('asset_maintenance_records')
          .select('asset_id, cost, downtime_hours, service_date')
          .eq('company_id', company_id);
        data = { assets: assets || [], maintenance: maint || [] };
        break;
      }

      case 'GET_REGISTER':
        data = await fetchRegisterPage(supabaseAdmin, company_id, body);
        break;

      case 'GET_REGISTER_FACETS':
        data = await fetchRegisterFacets(supabaseAdmin, company_id);
        break;

      case 'PEEK_NEXT_ASSET_CODE': {
        const { data: peeked, error: peekErr } = await supabaseAdmin.rpc('peek_next_asset_code', {
          p_company_id: company_id,
        });
        if (peekErr) throw peekErr;
        data = { asset_code: peeked };
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

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
