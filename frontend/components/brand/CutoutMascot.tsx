"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useMotionOK } from "@/lib/motion";

const SRC = "/brand/momo-mascot.png";

/**
 * The guard with the solid black field removed, so it can stand on the paper hero.
 * Near-black pixels are cleared only when they connect to a corner, which keeps the glasses and the lock.
 * A file that is already transparent at the corners is used as-is.
 */
function useCutout(src: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;
      const w = canvas.width;
      const h = canvas.height;
      const alpha = (x: number, y: number) => data[((y * w + x) * 4) + 3];
      const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const;
      if (corners.every(([x, y]) => alpha(x, y) < 16)) {
        if (!gone) setUrl(src);
        return;
      }
      const seen = new Uint8Array(w * h);
      const stack: number[] = [];
      const push = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const p = y * w + x;
        if (seen[p]) return;
        const i = p * 4;
        if (data[i] > 18 || data[i + 1] > 18 || data[i + 2] > 18) return;
        seen[p] = 1;
        stack.push(p);
      };
      for (const [x, y] of corners) push(x, y);
      while (stack.length) {
        const p = stack.pop() as number;
        const x = p % w;
        const y = (p - x) / w;
        data[p * 4 + 3] = 0;
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
      }
      ctx.putImageData(frame, 0, 0);
      if (!gone) setUrl(canvas.toDataURL("image/png"));
    };
    img.src = src;
    return () => {
      gone = true;
    };
  }, [src]);
  return url;
}

export function CutoutMascot({ className }: { className?: string }) {
  const url = useCutout(SRC);
  const motionOK = useMotionOK();
  if (!url) return <span className={className} aria-hidden />;
  return (
    <motion.img
      src={url}
      alt="The MOMO guard"
      draggable={false}
      className={className}
      animate={motionOK ? { y: [0, -12, 0] } : { y: 0 }}
      transition={motionOK ? { duration: 7, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
    />
  );
}
