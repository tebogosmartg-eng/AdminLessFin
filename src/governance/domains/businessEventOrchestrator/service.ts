// Governance — Business Event Orchestrator service (ERP Phase 5).

import { supabase } from '@/integrations/supabase/client';
import type { EventsDashboard, OrchestrationResult, PublishEventInput } from './model';

export class BusinessEventOrchestratorService {
  async publish(companyId: string, event: PublishEventInput): Promise<OrchestrationResult> {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'PUBLISH', company_id: companyId, event },
    });
    if (error) throw new Error(error.message);
    return data as OrchestrationResult;
  }

  async getDashboard(companyId: string): Promise<EventsDashboard> {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'GET_DASHBOARD', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as EventsDashboard;
  }

  async listEvents(companyId: string, limit = 50) {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'LIST_EVENTS', company_id: companyId, limit },
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async getEvent(companyId: string, eventId: string) {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'GET_EVENT', company_id: companyId, event_id: eventId },
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async retry(companyId: string, eventId: string) {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'RETRY', company_id: companyId, event_id: eventId },
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async replay(companyId: string, deadLetterId: string) {
    const { data, error } = await supabase.functions.invoke('business-event-orchestrator', {
      body: { method: 'REPLAY', company_id: companyId, dead_letter_id: deadLetterId },
    });
    if (error) throw new Error(error.message);
    return data;
  }
}

export const businessEventOrchestratorService = new BusinessEventOrchestratorService();
