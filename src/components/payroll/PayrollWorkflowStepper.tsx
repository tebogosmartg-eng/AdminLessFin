import { cn } from '../../lib/utils';
import {
  PAYROLL_WORKFLOW_STEPS,
  type PayrollWorkflowStepId,
  isStepComplete,
  isStepCurrent,
  workflowProgressPercent,
} from '../../lib/payrollWorkflow';
import { Progress } from '../ui/progress';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';

type Props = {
  currentStep: PayrollWorkflowStepId;
  className?: string;
};

const PayrollWorkflowStepper = ({ currentStep, className }: Props) => {
  const progress = workflowProgressPercent(currentStep);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Workflow progress</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {PAYROLL_WORKFLOW_STEPS.map((step) => {
          const complete = isStepComplete(step.id, currentStep);
          const current = isStepCurrent(step.id, currentStep);
          return (
            <li
              key={step.id}
              className={cn(
                'flex flex-col items-center text-center gap-1 p-2 rounded-lg border',
                current && 'border-primary bg-primary/5',
                complete && !current && 'border-green-200 bg-green-50 dark:bg-green-950/30',
                !complete && !current && 'border-transparent opacity-60'
              )}
            >
              {complete ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : current ? (
                <CircleDot className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={cn('text-xs font-medium', current && 'text-primary')}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default PayrollWorkflowStepper;
