import Image from "next/image";
import { cx } from "@/lib/cx";

const MASCOT = "/brand/momo-mascot.png";

/**
 * MOMO lockup: the original mascot artwork (square, uncropped, unaltered) beside the wordmark.
 * The mascot never stands in for a letter.
 */
export function MomoLockup({ size = 32, sub = "Sentinel", className }: { size?: number; sub?: string | null; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <Image src={MASCOT} alt="" width={size} height={size} priority className="shrink-0 select-none object-contain" draggable={false} />
      <span className="flex items-baseline gap-2 leading-none">
        <span className="text-[17px] font-semibold tracking-[-0.03em] text-text">MOMO</span>
        {sub && <span className="text-xs font-medium text-muted">{sub}</span>}
      </span>
    </span>
  );
}
