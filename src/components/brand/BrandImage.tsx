import { cn } from "@/lib/utils";
import { BRAND, type BrandSize } from "@/config/brand";
import { AdminLessFinMark } from "./AdminLessFinMark";

type BrandImageProps = {
  size?: BrandSize;
  className?: string;
  decorative?: boolean;
};

/** Low-level vector mark renderer — prefer AppIcon / AppBrand in UI code. */
export function BrandImage({ size = "md", className, decorative = true }: BrandImageProps) {
  return (
    <AdminLessFinMark
      decorative={decorative}
      className={cn(BRAND.sizes[size], className)}
    />
  );
}
