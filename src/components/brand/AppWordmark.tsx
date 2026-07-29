import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

type AppWordmarkProps = {
  className?: string;
  showProduct?: boolean;
};

/** Text-only master brand wordmark with optional product suffix. */
export function AppWordmark({ className, showProduct = true }: AppWordmarkProps) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      {BRAND.master}
      {showProduct && (
        <span className="ml-1.5 font-medium text-muted-foreground">{BRAND.productShort}</span>
      )}
    </span>
  );
}
