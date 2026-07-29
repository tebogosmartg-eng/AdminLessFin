import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export type RelatedRecord = {
  id: string;
  label: string;
  to: string;
};

type Props = {
  records: RelatedRecord[];
  className?: string;
  label?: string;
};

/** Compact links to related screens — no hunting required. */
const RelatedRecords = ({ records, className, label = 'Related' }: Props) => {
  if (records.length === 0) return null;
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {records.map((record) => (
          <Link
            key={record.id}
            to={record.to}
            className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {record.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RelatedRecords;
