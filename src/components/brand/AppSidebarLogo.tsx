import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { AppIcon } from "./AppIcon";

/** Sidebar brand zone — integrated into navigation architecture. */
export function AppSidebarLogo() {
  return (
    <div className="mb-4 shrink-0 border-b border-sidebar-border pb-4">
      <Link
        to="/"
        aria-label={`${BRAND.product} home`}
        className={cn(
          "group flex h-12 items-center gap-2.5 rounded-lg px-2 -mx-2",
          "outline-none transition-colors duration-fast",
          "hover:bg-sidebar-accent/60",
          "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        )}
      >
        <AppIcon size="md" className="transition-transform duration-fast group-hover:scale-[1.02]" />
        <div className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
            {BRAND.master}
          </span>
          <span className="block truncate text-xs font-medium text-sidebar-foreground/75">
            {BRAND.product}
          </span>
        </div>
      </Link>
    </div>
  );
}
