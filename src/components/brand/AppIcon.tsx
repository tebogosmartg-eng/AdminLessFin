import { BrandImage } from "./BrandImage";
import type { BrandSize } from "@/config/brand";

type AppIconProps = {
  size?: BrandSize;
  className?: string;
  /** Set false when the icon is the only label (e.g. icon-only buttons). */
  decorative?: boolean;
};

/** Square product icon — crisp vector mark at any density. */
export function AppIcon({ size = "sm", className, decorative = true }: AppIconProps) {
  return <BrandImage size={size} className={className} decorative={decorative} />;
}
