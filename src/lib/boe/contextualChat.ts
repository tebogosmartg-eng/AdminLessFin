/**
 * Business Operations Engine — Contextual Collaboration
 *
 * Chat belongs to a business object. Context is passed via URL params
 * until schema supports entity-linked messages (no DB change required).
 */

export type ChatContextType =
  | 'invoice'
  | 'quote'
  | 'purchase_order'
  | 'bill'
  | 'payroll_run'
  | 'journal'
  | 'project'
  | 'asset'
  | 'customer'
  | 'vendor'
  | 'general';

export type ChatContext = {
  type: ChatContextType;
  id?: string;
  label: string;
  lifecycleId: string;
  stageId: string;
  route: string;
};

const CONTEXT_META: Record<ChatContextType, { lifecycleId: string; stageId: string; routePrefix?: string }> = {
  invoice: { lifecycleId: 'revenue', stageId: 'collections', routePrefix: '/invoices' },
  quote: { lifecycleId: 'revenue', stageId: 'approval', routePrefix: '/quotes' },
  purchase_order: { lifecycleId: 'procurement', stageId: 'approval', routePrefix: '/purchase-orders' },
  bill: { lifecycleId: 'procurement', stageId: 'bill', routePrefix: '/bills' },
  payroll_run: { lifecycleId: 'payroll', stageId: 'processing', routePrefix: '/payroll-runs' },
  journal: { lifecycleId: 'accounting', stageId: 'journal', routePrefix: '/journal-entries' },
  project: { lifecycleId: 'projects', stageId: 'create', routePrefix: '/projects' },
  asset: { lifecycleId: 'fixed_assets', stageId: 'capitalise', routePrefix: '/fixed-assets' },
  customer: { lifecycleId: 'revenue', stageId: 'customer', routePrefix: '/customers' },
  vendor: { lifecycleId: 'procurement', stageId: 'vendor', routePrefix: '/vendors' },
  general: { lifecycleId: 'accounting', stageId: 'event' },
};

export function buildChatUrl(context: Omit<ChatContext, 'lifecycleId' | 'stageId' | 'route'>): string {
  const meta = CONTEXT_META[context.type];
  const params = new URLSearchParams({
    context: context.type,
    label: context.label,
  });
  if (context.id) params.set('id', context.id);
  return `/chat?${params.toString()}`;
}

export function parseChatContext(searchParams: URLSearchParams): ChatContext | null {
  const type = searchParams.get('context') as ChatContextType | null;
  const label = searchParams.get('label');
  if (!type || !label) return null;

  const meta = CONTEXT_META[type];
  const id = searchParams.get('id') ?? undefined;
  const route = meta.routePrefix && id ? `${meta.routePrefix}/${id}` : meta.routePrefix ?? '/chat';

  return {
    type,
    id,
    label,
    lifecycleId: meta.lifecycleId,
    stageId: meta.stageId,
    route,
  };
}

export function formatChatContextPrefix(context: ChatContext): string {
  const typeLabels: Record<ChatContextType, string> = {
    invoice: 'Invoice',
    quote: 'Quote',
    purchase_order: 'Purchase Order',
    bill: 'Bill',
    payroll_run: 'Payroll Run',
    journal: 'Journal',
    project: 'Project',
    asset: 'Asset',
    customer: 'Customer',
    vendor: 'Vendor',
    general: 'General',
  };
  return `${typeLabels[context.type]}: ${context.label}`;
}
