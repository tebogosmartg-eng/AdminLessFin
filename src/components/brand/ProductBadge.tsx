import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

type ProductBadgeProps = {
  className?: string;
  variant?: "default" | "onPrimary";
};

/** Compact product pill (e.g. "Fin") for nav and auth panels. */
export function ProductBadge({ className, variant = "default" }: ProductBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-semibold",
        variant === "onPrimary"
          ? "bg-primary-foreground/15 text-primary-foreground"
          : "bg-primary/10 text-primary",
        className,
      )}
    >
      {BRAND.productShort}
    </span>
  );
}
