import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { cn } from '../lib/utils';
import { Progress } from './ui/progress';
import {
  type LifecycleId,
  BUSINESS_LIFECYCLES,
  lifecycleProgressPercent,
  lifecycleStageIndex,
} from '../lib/businessLifecycles';

type Props = {
  lifecycleId: LifecycleId;
  currentStageId: string;
  /** Show only stages around the current position (compact mode for detail pages) */
  compact?: boolean;
  className?: string;
};

const BusinessLifecycleStepper = ({ lifecycleId, currentStageId, compact = false, className }: Props) => {
  const lifecycle = BUSINESS_LIFECYCLES[lifecycleId];
  const progress = lifecycleProgressPercent(lifecycleId, currentStageId);
  const currentIdx = lifecycleStageIndex(lifecycleId, currentStageId);

  const visibleStages = compact
    ? lifecycle.stages.filter((_, idx) => Math.abs(idx - currentIdx) <= 2)
    : lifecycle.stages;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">{lifecycle.label}</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
      <ol
        className={cn(
          'grid gap-1',
          compact ? 'grid-cols-5' : 'sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12'
        )}
      >
        {visibleStages.map((stage) => {
          const idx = lifecycleStageIndex(lifecycleId, stage.id);
          const complete = idx < currentIdx;
          const current = stage.id === currentStageId;

          const content = (
            <>
              {complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
              ) : current ? (
                <CircleDot className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className={cn('text-[10px] sm:text-xs font-medium leading-tight', current && 'text-primary')}>
                {stage.label}
              </span>
            </>
          );

          const itemClass = cn(
            'flex flex-col items-center text-center gap-0.5 p-1.5 rounded-md border transition-colors',
            current && 'border-primary bg-primary/5',
            complete && !current && 'border-green-200 bg-green-50/80 dark:bg-green-950/20',
            !complete && !current && 'border-transparent opacity-50',
            stage.futureReady && 'border-dashed opacity-40'
          );

          return (
            <li key={stage.id} className={itemClass} title={stage.description}>
              {stage.route && !stage.futureReady ? (
                <Link to={stage.route} className="flex flex-col items-center gap-0.5 hover:opacity-80">
                  {content}
                </Link>
              ) : (
                <div className="flex flex-col items-center gap-0.5">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default BusinessLifecycleStepper;
