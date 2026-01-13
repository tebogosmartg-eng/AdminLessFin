import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';

interface SetupChecklistProps {
  status: {
    hasLogo: boolean;
    hasAddress: boolean;
    hasCustomer: boolean;
    hasVendor: boolean;
    hasTransaction: boolean;
    isComplete: boolean;
  };
}

const SetupChecklist = ({ status }: SetupChecklistProps) => {
  if (status.isComplete) return null;

  const steps = [
    { label: 'Upload Company Logo', done: status.hasLogo, link: '/settings' },
    { label: 'Set Company Address', done: status.hasAddress, link: '/settings' },
    { label: 'Add a Customer', done: status.hasCustomer, link: '/customers' },
    { label: 'Add a Vendor', done: status.hasVendor, link: '/vendors' },
    { label: 'Record first Transaction', done: status.hasTransaction, link: '/journal-entries' },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">Business Setup Checklist</CardTitle>
            <CardDescription>Complete these steps to get your books in order.</CardDescription>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium">{completedCount} of {steps.length} complete</span>
          </div>
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="grid gap-2">
        {steps.map((step, idx) => (
          <Link 
            key={idx} 
            to={step.link}
            className={cn(
              "flex items-center justify-between p-2 rounded-md transition-colors hover:bg-white/50 dark:hover:bg-white/5",
              step.done ? "text-muted-foreground" : "text-foreground font-medium"
            )}
          >
            <div className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 text-blue-400" />
              )}
              <span>{step.label}</span>
            </div>
            {!step.done && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
};

export default SetupChecklist;