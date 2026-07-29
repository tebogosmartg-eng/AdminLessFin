// @ts-nocheck
// ERP Phase 5 — Business Event Orchestrator edge function.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';
import {
  buildDashboard,
  dispatchEventToSubscribers,
  mapRowToEvent,
  publishBusinessEvent,
} from '../_shared/businessEventOrchestrator/orchestrate.ts';
import { getHandlerMap, executeSubscriber } from '../_shared/businessEventOrchestrator/subscribers.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

function mapSubscriberRow(row: Record<string, unknown>) {
  return {
    subscriberId: row.subscriber_id as string,
    name: row.name as string,
    enabled: Boolean(row.enabled),
    priority: Number(row.priority),
    handlesModules: (row.handles_modules as string[]) ?? [],
    handlesEventTypes: (row.handles_event_types as string[]) ?? [],
    handlesAccountingImpact: row.handles_accounting_impact as boolean | null,
  };
}

serve(withEnterprisePlatform('business-event-orchestrator', 'tenant', async (req, ctx) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    const body = await req.json();
    const { method, company_id: companyId } = body;
    if (!companyId) throw new Error('company_id is required.');

    const { data: membership } = await supabase
      .from('company_users')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) throw new Error('Permission denied: not a member of this company.');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const subscriberCtx = {
      supabaseAdmin,
      companyId,
      userId: user.id,
      correlationId: ctx.correlationId,
    };

    if (method === 'GET_DASHBOARD') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { count: eventsToday },
        { count: failedEvents },
        { data: retryEvents },
        { count: deadLetterCount },
        { data: deliveryStats },
        { data: recentRows },
        { data: subscriberRows },
      ] = await Promise.all([
        supabaseAdmin.from('business_events').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).gte('published_at', todayStart.toISOString()),
        supabaseAdmin.from('business_events').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).in('status', ['failed', 'partial', 'dead_letter'])
          .gte('published_at', thirtyDaysAgo),
        supabaseAdmin.from('business_events').select('retry_count')
          .eq('company_id', companyId).gt('retry_count', 0).gte('published_at', thirtyDaysAgo),
        supabaseAdmin.from('business_event_dead_letter').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId).is('replayed_at', null),
        supabaseAdmin.from('business_event_deliveries').select('subscriber_id, duration_ms')
          .eq('company_id', companyId).eq('status', 'success').gte('created_at', thirtyDaysAgo),
        supabaseAdmin.from('business_events').select(`
          id, event_id, business_event, event_type, source_module, status, published_at, correlation_id
        `).eq('company_id', companyId).order('published_at', { ascending: false }).limit(10),
        supabaseAdmin.from('business_event_subscribers').select('subscriber_id, name'),
      ]);

      const retries = (retryEvents ?? []).reduce((sum, r) => sum + (r.retry_count ?? 0), 0);
      const nameMap = new Map((subscriberRows ?? []).map((s) => [s.subscriber_id, s.name]));

      const statsMap = new Map();
      for (const d of deliveryStats ?? []) {
        const key = d.subscriber_id;
        if (!statsMap.has(key)) statsMap.set(key, { total: 0, count: 0 });
        const entry = statsMap.get(key);
        entry.total += d.duration_ms ?? 0;
        entry.count += 1;
      }

      const slowestSubscribers = [...statsMap.entries()]
        .map(([subscriberId, stat]) => ({
          subscriberId,
          name: nameMap.get(subscriberId) ?? subscriberId,
          avgDurationMs: stat.count ? Math.round(stat.total / stat.count) : 0,
          deliveryCount: stat.count,
        }))
        .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
        .slice(0, 5);

      const dashboard = buildDashboard(
        eventsToday ?? 0,
        failedEvents ?? 0,
        retries,
        deadLetterCount ?? 0,
        slowestSubscribers,
        (recentRows ?? []).map((r) => ({
          id: r.id,
          eventId: r.event_id,
          businessEvent: r.business_event,
          eventType: r.event_type,
          sourceModule: r.source_module,
          status: r.status,
          publishedAt: r.published_at,
          correlationId: r.correlation_id,
        })),
      );

      return new Response(JSON.stringify(dashboard), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'LIST_EVENTS') {
      const limit = Math.min(Number(body.limit ?? 50), 200);
      const { data: rows, error } = await supabaseAdmin
        .from('business_events')
        .select(`
          id, event_id, business_event, event_type, entity_type, entity_id,
          source_module, status, correlation_id, published_at, completed_at,
          business_event_deliveries ( subscriber_id, status, duration_ms, error_message )
        `)
        .eq('company_id', companyId)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      return new Response(JSON.stringify(rows ?? []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'GET_EVENT') {
      const { event_id: eventRecordId } = body;
      if (!eventRecordId) throw new Error('event_id is required.');

      const { data: row, error } = await supabaseAdmin
        .from('business_events')
        .select(`
          *,
          business_event_deliveries ( * )
        `)
        .eq('company_id', companyId)
        .eq('id', eventRecordId)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error('Event not found.');

      return new Response(JSON.stringify(row), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'PUBLISH') {
      const { event: eventInput } = body;
      if (!eventInput) throw new Error('event payload is required.');

      const result = await publishBusinessEvent(
        { ...eventInput, companyId, userId: user.id, correlationId: eventInput.correlationId ?? ctx.correlationId },
        {
          findExisting: async (cid, key) => {
            const { data } = await supabaseAdmin
              .from('business_events')
              .select('*')
              .eq('company_id', cid)
              .eq('idempotency_key', key)
              .maybeSingle();
            return data ? mapRowToEvent(data) : null;
          },
          nextSequence: async (cid, aggregateKey) => {
            const { data, error } = await supabaseAdmin.rpc('business_event_next_sequence', {
              p_company_id: cid,
              p_aggregate_key: aggregateKey,
            });
            if (error) throw error;
            return Number(data);
          },
          insertEvent: async (row) => {
            const { data, error } = await supabaseAdmin
              .from('business_events')
              .insert(row)
              .select('*')
              .single();
            if (error) throw error;
            return mapRowToEvent(data);
          },
          updateEventStatus: async (eventId, status, completedAt) => {
            await supabaseAdmin
              .from('business_events')
              .update({ status, completed_at: completedAt })
              .eq('id', eventId);
          },
          loadSubscribers: async () => {
            const { data, error } = await supabaseAdmin
              .from('business_event_subscribers')
              .select('*')
              .eq('enabled', true)
              .order('priority');
            if (error) throw error;
            return (data ?? []).map(mapSubscriberRow);
          },
          dispatch: async (event, definitions) =>
            dispatchEventToSubscribers(event, definitions, subscriberCtx),
        },
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'RETRY') {
      const { event_id: eventRecordId } = body;
      if (!eventRecordId) throw new Error('event_id is required.');

      const { data: row, error: fetchError } = await supabaseAdmin
        .from('business_events')
        .select('*')
        .eq('company_id', companyId)
        .eq('id', eventRecordId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!row) throw new Error('Event not found.');

      const event = mapRowToEvent({ ...row, retry_count: (row.retry_count ?? 0) + 1 });

      await supabaseAdmin
        .from('business_events')
        .update({ status: 'processing', retry_count: event.retryCount })
        .eq('id', eventRecordId);

      await supabaseAdmin
        .from('business_event_deliveries')
        .delete()
        .eq('event_record_id', eventRecordId);

      const { data: subRows, error: subError } = await supabaseAdmin
        .from('business_event_subscribers')
        .select('*')
        .eq('enabled', true)
        .order('priority');
      if (subError) throw subError;

      const { deliveries, subscribersExecuted, subscribersFailed } = await dispatchEventToSubscribers(
        event,
        (subRows ?? []).map(mapSubscriberRow),
        subscriberCtx,
      );

      const finalStatus = deliveries.some((d) => d.status === 'failed') ? 'partial' : 'completed';
      await supabaseAdmin
        .from('business_events')
        .update({ status: finalStatus, completed_at: new Date().toISOString() })
        .eq('id', eventRecordId);

      return new Response(JSON.stringify({
        event: { ...event, status: finalStatus },
        deliveries,
        subscribersExecuted,
        subscribersFailed,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'REPLAY') {
      const { dead_letter_id: dlqId } = body;
      if (!dlqId) throw new Error('dead_letter_id is required.');

      const { data: dlq, error: dlqError } = await supabaseAdmin
        .from('business_event_dead_letter')
        .select('*, business_events (*)')
        .eq('company_id', companyId)
        .eq('id', dlqId)
        .maybeSingle();
      if (dlqError) throw dlqError;
      if (!dlq) throw new Error('Dead-letter entry not found.');

      const event = mapRowToEvent(dlq.business_events);
      const { data: subDef, error: subDefError } = await supabaseAdmin
        .from('business_event_subscribers')
        .select('*')
        .eq('subscriber_id', dlq.subscriber_id)
        .maybeSingle();
      if (subDefError) throw subDefError;

      const handler = getHandlerMap().get(dlq.subscriber_id);
      if (!handler || !subDef) throw new Error('Subscriber not found.');

      const delivery = await executeSubscriber(
        handler,
        mapSubscriberRow(subDef),
        event,
        subscriberCtx,
      );

      await supabaseAdmin.from('business_event_deliveries').insert({
        event_record_id: event.id,
        company_id: companyId,
        subscriber_id: dlq.subscriber_id,
        status: delivery.status,
        result: delivery.result ?? {},
        error_message: delivery.errorMessage ?? null,
        duration_ms: delivery.durationMs,
        retry_count: event.retryCount,
        correlation_id: ctx.correlationId,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      if (delivery.status === 'success') {
        await supabaseAdmin
          .from('business_event_dead_letter')
          .update({ replayed_at: new Date().toISOString() })
          .eq('id', dlqId);
      }

      return new Response(JSON.stringify({ event, delivery, replayed: delivery.status === 'success' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    throw new Error(`Unsupported method: ${method}`);
  } catch (error) {
    return edgeFailure(ctx, error);
  }
}));
