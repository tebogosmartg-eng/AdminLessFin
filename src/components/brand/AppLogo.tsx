import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { AppWordmark } from "./AppWordmark";
import { ProductBadge } from "./ProductBadge";
import type { BrandSize } from "@/config/brand";

type AppLogoProps = {
  size?: BrandSize;
  showWordmark?: boolean;
  showBadge?: boolean;
  className?: string;
  wordmarkClassName?: string;
  badgeVariant?: "default" | "onPrimary";
};

/** Icon + optional wordmark + optional product badge — composable lockup. */
export function AppLogo({
  size = "sm",
  showWordmark = false,
  showBadge = false,
  className,
  wordmarkClassName,
  badgeVariant = "default",
}: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AppIcon size={size} />
      {showWordmark && <AppWordmark className={wordmarkClassName} showProduct={false} />}
      {showBadge && <ProductBadge variant={badgeVariant} />}
    </div>
  );
}
