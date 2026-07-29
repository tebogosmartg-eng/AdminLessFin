import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";
import { BRAND } from "@/config/brand";

type AppLoadingLogoProps = {
  className?: string;
  message?: string;
};

/** Branded full-screen / inline loading state. */
export function AppLoadingLogo({ className, message }: AppLoadingLogoProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)} role="status" aria-live="polite">
      <AppIcon size="md" className="animate-pulse motion-reduce:animate-none" decorative={false} />
      <span className="sr-only">Loading {BRAND.product}</span>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
