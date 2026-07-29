import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Lightweight right-side drawer for metric drill-downs. */
const MetricDrawer = ({ open, onOpenChange, title, description, children, footer }: Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
      <SheetHeader className="space-y-1 border-b px-6 py-4 text-left">
        <SheetTitle>{title}</SheetTitle>
        {description && <SheetDescription>{description}</SheetDescription>}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
      {footer && <div className="border-t px-6 py-3">{footer}</div>}
    </SheetContent>
  </Sheet>
);

export default MetricDrawer;
