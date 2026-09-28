import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The official logo, unmodified. The dark variant only swaps the black
 * wordmark to white (and drops the white separators) for dark surfaces.
 */
export function Logo({ className, priority, height = 44 }: { className?: string; priority?: boolean; height?: number }) {
  const width = Math.round((height * 775) / 609);
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width, height }}>
      <Image src="/brand/logo.webp" alt="هنر آفاق" width={width} height={height} priority={priority} className="dark:hidden" />
      <Image src="/brand/logo-dark.webp" alt="هنر آفاق" width={width} height={height} priority={priority} className="hidden dark:block" />
    </span>
  );
}

/** The symbol alone (petals and inks), for compact spaces. */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  const h = Math.round((size * 416) / 775);
  return <Image src="/brand/mark.png" alt="" width={size} height={h} className={cn("shrink-0", className)} aria-hidden />;
}
