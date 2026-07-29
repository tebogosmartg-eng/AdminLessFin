import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { AppWordmark } from "./AppWordmark";
import { ProductBadge } from "./ProductBadge";
import type { BrandSize } from "@/config/brand";

export type AppBrandVariant = "icon" | "lockup" | "full";

type AppBrandProps = {
  variant?: AppBrandVariant;
  size?: BrandSize;
  className?: string;
  wordmarkClassName?: string;
  badgeVariant?: "default" | "onPrimary";
  /** Applied to the root link/wrapper when used inside navigational shells. */
  linkClassName?: string;
};

/**
 * Unified brand entry point — every screen should use this (or its sub-components)
 * instead of referencing image assets directly.
 */
export function AppBrand({
  variant = "lockup",
  size = "sm",
  className,
  wordmarkClassName,
  badgeVariant = "default",
}: AppBrandProps) {
  if (variant === "icon") {
    return <AppIcon size={size} className={className} />;
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AppIcon size={size} />
      {(variant === "lockup" || variant === "full") && (
        <AppWordmark className={wordmarkClassName} showProduct={false} />
      )}
      {variant === "full" && <ProductBadge variant={badgeVariant} />}
    </div>
  );
}
