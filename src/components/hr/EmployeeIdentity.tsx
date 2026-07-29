import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  formatEmployeeFullName,
  formatEmployeeIdentityCompact,
  formatEmployeeIdentityLine,
  formatEmployeeDocumentHeader,
  formatEmployeeEmailIdentity,
  formatEmployeeExportRow,
  getEmploymentStatusLabel,
  resolveEmployeeIdentity,
  type EmployeeIdentityFields,
} from '../../lib/employeeIdentity';

export type EmployeeIdentitySize = 'sm' | 'md' | 'lg';
export type EmployeeIdentityVariant =
  | 'stacked'
  | 'inline'
  | 'compact'
  | 'avatar'
  | 'list'
  | 'table'
  | 'card'
  | 'selector'
  | 'timeline'
  | 'document'
  | 'email'
  | 'export';

type Props = {
  employee: EmployeeIdentityFields;
  className?: string;
  size?: EmployeeIdentitySize;
  variant?: EmployeeIdentityVariant;
  showDepartment?: boolean;
  showBranch?: boolean;
  showPosition?: boolean;
  showStatus?: boolean;
  showCompany?: boolean;
  companyName?: string | null;
  layout?: 'inline' | 'stacked';
  numberClassName?: string;
  onClick?: () => void;
};

const sizeClasses: Record<EmployeeIdentitySize, { number: string; name: string; meta: string }> = {
  sm: { number: 'text-[10px]', name: 'text-xs', meta: 'text-[10px]' },
  md: { number: 'text-xs', name: 'text-sm', meta: 'text-xs' },
  lg: { number: 'text-sm', name: 'text-base', meta: 'text-sm' },
};

function StatusBadge({ status }: { status?: string | null }) {
  const label = getEmploymentStatusLabel(status);
  const variant =
    status === 'terminated' || status === 'archived'
      ? 'destructive'
      : status === 'on_leave' || status === 'suspended'
        ? 'secondary'
        : 'outline';
  return (
    <Badge variant={variant} className="text-[10px] capitalize">
      {label}
    </Badge>
  );
}

/** Official platform presentation layer for employee identity */
export function EmployeeIdentity({
  employee,
  className,
  size = 'md',
  variant,
  showDepartment = true,
  showBranch = false,
  showPosition = false,
  showStatus = false,
  showCompany = false,
  companyName,
  layout,
  numberClassName,
  onClick,
}: Props) {
  const resolved = resolveEmployeeIdentity({ ...employee, company_name: companyName ?? employee.company_name });
  const sz = sizeClasses[size];
  const effectiveVariant = variant ?? (layout === 'inline' ? 'inline' : 'stacked');

  const Wrapper = onClick ? 'button' : 'div';
  const wrapperProps = onClick
    ? { type: 'button' as const, onClick, className: cn('text-left w-full', className) }
    : { className: cn('min-w-0', className) };

  if (effectiveVariant === 'compact' || effectiveVariant === 'selector') {
    return (
      <Wrapper {...wrapperProps}>
        <span className={cn('font-mono', sz.number, 'text-muted-foreground')}>{employee.employee_number}</span>
        {' · '}
        <span className={cn('font-medium', sz.name)}>{resolved.displayName}</span>
        {showDepartment && resolved.department && (
          <span className={cn('text-muted-foreground', sz.meta)}> · {resolved.department}</span>
        )}
      </Wrapper>
    );
  }

  if (effectiveVariant === 'inline' || effectiveVariant === 'email') {
    return (
      <Wrapper {...wrapperProps}>
        <span className={cn(sz.name)}>
          {effectiveVariant === 'email'
            ? formatEmployeeEmailIdentity(employee, companyName)
            : formatEmployeeIdentityLine(employee)}
        </span>
      </Wrapper>
    );
  }

  if (effectiveVariant === 'document') {
    return (
      <Wrapper {...wrapperProps}>
        <pre className={cn('whitespace-pre-wrap font-sans', sz.name)}>
          {formatEmployeeDocumentHeader(employee, companyName)}
        </pre>
      </Wrapper>
    );
  }

  if (effectiveVariant === 'export') {
    const row = formatEmployeeExportRow({ ...employee, company_name: companyName ?? employee.company_name });
    return (
      <Wrapper {...wrapperProps}>
        <span className={cn(sz.name, 'font-mono')}>
          {Object.values(row).filter(Boolean).join(' | ')}
        </span>
      </Wrapper>
    );
  }

  if (effectiveVariant === 'avatar' || effectiveVariant === 'list' || effectiveVariant === 'card') {
    return (
      <Wrapper {...wrapperProps}>
        <div className={cn('flex items-center gap-3', effectiveVariant === 'card' && 'rounded-lg border p-3')}>
          <Avatar className={cn(size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10')}>
            {resolved.avatarUrl && <AvatarImage src={resolved.avatarUrl} alt={resolved.displayName} />}
            <AvatarFallback className="text-xs">{resolved.avatarInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className={cn('font-mono text-muted-foreground truncate', sz.number, numberClassName)}>
              {employee.employee_number}
            </p>
            <p className={cn('font-medium truncate', sz.name)}>{resolved.displayName}</p>
            {showDepartment && resolved.department && (
              <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.department}</p>
            )}
            {showBranch && resolved.branch && (
              <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.branch}</p>
            )}
            {showStatus && <StatusBadge status={employee.employment_status} />}
          </div>
        </div>
      </Wrapper>
    );
  }

  if (effectiveVariant === 'timeline') {
    return (
      <Wrapper {...wrapperProps}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('font-mono font-medium', sz.number)}>{employee.employee_number}</span>
          <span className={cn('font-medium', sz.name)}>{resolved.displayName}</span>
          {showDepartment && resolved.department && (
            <span className={cn('text-muted-foreground', sz.meta)}>· {resolved.department}</span>
          )}
        </div>
      </Wrapper>
    );
  }

  if (effectiveVariant === 'table') {
    return (
      <Wrapper {...wrapperProps}>
        <p className={cn('font-mono text-muted-foreground truncate', sz.number, numberClassName)}>
          {employee.employee_number}
        </p>
        <p className={cn('font-medium truncate', sz.name)}>{resolved.displayName}</p>
        {showDepartment && resolved.department && (
          <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.department}</p>
        )}
      </Wrapper>
    );
  }

  // Default: stacked
  return (
    <Wrapper {...wrapperProps}>
      <p className={cn('font-mono text-muted-foreground truncate', sz.number, numberClassName)}>
        {employee.employee_number}
      </p>
      <p className={cn('font-medium truncate', sz.name)}>{resolved.displayName}</p>
      {showDepartment && resolved.department && (
        <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.department}</p>
      )}
      {showBranch && resolved.branch && (
        <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.branch}</p>
      )}
      {showPosition && resolved.position && (
        <p className={cn('text-muted-foreground truncate', sz.meta)}>{resolved.position}</p>
      )}
      {showCompany && (companyName ?? employee.company_name) && (
        <p className={cn('text-muted-foreground truncate', sz.meta)}>{companyName ?? employee.company_name}</p>
      )}
      {showStatus && (
        <div className="mt-1">
          <StatusBadge status={employee.employment_status} />
        </div>
      )}
    </Wrapper>
  );
}

type SelectContentProps = {
  employee: EmployeeIdentityFields;
};

/** @deprecated Use EmployeeSelector — kept for backward compatibility */
export function EmployeeSelectOption({ employee }: SelectContentProps) {
  return (
    <EmployeeIdentity
      employee={employee}
      variant="selector"
      size="sm"
      showDepartment
      showBranch
      showStatus
    />
  );
}

type TableCellProps = {
  employee: EmployeeIdentityFields;
  onClick?: () => void;
};

export function EmployeeIdentityCell({ employee, onClick }: TableCellProps) {
  return (
    <EmployeeIdentity
      employee={employee}
      variant="table"
      showDepartment
      onClick={onClick}
      className={onClick ? 'hover:text-primary' : undefined}
    />
  );
}

/** Compact single-line for registers and bank files */
export function EmployeeIdentityCompact({ employee }: { employee: EmployeeIdentityFields }) {
  return <span className="text-sm">{formatEmployeeIdentityCompact(employee)}</span>;
}
