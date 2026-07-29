import { cn } from "@/lib/utils";
import { AppIcon } from "./AppIcon";

type CompanyLogoProps = {
  src?: string | null;
  alt?: string;
  className?: string;
};

/** Tenant logo on documents; falls back to the AdminLess Fin vector mark. */
export function CompanyLogo({ src, alt = "Company logo", className }: CompanyLogoProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("size-12 object-contain object-left", className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <AppIcon size="md" className={cn("object-left", className)} decorative={false} />;
}
