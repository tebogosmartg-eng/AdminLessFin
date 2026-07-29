import { Link } from 'react-router-dom';
import { Badge } from '../ui/badge';
import { BUSINESS_LIFECYCLES, type LifecycleId } from '../../lib/businessLifecycles';
import { cn } from '../../lib/utils';

type Props = {
  lifecycleId: LifecycleId;
  stageId: string;
  className?: string;
  compact?: boolean;
};

const LifecycleContextBadge = ({ lifecycleId, stageId, className, compact }: Props) => {
  const lifecycle = BUSINESS_LIFECYCLES[lifecycleId];
  const stage = lifecycle.stages.find((s) => s.id === stageId);

  if (!lifecycle || !stage) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Badge variant="outline" className="text-xs font-normal">
        {lifecycle.label}
      </Badge>
      <span className="text-muted-foreground text-xs">→</span>
      <Badge variant="secondary" className="text-xs font-medium">
        {stage.label}
      </Badge>
      {!compact && lifecycle.workspaceRoute && (
        <Link to={lifecycle.workspaceRoute} className="text-xs text-primary hover:underline ml-1">
          Workspace
        </Link>
      )}
    </div>
  );
};

export default LifecycleContextBadge;
