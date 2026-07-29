import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

type Props = {
  label: string;
  description: string;
  route?: string;
  onAction?: () => void;
  className?: string;
};

const LifecycleNextAction = ({ label, description, route, onAction, className }: Props) => (
  <Alert className={className}>
    <ArrowRight className="h-4 w-4" />
    <AlertTitle>Next in lifecycle: {label}</AlertTitle>
    <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1">
      <span>{description}</span>
      {route && (
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link to={route}>
            Continue <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      )}
      {!route && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="shrink-0">
          Continue <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      )}
    </AlertDescription>
  </Alert>
);

export default LifecycleNextAction;
