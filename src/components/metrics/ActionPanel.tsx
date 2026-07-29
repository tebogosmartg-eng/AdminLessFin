import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export type ActionItem = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
};

type Props = {
  actions: ActionItem[];
  className?: string;
  children?: ReactNode;
};

/** One-click action row for drawers and lists. */
const ActionPanel = ({ actions, className, children }: Props) => (
  <div className={cn('flex flex-wrap items-center gap-2', className)}>
    {actions.map((action) => (
      <Button
        key={action.id}
        type="button"
        size="sm"
        variant={action.variant ?? 'outline'}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    ))}
    {children}
  </div>
);

export default ActionPanel;
