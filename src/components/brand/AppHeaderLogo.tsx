import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { AppBrand } from "./AppBrand";

type AppHeaderLogoProps = {
  to?: string;
  className?: string;
};

/** Marketing / public header lockup — icon, wordmark, product badge. */
export function AppHeaderLogo({ to = "/welcome", className }: AppHeaderLogoProps) {
  return (
    <Link
      to={to}
      aria-label={BRAND.product}
      className={cn(
        "rounded-lg outline-none transition-all duration-fast hover:opacity-90",
        "hover:-translate-y-px",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <AppBrand variant="full" size="sm" />
    </Link>
  );
}
