import { type LifecycleId, lifecycleStageIndex } from './businessLifecycles';

export type ProcurementStageId =
  | 'vendor'
  | 'purchase_request'
  | 'purchase_order'
  | 'approval'
  | 'received'
  | 'bill'
  | 'payment_approval'
  | 'payment'
  | 'statement'
  | 'analytics'
  | 'history';

export type PurchaseOrderWorkflowState = {
  status: 'draft' | 'sent' | 'billed' | 'closed' | 'cancelled' | string;
};

export function resolvePurchaseOrderLifecycleStage(po: PurchaseOrderWorkflowState): ProcurementStageId {
  switch (po.status) {
    case 'draft':
      return 'purchase_order';
    case 'sent':
      return 'approval';
    case 'billed':
      return 'bill';
    case 'closed':
    case 'cancelled':
      return 'history';
    default:
      return 'purchase_order';
  }
}

export type ProcurementNextAction = {
  label: string;
  description: string;
  route?: string;
  action?: 'send' | 'bill' | 'payment';
};

export function purchaseOrderNextAction(po: PurchaseOrderWorkflowState): ProcurementNextAction | null {
  switch (po.status) {
    case 'draft':
      return { label: 'Send purchase order', description: 'Email the PO to your vendor for authorisation.', action: 'send' };
    case 'sent':
      return { label: 'Convert to bill', description: 'Record the supplier invoice when goods or services are received.', action: 'bill' };
    case 'billed':
      return {
        label: 'Pay bill',
        description: 'Settle the supplier invoice in accounts payable.',
        route: '/pay-bills',
        action: 'payment',
      };
    case 'cancelled':
      return null;
    default:
      return null;
  }
}

const LIFECYCLE_ID: LifecycleId = 'procurement';

export function procurementStageIndex(stageId: ProcurementStageId): number {
  return lifecycleStageIndex(LIFECYCLE_ID, stageId);
}

export function isProcurementStageComplete(stageId: ProcurementStageId, currentStageId: ProcurementStageId): boolean {
  return procurementStageIndex(stageId) < procurementStageIndex(currentStageId);
}

export function isProcurementStageCurrent(stageId: ProcurementStageId, currentStageId: ProcurementStageId): boolean {
  return stageId === currentStageId;
}
